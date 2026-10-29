import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {withSystem,closeDatabase} from '@chordjai/db';
import {signSession} from '@chordjai/auth';
import app from './app';
import journal from '../../journal/src/app';
const testUrl=process.env.TEST_DATABASE_URL;
const isolated=!!testUrl&&['localhost','127.0.0.1','::1'].includes(new URL(testUrl).hostname);

describe.skipIf(!isolated)('owner record corrections and source-bound invalidation',()=>{
 const owner=randomUUID(),carer=randomUUID(),viewer=randomUUID(),outsider=randomUUID(),staff=randomUUID(),pet=randomUUID(),otherPet=randomUUID();
 const people=[owner,carer,viewer,outsider,staff],tokens=new Map<string,string>();
 async function call(path:string,method='GET',body?:unknown,user=owner,key=randomUUID()){
  const response=await app.request(`/api/v1/health${path}`,{method,headers:{Authorization:`Bearer ${tokens.get(user)}`,'Content-Type':'application/json','Idempotency-Key':key},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:response.status,body:await response.json()};
 }
 const fields=(extra:Record<string,unknown>={})=>({petId:pet,kind:'note',title:'Owner observation',recordedAt:'2026-01-02',notes:'Owner-reported fact',...extra});
 const correction=(record:any,extra:Record<string,unknown>={})=>({revision:record.revision,kind:record.kind,title:record.title,recordedAt:record.recordedAt,nextDueAt:record.nextDueAt,notes:record.notes??'',value:record.value,...extra});
 async function create(extra:Record<string,unknown>={},user=owner){const result=await call('/records','POST',fields(extra),user);expect(result.status,JSON.stringify(result.body)).toBe(201);return result.body.data;}
 async function raw(statement:string,args:unknown[]=[]){return withSystem(db=>db.query(statement,args));}
 beforeAll(async()=>{
  process.env.DATABASE_URL=testUrl;process.env.APP_JWT_SECRET='isolated-record-mutation-secret-more-than-32-chars';process.env.APP_JWT_ISSUER='https://www.chordjai.life';
  await withSystem(async db=>{
   for(const id of people)await db.query("insert into identity.users(id,line_user_id,display_name) values($1,$2,'Mutation fixture')",[id,`mutation-${id}`]);
   await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'Peony fixture','cat'),($3,$2,'Another pet','dog')",[pet,owner,otherPet]);
   await db.query("insert into pet.members(pet_id,user_id,role) values($1,$2,'carer'),($1,$3,'viewer')",[pet,carer,viewer]);
  });
  for(const id of people)tokens.set(id,await signSession({id,role:'owner'}));
 });
 afterAll(async()=>{await raw('delete from identity.users where id=any($1::uuid[])',[people]);await closeDatabase();});

 it('returns revision and mutation permissions and updates only the selected record',async()=>{
  const first=await create(),untouched=await create({title:'Keep this record'});
  expect(first.revision).toMatch(/^[a-f0-9]{32}$/);expect(first.canEdit).toBe(true);expect(first.canDelete).toBe(true);
  const result=await call(`/records/${first.id}`,'PATCH',correction(first,{title:'Corrected observation',notes:'Owner correction'}));
  expect(result.status,JSON.stringify(result.body)).toBe(200);expect(result.body.data.title).toBe('Corrected observation');expect(result.body.data.revision).not.toBe(first.revision);
  expect((await call(`/records/${untouched.id}`)).body.data.title).toBe('Keep this record');
 });
 it('rejects stale edit and delete without removing the newer value',async()=>{
  const record=await create();expect((await call(`/records/${record.id}`,'PATCH',correction(record,{title:'Newer version'}))).status).toBe(200);
  for(const method of ['PATCH','DELETE']){const result=await call(`/records/${record.id}`,method,method==='PATCH'?correction(record,{title:'Stale replacement'}):{revision:record.revision});expect(result.status).toBe(409);expect(result.body.error.code).toBe('VERSION_CONFLICT');}
  expect((await call(`/records/${record.id}`)).body.data.title).toBe('Newer version');
 });
 it('preserves original OCR/source metadata and rejects attribution or pet reassignment',async()=>{
  const record=await create({data:{source:'owner_supplied',originalLabel:'ORIGINAL_EVIDENCE'}});
  expect((await call(`/records/${record.id}`,'PATCH',correction(record,{notes:'Corrected owner note'}))).status).toBe(200);
  expect((await raw('select data,pet_id,created_by from health.records where id=$1',[record.id])).rows[0]).toMatchObject({data:{source:'owner_supplied',originalLabel:'ORIGINAL_EVIDENCE'},pet_id:pet,created_by:owner});
  const current=(await call(`/records/${record.id}`)).body.data;
  for(const extra of [{data:{}},{createdBy:carer},{petId:otherPet}])expect((await call(`/records/${record.id}`,'PATCH',correction(current,extra))).status).toBe(400);
 });
 it('keeps viewers read-only and outsiders unable to fetch or mutate a record',async()=>{
  const record=await create(),visible=await call(`/records/${record.id}`,'GET',undefined,viewer);
  expect(visible.status).toBe(200);expect(visible.body.data.canEdit).toBe(false);expect(visible.body.data.canDelete).toBe(false);
  for(const user of [viewer,outsider])for(const method of ['PATCH','DELETE'])expect([403,404]).toContain((await call(`/records/${record.id}`,method,method==='PATCH'?correction(record):{revision:record.revision},user)).status);
  expect((await call(`/records/${record.id}`,'GET',undefined,outsider)).status).toBe(404);
 });
 it('lets an owner correct family records while syncing the original author reminder and old share',async()=>{
  const record=await create({title:'Family vaccine',kind:'vaccine',nextDueAt:'2026-02-02'},carer),share=randomUUID();
  await raw("insert into share.links(id,pet_id,owner_id,token_hash,snapshot) values($1,$2,$3,$4,$5::jsonb)",[share,pet,carer,randomUUID(),JSON.stringify({records:[{id:record.id,title:'Family vaccine'}]})]);
  const result=await call(`/records/${record.id}`,'PATCH',correction(record,{title:'Corrected vaccine date',nextDueAt:'2026-03-02'}));expect(result.status,JSON.stringify(result.body)).toBe(200);
  const reminder=(await raw('select user_id,title,due_at from notify.reminders where dedupe_key=$1',[`health:${record.id}`])).rows[0];
  expect(reminder.user_id).toBe(carer);expect(reminder.title).toBe('Corrected vaccine date');expect(reminder.due_at.toISOString().slice(0,10)).toBe('2026-03-02');
  expect((await raw('select revoked_at from share.links where id=$1',[share])).rows[0].revoked_at).not.toBeNull();
  expect((await call(`/records/${record.id}`,'DELETE',{revision:result.body.data.revision})).status).toBe(200);
  expect((await raw('select id from notify.reminders where dedupe_key=$1',[`health:${record.id}`])).rowCount).toBe(0);
 });
 it('keeps outside-family clinical originals read-only for the owner',async()=>{
  const id=randomUUID();await raw("insert into health.records(id,pet_id,created_by,kind,title,recorded_at) values($1,$2,$3,'note','Clinic original','2026-01-01')",[id,pet,staff]);
  const current=(await call(`/records/${id}`)).body.data;expect(current.canEdit).toBe(false);expect(current.canDelete).toBe(false);
  expect((await call(`/records/${id}`,'PATCH',correction(current,{title:'Owner rewriting clinic original'}))).status).toBe(403);
  expect((await call(`/records/${id}`,'DELETE',{revision:current.revision})).status).toBe(403);
 });
 it('recalculates the latest weight when records are corrected, backdated, retyped or removed',async()=>{
  const old=await create({kind:'weight',title:'Older weight',recordedAt:'2026-01-01',value:3.8});
  const latest=await create({kind:'weight',title:'Latest weight',recordedAt:'2026-01-03',value:4.3});
  await create({kind:'weight',title:'Backdated weight',recordedAt:'2025-12-31',value:3.5});
  const weight=async()=>(await raw('select weight_kg from pet.pets where id=$1',[pet])).rows[0].weight_kg;
  expect(await weight()).toBe(4.3);
  let changed=await call(`/records/${latest.id}`,'PATCH',correction(latest,{value:4.4}));expect(changed.status).toBe(200);expect(await weight()).toBe(4.4);
  changed=await call(`/records/${latest.id}`,'PATCH',correction(changed.body.data,{kind:'note',value:null}));expect(changed.status).toBe(200);expect(await weight()).toBe(3.8);
  expect((await call(`/records/${old.id}`,'DELETE',{revision:old.revision})).status).toBe(200);expect(await weight()).toBe(3.5);
 });
 it('rejects invalid edited dates and impossible weights without changing the source',async()=>{
  const record=await create();
  for(const extra of [{recordedAt:'2026-02-31'},{recordedAt:'not-a-date'},{nextDueAt:'2025-01-01'},{kind:'weight',value:0},{kind:'weight',value:151}])expect((await call(`/records/${record.id}`,'PATCH',correction(record,extra))).status).toBe(400);
  expect((await call(`/records/${record.id}`)).body.data.title).toBe(record.title);
 });
 it('makes simultaneous stale writers conflict instead of silently overwriting each other',async()=>{
  const record=await create();const results=await Promise.all(['First correction','Second correction'].map(title=>call(`/records/${record.id}`,'PATCH',correction(record,{title}))));
  expect(results.map(result=>result.status).sort()).toEqual([200,409]);
 });
 it('deletes with an idempotency key once and returns the cached outcome on transport retry',async()=>{
  const record=await create(),key=randomUUID(),body={revision:record.revision};
  const first=await call(`/records/${record.id}`,'DELETE',body,owner,key),retry=await call(`/records/${record.id}`,'DELETE',body,owner,key);
  expect(first.status).toBe(200);expect(retry.status).toBe(200);expect(retry.body.data.deleted).toBe(true);expect((await call(`/records/${record.id}`)).status).toBe(404);
 });
 it('removes only an episode grouping and bumps retained diary versions after the FK changes',async()=>{
  const created=await call('/care/episodes','POST',{petId:pet,title:'Care group',startedAt:'2026-01-01T08:00:00Z',clientEpisodeId:randomUUID()});expect(created.status).toBe(201);const episode=created.body.data;
  const createdEntry=await call('/care/entries','POST',{petId:pet,clientEntryId:randomUUID(),episodeId:episode.id,kind:'daily',title:'Retained diary',observedAt:'2026-01-02T08:00:00Z',narrative:'Keep this update'});expect(createdEntry.status).toBe(201);
  const removed=await call(`/care/episodes/${episode.id}`,'DELETE',{version:episode.version});expect(removed.status).toBe(200);expect(removed.body.data.entriesPreserved).toBe(true);
  const entry=(await call(`/care/entries/${createdEntry.body.data.id}`)).body.data;expect(entry.episodeId).toBeNull();expect(entry.version).toBe(createdEntry.body.data.version+1);
 });
 it('checks Story page versions before deletion and leaves other pages intact',async()=>{
  const headers={Authorization:`Bearer ${tokens.get(owner)}`,'Content-Type':'application/json'};
  const body={petId:pet,title:'Story to review',theme:{background:'#ffffff',font:'sans',accent:'#ff8a24'},elements:[]};
  const createPage=async()=>{const r=await journal.request('/api/v1/journal/pages',{method:'POST',headers,body:JSON.stringify(body)});expect(r.status).toBe(201);return(await r.json()).data;};
  const page=await createPage(),keep=await createPage();
  const stale=await journal.request(`/api/v1/journal/pages/${page.id}`,{method:'DELETE',headers,body:JSON.stringify({version:page.version+1})});expect(stale.status).toBe(409);
  const removed=await journal.request(`/api/v1/journal/pages/${page.id}`,{method:'DELETE',headers,body:JSON.stringify({version:page.version})});expect(removed.status).toBe(200);
  expect((await journal.request(`/api/v1/journal/pages/${keep.id}`,{headers})).status).toBe(200);
 });
 it('fails closed before migration23 and exposes no misleading mutation flags',async()=>{
  const record=await create(),maintenance=new pg.Client({connectionString:testUrl});await maintenance.connect();
  try{await maintenance.query('alter function health.sync_record_mutation() rename to sync_record_mutation_fixture_off');
   const read=await call(`/records/${record.id}`);expect(read.body.data.canEdit).toBe(false);expect(read.body.data.canDelete).toBe(false);
   for(const method of ['PATCH','DELETE']){const result=await call(`/records/${record.id}`,method,method==='PATCH'?correction(record):{revision:record.revision});expect(result.status).toBe(503);expect(result.body.error.code).toBe('RECORD_MUTATIONS_UPGRADE_REQUIRED');}
  }finally{await maintenance.query('alter function health.sync_record_mutation_fixture_off() rename to sync_record_mutation');await maintenance.end();}
 });
 it('revokes only health summaries containing a corrected diary source, including changed costs',async()=>{
  const original={petId:pet,clientEntryId:randomUUID(),kind:'daily',title:'Owner care account',observedAt:'2026-01-02T08:00:00Z',narrative:'Owner story',clinicalNote:'Original owner observation',shareWithClinic:true,shareCosts:true,costs:[{label:'Consultation',amountMinor:50000,currency:'THB',kind:'paid'}]};
  const saved=await call('/care/entries','POST',original);expect(saved.status).toBe(201);const entry=saved.body.data,link=randomUUID(),unrelated=randomUUID();
  for(const [id,source]of [[link,entry.id],[unrelated,randomUUID()]])await raw('insert into share.links(id,pet_id,owner_id,token_hash,snapshot) values($1,$2,$3,$4,$5::jsonb)',[id,pet,carer,randomUUID(),JSON.stringify({careEntries:[{id:source,clinicalNote:'Original owner observation'}]})]);
  const {petId,clientEntryId,...fields}=original;
  const changed=await call(`/care/entries/${entry.id}`,'PATCH',{...fields,version:entry.version,clinicalNote:'Corrected owner observation',costs:[{label:'Consultation',amountMinor:45000,currency:'THB',kind:'paid'}]});expect(changed.status,JSON.stringify(changed.body)).toBe(200);
  const rows=(await raw('select id,revoked_at from share.links where id=any($1::uuid[])',[[link,unrelated]])).rows;
  expect(rows.find(row=>row.id===link).revoked_at).not.toBeNull();expect(rows.find(row=>row.id===unrelated).revoked_at).toBeNull();
 });
 it('does not grant direct execution of privileged maintenance triggers to application or worker roles',async()=>{
  for(const role of ['chordjai_app','chordjai_worker'])for(const routine of ['health.sync_record_mutation()','health.invalidate_care_mutation()','health.invalidate_episode_mutation()']){
   const check=(await raw('select has_function_privilege($1,$2,\'execute\') permitted',[role,routine])).rows[0];expect(check.permitted).toBe(false);
  }
 });
});
