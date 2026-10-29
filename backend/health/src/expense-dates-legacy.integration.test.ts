import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withSystem,closeDatabase} from '@chordjai/db';
import {signSession} from '@chordjai/auth';
import type {Hono} from 'hono';
import type {ServiceEnv} from '@chordjai/service-kit';
import app from './app';
import identity from '../../identity/src/app';

// Deliberately separate from the schema-24 suite. Run only against this named
// disposable database with migrations 1–23; never alter a shared test schema.
const testUrl=process.env.TEST_DATABASE_URL;
const legacyFixture=process.env.TEST_EXPENSE_LEGACY_SCHEMA==='23'&&!!testUrl&&(()=>{
 const url=new URL(testUrl);return ['localhost','127.0.0.1','::1'].includes(url.hostname)&&url.pathname==='/chordjai_expense_compat23';
})();
describe.skipIf(!legacyFixture)('expense dates remain compatible with isolated schema 23',()=>{
 const owner=randomUUID(),pet=randomUUID();let token='';
 const body=()=>({petId:pet,clientEntryId:randomUUID(),kind:'daily',title:'Undated legacy expense',observedAt:'2026-01-01T08:00:00+07:00',narrative:'Legacy schema compatibility fixture',costs:[{label:'Consultation',amountMinor:55000,currency:'THB',kind:'paid'}]});
 async function call(service:Hono<ServiceEnv>,path:string,method='GET',payload?:unknown){
  const response=await service.request(path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':randomUUID()},...(payload===undefined?{}:{body:JSON.stringify(payload)})});
  return{status:response.status,body:await response.json()};
 }
 async function create(){const input=body(),response=await call(app,'/api/v1/health/care/entries','POST',input);expect(response.status,JSON.stringify(response.body)).toBe(201);return{input,entry:response.body.data};}
 beforeAll(async()=>{
  vi.stubEnv('DATABASE_URL',testUrl!);vi.stubEnv('APP_JWT_SECRET','isolated-legacy-expense-secret-at-least-32-characters');vi.stubEnv('APP_JWT_ISSUER','https://www.chordjai.life');vi.stubEnv('OPENAI_API_KEY','');
  vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('External providers are forbidden in the legacy expense fixture');}));
  await withSystem(async db=>{
   const ready=(await db.query("SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('health.care_costs') AND attname='expense_date' AND NOT attisdropped) ready")).rows[0].ready;
   expect(ready,'This suite requires unchanged schema 23, not schema 24').toBe(false);
   await db.query("INSERT INTO identity.users(id,line_user_id,display_name) VALUES($1,$2,'Legacy expense fixture')",[owner,`legacy-expense-${owner}`]);
   await db.query("INSERT INTO identity.consents(user_id,purpose,granted,version) VALUES($1,'service',true,'fixture')",[owner]);
   await db.query("INSERT INTO pet.pets(id,owner_id,name,species) VALUES($1,$2,'Legacy expense fixture pet','cat')",[pet,owner]);
  });token=await signSession({id:owner,role:'owner'});
 });
 afterAll(async()=>{await withSystem(db=>db.query('DELETE FROM identity.users WHERE id=$1',[owner]));await closeDatabase();vi.unstubAllEnvs();vi.unstubAllGlobals();});

 it('creates, reads and retries undated costs with the current API without requiring the new column',async()=>{
  const saved=await create();expect(saved.entry.costs[0]).toMatchObject({label:'Consultation',amountMinor:55000,expenseDate:null});
  const read=await call(app,`/api/v1/health/care/entries/${saved.entry.id}`);expect(read.status).toBe(200);expect(read.body.data.costs[0].expenseDate).toBeNull();
  const retry=await call(app,'/api/v1/health/care/entries','POST',saved.input);expect(retry.status,JSON.stringify(retry.body)).toBe(201);expect(retry.body.data.id).toBe(saved.entry.id);
  expect(await withSystem(async db=>(await db.query('SELECT count(*)::int n FROM health.care_entries WHERE created_by=$1 AND client_entry_id=$2',[owner,saved.input.clientEntryId])).rows[0].n)).toBe(1);
 });
 it('rejects a dated create with a clear upgrade code and rolls back the whole diary entry',async()=>{
  const input=body(),dated={...input,costs:input.costs.map(cost=>({...cost,expenseDate:'2026-01-05'}))};
  const response=await call(app,'/api/v1/health/care/entries','POST',dated);expect(response.status).toBe(503);expect(response.body.error.code).toBe('EXPENSE_DATES_UPGRADE_REQUIRED');
  expect(await withSystem(async db=>(await db.query('SELECT id FROM health.care_entries WHERE created_by=$1 AND client_entry_id=$2',[owner,input.clientEntryId])).rowCount)).toBe(0);
 });
 it('rejects a dated edit without changing the original version, narrative or cost',async()=>{
  const saved=await create(),path=`/api/v1/health/care/entries/${saved.entry.id}`;
  const response=await call(app,path,'PATCH',{...saved.input,version:saved.entry.version,title:'Must roll back',narrative:'Must not replace the original',costs:[{...saved.input.costs[0],amountMinor:99900,expenseDate:'2026-01-05'}]});
  expect(response.status).toBe(503);expect(response.body.error.code).toBe('EXPENSE_DATES_UPGRADE_REQUIRED');
  const read=await call(app,path);expect(read.status).toBe(200);expect(read.body.data).toMatchObject({version:saved.entry.version,title:saved.input.title,narrative:saved.input.narrative});
  expect(read.body.data.costs).toEqual([{...saved.input.costs[0],expenseDate:null}]);
 });
 it('exports existing undated costs without a missing-column failure or an inferred date',async()=>{
  const saved=await create(),response=await call(identity,'/api/v1/identity/export');expect(response.status,JSON.stringify(response.body)).toBe(200);
  const cost=response.body.data.careCosts.find((item:{entryId:string;position:number})=>item.entryId===saved.entry.id&&item.position===0);
  expect(cost).toMatchObject({label:'Consultation',amountMinor:55000,expenseDate:null});
  expect(fetch).not.toHaveBeenCalled();
 });
});
