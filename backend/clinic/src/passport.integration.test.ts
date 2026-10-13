import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withSystem,withUser,closeDatabase} from '@chordjai/db';
import {signSession} from '@chordjai/auth';
import {createService} from '@chordjai/service-kit';
import {passportQuestion,type PassportSnapshot} from '@chordjai/contracts';
import {registerClinicPassportRoutes} from './passport';

const mocks=vi.hoisted(()=>({readMedia:vi.fn(async()=>Buffer.from([255,216,255,217]))}));
vi.mock('@chordjai/media',()=>({readMedia:mocks.readMedia}));
const url=process.env.TEST_DATABASE_URL,isolated=!!url&&['localhost','127.0.0.1','::1'].includes(new URL(url).hostname);
describe.skipIf(!isolated)('Clinic Passport scoped reading and immutable notes on isolated PostgreSQL',()=>{
  const owner=randomUUID(),vet=randomUUID(),staff=randomUUID(),outsider=randomUUID(),pet=randomUUID(),clinicId=randomUUID(),otherClinic=randomUUID();
  const users=[owner,vet,staff,outsider],tokens=new Map<string,string>(),photos:string[]=[];
  const app=createService('clinic-passport-fixture');registerClinicPassportRoutes(app);
  async function fixture({publish=true,confirmed=true,scopes=['passport.read','passport.write']}:{publish?:boolean;confirmed?:boolean;scopes?:string[]}={}){
    const sessionId=randomUUID(),snapshotId=randomUUID(),mediaId=randomUUID(),grantId=randomUUID();photos.push(mediaId);
    const document:PassportSnapshot={protocol:'passport-intake-v1',sessionId,petId:pet,language:'en',pet:{name:'Test pet',species:'cat',sex:'female',birthDate:null,weightKg:4.3},concern:'Ear scratching after a prior visit',episodeId:null,answers:[{questionId:'onset',status:'unknown',value:'',attempts:2,updatedAt:'2026-01-02T00:00:00Z',question:passportQuestion('onset','en',true)},{questionId:'ear_side',status:'answered',value:'Both ears',attempts:1,updatedAt:'2026-01-02T00:00:00Z',question:passportQuestion('ear_side','en')}],history:[],mediaIds:[mediaId],emergency:{urgent:false,codes:[],message:''},summary:{concern:'Ear scratching after a prior visit',answeredCount:1,unknownQuestionIds:['onset'],notApplicableQuestionIds:[]},provenance:'owner_reported',confirmedAt:'2026-01-02T00:00:00Z',sessionVersion:1};
    await withSystem(async db=>{
      await db.query("INSERT INTO media.objects(id,user_id,pet_id,pathname,mime,size,status) VALUES($1,$2,$3,$4,'image/jpeg',4,'ready')",[mediaId,owner,pet,`u/${owner}/${mediaId}.jpg`]);
      const answers=Object.fromEntries(document.answers.map(({questionId,question,...answer})=>[questionId,answer]));
      await db.query("INSERT INTO health.passport_sessions(id,pet_id,created_by,client_session_id,create_hash,language,reason,media_ids,answers,ready_for_review) VALUES($1,$2,$3,$4,repeat('a',64),'en',$5,$6,$7,true)",[sessionId,pet,owner,randomUUID(),document.concern,[mediaId],JSON.stringify(answers)]);
      await db.query('INSERT INTO health.passport_snapshots(id,session_id,pet_id,owner_id,session_version,document) VALUES($1,$2,$3,$4,1,$5)',[snapshotId,sessionId,pet,owner,JSON.stringify(document)]);
      await db.query('INSERT INTO health.passport_snapshot_media(snapshot_id,media_id,position) VALUES($1,$2,0)',[snapshotId,mediaId]);
      if(confirmed)await db.query("UPDATE health.passport_sessions SET status='confirmed',current_snapshot_id=$2,published_to_clinic=$3 WHERE id=$1",[sessionId,snapshotId,publish]);
      await db.query("INSERT INTO identity.grants(id,pet_id,clinic_id,granted_by,scopes,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '1 day')",[grantId,pet,clinicId,owner,scopes]);
    });return{sessionId,snapshotId,mediaId,grantId,document};
  }
  async function call(path:string,user=vet,method='GET',body?:unknown,key=randomUUID()){
    const response=await app.request(path,{method,headers:{Authorization:`Bearer ${tokens.get(user)}`,'Accept-Language':'en',...(body?{'Content-Type':'application/json','Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return{status:response.status,body:await response.json()};
  }
  const path=(session:string,clinic=clinicId)=>`/api/v1/clinic/passports/${session}?clinicId=${clinic}`;
  const note=(snapshotId:string)=>({clinicId,snapshotId,clientNoteId:randomUUID(),findings:'Clinic-recorded observation',treatment:'Treatment recorded by the veterinarian',careInstructions:'Return for reassessment',nextFollowupAt:'2026-10-30T03:00:00Z'});
  beforeAll(async()=>{
    vi.stubEnv('DATABASE_URL',url!);vi.stubEnv('APP_JWT_SECRET','clinic-passport-fixture-secret-over-32-characters');vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Live network forbidden');}));
    await withSystem(async db=>{
      for(const id of users){await db.query("INSERT INTO identity.users(id,line_user_id,display_name,role) VALUES($1,$2,'Passport fixture',$3)",[id,`passport-clinic-${id}`,id===vet?'vet':'owner']);await db.query("INSERT INTO identity.consents(user_id,purpose,granted,version) VALUES($1,'service',true,'fixture')",[id]);}
      await db.query("INSERT INTO pet.pets(id,owner_id,name,species) VALUES($1,$2,'Passport fixture','cat')",[pet,owner]);
      for(const id of[clinicId,otherClinic])await db.query("INSERT INTO clinic.clinics(id,name,verified_at) VALUES($1,'Passport fixture clinic',now())",[id]);
      await db.query("INSERT INTO clinic.members(clinic_id,user_id,role) VALUES($1,$2,'vet'),($1,$3,'staff'),($4,$2,'vet')",[clinicId,vet,staff,otherClinic]);
    });for(const id of users)tokens.set(id,await signSession({id,role:id===vet?'vet':'owner'}));
  });
  afterAll(async()=>{await withSystem(async db=>{await db.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[users]);await db.query('DELETE FROM clinic.clinics WHERE id=ANY($1::uuid[])',[[clinicId,otherClinic]]);await db.query('DELETE FROM ops.jobs WHERE dedupe_key=ANY($1::text[])',[photos.map(id=>`media-delete:${id}`)]);});await closeDatabase();vi.unstubAllEnvs();vi.unstubAllGlobals();});
  it('reads confirmed selected answers and private photos with exact clinic permission',async()=>{
    const f=await fixture();const result=await call(path(f.sessionId));expect(result.status).toBe(200);expect(result.body.data.snapshot.document.answers[0]).toMatchObject({status:'unknown',value:''});expect(result.body.data.snapshot.document.answers[1].value).toBe('Both ears');expect(result.body.data.canWrite).toBe(true);expect(JSON.stringify(result.body)).not.toContain('ownerId');
    const photoUrl=result.body.data.media[0].url;expect(photoUrl).not.toMatch(/read=|token=|Bearer/);const photo=await app.request(photoUrl,{headers:{Authorization:`Bearer ${tokens.get(vet)}`}});expect(photo.status).toBe(200);expect(photo.headers.get('Content-Type')).toBe('image/jpeg');expect(photo.headers.get('Cache-Control')).toBe('private, no-store');expect(mocks.readMedia).toHaveBeenLastCalledWith(f.mediaId,owner);expect(fetch).not.toHaveBeenCalled();
    expect((await call(path(f.sessionId,otherClinic))).status).toBe(403);expect((await call(path(f.sessionId),outsider)).status).toBe(403);
    expect(await withUser(outsider,async db=>(await db.query('SELECT id FROM health.passport_snapshots')).rows)).toEqual([]);
  });
  it('never discloses drafts or unselected publication despite a legacy summary grant',async()=>{
    for(const options of[{publish:false},{confirmed:false},{scopes:['summary.read']}]){await withSystem(db=>db.query('DELETE FROM identity.grants WHERE pet_id=$1',[pet]));const f=await fixture(options);expect((await call(path(f.sessionId))).status).toBe(403);}
  });
  it('grant revocation, expiry, membership removal and clinic verification changes stop current reads',async()=>{
    await withSystem(db=>db.query('DELETE FROM identity.grants WHERE pet_id=$1',[pet]));const f=await fixture();
    await withSystem(db=>db.query('UPDATE identity.grants SET revoked_at=now() WHERE id=$1',[f.grantId]));expect((await call(path(f.sessionId))).status).toBe(403);
    await withSystem(db=>db.query("UPDATE identity.grants SET revoked_at=NULL,expires_at=now()-interval '1 second' WHERE id=$1",[f.grantId]));expect((await call(path(f.sessionId))).status).toBe(403);
    await withSystem(db=>db.query("UPDATE identity.grants SET expires_at=now()+interval '1 day' WHERE id=$1",[f.grantId]));
    await withSystem(db=>db.query('DELETE FROM clinic.members WHERE clinic_id=$1 AND user_id=$2',[clinicId,vet]));expect((await call(path(f.sessionId))).status).toBe(403);
    await withSystem(db=>db.query("INSERT INTO clinic.members(clinic_id,user_id,role) VALUES($1,$2,'vet')",[clinicId,vet]));await withSystem(db=>db.query('UPDATE clinic.clinics SET verified_at=NULL WHERE id=$1',[clinicId]));expect((await call(path(f.sessionId))).status).toBe(403);
    await withSystem(db=>db.query('UPDATE clinic.clinics SET verified_at=now() WHERE id=$1',[clinicId]));
  });
  it('allows staff reading but only authorised veterinarian members write immutable notes',async()=>{
    const f=await fixture();expect((await call(path(f.sessionId),staff)).body.data.canWrite).toBe(false);const body=note(f.snapshotId),route=`/api/v1/clinic/passports/${f.sessionId}/notes`;
    expect((await call(route,staff,'POST',body)).status).toBe(403);const result=await call(route,vet,'POST',body);expect(result.status).toBe(201);expect(result.body.data.authorId).toBe(vet);const read=await call(path(f.sessionId));expect(read.body.data.notes.at(-1)).toMatchObject({findings:body.findings,provenance:'clinician_authored',snapshotId:f.snapshotId});
    await expect(withUser(vet,db=>db.query("UPDATE health.passport_clinic_notes SET findings='Overwritten' WHERE id=$1",[result.body.data.id]))).rejects.toMatchObject({code:'42501'});
    expect((await withSystem(async db=>(await db.query('SELECT document FROM health.passport_snapshots WHERE id=$1',[f.snapshotId])).rows[0])).document).toEqual(f.document);
  });
  it('deduplicates concurrent note retries but rechecks revoked permissions and stale snapshots',async()=>{
    await withSystem(db=>db.query('DELETE FROM identity.grants WHERE pet_id=$1',[pet]));const f=await fixture(),body=note(f.snapshotId),route=`/api/v1/clinic/passports/${f.sessionId}/notes`,key=randomUUID();
    const results=await Promise.all([call(route,vet,'POST',body,key),call(route,vet,'POST',body,key)]);for(const result of results)expect(result.status).toBe(201);expect(results[0].body.data.id).toBe(results[1].body.data.id);
    expect((await call(route,vet,'POST',{...body,findings:'Changed body'},key)).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect((await call(route,vet,'POST',{...body,snapshotId:randomUUID(),clientNoteId:randomUUID()})).body.error.code).toBe('PASSPORT_CHANGED');
    await withSystem(db=>db.query('UPDATE identity.grants SET revoked_at=now() WHERE id=$1',[f.grantId]));expect((await call(route,vet,'POST',body,key)).status).toBe(403);
  });
  it('requires current veterinarian account role and both Passport scopes in the same grant',async()=>{
    await withSystem(db=>db.query('DELETE FROM identity.grants WHERE pet_id=$1',[pet]));const f=await fixture(),body=note(f.snapshotId),route=`/api/v1/clinic/passports/${f.sessionId}/notes`;
    await withSystem(db=>db.query("UPDATE identity.users SET role='owner' WHERE id=$1",[vet]));expect((await call(route,vet,'POST',body)).status).toBe(403);
    await withSystem(db=>db.query("UPDATE identity.users SET role='vet' WHERE id=$1",[vet]));await withSystem(db=>db.query("UPDATE identity.grants SET scopes=ARRAY['passport.write'] WHERE id=$1",[f.grantId]));
    expect((await call(route,vet,'POST',body)).status).toBe(403);
    await withSystem(db=>db.query("INSERT INTO identity.grants(pet_id,clinic_id,granted_by,scopes,expires_at) VALUES($1,$2,$3,ARRAY['passport.read'],now()+interval '1 day')",[pet,clinicId,owner]));
    expect((await call(path(f.sessionId))).status).toBe(200);expect((await call(route,vet,'POST',body)).status).toBe(403);
    const anonymous=await app.request(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});expect(anonymous.status).toBe(401);
  });
  it('does not return photo bytes after access was revoked while private storage was loading',async()=>{
    await withSystem(db=>db.query('DELETE FROM identity.grants WHERE pet_id=$1',[pet]));const f=await fixture();mocks.readMedia.mockImplementationOnce(async()=>{await withSystem(db=>db.query('UPDATE identity.grants SET revoked_at=now() WHERE id=$1',[f.grantId]));return Buffer.from([255,216,255,217]);});
    const result=await call(`/api/v1/clinic/passports/${f.sessionId}/media/${f.mediaId}?clinicId=${clinicId}`);expect(result.status).toBe(403);expect(result.body.error.code).toBe('PASSPORT_GRANT_REQUIRED');
  });
  it('a deleted attachment or owner service-consent withdrawal invalidates the confirmed document',async()=>{
    const f=await fixture();await withSystem(db=>db.query('DELETE FROM media.objects WHERE id=$1',[f.mediaId]));expect((await call(path(f.sessionId))).status).toBe(403);
    const g=await fixture();await withSystem(db=>db.query("UPDATE identity.consents SET granted=false WHERE user_id=$1 AND purpose='service'",[owner]));expect((await call(path(g.sessionId))).status).toBe(403);
    await withSystem(db=>db.query("UPDATE identity.consents SET granted=true WHERE user_id=$1 AND purpose='service'",[owner]));expect((await call(path(g.sessionId))).status).toBe(403);
  });
});
