import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {withSystem,withUser,closeDatabase,careSummary} from '@chordjai/db';
import {signSession} from '@chordjai/auth';
import {careEntryCreateSchema} from '@chordjai/contracts';
import type {Hono} from 'hono';
import type {ServiceEnv} from '@chordjai/service-kit';
import app from './app';
import clinic from '../../clinic/src/app';
import share from '../../share/src/app';
import identity from '../../identity/src/app';

const testUrl=process.env.TEST_DATABASE_URL;
const isolated=!!testUrl&&['localhost','127.0.0.1','::1'].includes(new URL(testUrl).hostname);
describe.skipIf(!isolated)('optional expense calendar dates in isolated PostgreSQL',()=>{
 const owner=randomUUID(),viewer=randomUUID(),staff=randomUUID(),pet=randomUUID(),clinicId=randomUUID(),people=[owner,viewer,staff],tokens=new Map<string,string>();
 const costs=(date:string|null='2026-01-05')=>[{label:'Consultation',amountMinor:55000,currency:'THB',kind:'paid',expenseDate:date},{label:'Quoted test',amountMinor:25000,currency:'USD',kind:'estimate'}];
 const entry=(extra:Record<string,unknown>={})=>({petId:pet,clientEntryId:randomUUID(),kind:'daily',title:'Expense date fixture',observedAt:'2026-01-01T08:00:00+07:00',narrative:'Owner care update',costs:costs(),...extra});
 async function call(service:Hono<ServiceEnv>,path:string,user:string=owner,method='GET',body?:unknown,key=randomUUID()){
  const response=await service.request(path,{method,headers:{...(user?{Authorization:`Bearer ${tokens.get(user)}`}:{}) ,'Content-Type':'application/json','Idempotency-Key':key},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};
 }
 async function create(extra:Record<string,unknown>={}){const body=entry(extra),response=await call(app,'/api/v1/health/care/entries',owner,'POST',body);expect(response.status,JSON.stringify(response.body)).toBe(201);return{body,entry:response.body.data};}
 beforeAll(async()=>{
  process.env.DATABASE_URL=testUrl;process.env.APP_JWT_SECRET='isolated-expense-date-secret-at-least-32-characters';process.env.APP_JWT_ISSUER='https://www.chordjai.life';
  await withSystem(async db=>{
   for(const id of people){await db.query("INSERT INTO identity.users(id,line_user_id,display_name) VALUES($1,$2,'Expense fixture')",[id,`expense-test-${id}`]);await db.query("INSERT INTO identity.consents(user_id,purpose,granted,version) VALUES($1,'service',true,'fixture')",[id]);}
   await db.query("INSERT INTO pet.pets(id,owner_id,name,species) VALUES($1,$2,'Expense fixture pet','cat')",[pet,owner]);await db.query("INSERT INTO pet.members(pet_id,user_id,role) VALUES($1,$2,'viewer')",[pet,viewer]);
   await db.query("INSERT INTO clinic.clinics(id,name,verified_at) VALUES($1,'Expense clinic',now())",[clinicId]);await db.query("INSERT INTO clinic.members(clinic_id,user_id,role) VALUES($1,$2,'staff')",[clinicId,staff]);
   await db.query("INSERT INTO identity.grants(pet_id,clinic_id,granted_by,scopes,expires_at) VALUES($1,$2,$3,ARRAY['summary.read','care.read'],now()+interval '1 day')",[pet,clinicId,owner]);
  });for(const id of people)tokens.set(id,await signSession({id,role:'owner'}));
 });
 afterAll(async()=>{await withSystem(async db=>{await db.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])',[people]);await db.query('DELETE FROM clinic.clinics WHERE id=$1',[clinicId]);});await closeDatabase();});

 it('saves per-expense dates independently from the diary date and retries without duplicate entries',async()=>{
  const created=await create();expect(created.entry.costs.map((c:{expenseDate:string|null})=>c.expenseDate)).toEqual(['2026-01-05',null]);
  const retry=await call(app,'/api/v1/health/care/entries',owner,'POST',created.body);expect(retry.status).toBe(201);expect(retry.body.data.id).toBe(created.entry.id);
  const read=await call(app,`/api/v1/health/care/entries/${created.entry.id}`);expect(read.body.data.costs[0].expenseDate).toBe('2026-01-05');expect(typeof read.body.data.costs[0].expenseDate).toBe('string');
  expect(await withSystem(async db=>(await db.query('SELECT count(*)::int n FROM health.care_entries WHERE created_by=$1 AND client_entry_id=$2',[owner,created.body.clientEntryId])).rows[0].n)).toBe(1);
 });
 it('edits and clears an expense date while preserving amounts and paid/estimate distinctions',async()=>{
  const created=await create(),path=`/api/v1/health/care/entries/${created.entry.id}`;
  const changed=await call(app,path,owner,'PATCH',{...created.body,version:created.entry.version,costs:[{...costs()[0],expenseDate:'2026-02-12'},costs()[1]]});expect(changed.status,JSON.stringify(changed.body)).toBe(200);expect(changed.body.data.costs[0].expenseDate).toBe('2026-02-12');
  const cleared=await call(app,path,owner,'PATCH',{...created.body,version:changed.body.data.version,costs:costs(null)});expect(cleared.status).toBe(200);expect(cleared.body.data.costs.map((c:{expenseDate:string|null})=>c.expenseDate)).toEqual([null,null]);expect(cleared.body.data.costs.map((c:{amountMinor:number;kind:string})=>[c.amountMinor,c.kind])).toEqual([[55000,'paid'],[25000,'estimate']]);
  expect([403,404]).toContain((await call(app,path,viewer,'PATCH',{...created.body,version:cleared.body.data.version})).status);
 });
 it('rejects invalid calendar dates before inserting anything',async()=>{
  for(const expenseDate of ['0000-01-01','2026-02-30','2026-02-29','2026-01-05T00:00:00Z']){
   const body=entry({costs:[{...costs()[0],expenseDate}]}),response=await call(app,'/api/v1/health/care/entries',owner,'POST',body);expect(response.status).toBe(400);
   expect(await withSystem(async db=>(await db.query('SELECT id FROM health.care_entries WHERE created_by=$1 AND client_entry_id=$2',[owner,body.clientEntryId])).rowCount)).toBe(0);
  }
 });
 it('keeps dates under the existing cost opt-in and revokes selected snapshots when only the expense date changes',async()=>{
  const created=await create({shareWithClinic:true,shareCosts:true}),id=created.entry.id;
  const hidden=await withUser(owner,db=>careSummary(db,pet));expect(hidden.entries.find(e=>e.id===id)?.costs).toEqual([]);
  const visible=await withUser(owner,db=>careSummary(db,pet,{includeCosts:true}));expect(visible.entries.find(e=>e.id===id)?.costs[0].expenseDate).toBe('2026-01-05');
  const clinical=await call(clinic,`/api/v1/clinic/pets/${pet}/summary?includeCosts=true`,staff);expect(clinical.status,JSON.stringify(clinical.body)).toBe(200);expect(clinical.body.data.careEntries.find((e:{id:string})=>e.id===id).costs[0].expenseDate).toBe('2026-01-05');
  const defaultLink=await call(share,'/api/v1/share/links',owner,'POST',{petId:pet,includeCare:true});expect((await call(share,`/api/v1/share/public/${defaultLink.body.data.token}`,'')).body.data.careEntries.find((e:{id:string})=>e.id===id).costs).toEqual([]);
  const link=await call(share,'/api/v1/share/links',owner,'POST',{petId:pet,includeCare:true,includeCosts:true});expect(link.status).toBe(201);expect((await call(share,`/api/v1/share/public/${link.body.data.token}`,'')).body.data.careEntries.find((e:{id:string})=>e.id===id).costs[0].expenseDate).toBe('2026-01-05');
  const changed=await call(app,`/api/v1/health/care/entries/${id}`,owner,'PATCH',{...created.body,version:created.entry.version,costs:[{...costs()[0],expenseDate:'2026-01-06'},costs()[1]]});expect(changed.status).toBe(200);expect((await call(share,`/api/v1/share/public/${link.body.data.token}`,'')).status).toBe(410);
 });
 it('exports date-only strings and keeps legacy undated request hashes replayable',async()=>{
  const created=await create(),exported=await call(identity,'/api/v1/identity/export');expect(exported.status).toBe(200);
  expect(exported.body.data.careCosts.find((c:{entryId:string;position:number})=>c.entryId===created.entry.id&&c.position===0).expenseDate).toBe('2026-01-05');
  const body=entry({costs:costs(null)}),parsed=careEntryCreateSchema.parse(body),legacy={...parsed,costs:parsed.costs.map(({expenseDate,...cost})=>cost)},id=randomUUID(),hash=createHash('sha256').update(JSON.stringify(legacy)).digest('hex');
  await withSystem(async db=>{
   await db.query(`INSERT INTO health.care_entries(id,pet_id,created_by,client_entry_id,create_hash,episode_id,kind,title,observed_at,narrative,clinical_note,observations,visit,share_with_clinic,share_costs) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15)`,[id,pet,owner,parsed.clientEntryId,hash,parsed.episodeId,parsed.kind,parsed.title,parsed.observedAt,parsed.narrative,parsed.clinicalNote,JSON.stringify(parsed.observations),parsed.visit?JSON.stringify(parsed.visit):null,parsed.shareWithClinic,parsed.shareCosts]);
   for(const[position,cost]of legacy.costs.entries())await db.query('INSERT INTO health.care_costs(entry_id,position,label,amount_minor,currency,kind) VALUES($1,$2,$3,$4,$5,$6)',[id,position,cost.label,cost.amountMinor,cost.currency,cost.kind]);
  });
  const retry=await call(app,'/api/v1/health/care/entries',owner,'POST',body);expect(retry.status,JSON.stringify(retry.body)).toBe(201);expect(retry.body.data.id).toBe(id);expect(retry.body.data.costs.every((c:{expenseDate:null})=>c.expenseDate===null)).toBe(true);
 });
});
