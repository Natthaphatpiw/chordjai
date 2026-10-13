import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import {withSystem,withUser,closeDatabase} from '@chordjai/db';
import {signSession} from '@chordjai/auth';
import {FOLLOWUP_CONSENT_VERSION,type PassportSession} from '@chordjai/contracts';
import share from './app';
import health from '../../health/src/app';
import identity from '../../identity/src/app';
import notification from '../../notification/src/app';
const mock=vi.hoisted(()=>({bytes:Buffer.from('synthetic private passport jpeg'),read:vi.fn(),ai:vi.fn(),push:vi.fn(),reply:vi.fn()}));
vi.mock('@chordjai/media',async original=>({...await original<typeof import('@chordjai/media')>(),mediaUrl:vi.fn(async(asset:{id:string})=>`/api/v1/media/${asset.id}`),readMedia:mock.read}));
vi.mock('@chordjai/ai',async original=>({...await original<typeof import('@chordjai/ai')>(),runStructured:mock.ai}));
vi.mock('@chordjai/line',async original=>({...await original<typeof import('@chordjai/line')>(),pushMessage:mock.push,replyMessage:mock.reply}));
const connection=process.env.TEST_DATABASE_URL;
const isolated=!!connection&&['localhost','127.0.0.1','::1'].includes(new URL(connection).hostname);
describe.skipIf(!isolated)('Owner-confirmed Passport sharing and post-visit continuity',()=>{
 const owner=randomUUID(),other=randomUUID(),pet=randomUUID(),image=randomUUID(),unselected=randomUUID(),source=randomUUID();
 const tokens=new Map<string,string>();
 async function call(app:typeof share,path:string,actor:string|null=owner,method='GET',body?:unknown,key?:string){
  const res=await app.request(path,{method,headers:{...(actor?{Authorization:`Bearer ${tokens.get(actor)}`}:{ }),...(body?{'Content-Type':'application/json','Idempotency-Key':key??randomUUID()}:{}),},...(body?{body:JSON.stringify(body)}:{})});
  return{status:res.status,body:await res.json()};
 }
 async function draft(photos=[image],historyEntryIds:string[]=[]){const r=await call(health,'/api/v1/health/passport/sessions',owner,'POST',{petId:pet,clientSessionId:randomUUID(),language:'en',reason:'Ear scratching has increased over two days',mediaIds:photos,historyEntryIds});expect(r.status,JSON.stringify(r.body)).toBe(201);return r.body.data as PassportSession;}
 async function ready(current:PassportSession){
  for(let i=0;current.nextQuestion&&i<45;i++){
   const q=current.nextQuestion.id,r=await call(health,`/api/v1/health/passport/sessions/${current.id}/answers`,owner,'POST',{version:current.version,questionId:q,status:q==='danger_signs'?'answered':'unknown',value:q==='danger_signs'?'None of these':''});
   expect(r.status,JSON.stringify(r.body)).toBe(200);current=r.body.data;
  }
  expect(current.readyForReview).toBe(true);
  const r=await call(health,`/api/v1/health/passport/sessions/${current.id}/confirm`,owner,'POST',{version:current.version,ownerConfirmed:true,publishToClinic:false});expect(r.status,JSON.stringify(r.body)).toBe(200);return r.body.data as PassportSession;
 }
 async function link(current:PassportSession){const body={sessionId:current.id,version:current.version,requestId:randomUUID(),expiresInDays:7},r=await call(share,'/api/v1/share/passports',owner,'POST',body);expect(r.status,JSON.stringify(r.body)).toBe(201);return{body,data:r.body.data,token:new URL(r.body.data.url).pathname.split('/').at(-1)!};}
 const publicPath=(token:string)=>`/api/v1/share/public/passport/${token}`;
 beforeAll(async()=>{
  process.env.DATABASE_URL=connection!;process.env.APP_JWT_SECRET='passport-share-fixture-only-secret-0123456789abcdef';
  process.env.APP_ORIGIN='https://www.chordjai.life';
  await withSystem(async db=>{
   for(const id of [owner,other]){await db.query("INSERT INTO identity.users(id,line_user_id,display_name) VALUES($1,$2,'Synthetic Passport owner')",[id,`passport-share-${id}`]);await db.query("INSERT INTO identity.consents(user_id,purpose,granted,version) VALUES($1,'service',true,'passport-test')",[id]);}
   await db.query("INSERT INTO pet.pets(id,owner_id,name,species) VALUES($1,$2,'Synthetic Peony','cat')",[pet,owner]);
   for(const id of [image,unselected])await db.query("INSERT INTO media.objects(id,user_id,pet_id,pathname,mime,size,status) VALUES($1,$2,$3,$4,'image/jpeg',100,'ready')",[id,owner,pet,`synthetic/${id}.jpg`]);
   await db.query("INSERT INTO health.care_entries(id,pet_id,created_by,client_entry_id,create_hash,kind,title,observed_at,narrative,clinical_note,visit,share_with_clinic) VALUES($1,$2,$3,$4,repeat('a',64),'visit','Prior ear care',now()-interval '5 days','PRIVATE_STORY_CANARY','Owner reports ear scratching',$5::jsonb,true)",[source,pet,owner,randomUUID(),JSON.stringify({clinicName:'Synthetic clinic',reason:'Ear scratching',vetReportedFindings:'Owner-recorded prior care',treatment:'Recorded care',nextFollowupAt:null})]);
   await db.query("INSERT INTO health.care_reflections(entry_id,author_id,content) VALUES($1,$2,'PRIVATE_REFLECTION_CANARY')",[source,owner]);
  });
  for(const id of [owner,other])tokens.set(id,await signSession({id,role:'owner'}));
 });
 beforeEach(()=>{mock.read.mockReset().mockResolvedValue(mock.bytes);mock.ai.mockReset().mockRejectedValue(new Error('Synthetic provider unavailable: deterministic Q&A fallback'));mock.push.mockReset().mockResolvedValue(undefined);mock.reply.mockReset().mockResolvedValue(undefined);vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('No real network in Passport tests');}));});
 afterAll(async()=>{vi.unstubAllGlobals();await withSystem(db=>db.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[[owner,other]]));await closeDatabase();});
 it('keeps draft and unconfirmed answers private and requires the actual owner',async()=>{
  const current=await draft();expect((await call(share,'/api/v1/share/passports',owner,'POST',{sessionId:current.id,version:current.version,requestId:randomUUID()})).status).toBe(409);
  expect((await call(health,`/api/v1/health/passport/sessions/${current.id}`,other)).status).toBe(404);
  expect((await call(share,'/api/v1/share/passports',other,'POST',{sessionId:current.id,version:current.version,requestId:randomUUID()})).status).toBe(409);
  expect((await call(share,'/api/v1/share/passports',null,'POST',{})).status).toBe(401);
 });
 it('shares the exact confirmed Q&A and only selected clinical history/photos with stable retries',async()=>{
  const current=await ready(await draft([image],[source])),created=await link(current);
  const retry=await call(share,'/api/v1/share/passports',owner,'POST',created.body);expect(retry.body.data).toEqual(created.data);
  expect((await call(share,'/api/v1/share/passports',owner,'POST',{...created.body,expiresInDays:8})).status).toBe(409);
  const read=await call(share,publicPath(created.token),null);expect(read.status).toBe(200);
  expect(read.body.data.document).toEqual(current.confirmation!.document);expect(read.body.data.photos).toHaveLength(1);
  for(const canary of ['PRIVATE_STORY_CANARY','PRIVATE_REFLECTION_CANARY','read=','pathname',unselected])expect(JSON.stringify(read.body)).not.toContain(canary);
  expect(read.body.data.document.answers.some((a:{status:string})=>a.status==='unknown')).toBe(true);
  const photo=await share.request(`${publicPath(created.token)}/media/${image}`);expect(photo.status).toBe(200);expect(Buffer.from(await photo.arrayBuffer())).toEqual(mock.bytes);expect(photo.headers.get('cache-control')).toBe('private, no-store');
  expect((await share.request(`${publicPath(created.token)}/media/${unselected}`)).status).toBe(404);
  const exported=await call(identity,'/api/v1/identity/export');expect(exported.status).toBe(200);expect(exported.body.data.passportSnapshots.some((s:{sessionId:string})=>s.sessionId===current.id)).toBe(true);expect(JSON.stringify(exported.body.data.passportLinks)).not.toContain(created.token);
 });
 it('editing invalidates old links even with the original HTTP key, until owner confirms a new snapshot',async()=>{
  let current=await ready(await draft()),created=await link(current);const httpKey=randomUUID();
  expect((await call(share,'/api/v1/share/passports',owner,'POST',created.body,httpKey)).status).toBe(201);
  const changed=await call(health,`/api/v1/health/passport/sessions/${current.id}`,owner,'PATCH',{version:current.version,reason:'Ear scratching increased again'});expect(changed.status).toBe(200);current=changed.body.data;
  expect(current.status).toBe('draft');expect((await call(share,publicPath(created.token),null)).status).toBe(410);
  expect((await call(share,'/api/v1/share/passports',owner,'POST',created.body,httpKey)).status).toBe(409);
  expect((await call(share,`/api/v1/share/passports/${created.data.id}`,owner,'DELETE')).status).toBe(200);
  current=await ready(current);const fresh=await link(current);expect((await call(share,publicPath(fresh.token),null)).status).toBe(200);expect(fresh.token).not.toBe(created.token);
 });
 it('explicit revocation and expiry prevent text and images without creating another capability on retry',async()=>{
  const current=await ready(await draft()),created=await link(current);
  expect((await call(share,`/api/v1/share/passports/${created.data.id}`,owner,'DELETE')).status).toBe(200);
  expect((await call(share,publicPath(created.token),null)).status).toBe(410);expect((await share.request(`${publicPath(created.token)}/media/${image}`)).status).toBe(410);
  expect((await call(share,'/api/v1/share/passports',owner,'POST',created.body)).status).toBe(410);
  const expiring=await link(current);await withSystem(db=>db.query("UPDATE health.passport_share_links SET created_at=now()-interval '8 days',expires_at=now()-interval '1 day' WHERE id=$1",[expiring.data.id]));expect((await call(share,publicPath(expiring.token),null)).status).toBe(410);
 });
 it('permission withdrawn while loading private bytes is checked again before the response',async()=>{
  const current=await ready(await draft()),created=await link(current);
  mock.read.mockImplementationOnce(async()=>{await withSystem(db=>db.query("UPDATE identity.consents SET granted=false WHERE user_id=$1 AND purpose='service'",[owner]));return mock.bytes;});
  expect((await share.request(`${publicPath(created.token)}/media/${image}`)).status).toBe(410);
  await withSystem(db=>db.query("UPDATE identity.consents SET granted=true WHERE user_id=$1 AND purpose='service'",[owner]));
  expect((await call(share,publicPath(created.token),null)).status).toBe(410);
 });
 it('withdrawing a selected source or erasing a selected photo invalidates frozen disclosure',async()=>{
  const current=await ready(await draft([image],[source])),created=await link(current);
  await withSystem(db=>db.query('UPDATE health.care_entries SET share_with_clinic=false WHERE id=$1',[source]));expect((await call(share,publicPath(created.token),null)).status).toBe(410);
  const next=await ready(await draft()),photoLink=await link(next);
  await withSystem(db=>db.query("UPDATE media.objects SET status='deleted' WHERE id=$1",[image]));expect((await call(share,publicPath(photoLink.token),null)).status).toBe(410);
  await withSystem(db=>db.query("UPDATE media.objects SET status='ready' WHERE id=$1",[image]));expect((await call(share,publicPath(photoLink.token),null)).status).toBe(410);
 });
 it('owner-reviewed after-visit results create one continuing diary episode and reminder, eligible only for opted-in followups',async()=>{
  const current=await ready(await draft([]));const when=new Date(Date.now()-3*86400000).toISOString(),nextDue=new Date(Date.now()+5*86400000).toISOString();
  const body={ownerConfirmed:true,version:current.version,clientEntryId:randomUUID(),observedAt:when,title:'Ear care vet visit',narrative:'Peony saw the vet about ear scratching',vetReportedFindings:'Owner reports the vet discussed ear care',treatment:'Follow the instructions provided by the clinic',nextFollowupAt:nextDue,reflection:'PRIVATE_AFTER_VISIT_CANARY',costs:[{label:'Consultation',amountMinor:120000,currency:'THB',kind:'paid'}]};
  const saved=await call(health,`/api/v1/health/passport/sessions/${current.id}/after-visit`,owner,'POST',body);expect(saved.status,JSON.stringify(saved.body)).toBe(201);expect(saved.body.data.episodeId).toBeTruthy();expect(saved.body.data.reminderScheduled).toBe(true);
  const replay=await call(health,`/api/v1/health/passport/sessions/${current.id}/after-visit`,owner,'POST',body);expect(replay.body.data.entryId).toBe(saved.body.data.entryId);
  const entry=await call(health,`/api/v1/health/care/entries/${saved.body.data.entryId}`);expect(entry.body.data.passportSource.kind).toBe('owner_reported_visit');expect(entry.body.data.episodeId).toBe(saved.body.data.episodeId);
  const reminders=await withSystem(db=>db.query("SELECT * FROM notify.reminders WHERE dedupe_key=$1",[`care:${saved.body.data.entryId}`]));expect(reminders.rowCount).toBe(1);
  expect((await call(notification,'/api/v1/notification/followup/preview',owner,'POST',{})).status).toBe(403);
  const prefs=await call(notification,'/api/v1/notification/followup/preferences');
  const enabled=await call(notification,'/api/v1/notification/followup/preferences',owner,'PATCH',{expectedVersion:prefs.body.data.version,enabled:true,cadenceDays:7,language:'en',pausedUntil:null,sources:{care:true,booklet:false,journal:false,assistantMemory:false},consentVersion:FOLLOWUP_CONSENT_VERSION});expect(enabled.status,JSON.stringify(enabled.body)).toBe(200);
  mock.ai.mockResolvedValueOnce({shouldSend:true,sourceId:saved.body.data.entryId,petId:pet,intent:'vet_followup',topic:'ear',greeting:'warm',reason:'post_visit'});
  const preview=await call(notification,'/api/v1/notification/followup/preview',owner,'POST',{});expect(preview.status,JSON.stringify(preview.body)).toBe(200);expect(preview.body.data.message).toContain('Synthetic Peony');expect(preview.body.data.message).not.toContain('PRIVATE_AFTER_VISIT_CANARY');expect(mock.push).not.toHaveBeenCalled();expect(mock.reply).not.toHaveBeenCalled();
 });
 it('owner account erasure cascades snapshots, links, turns and clinical permissions',async()=>{
  const current=await ready(await draft([])),created=await link(current);
  await withSystem(db=>db.query('DELETE FROM identity.users WHERE id=$1',[owner]));
  expect((await call(share,publicPath(created.token),null)).status).toBe(410);
  expect((await withUser(other,db=>db.query('SELECT id FROM health.passport_sessions'))).rowCount).toBe(0);
  expect((await withSystem(db=>db.query('SELECT id FROM health.passport_share_links WHERE owner_id=$1',[owner]))).rowCount).toBe(0);
 });
});
