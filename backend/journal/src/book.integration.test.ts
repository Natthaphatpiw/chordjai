import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { signSession } from '@chordjai/auth';
import { withSystem, closeDatabase } from '@chordjai/db';
import journal from './app';
import identity from '../../identity/src/app';
const testUrl=process.env.TEST_DATABASE_URL;
const isolated=!!testUrl&&['localhost','127.0.0.1','::1'].includes(new URL(testUrl).hostname);
describe.skipIf(!isolated)('permanent memory books in isolated PostgreSQL',()=>{
  const owner=randomUUID(),stranger=randomUUID(),viewer=randomUUID(),carer=randomUUID(),petId=randomUUID(),foreignPet=randomUUID(),ownPhoto=randomUUID(),foreignPhoto=randomUUID(),secondOwnedPet=randomUUID(),wrongPetPhoto=randomUUID(),finderPhoto=randomUUID();
  let ownerToken='',strangerToken='',viewerToken='',carerToken='',bookId='';const pageIds:string[]=[];
  const theme={background:'#fffaf5',font:'sans',accent:'#ff8a24'};
  const caption={id:'caption',type:'text',x:90,y:1200,width:600,height:100,rotation:0,content:'An adventure to remember',color:'#3a210d'};
  const coverBody=()=>({petId,title:'Our little days',coverTheme:theme,coverElements:[caption]});
  async function call(path:string,token=ownerToken,method='GET',body?:unknown,key?:string,app=journal){
    const response=await app.request(path,{method,headers:{Authorization:`Bearer ${token}`,'Accept-Language':'en',...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return{status:response.status,body:await response.json(),replayed:response.headers.get('Idempotency-Replayed')};
  }
  beforeAll(async()=>{
    vi.stubEnv('DATABASE_URL',testUrl!);vi.stubEnv('APP_JWT_SECRET','isolated-memorybook-test-secret-at-least-32-characters');vi.stubEnv('APP_JWT_ISSUER','https://www.chordjai.life');
    vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Live providers are forbidden in memory book database tests');}));
    await withSystem(async db=>{
      for(const user of [owner,stranger,viewer,carer])await db.query('insert into identity.users(id,line_user_id,display_name) values($1,$2,$3)',[user,`memory-book-${user}`,'Memory Book Test']);
      await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'Tofu','cat'),($3,$4,'Other Pet','dog')",[petId,owner,foreignPet,stranger]);
      await db.query("insert into pet.members(pet_id,user_id,role) values($1,$2,'viewer'),($1,$3,'carer')",[petId,viewer,carer]);
      await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'Other own pet','dog')",[secondOwnedPet,owner]);
      for(const[id,user,pet]of [[ownPhoto,owner,petId],[foreignPhoto,stranger,foreignPet],[wrongPetPhoto,owner,secondOwnedPet],[finderPhoto,owner,null]])await db.query("insert into media.objects(id,user_id,pet_id,pathname,mime,size,status) values($1,$2,$3,$4,'image/jpeg',10,'ready')",[id,user,pet,`u/${user}/${id}.jpg`]);
    });
    [ownerToken,strangerToken,viewerToken,carerToken]=await Promise.all([owner,stranger,viewer,carer].map(id=>signSession({id,role:'owner'})));
  });
  afterAll(async()=>{
    await withSystem(async db=>{await db.query('delete from identity.users where id=any($1::uuid[])',[[owner,stranger,viewer,carer]]);await db.query('delete from ops.jobs where dedupe_key=any($1::text[])',[[ownPhoto,foreignPhoto,wrongPetPhoto,finderPhoto].map(id=>`media-delete:${id}`)]);});
    await closeDatabase();vi.unstubAllGlobals();vi.unstubAllEnvs();
  });
  it('creates one personal cover across retries and rejects competing optimistic updates',async()=>{
    expect((await call(`/api/v1/journal/books?petId=${petId}`)).body.data).toBeNull();const key=randomUUID();
    const created=await call('/api/v1/journal/books',ownerToken,'POST',coverBody(),key);expect(created.status).toBe(201);bookId=created.body.data.id;
    expect(created.body.data.coverElements[0].y).toBe(1200);
    const retried=await call('/api/v1/journal/books',ownerToken,'POST',coverBody(),key);expect(retried.body.data.id).toBe(bookId);expect(retried.replayed).toBe('true');
    expect((await call('/api/v1/journal/books',ownerToken,'POST',coverBody())).status).toBe(409);
    const changed=await call(`/api/v1/journal/books/${bookId}`,ownerToken,'PATCH',{...coverBody(),title:'Our tiny adventures',version:1});expect(changed.status).toBe(200);expect(changed.body.data.version).toBe(2);
    expect((await call(`/api/v1/journal/books/${bookId}`,ownerToken,'PATCH',{...coverBody(),title:'An overwritten edit',version:1})).status).toBe(409);
    expect((await call(`/api/v1/journal/books?petId=${petId}`)).body.data.title).toBe('Our tiny adventures');
  });
  it('persists three ordered pages, portrait date/place and legacy shape across edits and retries',async()=>{
    const firstBody={petId,title:'Legacy page',theme,elements:[]};const key=randomUUID();
    const legacy=await call('/api/v1/journal/pages',ownerToken,'POST',firstBody,key);expect(legacy.status).toBe(201);pageIds.push(legacy.body.data.id);expect(legacy.body.data).toMatchObject({canvasHeight:1000,pageOrder:0,storyDate:null,location:''});
    expect((await call('/api/v1/journal/pages',ownerToken,'POST',firstBody,key)).body.data.id).toBe(pageIds[0]);
    for(const title of ['The park','Home again']){
      const next=await call('/api/v1/journal/pages',ownerToken,'POST',{petId,title,theme,elements:[caption],canvasHeight:1422,storyDate:'2026-10-11',location:'Our favourite park'});expect(next.status).toBe(201);expect(next.body.data.storyDate).toBe('2026-10-11');pageIds.push(next.body.data.id);
    }
    const changed=await call(`/api/v1/journal/pages/${pageIds[0]}`,ownerToken,'PATCH',{title:'Legacy page edited later',theme,elements:[],version:1});expect(changed.status).toBe(200);
    const listed=await call(`/api/v1/journal/pages?petId=${petId}`);expect(listed.body.data.map((page:{id:string})=>page.id)).toEqual(pageIds);expect(listed.body.data.map((page:{pageOrder:number})=>page.pageOrder)).toEqual([0,1,2]);
    const portrait=await call(`/api/v1/journal/pages/${pageIds[1]}`);expect(portrait.body.data).toMatchObject({canvasHeight:1422,storyDate:'2026-10-11',location:'Our favourite park'});
    expect((await call(`/api/v1/journal/pages/${pageIds[1]}`,ownerToken,'PATCH',{title:'Out of bounds',theme,elements:[{...caption,y:1400}],canvasHeight:1422,version:1})).status).toBe(400);
  });
  it('isolates covers and pages by their author and rejects cross-owner/viewer writes',async()=>{
    for(const token of [strangerToken,viewerToken]){
      expect((await call(`/api/v1/journal/books?petId=${petId}`,token)).body.data).toBeNull();expect((await call(`/api/v1/journal/pages?petId=${petId}`,token)).body.data).toEqual([]);
      expect((await call(`/api/v1/journal/pages/${pageIds[0]}`,token)).status).toBe(404);
      expect((await call(`/api/v1/journal/books/${bookId}`,token,'PATCH',{...coverBody(),version:2})).status).toBe(404);
      expect([403,404]).toContain((await call('/api/v1/journal/books',token,'POST',coverBody())).status);
      expect([403,404]).toContain((await call('/api/v1/journal/pages',token,'POST',{petId,title:'Forbidden',theme,elements:[]})).status);
    }
    const separate=await call('/api/v1/journal/books',carerToken,'POST',{...coverBody(),title:'Carer memories'});expect(separate.status).toBe(201);expect(separate.body.data.id).not.toBe(bookId);
    expect((await call(`/api/v1/journal/books?petId=${petId}`)).body.data.id).toBe(bookId);
    const carerPage=await call('/api/v1/journal/pages',carerToken,'POST',{petId,title:'Carer page',theme,elements:[]});expect(carerPage.status).toBe(201);expect(carerPage.body.data.pageOrder).toBe(0);
  });
  it('allows uploaded own pet photos and blocks another account photos and arbitrary remote URLs',async()=>{
    const photo={id:'photo',type:'photo',x:100,y:200,width:500,height:500,rotation:0,content:`/api/v1/media/${ownPhoto}`};
    const saved=await call(`/api/v1/journal/books/${bookId}`,ownerToken,'PATCH',{...coverBody(),title:'Our tiny adventures',coverElements:[photo],version:2});expect(saved.status).toBe(200);expect(saved.body.data.coverElements[0].content).toContain(`/api/v1/media/${ownPhoto}?read=`);
    const foreign={...photo,content:`/api/v1/media/${foreignPhoto}`};
    expect((await call(`/api/v1/journal/books/${bookId}`,ownerToken,'PATCH',{...coverBody(),coverElements:[foreign],version:3})).status).toBe(404);
    expect((await call('/api/v1/journal/pages',ownerToken,'POST',{petId,title:'Not my photo',theme,elements:[foreign]})).status).toBe(404);
    expect((await call('/api/v1/journal/pages',ownerToken,'POST',{petId,title:'External tracker',theme,elements:[{...photo,content:'https://evil.example/photo'}]})).status).toBe(400);
    for(const media of [wrongPetPhoto,finderPhoto]){
      const mismatched=await call('/api/v1/journal/pages',ownerToken,'POST',{petId,title:'Wrong context',theme,elements:[{...photo,content:`/api/v1/media/${media}`}]});
      expect(mismatched.status).toBe(400);expect(mismatched.body.error.code).toBe('IMAGE_PET_MISMATCH');
    }
    expect(await withSystem(async db=>(await db.query('select cover_elements from journal.books where id=$1',[bookId])).rows[0].cover_elements[0].content)).toBe(`/api/v1/media/${ownPhoto}`);
  });
  it('rejects stale copied, mismatched and deleted photo references before an AI request',async()=>{
    const photo={id:'old-photo',type:'photo',x:100,y:200,width:500,height:500,rotation:0};
    for(const[media,code]of [[foreignPhoto,'PHOTO_REFERENCE_INVALID'],[wrongPetPhoto,'IMAGE_PET_MISMATCH'],[finderPhoto,'IMAGE_PET_MISMATCH']]){
      await withSystem(db=>db.query('update journal.books set cover_elements=$2::jsonb where id=$1',[bookId,JSON.stringify([{...photo,content:`/api/v1/media/${media}`}])]));
      const result=await call('/api/v1/journal/decorate',ownerToken,'POST',{bookId,prompt:'Make it playful'});expect(result.body.error.code).toBe(code);
    }
    await withSystem(async db=>{await db.query('update journal.books set cover_elements=$2::jsonb where id=$1',[bookId,JSON.stringify([{...photo,content:`/api/v1/media/${ownPhoto}`}])]);await db.query("update media.objects set status='deleted' where id=$1",[ownPhoto]);});
    expect((await call('/api/v1/journal/decorate',ownerToken,'POST',{bookId,prompt:'Make it playful'})).body.error.code).toBe('PHOTO_REFERENCE_INVALID');
    await withSystem(db=>db.query("update media.objects set status='ready' where id=$1",[ownPhoto]));expect(fetch).not.toHaveBeenCalled();
  });
  it('serializes concurrent additions into distinct book page positions',async()=>{
    const created=await Promise.all(['Concurrent A','Concurrent B','Concurrent C'].map(title=>call('/api/v1/journal/pages',ownerToken,'POST',{petId,title,theme,elements:[],canvasHeight:1422},randomUUID())));
    expect(created.map(page=>page.status)).toEqual([201,201,201]);expect(new Set(created.map(page=>page.body.data.pageOrder)).size).toBe(3);expect(created.map(page=>page.body.data.pageOrder).sort()).toEqual([3,4,5]);
  });
  it('includes personal book/page metadata in export and cascades author deletion',async()=>{
    const exported=await call('/api/v1/identity/export',ownerToken,'GET',undefined,undefined,identity);expect(exported.status).toBe(200);expect(exported.body.data.memoryBooks).toHaveLength(1);expect(exported.body.data.memoryBooks[0].title).toBe('Our tiny adventures');expect(exported.body.data.journal.find((page:{id:string})=>page.id===pageIds[1])).toMatchObject({canvasHeight:1422,storyDate:'2026-10-11',location:'Our favourite park'});
    const viewerExport=await call('/api/v1/identity/export',viewerToken,'GET',undefined,undefined,identity);expect(viewerExport.status).toBe(200);expect(viewerExport.body.data.memoryBooks).toEqual([]);expect(viewerExport.body.data.journal).toEqual([]);
    await withSystem(db=>db.query('delete from identity.users where id=$1',[owner]));
    const remaining=await withSystem(async db=>({books:(await db.query('select id from journal.books where pet_id=$1 or owner_id=$2',[petId,owner])).rowCount,pages:(await db.query('select id from journal.pages where pet_id=$1 or owner_id=$2',[petId,owner])).rowCount}));expect(remaining).toEqual({books:0,pages:0});expect((await call(`/api/v1/journal/books?petId=${petId}`)).status).toBe(401);expect(fetch).not.toHaveBeenCalled();
  });
});
