import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),ai:vi.fn(),book:null as Record<string,unknown>|null,pages:[] as Record<string,unknown>[]}));
const owner='00000000-0000-4000-8000-000000000001',pet='00000000-0000-4000-8000-000000000002',bookId='00000000-0000-4000-8000-000000000003',pageId='00000000-0000-4000-8000-000000000004';
vi.mock('@chordjai/auth',()=>({verifySession:vi.fn(async()=>({id:'00000000-0000-4000-8000-000000000001',role:'owner'}))}));
vi.mock('@chordjai/db',()=>({withUser:vi.fn(async(_id,fn)=>fn({query:mocks.query})),withSystem:vi.fn(async fn=>fn({query:mocks.query}))}));
vi.mock('@chordjai/ai',()=>({runStructured:mocks.ai}));
vi.mock('@chordjai/media',()=>({stableMediaContent:(content:string)=>content.split('?')[0],refreshStoredMediaUrls:vi.fn(async(_id,elements)=>elements)}));
import app from './app';
const theme={background:'#ffffff',accent:'#ff8a24',font:'sans'};
const text={id:'text',type:'text',x:100,y:1200,width:500,height:80,rotation:0,content:'A little memory',color:'#3a210d'};
async function request(path:string,method='GET',body?:unknown){const response=await app.request(path,{method,headers:{Authorization:'Bearer test-session','Accept-Language':'en',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};}
beforeEach(()=>{
  vi.clearAllMocks();mocks.book=null;mocks.pages=[];vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Live provider calls are forbidden in memory book tests');}));
  mocks.query.mockImplementation(async(sql:string,args:unknown[]=[])=>{
    if(sql.includes('ops.take_rate_limit'))return{rows:[{allowed:true}],rowCount:1};
    if(sql.includes('FROM identity.users'))return{rowCount:1,rows:[{id:owner,role:'owner',status:'active'}]};
    if(sql.startsWith('select id from pet.pets'))return{rowCount:1,rows:[{id:pet}]};
    if(sql.startsWith('insert into journal.books')){if(mocks.book)return{rowCount:0,rows:[]};mocks.book={id:bookId,pet_id:pet,owner_id:owner,title:args[2],cover_theme:JSON.parse(args[3] as string),cover_elements:JSON.parse(args[4] as string),version:1};return{rowCount:1,rows:[mocks.book]};}
    if(sql.startsWith('update journal.books')){if(!mocks.book||mocks.book.version!==args[5])return{rowCount:0,rows:[]};mocks.book={...mocks.book,title:args[2],cover_theme:JSON.parse(args[3] as string),cover_elements:JSON.parse(args[4] as string),version:Number(mocks.book.version)+1};return{rowCount:1,rows:[mocks.book]};}
    if(sql.startsWith('select pet_id from journal.books'))return{rowCount:mocks.book?1:0,rows:mocks.book?[{pet_id:pet}]:[]};
    if(sql.startsWith('select id from journal.books'))return{rowCount:mocks.book?1:0,rows:mocks.book?[{id:bookId}]:[]};
    if(sql.startsWith('select * from journal.books'))return{rowCount:mocks.book?1:0,rows:mocks.book?[mocks.book]:[]};
    if(sql.startsWith('select id,pet_id from media.objects'))return{rowCount:0,rows:[]};
    if(sql.includes('cover_theme as theme'))return{rowCount:mocks.book?1:0,rows:mocks.book?[{theme:mocks.book.cover_theme,elements:mocks.book.cover_elements,canvas_height:1422,pet_id:pet}]:[]};
    if(sql.startsWith('insert into journal.pages')){const created={id:pageId,pet_id:pet,owner_id:owner,title:args[2],theme:JSON.parse(args[3] as string),elements:JSON.parse(args[4] as string),canvas_height:args[5],story_date:args[6],location:args[7],page_order:mocks.pages.length,version:1};mocks.pages.push(created);return{rowCount:1,rows:[created]};}
    if(sql.startsWith('select theme,elements,canvas_height'))return{rowCount:mocks.pages.length?1:0,rows:mocks.pages.slice(0,1)};
    if(sql.startsWith('select *,story_date::text as story_date from journal.pages'))return{rowCount:mocks.pages.length,rows:mocks.pages};
    return{rowCount:0,rows:[]};
  });
  mocks.ai.mockImplementation(async options=>options.schema.parse({theme,elements:[text]}));
});
describe('memory book HTTP behavior with isolated providers',()=>{
  it('stores a customizable permanent cover, rejects duplicate creation and protects optimistic edits',async()=>{
    expect((await request(`/api/v1/journal/books?petId=${pet}`)).body.data).toBeNull();
    const body={petId:pet,title:'Our days',coverTheme:theme,coverElements:[text]};
    const created=await request('/api/v1/journal/books','POST',body);expect(created.status).toBe(201);expect(created.body.data).toMatchObject({id:bookId,title:'Our days',coverElements:[text],version:1});
    expect((await request('/api/v1/journal/books','POST',body)).status).toBe(409);
    expect((await request(`/api/v1/journal/books/${bookId}`,'PATCH',{...body,title:'Together',version:1})).body.data.version).toBe(2);
    expect((await request(`/api/v1/journal/books/${bookId}`,'PATCH',{...body,title:'Lost edit',version:1})).status).toBe(409);
    expect((await request(`/api/v1/journal/books?petId=${pet}`)).body.data.title).toBe('Together');
  });
  it('stores portrait Story date/place/order and keeps legacy pages compatible',async()=>{
    const created=await request('/api/v1/journal/pages','POST',{petId:pet,title:'Park',theme,elements:[text],canvasHeight:1422,storyDate:'2026-10-11',location:'A happy park'});
    expect(created.status).toBe(201);expect(created.body.data).toMatchObject({canvasHeight:1422,storyDate:'2026-10-11',location:'A happy park',pageOrder:0});
    const legacy=await request('/api/v1/journal/pages','POST',{petId:pet,title:'Old page',theme,elements:[]});expect(legacy.status).toBe(201);expect(legacy.body.data).toMatchObject({canvasHeight:1000,storyDate:null,location:'',pageOrder:1});
    expect(mocks.query.mock.calls.find(([sql])=>sql.startsWith('select id from pet.pets'))![0]).toContain('for update');
  });
  it('rejects invalid page dates, overflows and arbitrary cover photo URLs before saving',async()=>{
    const base={petId:pet,title:'A page',theme,elements:[],canvasHeight:1422};
    expect((await request('/api/v1/journal/pages','POST',{...base,storyDate:'2026-02-30'})).status).toBe(400);
    expect((await request('/api/v1/journal/pages','POST',{...base,elements:[{...text,y:1400}]})).status).toBe(400);
    expect((await request('/api/v1/journal/books','POST',{petId:pet,title:'Cover',coverTheme:theme,coverElements:[{...text,type:'photo',content:'https://evil.example/photo'}]})).status).toBe(400);
    expect(mocks.query.mock.calls.some(([sql])=>sql.startsWith('insert into journal.'))).toBe(false);
  });
  it('returns an AI cover draft at portrait bounds without changing stored user content',async()=>{
    await request('/api/v1/journal/books','POST',{petId:pet,title:'Original',coverTheme:theme,coverElements:[]});
    const result=await request('/api/v1/journal/decorate','POST',{bookId,prompt:'A cheerful cover'});expect(result.status).toBe(200);expect(result.body.data.draft).toBe(true);expect(result.body.data.elements[0].y).toBe(1200);
    expect(mocks.ai.mock.calls[0][0].instructions).toContain('800 by 1422');expect(mocks.ai.mock.calls[0][0].instructions).toContain('English');expect(mocks.book?.cover_elements).toEqual([]);
    expect(mocks.query.mock.calls.some(([sql])=>sql.startsWith('update journal.'))).toBe(false);
  });
  it('rejects AI overflow and mixed decoration targets',async()=>{
    await request('/api/v1/journal/books','POST',{petId:pet,title:'Cover',coverTheme:theme,coverElements:[]});mocks.ai.mockImplementation(async options=>options.schema.parse({theme,elements:[{...text,y:1400}]}));
    expect((await request('/api/v1/journal/decorate','POST',{bookId,prompt:'Anything'})).body.error.code).toBe('AI_LAYOUT_INVALID');
    expect((await request('/api/v1/journal/decorate','POST',{bookId,pageId,prompt:'Anything'})).status).toBe(400);
  });
});
