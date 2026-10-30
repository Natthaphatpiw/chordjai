import{beforeAll,afterAll,beforeEach,describe,it,expect,vi}from'vitest';
import{randomUUID}from'node:crypto';
import{withSystem,closeDatabase}from'@chordjai/db';
import{signSession}from'@chordjai/auth';
const model=vi.hoisted(()=>vi.fn());
vi.mock('@chordjai/ai',async original=>({...await original<typeof import('@chordjai/ai')>(),runStructured:model}));
import app from'./app';
const url=process.env.TEST_DATABASE_URL;
describe.skipIf(!url||!['127.0.0.1','localhost','::1'].includes(new URL(url).hostname))('care organization permission and review boundary',()=>{
 const owner=randomUUID(),viewer=randomUUID(),outsider=randomUUID(),pet=randomUUID(),tokens=new Map<string,string>();let entry='';
 async function organize(user=owner,version=1,key?:string){const response=await app.request(`/api/v1/health/care/entries/${entry}/organize`,{method:'POST',headers:{Authorization:`Bearer ${tokens.get(user)}`,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify({version})});return{status:response.status,body:await response.json()};}
 beforeAll(async()=>{
  process.env.DATABASE_URL=url;process.env.APP_JWT_SECRET='care-organize-isolated-secret-at-least-32-characters';
  await withSystem(async db=>{for(const user of[owner,viewer,outsider]){await db.query("insert into identity.users(id,line_user_id,display_name) values($1,$2,'SYNTHETIC ORGANIZE')",[user,`organize-${user}`]);await db.query("insert into identity.consents(user_id,purpose,granted,version) values($1,'service',true,'test')",[user]);}await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'SYNTHETIC PET','cat')",[pet,owner]);await db.query("insert into pet.members(pet_id,user_id,role) values($1,$2,'viewer')",[pet,viewer]);});
  for(const id of[owner,viewer,outsider])tokens.set(id,await signSession({id,role:'owner'}));
  const response=await app.request('/api/v1/health/care/entries',{method:'POST',headers:{Authorization:`Bearer ${tokens.get(owner)}`,'Content-Type':'application/json'},body:JSON.stringify({petId:pet,clientEntryId:randomUUID(),kind:'daily',title:'Original',observedAt:'2026-01-01T10:00:00+07:00',narrative:'เกาหูบ่อย จ่าย 414 บาท',reflection:'DO_NOT_SEND_PRIVATE_REFLECTION',observations:{symptoms:[],severity:'unknown',appetite:'unknown',energy:'unknown',trend:'unknown'},visit:null,costs:[],mediaIds:[],shareWithClinic:false,shareCosts:false})});expect(response.status).toBe(201);entry=(await response.json()).data.id;
 });
 beforeEach(async()=>{model.mockReset();model.mockResolvedValue({kind:'symptom',kindEvidence:'เกาหูบ่อย',symptoms:['เกาหูบ่อย'],clinicName:null,reason:null,treatment:null,costs:[{quote:'จ่าย 414 บาท',amount:'414',currency:'THB'}]});await withSystem(async db=>{await db.query('update health.care_entries set version=1 where id=$1',[entry]);await db.query("update identity.consents set granted=true where user_id=$1 and purpose='service'",[owner]);});});
 afterAll(async()=>{await withSystem(db=>db.query('delete from identity.users where id=any($1::uuid[])',[[owner,viewer,outsider]]));await closeDatabase();});
 it('returns a suggestion without modifying the original, private reflection, costs or sharing',async()=>{
  const result=await organize();expect(result.status).toBe(200);expect(result.body.data).toMatchObject({entryId:entry,version:1,symptoms:['เกาหูบ่อย']});expect(model.mock.calls[0][0]).toMatchObject({feature:'care.organize',input:{narrative:'เกาหูบ่อย จ่าย 414 บาท'}});expect(JSON.stringify(model.mock.calls[0][0])).not.toContain('DO_NOT_SEND');
  const unchanged=await withSystem(async db=>(await db.query('select kind,version,share_with_clinic,(select count(*)::int from health.care_costs where entry_id=$1) costs from health.care_entries where id=$1',[entry])).rows[0]);expect(unchanged).toMatchObject({kind:'daily',version:1,share_with_clinic:false,costs:0});
 });
 it('denies viewers, strangers, stale versions and withdrawn consent before calling AI',async()=>{
  expect((await organize(viewer)).status).toBe(403);expect((await organize(outsider)).status).toBe(404);expect((await organize(owner,99)).status).toBe(409);await withSystem(db=>db.query("update identity.consents set granted=false where user_id=$1 and purpose='service'",[owner]));expect((await organize()).status).toBe(403);expect(model).not.toHaveBeenCalled();
 });
 it('rechecks edits and consent after generation',async()=>{
  model.mockImplementationOnce(async()=>{await withSystem(db=>db.query('update health.care_entries set version=2 where id=$1',[entry]));return{kind:null,kindEvidence:null,symptoms:[],clinicName:null,reason:null,treatment:null,costs:[]};});expect((await organize()).status).toBe(409);
  await withSystem(db=>db.query('update health.care_entries set version=1 where id=$1',[entry]));model.mockImplementationOnce(async()=>{await withSystem(db=>db.query("update identity.consents set granted=false where user_id=$1 and purpose='service'",[owner]));return{kind:null,kindEvidence:null,symptoms:[],clinicName:null,reason:null,treatment:null,costs:[]};});expect((await organize()).status).toBe(403);
 });
 it('does not replay cached private suggestions after consent withdrawal',async()=>{
  const key=randomUUID();expect((await organize(owner,1,key)).status).toBe(200);await withSystem(db=>db.query("update identity.consents set granted=false where user_id=$1 and purpose='service'",[owner]));expect((await organize(owner,1,key)).status).toBe(403);expect(model).toHaveBeenCalledOnce();
 });
});
