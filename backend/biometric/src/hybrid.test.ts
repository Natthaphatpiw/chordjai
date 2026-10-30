import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
const mocks=vi.hoisted(()=>({query:vi.fn(),ai:vi.fn(),embed:vi.fn(),image:vi.fn(),indexed:[] as unknown[],exact:[] as unknown[],hasIndex:true}));
vi.mock('@chordjai/db',()=>({withSystem:async(callback:(tx:{query:typeof mocks.query})=>Promise<unknown>)=>callback({query:mocks.query}),withUser:async(_id:string,callback:(tx:{query:typeof mocks.query})=>Promise<unknown>)=>callback({query:mocks.query})}));
vi.mock('@chordjai/ai',()=>({runStructured:mocks.ai,embedTexts:mocks.embed}));
vi.mock('@chordjai/media',()=>({loadOwnedImage:mocks.image,mediaUrl:vi.fn()}));
import {signSession} from '@chordjai/auth';
import app,{searchGallery,INDEXED_GALLERY_SQL,EXACT_GALLERY_SQL,type GalleryCandidate} from './app.js';
const finder=randomUUID(),owner=randomUUID(),foundImage=randomUUID();
const vector=Array.from({length:1536},(_,i)=>i===0?1:0);
const visual={species:'cat',usable:true,qualityIssues:[],global:'orange cat',face:'white chin',coat:'orange striped coat',marks:'small black spot on nose'};
function candidate(index:number):GalleryCandidate{return{id:randomUUID(),user_id:owner,media_id:randomUUID(),public_slug:`lost-cat-${index}`,score:0.99-index/100,signature:visual as GalleryCandidate['signature']};}
describe('PetID vector retrieval + vision verification with mocked providers',()=>{
  beforeEach(()=>{
    vi.stubEnv('APP_JWT_SECRET','unit-test-petid-session-secret-more-than-32');vi.stubEnv('APP_JWT_ISSUER','https://www.chordjai.life');
    vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Live providers are forbidden in this test');}));
    mocks.hasIndex=true;mocks.indexed=[];mocks.exact=[];
    mocks.image.mockImplementation(async(_user:string,id:string)=>`data:image/jpeg;base64,${id}`);
    mocks.embed.mockResolvedValue([vector]);
    mocks.ai.mockImplementation(async(options:{feature:string})=>options.feature==='petid.signature'?visual:{verdict:'possible',observations:['ลักษณะขนใกล้เคียง'],limitations:'ต้องให้เจ้าของยืนยัน'});
    mocks.query.mockImplementation(async(sql:string,params:unknown[]=[])=>{
    if(sql.includes('ops.take_rate_limit'))return{rows:[{allowed:true}],rowCount:1};
      if(sql.includes('SELECT id,role,status FROM identity.users'))return{rows:[{id:params[0],role:'owner',status:'active'}],rowCount:1};
      if(sql.includes('from pg_extension'))return{rows:[{extversion:'0.8.7',indexed:mocks.hasIndex}],rowCount:1};
      if(sql===INDEXED_GALLERY_SQL)return{rows:mocks.indexed,rowCount:mocks.indexed.length};
      if(sql===EXACT_GALLERY_SQL)return{rows:mocks.exact,rowCount:mocks.exact.length};
      if(sql.includes('select e.id from biometric.enrollments'))return{rows:[{id:params[0]}],rowCount:1};
      if(sql.includes('insert into biometric.matches'))return{rows:[{id:randomUUID()}],rowCount:1};
      return{rows:[],rowCount:1};
    });
  });
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();});
  async function identify(language='th'){const token=await signSession({id:finder,role:'owner'});return app.request('/api/v1/biometric/identify',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,'Accept-Language':language},body:JSON.stringify({mediaId:foundImage})});}
  it('uses the selected language for explanations while keeping vector signatures in English',async()=>{
    mocks.indexed=Array.from({length:5},(_,i)=>candidate(i));
    const body=await(await identify('en-GB')).json();
    expect(body.data.notice).not.toMatch(/[\u0e00-\u0e7f]/);
    expect(mocks.ai.mock.calls.find(([options])=>options.feature==='petid.verify_pair')?.[0].instructions).toContain('entirely in English');
    expect(mocks.ai.mock.calls.find(([options])=>options.feature==='petid.signature')?.[0].instructions).toContain('English visual signature');
    expect(mocks.ai.mock.calls.find(([options])=>options.feature==='petid.signature')?.[0].instructions).toContain('qualityIssues explanations in English');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('recovers missing ANN candidates with exact search before vision verification',async()=>{
    mocks.indexed=[candidate(0),candidate(1)];mocks.exact=[...mocks.indexed,candidate(2),candidate(3),candidate(4)];
    const response=await identify(),body=await response.json();expect(response.status).toBe(200);expect(body.data.candidates).toHaveLength(5);
    expect(mocks.query.mock.calls.filter(([sql])=>sql===EXACT_GALLERY_SQL)).toHaveLength(1);
    expect(mocks.ai.mock.calls.filter(([o])=>o.feature==='petid.verify_pair')).toHaveLength(5);
    expect(mocks.embed.mock.calls[0]?.[1][0]).toContain('Face: white chin');
    expect(mocks.ai.mock.calls.find(([o])=>o.feature==='petid.verify_pair')?.[0].input.gallerySignature).toEqual(visual);
    expect(body.data.candidates.every((row:{status:string})=>row.status==='owner_confirmation_required')).toBe(true);
    expect(JSON.stringify(body)).not.toContain(owner);expect(body.data.candidates[0].score).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps a high cosine neighbour out when vision sees incompatible markings',async()=>{
    mocks.indexed=Array.from({length:5},(_,i)=>candidate(i));
    mocks.ai.mockImplementation(async(options:{feature:string;images?:string[]})=>options.feature==='petid.signature'?visual:options.images?.[1]?.includes((mocks.indexed[0] as GalleryCandidate).media_id)?{verdict:'different',observations:['ลายจมูกต่างกัน'],limitations:''}:{verdict:'possible',observations:[],limitations:'เจ้าของต้องยืนยัน'});
    const body=await(await identify()).json();expect(body.data.candidates).toHaveLength(4);
    expect(mocks.query.mock.calls.filter(([sql])=>sql.includes('insert into biometric.matches'))).toHaveLength(4);
    expect(mocks.query.mock.calls.some(([sql])=>sql===EXACT_GALLERY_SQL)).toBe(false);
  });
  it('never promotes a failed LLM comparison to proven identity',async()=>{
    mocks.indexed=Array.from({length:5},(_,i)=>candidate(i));
    mocks.ai.mockImplementation(async(options:{feature:string})=>{if(options.feature==='petid.signature')return visual;throw new Error('mocked AI unavailable');});
    const body=await(await identify()).json();expect(body.data.status).toBe('possible');
    expect(body.data.candidates.every((row:{status:string})=>row.status==='owner_confirmation_required')).toBe(true);
    const evidence=mocks.query.mock.calls.filter(([sql])=>sql.includes('insert into biometric.matches')).map(([,params])=>JSON.parse(params[2]));
    expect(evidence.every(row=>row.identityProof===false&&row.verification.verdict==='insufficient')).toBe(true);
  });
  it('drops a withdrawn or resolved enrollment after retrieval before creating a match',async()=>{
    mocks.indexed=Array.from({length:5},(_,i)=>candidate(i));
    const implementation=mocks.query.getMockImplementation()!;
    mocks.query.mockImplementation(async(sql:string,params:unknown[])=>sql.includes('select e.id from biometric.enrollments')?{rows:[],rowCount:0}:implementation(sql,params));
    const body=await(await identify()).json();expect(body.data).toMatchObject({status:'no_match',candidates:[]});
    expect(mocks.query.mock.calls.some(([sql])=>sql.includes('insert into biometric.matches'))).toBe(false);
  });
  it('requires usable photos and valid 1536-dimensional nonzero vectors',async()=>{
    mocks.ai.mockResolvedValue({...visual,usable:false});const insufficient=await(await identify()).json();expect(insufficient.data.status).toBe('insufficient');expect(mocks.embed).not.toHaveBeenCalled();
    await expect(searchGallery(finder,'cat',[1,0])).rejects.toMatchObject({code:'EMBEDDING_INVALID'});
    await expect(searchGallery(finder,'cat',Array(1536).fill(0))).rejects.toMatchObject({code:'EMBEDDING_INVALID'});
  });
  it('uses exact search when the HNSW migration is absent',async()=>{
    mocks.hasIndex=false;mocks.exact=[candidate(0)];
    expect(await searchGallery(finder,'cat',vector)).toHaveLength(1);
    expect(mocks.query.mock.calls.some(([sql])=>sql===INDEXED_GALLERY_SQL)).toBe(false);
  });
});
