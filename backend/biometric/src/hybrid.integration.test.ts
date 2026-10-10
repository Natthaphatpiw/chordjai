import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withSystem,closeDatabase} from '@chordjai/db';
import {signSession} from '@chordjai/auth';
const providers=vi.hoisted(()=>({ai:vi.fn(),embed:vi.fn(),image:vi.fn()}));
vi.mock('@chordjai/ai',()=>({runStructured:providers.ai,embedTexts:providers.embed}));
vi.mock('@chordjai/media',()=>({loadOwnedImage:providers.image,mediaUrl:vi.fn()}));
import app,{searchGallery} from './app.js';
const url=process.env.TEST_DATABASE_URL;
const isolated=!!url&&['localhost','127.0.0.1','::1'].includes(new URL(url).hostname);
describe.skipIf(!isolated)('real Postgres PetID privacy filters and hybrid confirmation',()=>{
  const owner=randomUUID(),finder=randomUUID(),outsider=randomUUID();
  const vector=Array.from({length:1536},(_,i)=>i===0?1:0);
  const signature={species:'cat',usable:true,qualityIssues:[],global:'orange cat',face:'white chin',coat:'orange coat',marks:'black nose spot'};
  const mediaIds:string[]=[];let ownerToken='',finderToken='',outsiderToken='',foundMedia='',possibleEnrollment='',possibleGalleryMedia='',differentGalleryMedia='',matchId='';
  async function call(path:string,token:string,method='GET',body?:unknown){
    const response=await app.request(path,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return{status:response.status,body:await response.json()};
  }
  beforeAll(async()=>{
    vi.stubEnv('DATABASE_URL',url!);vi.stubEnv('APP_JWT_SECRET','isolated-petid-test-session-secret-longer-than-32');vi.stubEnv('APP_JWT_ISSUER','https://www.chordjai.life');
    vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Live provider calls are forbidden in isolated PetID tests');}));
    providers.image.mockImplementation(async(_user:string,id:string)=>`data:image/jpeg;base64,${id}`);
    providers.embed.mockResolvedValue([vector]);
    providers.ai.mockImplementation(async(options:{feature:string;images?:string[]})=>options.feature==='petid.signature'?signature:options.images?.[1]?.includes(differentGalleryMedia)?{verdict:'different',observations:['จุดจมูกไม่ตรงกัน'],limitations:''}:{verdict:'possible',observations:['ลักษณะบางส่วนใกล้เคียง'],limitations:'เจ้าของต้องยืนยัน'});
    await withSystem(async db=>{
      for(const id of [owner,finder,outsider])await db.query('insert into identity.users(id,line_user_id,display_name) values($1,$2,$3)',[id,`petid-test-${id}`,'PetID Test']);
      // Exact same vectors deliberately stress privacy filters: similarity alone
      // must never expose off, resolved, wrong-species, own, or deleted images.
      for(const variant of ['possible','different','resolved','off','dog','own','deleted']){
        const pet=randomUUID(),asset=randomUUID(),enrollment=randomUUID(),user=variant==='own'?finder:owner;
        mediaIds.push(asset);
        await db.query('insert into pet.pets(id,owner_id,name,species) values($1,$2,$3,$4)',[pet,user,`PetID ${variant}`,variant==='dog'?'dog':'cat']);
        await db.query('insert into media.objects(id,user_id,pet_id,pathname,mime,size,status) values($1,$2,$3,$4,$5,$6,$7)',[asset,user,pet,`u/${user}/${asset}.jpg`,'image/jpeg',100,variant==='deleted'?'deleted':'ready']);
        await db.query('insert into biometric.enrollments(id,pet_id,user_id,description,signature,search_mode,status,media_id,embedding) values($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9::extensions.vector)',[enrollment,pet,user,'Test gallery',JSON.stringify(signature),variant==='off'?'off':'lost_only','ready',asset,JSON.stringify(vector)]);
        await db.query('insert into lostfound.cases(pet_id,owner_id,public_slug,description,district,status) values($1,$2,$3,$4,$5,$6)',[pet,user,`petid-${enrollment}`,'Test lost pet','Test district',variant==='resolved'?'resolved':'active']);
        if(variant==='possible'){possibleEnrollment=enrollment;possibleGalleryMedia=asset;}
        if(variant==='different')differentGalleryMedia=asset;
      }
      foundMedia=randomUUID();mediaIds.push(foundMedia);
      await db.query('insert into media.objects(id,user_id,pathname,mime,size,status) values($1,$2,$3,$4,$5,$6)',[foundMedia,finder,`u/${finder}/${foundMedia}.jpg`,'image/jpeg',100,'ready']);
    });
    [ownerToken,finderToken,outsiderToken]=await Promise.all([owner,finder,outsider].map(id=>signSession({id,role:'owner'})));
  });
  afterAll(async()=>{
    await withSystem(async db=>{await db.query('delete from identity.users where id=any($1::uuid[])',[[owner,finder,outsider]]);await db.query('delete from ops.jobs where dedupe_key=any($1::text[])',[mediaIds.map(id=>`media-delete:${id}`)]);});
    await closeDatabase();vi.unstubAllEnvs();vi.unstubAllGlobals();
  });
  it('retrieves only active opted-in ready images of another owner and the same species',async()=>{
    const candidates=await searchGallery(finder,'cat',vector);
    expect(candidates).toHaveLength(2);expect(new Set(candidates.map(row=>row.media_id))).toEqual(new Set([possibleGalleryMedia,differentGalleryMedia]));
    expect(candidates.every(row=>row.user_id===owner&&Number.isFinite(row.score))).toBe(true);
  });
  it('combines vector neighbours with vision and persists only unconfirmed evidence',async()=>{
    const result=await call('/api/v1/biometric/identify',finderToken,'POST',{mediaId:foundMedia});expect(result.status).toBe(200);expect(result.body.data.candidates).toHaveLength(1);
    expect(result.body.data.candidates[0].status).toBe('owner_confirmation_required');expect(JSON.stringify(result.body)).not.toContain(owner);
    matchId=result.body.data.candidates[0].matchId;
    await withSystem(async db=>{const match=(await db.query('select enrollment_id,owner_confirmed,evidence from biometric.matches where id=$1',[matchId])).rows[0];expect(match.enrollment_id).toBe(possibleEnrollment);expect(match.owner_confirmed).toBeNull();expect(match.evidence.identityProof).toBe(false);});
    expect(providers.ai.mock.calls.filter(([o])=>o.feature==='petid.verify_pair')).toHaveLength(2);expect(fetch).not.toHaveBeenCalled();
  });
  it('allows confirmation only to the enrollment owner under real RLS',async()=>{
    expect((await call(`/api/v1/biometric/matches/${matchId}/confirm`,finderToken,'POST',{confirmed:true})).status).toBe(404);
    expect((await call(`/api/v1/biometric/matches/${matchId}/confirm`,outsiderToken,'POST',{confirmed:true})).status).toBe(404);
    const accepted=await call(`/api/v1/biometric/matches/${matchId}/confirm`,ownerToken,'POST',{confirmed:true});expect(accepted.status).toBe(200);expect(accepted.body.data.ownerConfirmed).toBe(true);
  });
  it('withdrawal clears vector and removes the enrollment from either retrieval path',async()=>{
    expect((await call(`/api/v1/biometric/enrollments/${possibleEnrollment}`,ownerToken,'PATCH',{searchMode:'off'})).status).toBe(200);
    const candidates=await searchGallery(finder,'cat',vector);expect(candidates.map(row=>row.id)).not.toContain(possibleEnrollment);
    await withSystem(async db=>{const row=(await db.query('select embedding,status,search_mode from biometric.enrollments where id=$1',[possibleEnrollment])).rows[0];expect(row.embedding).toBeNull();expect(row.status).toBe('withdrawn');});
  });
});
