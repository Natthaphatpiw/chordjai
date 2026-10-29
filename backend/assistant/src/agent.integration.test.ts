import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withSystem,withUser,closeDatabase} from '@chordjai/db';
import {signSession} from '@chordjai/auth';
import app from './app';
import {deliverAgentMessage,executeAgentTask,ingestAgentTurn} from './agent';
import {getAgentTool} from './agent-tools';
import {bangkokAgentNow} from './agent-model';

const provider=vi.hoisted(()=>({structured:vi.fn(),text:vi.fn(),push:vi.fn(),background:vi.fn()}));
vi.mock('@chordjai/ai',async original=>({...await original<typeof import('@chordjai/ai')>(),runStructured:provider.structured,runText:provider.text}));
vi.mock('@chordjai/line',async original=>({...await original<typeof import('@chordjai/line')>(),pushLine:provider.push}));
vi.mock('@vercel/functions',async original=>({...await original<typeof import('@vercel/functions')>(),waitUntil:provider.background}));
const testUrl=process.env.TEST_DATABASE_URL;
const isolated=!!testUrl&&['localhost','127.0.0.1','::1'].includes(new URL(testUrl).hostname);

describe.skipIf(!isolated)('durable LINE Agent with isolated PostgreSQL and mocked external providers',()=>{
 const owner=randomUUID(),other=randomUUID(),thirdOwner=randomUUID(),pet=randomUUID(),secondPet=randomUUID(),foreignPet=randomUUID();
 const line=(id:string)=>`agent-fixture-${id}`;
 const users=[owner,other,thirdOwner],tokens=new Map<string,string>(),events:string[]=[];
 const plans:any[]=[],normalizations:any[]=[],background:Promise<unknown>[]=[];
 const example='วันนี้พาน้องถั่วเหลืองไปหยอดหลังคอกำจัดไรหูมา บันทึกไว้ให้หน่อยสิ';
 const normalized=(extra:Record<string,unknown>={})=>({route:'agent',language:'th',normalizedText:example,intentSummary:'บันทึกการดูแลน้อง',petMentions:['ถั่วเหลือง'],...extra});
 const action=(tool:string,args:Record<string,unknown>)=>({tool,argsJson:JSON.stringify(args)});
 const ready=(actions:any[])=>({mode:'ready',title:'บันทึกเรื่องของน้อง',message:'',question:'',options:[],actions});
 const ask=(question:string,options:{label:string;value:string}[])=>({mode:'ask',title:'ขอรายละเอียดอีกนิด',message:'',question,options,actions:[]});
 const diary=(extra:Record<string,unknown>={})=>({petId:pet,kind:'visit',title:'ไปดูแลไรหู',observedAt:new Date().toISOString(),narrative:example,...extra});
 async function storeEvent(text:string,user=owner,extra:Record<string,unknown>={}){
  const id=`agent-test-${randomUUID()}`;events.push(id);
  await withSystem(db=>db.query(`insert into notify.webhook_events(event_id,event_type,payload) values($1,$2,$3::jsonb)`,[id,'message',JSON.stringify({type:'message',webhookEventId:id,source:{type:'user',userId:line(user)},message:{type:'text',text},...extra})]));
  return id;
 }
 async function input(text=example,user=owner,extra:Record<string,unknown>={}){const id=await storeEvent(text,user,extra);await ingestAgentTurn(id,user);return id;}
 async function postback(choiceId:string,user=owner){return input('',user,{type:'postback',message:undefined,postback:{data:`agent:choice:${choiceId}`}});}
 async function task(user=owner){return withSystem(async db=>(await db.query<any>('select * from assistant.agent_tasks where user_id=$1 order by created_at desc,id desc limit 1',[user])).rows[0]);}
 async function choices(taskId:string){return withSystem(async db=>(await db.query<any>('select * from assistant.agent_choices where task_id=$1 and consumed_at is null order by created_at,id',[taskId])).rows);}
 async function entries(){return withSystem(async db=>(await db.query<any>('select * from health.care_entries where created_by=$1 order by created_at,id',[owner])).rows);}
 async function deliveries(taskId?:string){return withSystem(async db=>(await db.query<any>('select * from assistant.agent_deliveries where user_id=$1 and ($2::uuid is null or task_id=$2) order by created_at,id',[owner,taskId??null])).rows);}
 async function deliverPending(){for(const row of await deliveries())if(row.status==='pending')await deliverAgentMessage(row.id);}
 async function call(path:string,user=owner,method='GET',body?:unknown,auth?:string){const response=await app.request(path,{method,headers:{Authorization:auth??`Bearer ${tokens.get(user)}`,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:response.status,body:await response.json()};}
 async function clean(){
  await withSystem(async db=>{
   await db.query(`delete from ops.jobs where payload->>'deliveryId' in(select id::text from assistant.agent_deliveries where user_id=any($1::uuid[])) or payload->>'taskId' in(select id::text from assistant.agent_tasks where user_id=any($1::uuid[])) or payload->>'eventId'=any($2::text[])`,[users,events]);
   await db.query('delete from assistant.agent_threads where user_id=any($1::uuid[])',[users]);
   await db.query('delete from assistant.conversations where user_id=any($1::uuid[])',[users]);
   await db.query('delete from assistant.memories where user_id=any($1::uuid[])',[users]);
   await db.query('delete from assistant.preferences where user_id=any($1::uuid[])',[users]);
   await db.query("delete from identity.consents where user_id=any($1::uuid[]) and purpose='ai_memory'",[users]);
   await db.query('delete from health.care_entries where created_by=any($1::uuid[])',[users]);
   await db.query('delete from notify.reminders where user_id=any($1::uuid[])',[users]);
   await db.query('delete from notify.webhook_events where event_id=any($1::text[])',[events]);
   await db.query("delete from pet.members where pet_id=$1 and user_id=$2",[foreignPet,owner]);
   await db.query("update identity.users set status='active' where id=any($1::uuid[])",[users]);
   await db.query("update identity.consents set granted=true where user_id=any($1::uuid[]) and purpose='service'",[users]);
  });events.length=0;
 }
 beforeAll(async()=>{
  vi.stubEnv('DATABASE_URL',testUrl!);vi.stubEnv('APP_JWT_SECRET','agent-integration-fixture-secret-over-32-characters');vi.stubEnv('APP_JWT_ISSUER','https://www.chordjai.life');vi.stubEnv('OPENAI_API_KEY','');
  vi.stubEnv('CRON_SECRET','agent-fixture-machine-secret-over-32-characters');vi.stubEnv('APP_ORIGIN','https://www.chordjai.life');vi.stubEnv('LINE_AGENT_LIFF_ID','2010549060-FRfLt9mJ');
  await withSystem(async db=>{
   for(const id of users){await db.query("insert into identity.users(id,line_user_id,display_name) values($1,$2,'Agent API fixture')",[id,line(id)]);await db.query("insert into identity.consents(user_id,purpose,granted,version) values($1,'service',true,'fixture')",[id]);}
   await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'ถั่วเหลือง','cat'),($3,$2,'ถั่วดำ','cat'),($4,$5,'Other owner pet','dog')",[pet,owner,secondPet,foreignPet,other]);
  });for(const id of users)tokens.set(id,await signSession({id,role:'owner'}));
 });
 beforeEach(async()=>{
  await clean();vi.stubEnv('LINE_AGENT_ENABLED','true');vi.stubEnv('VERCEL','');plans.length=0;normalizations.length=0;background.length=0;vi.clearAllMocks();provider.structured.mockReset();provider.text.mockReset();provider.push.mockReset();provider.background.mockReset();
  provider.background.mockImplementation((promise:Promise<unknown>)=>{background.push(promise);});
  provider.push.mockResolvedValue(undefined);provider.text.mockResolvedValue('สวัสดีครับ เล่าเรื่องของน้องให้ฟังได้เลย');
  provider.structured.mockImplementation(async(options:{feature:string})=>{
   if(options.feature==='agent.normalize')return normalizations.shift()??normalized();
   if(options.feature==='agent.plan'){const plan=plans.shift();if(!plan)throw new Error('Unexpected extra agent planning call');return plan;}
   if(options.feature==='agent.answer')return {summary:'จากบันทึกที่เจ้าของรายงาน ถั่วเหลืองยังมีอาการเกาหูครับ'};
   throw new Error(`Unmocked AI feature ${options.feature}`);
  });
  vi.stubGlobal('fetch',vi.fn(async(value:RequestInfo|URL)=>{
   const url=new URL(value instanceof Request?value.url:String(value));
   if(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/internal/agent/capture-followup')return new Response(JSON.stringify({data:{captured:true}}),{status:200,headers:{'Content-Type':'application/json'}});
   throw new Error('External network forbidden in agent integration fixture');
  }));
 });
 afterAll(async()=>{await clean();await withSystem(db=>db.query('delete from identity.users where id=any($1::uuid[])',[users]));await closeDatabase();vi.unstubAllGlobals();vi.unstubAllEnvs();});

 it('routes the owner example through LLM0 and saves a real private diary entry without LIFF interaction',async()=>{
  plans.push(ready([action('care.entries.create',diary())]));const eventId=await input();let current=await task();
  expect(current.status).toBe('queued');expect(await entries()).toHaveLength(0);expect(provider.structured.mock.calls.map(([o])=>o.feature)).toEqual(['agent.normalize','agent.plan']);
  await executeAgentTask(current.id);current=await task();expect(current.status,JSON.stringify(current.result)).toBe('succeeded');
  const saved=await entries();expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({pet_id:pet,narrative:example,kind:'visit',share_with_clinic:false,share_costs:false,provenance:'owner_reported'});expect(saved[0].visit).toBeNull();
  expect((await withSystem(async db=>(await db.query('select state from assistant.agent_turns where event_id=$1',[eventId])).rows[0])).state).toBe('done');
  await deliverPending();expect(provider.push.mock.calls.some(([,messages])=>JSON.stringify(messages).includes('กำลังทำงานให้คุณ'))).toBe(true);expect(provider.push.mock.calls.some(([,messages])=>JSON.stringify(messages).includes('ทำงานเสร็จแล้ว'))).toBe(true);
  const resultCard=provider.push.mock.calls.map(([,messages])=>JSON.stringify(messages)).find(text=>text.includes('https://liff.line.me/'))!;
  expect(resultCard).toContain('2010549060-FRfLt9mJ');expect(resultCard).toContain(`agentTaskId=${current.id}`);expect(resultCard).toContain(`petId=${pet}`);
 });
 it('asks with a card when the pet is ambiguous, then accepts a private versioned postback answer',async()=>{
  plans.push(ready([action('care.entries.create',diary())]));await input('ไปพบหมอมา บันทึกให้หน่อย');const pending=await task();expect(pending.status).toBe('collecting');
  await deliverPending();const card=JSON.stringify(provider.push.mock.calls[0]![1]);expect(card).toContain('postback');expect(card).toContain('กดตัวเลือกหรือพิมพ์คำตอบ');expect(await entries()).toHaveLength(0);
  const selected=(await choices(pending.id)).find(row=>row.value===secondPet);expect(selected.action).toBe('pet');plans.push(ready([action('care.entries.create',diary({petId:secondPet}))]));await postback(selected.id);expect((await task()).status).toBe('queued');
  await executeAgentTask(pending.id);expect((await entries())[0].pet_id).toBe(secondPet);expect(await withSystem(async db=>(await db.query('select consumed_at is not null consumed from assistant.agent_choices where id=$1',[selected.id])).rows[0].consumed)).toBe(true);
 });
 it('starts Vercel background execution after private ingest while preserving durable fallback jobs',async()=>{
  vi.stubEnv('VERCEL','1');plans.push(ready([action('care.entries.create',diary())]));const eventId=await storeEvent(example);
  const accepted=await call('/internal/agent/ingest',owner,'POST',{eventId,userId:owner},`Bearer ${process.env.CRON_SECRET}`);expect(accepted.status).toBe(200);expect(provider.background).toHaveBeenCalledTimes(1);
  const completed=await Promise.allSettled(background);expect(completed.every(item=>item.status==='fulfilled')).toBe(true);const finished=await task();expect(finished.status).toBe('succeeded');expect(await entries()).toHaveLength(1);
  expect(provider.push.mock.calls.some(([,messages])=>JSON.stringify(messages).includes('ทำงานเสร็จแล้ว'))).toBe(true);
  const jobs=await withSystem(async db=>(await db.query('select topic from ops.jobs where payload->>\'taskId\'=$1 or payload->>\'deliveryId\' in(select id::text from assistant.agent_deliveries where user_id=$2)',[finished.id,owner])).rows);
  expect(jobs.some(row=>row.topic==='agent.execute')).toBe(true);expect(jobs.some(row=>row.topic==='agent.deliver')).toBe(true);
  await executeAgentTask(finished.id);await deliverPending();expect(await entries()).toHaveLength(1);
 });
 it('asks instead of accepting a model-selected different pet from the same household',async()=>{
  plans.push(ready([action('care.entries.create',diary({petId:secondPet}))]));await input(example);const pending=await task();expect(pending.status).toBe('collecting');expect(pending.plan).toEqual([]);expect(await entries()).toHaveLength(0);
  const buttons=await choices(pending.id);expect(buttons.filter(row=>row.action==='pet').map(row=>row.value).sort()).toEqual([pet,secondPet].sort());await executeAgentTask(pending.id);expect(await entries()).toHaveLength(0);
 });
 it('suppresses an undelivered pet-choice card when a shared candidate is no longer accessible',async()=>{
  await withSystem(db=>db.query("insert into pet.members(pet_id,user_id,role) values($1,$2,'carer')",[foreignPet,owner]));plans.push(ready([action('care.entries.create',diary())]));await input('ไปพบหมอมา บันทึกให้หน่อย');const pending=await task();expect(pending.status).toBe('collecting');
  expect(pending.question.accessChecks).toContainEqual({tool:'pets.get',args:{id:foreignPet}});const card=(await deliveries(pending.id)).find(row=>row.kind.startsWith('question:'));expect(JSON.stringify(card.messages)).toContain('Other owner pet');
  await withSystem(db=>db.query('delete from pet.members where pet_id=$1 and user_id=$2',[foreignPet,owner]));await deliverAgentMessage(card.id);expect(provider.push).not.toHaveBeenCalled();expect(await entries()).toHaveLength(0);
  expect((await deliveries(pending.id)).find(row=>row.id===card.id)).toMatchObject({status:'failed',messages:[],error_code:'AGENT_RESOURCE_ACCESS_CHANGED'});expect((await call(`/api/v1/assistant/agent/tasks/${pending.id}`)).body.data).toMatchObject({question:null,result:null,results:[],errorCode:'AGENT_RESOURCE_ACCESS_CHANGED'});
 });
 it('anchors relative-date planning to the original webhook time even when the worker runs on a later day',async()=>{
  const workerTime=new Date(`${bangkokAgentNow().date}T10:00:00+07:00`),reference=new Date(workerTime.getTime()-12*3600000);
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(workerTime);
  try{
   const eventId=await storeEvent(example);await withSystem(db=>db.query('update notify.webhook_events set received_at=$2 where event_id=$1',[eventId,reference]));
   plans.push(ready([action('care.entries.create',diary({observedAt:reference.toISOString()}))]));await ingestAgentTurn(eventId,owner);const pending=await task();expect(pending.reference_at.toISOString()).toBe(reference.toISOString());
   const planning=provider.structured.mock.calls.find(([o])=>o.feature==='agent.plan')![0];expect(planning.input.requestTime).toEqual(bangkokAgentNow(reference));expect(planning.input.currentReplyTime).toEqual(bangkokAgentNow(reference));expect(planning.input.requestTime.date).not.toBe(bangkokAgentNow().date);
  }finally{vi.useRealTimers();}
 });
 it('allows a typed answer outside the provided options and preserves it as model input',async()=>{
  plans.push(ask('ต้องการจดเรื่องอะไรเพิ่มเติมครับ',[{label:'ไปพบหมอ',value:'vet visit'}]));await input('ช่วยจดเรื่องของถั่วเหลืองให้หน่อย');const pending=await task();
  const ownWords='วันนี้แค่อยากจดว่าน้องเล่นของเล่นใหม่';plans.push(ready([action('care.entries.create',diary({kind:'daily',narrative:ownWords,title:'เล่นของเล่นใหม่'}))]));await input(ownWords);
  const planning=provider.structured.mock.calls.filter(([o])=>o.feature==='agent.plan').at(-1)![0];expect(planning.input.currentReply).toBe(ownWords);
  await executeAgentTask(pending.id);expect((await entries())[0].narrative).toBe(ownWords);
 });
 it('repairs incomplete tool arguments into a clarification without inventing a reminder time or writing',async()=>{
  plans.push(ready([action('reminders.create',{petId:pet,title:'ไปพบหมอ'})]),ask('ให้เตือนเรื่องถั่วเหลืองวันไหนและกี่โมงครับ',[{label:'ขอคิดก่อน',value:'ยังไม่ทราบวันเวลา'}]));await input('ตั้งเตือนถั่วเหลืองไปพบหมอให้หน่อย');const pending=await task();expect(pending.status).toBe('collecting');expect(pending.plan).toEqual([]);
  const planning=provider.structured.mock.calls.filter(([o])=>o.feature==='agent.plan');expect(planning).toHaveLength(2);expect(planning[1]![0].input.observations).toContainEqual({tool:'validation',result:expect.objectContaining({error:'AGENT_TOOL_ARGUMENTS_INVALID',details:expect.stringContaining('dueAt')})});
  expect(await withSystem(async db=>(await db.query('select count(*)::int n from notify.reminders where user_id=$1',[owner])).rows[0].n)).toBe(0);expect(await entries()).toHaveLength(0);await deliverPending();expect(JSON.stringify(provider.push.mock.calls)).toContain('วันไหนและกี่โมง');expect(JSON.stringify(provider.push.mock.calls)).toContain('กดตัวเลือกหรือพิมพ์คำตอบ');
 });
 it('inspects real records while planning and never treats read-only inspection as permission for a mutation',async()=>{
  plans.push({mode:'inspect',title:'ดูน้องที่ดูแล',message:'',question:'',options:[],actions:[action('pets.list',{})]},ready([action('care.entries.create',diary())]));await input();
  const calls=provider.structured.mock.calls.filter(([o])=>o.feature==='agent.plan');expect(calls).toHaveLength(2);expect(calls[1]![0].input.observations[0].tool).toBe('pets.list');expect(JSON.stringify(calls[1]![0].input.observations[0].result)).toContain(pet);expect(await entries()).toHaveLength(0);
 });
 it('answers an owner-requested history lookup from real current records without private reflections in model context',async()=>{
  await getAgentTool('care.entries.create')!.execute({id:owner,role:'owner'},diary({narrative:'เจ้าของยังสังเกตว่าน้องเกาหู',reflection:'PRIVATE_FEELING_DO_NOT_EXPOSE'}),randomUUID());plans.push(ready([action('care.entries.list',{petId:pet})]));await input('ขอดูบันทึกของถั่วเหลือง');const pending=await task();await executeAgentTask(pending.id);
  expect((await task()).status).toBe('succeeded');expect(await entries()).toHaveLength(1);const answering=provider.structured.mock.calls.find(([o])=>o.feature==='agent.answer')![0];expect(JSON.stringify(answering.input.results)).toContain('เกาหู');expect(JSON.stringify(answering.input.results)).not.toContain('PRIVATE_FEELING_DO_NOT_EXPOSE');
  await deliverPending();expect(JSON.stringify(provider.push.mock.calls)).toContain('จากบันทึกที่เจ้าของรายงาน');expect(JSON.stringify((await task()).result)).not.toContain('เจ้าของยังสังเกต');
 });
 it('requires explicit confirmation for a risky profile update and binds buttons to the current plan version',async()=>{
  plans.push(ready([action('pets.update',{id:pet,changes:{name:'ถั่วเหลืองใหม่'}})]));await input('เปลี่ยนชื่อถั่วเหลืองเป็นถั่วเหลืองใหม่');const pending=await task();expect(pending.status).toBe('awaiting_confirmation');expect(pending.confirmed_version).toBeNull();
  await executeAgentTask(pending.id);expect(await withSystem(async db=>(await db.query('select name from pet.pets where id=$1',[pet])).rows[0].name)).toBe('ถั่วเหลือง');
  const oldChoice=(await choices(pending.id)).find(row=>row.action==='confirm');await withSystem(db=>db.query('update assistant.agent_tasks set version=version+1 where id=$1',[pending.id]));await postback(oldChoice.id);
  expect((await task()).status).toBe('awaiting_confirmation');expect(await withSystem(async db=>(await db.query('select normalized from assistant.agent_turns where postback_data=$1',[`agent:choice:${oldChoice.id}`])).rows[0].normalized.errorCode)).toBe('AGENT_CHOICE_STALE');
  await input('ยืนยัน');const queued=await task();expect(queued.confirmed_version).toBe(queued.version);await executeAgentTask(pending.id);expect(await withSystem(async db=>(await db.query('select name from pet.pets where id=$1',[pet])).rows[0].name)).toBe('ถั่วเหลืองใหม่');
  await withSystem(db=>db.query("update pet.pets set name='ถั่วเหลือง' where id=$1",[pet]));
 });
 it('does not let an old typed yes confirm a newer task confirmation card',async()=>{
  plans.push(ready([action('pets.update',{id:pet,changes:{name:'ถั่วเหลืองตรวจแล้ว'}})]));await input('เปลี่ยนชื่อถั่วเหลืองให้หน่อย');const pending=await task();expect(pending.status).toBe('awaiting_confirmation');expect(pending.question.issuedAt).toBeTruthy();
  const oldYes=await storeEvent('ยืนยัน');await withSystem(db=>db.query('update notify.webhook_events set received_at=$2 where event_id=$1',[oldYes,new Date(new Date(pending.question.issuedAt).getTime()-1000)]));await ingestAgentTurn(oldYes,owner);
  expect((await task()).status).toBe('awaiting_confirmation');expect(await withSystem(async db=>(await db.query('select name from pet.pets where id=$1',[pet])).rows[0].name)).toBe('ถั่วเหลือง');
  const fresh=(await choices(pending.id)).find(row=>row.action==='confirm');await postback(fresh.id);expect((await task()).status).toBe('queued');
 });
 it('treats a classifier mistake on an instructional question as a reviewed action rather than an automatic write',async()=>{
  const question='How do I record a diary for ถั่วเหลือง?';normalizations.push(normalized({route:'agent',language:'en',normalizedText:question}));plans.push(ready([action('care.entries.create',diary())]));await input(question);const pending=await task();expect(pending.status).toBe('awaiting_confirmation');expect(pending.confirmed_version).toBeNull();
  await executeAgentTask(pending.id);expect(await entries()).toHaveLength(0);expect((await choices(pending.id)).some(row=>row.action==='confirm')).toBe(true);
 });
 it('does not let another LINE account replay an owner choice or read its task result',async()=>{
  plans.push(ask('ตัวไหนครับ',[{label:'ถั่วเหลือง',value:pet}]));await input();const pending=await task(),choice=(await choices(pending.id))[0];const before=provider.structured.mock.calls.length;
  await postback(choice.id,other);expect(provider.structured).toHaveBeenCalledTimes(before);expect((await task()).status).toBe('collecting');expect(await task(other)).toBeUndefined();
  expect((await call(`/api/v1/assistant/agent/tasks/${pending.id}`,other)).status).toBe(404);expect((await call(`/api/v1/assistant/agent/tasks/${pending.id}`)).status).toBe(200);
 });
 it('deduplicates a redelivered webhook and repeated task execution with the same underlying care write',async()=>{
  plans.push(ready([action('care.entries.create',diary())]));const eventId=await input(),pending=await task();await ingestAgentTurn(eventId,owner);expect(provider.structured).toHaveBeenCalledTimes(2);
  await executeAgentTask(pending.id);await executeAgentTask(pending.id);expect(await entries()).toHaveLength(1);expect(await withSystem(async db=>(await db.query('select count(*)::int n from assistant.agent_tool_calls where task_id=$1',[pending.id])).rows[0].n)).toBe(1);
  await deliverPending();const before=provider.push.mock.calls.length;for(const delivery of await deliveries())await deliverAgentMessage(delivery.id);expect(provider.push).toHaveBeenCalledTimes(before);
 });
 it('claims one execution lease when duplicate worker jobs race',async()=>{
  plans.push(ready([action('care.entries.create',diary())]));await input();const pending=await task();
  const attempts=await Promise.allSettled([executeAgentTask(pending.id),executeAgentTask(pending.id)]);expect(attempts.some(result=>result.status==='fulfilled')).toBe(true);expect((await task()).status).toBe('succeeded');expect(await entries()).toHaveLength(1);
  for(const result of attempts)if(result.status==='rejected')expect(result.reason).toMatchObject({code:'AGENT_BUSY'});
 });
 it('keeps nested pool capacity by immediately deferring concurrent users and progresses their retries once the permit is free',async()=>{
  let release!:()=>void,entered!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
  provider.structured.mockImplementation(async options=>{
   if(options.feature==='agent.normalize'){entered();await held;return normalized({normalizedText:'ขอดูน้องในบัญชี',petMentions:[]});}
   if(options.feature==='agent.plan')return ready([action('pets.list',{})]);
   if(options.feature==='agent.answer')return {summary:'รายชื่อน้องที่คุณมีสิทธิ์ดู'};
   throw new Error(`Unmocked AI feature ${options.feature}`);
  });
  const ids=await Promise.all(users.map(user=>storeEvent('ขอดูน้องในบัญชี',user)));const first=ingestAgentTurn(ids[0]!,owner);
  try{
   await started;const before=performance.now();const deferred=await Promise.allSettled([ingestAgentTurn(ids[1]!,other),ingestAgentTurn(ids[2]!,thirdOwner),executeAgentTask(randomUUID()),deliverAgentMessage(randomUUID())]);
   expect(performance.now()-before).toBeLessThan(2000);expect(deferred.every(result=>result.status==='rejected')).toBe(true);for(const result of deferred)if(result.status==='rejected')expect(result.reason).toMatchObject({code:'AGENT_BUSY'});
   expect(provider.structured).toHaveBeenCalledTimes(1);
  }finally{release();await first;}
  await ingestAgentTurn(ids[1]!,other);await ingestAgentTurn(ids[2]!,thirdOwner);
  const queued=await withSystem(async db=>(await db.query('select id,user_id from assistant.agent_tasks where user_id=any($1::uuid[]) order by created_at',[users])).rows);expect(queued).toHaveLength(3);
  for(const pending of queued)await executeAgentTask(pending.id);
  const responses=await withSystem(async db=>(await db.query('select id,user_id from assistant.agent_deliveries where user_id=any($1::uuid[]) order by created_at',[users])).rows);
  for(const response of responses)await deliverAgentMessage(response.id);
  expect(provider.push).toHaveBeenCalledTimes(6);for(const user of users)expect(provider.push.mock.calls.filter(([recipient])=>recipient===line(user))).toHaveLength(2);
  const counts=await withSystem(async db=>(await db.query("select state,count(*)::int n from assistant.agent_turns where event_id=any($1::text[]) group by state",[ids])).rows);expect(counts).toEqual([{state:'done',n:3}]);
  const own=await task(),third=await task(thirdOwner);expect(JSON.stringify(own.result)).not.toContain(foreignPet);expect(JSON.stringify(third.result)).not.toContain(pet);expect(JSON.stringify(third.result)).not.toContain(foreignPet);
  for(const response of responses)await deliverAgentMessage(response.id);expect(provider.push).toHaveBeenCalledTimes(6);
 });
 it('releases the process permit after an unexpected provider failure so later queued work can continue',async()=>{
  provider.structured.mockRejectedValueOnce(new Error('Synthetic provider connection loss'));const failed=await storeEvent(example);await expect(ingestAgentTurn(failed,owner)).rejects.toThrow('Synthetic provider connection loss');
  normalizations.push(normalized({route:'help',normalizedText:'ช่วยอะไรได้บ้าง',petMentions:[]}));await input('ช่วยอะไรได้บ้าง');await deliverPending();expect(provider.push).toHaveBeenCalledTimes(1);expect(await task()).toBeUndefined();expect(await entries()).toHaveLength(0);
 });
 it('reuses the domain idempotency key after a tool commits but its response is lost',async()=>{
  const tool=getAgentTool('care.entries.create')!,original=tool.execute;
  const transient=vi.spyOn(tool,'execute').mockImplementationOnce(async(...args)=>{await original(...args);throw new Error('Synthetic response lost after domain commit');});
  try{
   plans.push(ready([action('care.entries.create',diary())]));await input();const pending=await task();await executeAgentTask(pending.id);expect((await task()).status).toBe('failed');expect(await entries()).toHaveLength(1);
   const before=await withSystem(async db=>(await db.query('select key_uuid from assistant.agent_tool_calls where task_id=$1',[pending.id])).rows[0].key_uuid);await input('ลองใหม่');await executeAgentTask(pending.id);expect((await task()).status).toBe('succeeded');expect(await entries()).toHaveLength(1);
   expect(await withSystem(async db=>(await db.query('select key_uuid from assistant.agent_tool_calls where task_id=$1',[pending.id])).rows[0].key_uuid)).toBe(before);
  }finally{transient.mockRestore();}
 });
 it('persists completed step receipts and retry keys when a later independent step fails',async()=>{
  const transient=vi.spyOn(getAgentTool('reminders.create')!,'execute').mockRejectedValueOnce(new Error('Synthetic second-step service outage'));
  try{
   plans.push(ready([action('care.entries.create',diary()),action('reminders.create',{petId:pet,title:'Owner requested follow-up',dueAt:new Date(Date.now()+86400000).toISOString()})]));await input();const pending=await task();await executeAgentTask(pending.id);
   let current=await task();expect(current.status).toBe('failed');expect(await entries()).toHaveLength(1);const first=await withSystem(async db=>(await db.query('select step,status,key_uuid,result from assistant.agent_tool_calls where task_id=$1 order by step',[pending.id])).rows);expect(first.map(row=>row.status)).toEqual(['succeeded','failed']);expect(first[0].result.resourceId).toBe((await entries())[0].id);
   await input('ลองใหม่');await executeAgentTask(pending.id);current=await task();expect(current.status,JSON.stringify(current.result)).toBe('succeeded');expect(await entries()).toHaveLength(1);
   const next=await withSystem(async db=>(await db.query('select key_uuid,status from assistant.agent_tool_calls where task_id=$1 order by step',[pending.id])).rows);expect(next.map(row=>row.key_uuid)).toEqual(first.map(row=>row.key_uuid));expect(next.map(row=>row.status)).toEqual(['succeeded','succeeded']);expect(await withSystem(async db=>(await db.query('select count(*)::int n from notify.reminders where user_id=$1',[owner])).rows[0].n)).toBe(1);
  }finally{transient.mockRestore();}
 });
 it('uses the existing AI chat conversation for ordinary questions without making a diary entry',async()=>{
  normalizations.push(normalized({route:'chat',normalizedText:'สวัสดี',petMentions:[]}));await input('สวัสดี');const thread=await withSystem(async db=>(await db.query('select * from assistant.agent_threads where user_id=$1',[owner])).rows[0]);
  expect(thread.conversation_id).toBe(thread.id);expect(provider.text).toHaveBeenCalledTimes(1);expect(await entries()).toHaveLength(0);expect(await task()).toBeUndefined();
  await deliverPending();expect(JSON.stringify(provider.push.mock.calls[0]![1])).toContain('สวัสดีครับ');
 });
 it('keeps follow-up replies private without inventing an action or entering clinical diary data',async()=>{
  normalizations.push(normalized({route:'followup_reply',normalizedText:'ดีขึ้นแล้ว',petMentions:[]}));await input('ดีขึ้นแล้ว');expect(provider.text).not.toHaveBeenCalled();expect(await entries()).toHaveLength(0);expect(await task()).toBeUndefined();await deliverPending();expect(JSON.stringify(provider.push.mock.calls[0]![1])).toContain('ส่วนตัว');
 });
 it('prioritizes emergency guidance and help without executing tools',async()=>{
  await input('น้องหายใจไม่ออก');normalizations.push(normalized({route:'help',normalizedText:'ทำอะไรได้บ้าง'}));await input('ทำอะไรได้บ้าง');expect(await task()).toBeUndefined();expect(await entries()).toHaveLength(0);await deliverPending();expect(JSON.stringify(provider.push.mock.calls)).toContain('/emergency?lang=th');expect(provider.structured.mock.calls.filter(([o])=>o.feature==='agent.plan')).toHaveLength(0);
 });
 it('shows deterministic urgent guidance before LLM0 even when the model provider is unavailable',async()=>{
  provider.structured.mockRejectedValue(new Error('Synthetic AI quota unavailable'));const eventId=await input('น้องกำลังชักไม่หยุด');expect(provider.structured).not.toHaveBeenCalled();expect(provider.text).not.toHaveBeenCalled();expect(await task()).toBeUndefined();expect(await entries()).toHaveLength(0);
  const turn=await withSystem(async db=>(await db.query('select state,route from assistant.agent_turns where event_id=$1',[eventId])).rows[0]);expect(turn).toMatchObject({state:'done',route:'emergency'});await deliverPending();expect(JSON.stringify(provider.push.mock.calls)).toContain('/emergency?lang=th');
 });
 it('rejects disabled, group, wrong-account and stale events before any model or tool call',async()=>{
  const eventId=await storeEvent(example);vi.stubEnv('LINE_AGENT_ENABLED','false');await expect(ingestAgentTurn(eventId,owner)).rejects.toMatchObject({code:'AGENT_DISABLED'});vi.stubEnv('LINE_AGENT_ENABLED','true');
  const group=await storeEvent(example,owner,{source:{type:'group',userId:line(owner)}});await expect(ingestAgentTurn(group,owner)).rejects.toMatchObject({code:'AGENT_EVENT_INVALID'});
  const mismatch=await storeEvent(example,other);await expect(ingestAgentTurn(mismatch,owner)).rejects.toMatchObject({code:'AGENT_EVENT_INVALID'});
  await withSystem(db=>db.query("update notify.webhook_events set received_at=now()-interval '25 hours' where event_id=$1",[eventId]));await expect(ingestAgentTurn(eventId,owner)).rejects.toMatchObject({code:'AGENT_EVENT_INVALID'});expect(provider.structured).not.toHaveBeenCalled();expect(provider.push).not.toHaveBeenCalled();expect(await entries()).toHaveLength(0);
 });
 it('withdrawal after planning cancels the queued action and prevents both execution and disclosure',async()=>{
  plans.push(ready([action('care.entries.create',diary())]));await input();const pending=await task();await withSystem(db=>db.query("update identity.consents set granted=false where user_id=$1 and purpose='service'",[owner]));
  await executeAgentTask(pending.id);for(const row of await deliveries())await deliverAgentMessage(row.id);expect((await task()).status).toBe('cancelled');expect(await entries()).toHaveLength(0);expect(provider.push).not.toHaveBeenCalled();
 });
 it('rechecks live ownership at tool execution rather than trusting the pet selected during planning',async()=>{
  plans.push(ready([action('care.entries.create',diary())]));await input();const pending=await task();await withSystem(db=>db.query('delete from pet.members where pet_id=$1 and user_id=$2',[pet,owner]));
  // Owner access also comes from pet.pets.owner_id; transferring both records
  // models a completed ownership change rather than merely removing a carer.
  await withSystem(db=>db.query('update pet.pets set owner_id=$2 where id=$1',[pet,other]));
  try{await executeAgentTask(pending.id);expect((await task()).status).toBe('failed');expect(await entries()).toHaveLength(0);}finally{await withSystem(async db=>{await db.query('update pet.pets set owner_id=$2 where id=$1',[pet,owner]);await db.query("insert into pet.members(pet_id,user_id,role) values($1,$2,'owner') on conflict(pet_id,user_id) do update set role=excluded.role",[pet,owner]);});}
 });
 it('keeps only reference receipts and redacts them after current pet access is lost',async()=>{
  plans.push(ready([action('care.entries.create',diary())]));await input();const pending=await task();await executeAgentTask(pending.id);const finished=await task();expect(finished.status).toBe('succeeded');
  const receipt=await withSystem(async db=>(await db.query('select result from assistant.agent_tool_calls where task_id=$1',[pending.id])).rows[0].result);expect(receipt.data).toBeUndefined();expect(JSON.stringify(receipt)).not.toContain(example);expect(JSON.stringify(finished.result)).not.toContain(example);expect(receipt.resourceId).toBe((await entries())[0].id);
  await withSystem(async db=>{await db.query('delete from pet.members where pet_id=$1 and user_id=$2',[pet,owner]);await db.query('update pet.pets set owner_id=$2 where id=$1',[pet,other]);});
  try{
   const current=await call(`/api/v1/assistant/agent/tasks/${pending.id}`);expect(current.status).toBe(200);expect(current.body.data).toMatchObject({result:null,results:[],question:null,errorCode:'AGENT_RESOURCE_ACCESS_CHANGED'});
   const pushed=provider.push.mock.calls.length;await deliverPending();expect(provider.push).toHaveBeenCalledTimes(pushed);expect((await deliveries(pending.id)).some(row=>row.error_code==='AGENT_RESOURCE_ACCESS_CHANGED'&&row.status==='failed'&&row.messages.length===0)).toBe(true);
  }finally{await withSystem(async db=>{await db.query('update pet.pets set owner_id=$2 where id=$1',[pet,owner]);await db.query("insert into pet.members(pet_id,user_id,role) values($1,$2,'owner') on conflict(pet_id,user_id) do update set role=excluded.role",[pet,owner]);});}
 });
 it('suppresses a queued read answer after its diary row is deleted even while pet access remains',async()=>{
  const saved=await getAgentTool('care.entries.create')!.execute({id:owner,role:'owner'},diary({narrative:'READ_SOURCE_CANARY'}),randomUUID());plans.push(ready([action('care.entries.get',{id:saved.resourceId})]));await input('ขอดูบันทึกของถั่วเหลือง');const pending=await task();await executeAgentTask(pending.id);
  const receipt=await withSystem(async db=>(await db.query('select result from assistant.agent_tool_calls where task_id=$1',[pending.id])).rows[0].result);expect(receipt.readDigest).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(receipt)).not.toContain('READ_SOURCE_CANARY');
  await withSystem(db=>db.query('delete from health.care_entries where id=$1',[saved.resourceId]));expect((await getAgentTool('pets.get')!.execute({id:owner,role:'owner'},{id:pet},randomUUID())).resourceId).toBe(pet);
  const current=await call(`/api/v1/assistant/agent/tasks/${pending.id}`);expect(current.body.data).toMatchObject({result:null,results:[],question:null,errorCode:'AGENT_RESOURCE_ACCESS_CHANGED'});
  const before=provider.push.mock.calls.length;await deliverPending();expect(provider.push).toHaveBeenCalledTimes(before);expect((await deliveries(pending.id)).some(row=>row.error_code==='AGENT_RESOURCE_ACCESS_CHANGED'&&row.status==='failed'&&row.messages.length===0)).toBe(true);
 });
 it('suppresses a queued memory answer when optional memory consent is withdrawn before delivery',async()=>{
  await withSystem(async db=>{await db.query('insert into assistant.preferences(user_id,memory_enabled) values($1,true)',[owner]);await db.query("insert into identity.consents(user_id,purpose,granted,version) values($1,'ai_memory',true,'fixture')",[owner]);await db.query("insert into assistant.memories(user_id,pet_id,content) values($1,$2,'PRIVATE_MEMORY_CANARY')",[owner,pet]);});
  const original=provider.structured.getMockImplementation()!;provider.structured.mockImplementation(async options=>options.feature==='agent.answer'?{summary:'PRIVATE_MEMORY_CANARY'}:original(options));plans.push(ready([action('assistant.memories.list',{})]));await input('ขอดูความจำที่ฉันอนุญาตให้จำ');const pending=await task();await executeAgentTask(pending.id);expect((await task()).status).toBe('succeeded');
  const receipt=await withSystem(async db=>(await db.query('select result from assistant.agent_tool_calls where task_id=$1',[pending.id])).rows[0].result);expect(receipt.readDigest).toMatch(/^[0-9a-f]{64}$/);expect(JSON.stringify(receipt)).not.toContain('PRIVATE_MEMORY_CANARY');
  await withSystem(db=>db.query("update identity.consents set granted=false where user_id=$1 and purpose='ai_memory'",[owner]));const before=provider.push.mock.calls.length;await deliverPending();expect(provider.push).toHaveBeenCalledTimes(before);expect(JSON.stringify(provider.push.mock.calls)).not.toContain('PRIVATE_MEMORY_CANARY');
  expect((await call(`/api/v1/assistant/agent/tasks/${pending.id}`)).body.data).toMatchObject({result:null,results:[],question:null,errorCode:'AGENT_RESOURCE_ACCESS_CHANGED'});expect((await deliveries(pending.id)).some(row=>row.error_code==='AGENT_RESOURCE_ACCESS_CHANGED'&&row.status==='failed'&&row.messages.length===0)).toBe(true);
 });
 it('bounds worker and client APIs: valid user tokens cannot call private ingest or forge task state',async()=>{
  expect((await call('/internal/agent/ingest',owner,'POST',{eventId:'not-verified',userId:owner})).status).toBe(401);
  plans.push(ready([action('care.entries.create',diary())]));await input();const pending=await task();expect((await call(`/api/v1/assistant/agent/tasks/${pending.id}`,owner,'PATCH',{status:'succeeded'})).status).toBe(404);
  await expect(withUser(owner,db=>db.query("update assistant.agent_tasks set status='succeeded' where id=$1",[pending.id]))).rejects.toMatchObject({code:'42501'});
 });
 it('exposes only task metadata in lists and privacy exports without replaying copied domain plan fields',async()=>{
  plans.push(ready([action('care.entries.create',diary({narrative:'COPIED_TOOL_ARGS_CANARY'}))]));await input(example);const pending=await task();
  await withSystem(db=>db.query('update assistant.agent_tasks set title=$2,question=$3::jsonb,request_text=$4 where id=$1',[pending.id,'COPIED_TITLE_CANARY',JSON.stringify({text:'COPIED_QUESTION_CANARY'}),'COPIED_REQUEST_CANARY']));
  const list=await call('/api/v1/assistant/agent/tasks');expect(list.status).toBe(200);const listed=JSON.stringify(list.body);for(const canary of ['COPIED_TOOL_ARGS_CANARY','COPIED_TITLE_CANARY','COPIED_QUESTION_CANARY','COPIED_REQUEST_CANARY'])expect(listed).not.toContain(canary);expect(list.body.data[0]).toMatchObject({id:pending.id,title:'งานของ Agent',question:null,result:null,results:[]});
  const identity=(await import('../../identity/src/app')).default;const response=await identity.request('/api/v1/identity/export',{headers:{Authorization:`Bearer ${tokens.get(owner)}`}});expect(response.status).toBe(200);const exported=(await response.json()).data.lineAgent;
  for(const canary of ['COPIED_TOOL_ARGS_CANARY','COPIED_TITLE_CANARY','COPIED_QUESTION_CANARY','COPIED_REQUEST_CANARY'])expect(JSON.stringify(exported)).not.toContain(canary);
  expect(exported.turns[0].inputText).toBe(example);expect(exported.tasks[0]).toMatchObject({id:pending.id,status:'queued'});for(const field of ['title','question','plan','requestText'])expect(exported.tasks[0][field]).toBeUndefined();expect(exported.toolCalls[0].args).toBeUndefined();expect(exported.toolCalls[0].toolName).toBe('care.entries.create');
  await withSystem(db=>db.query("update identity.consents set granted=false where user_id=$1 and purpose='service'",[owner]));expect((await call('/api/v1/assistant/agent/tasks')).status).toBe(403);
 });
 it('retries a failed LINE transport with the persisted messages and UUID rather than regenerating work',async()=>{
  normalizations.push(normalized({route:'help',normalizedText:'ช่วยอะไรได้บ้าง'}));await input('ช่วยอะไรได้บ้าง');const row=(await deliveries())[0];provider.push.mockRejectedValueOnce(new Error('Synthetic transport timeout'));
  await expect(deliverAgentMessage(row.id)).rejects.toThrow('Synthetic transport timeout');await deliverAgentMessage(row.id);expect(provider.push).toHaveBeenCalledTimes(2);expect(provider.push.mock.calls[1]![2]).toBe(provider.push.mock.calls[0]![2]);expect(provider.push.mock.calls[1]![1]).toEqual(provider.push.mock.calls[0]![1]);expect(provider.structured).toHaveBeenCalledTimes(1);
 });
 it('expires queued LINE output before the provider retry-key window can be exceeded',async()=>{
  const row=await withSystem(async db=>(await db.query(`insert into assistant.agent_deliveries(user_id,kind,dedupe_key,messages,created_at,expires_at) values($1,'expired',$2,'[{"type":"text","text":"Expired fixture output"}]',now()-interval '25 hours',now()-interval '2 hours') returning id`,[owner,`agent-expired-${randomUUID()}`])).rows[0]);
  await deliverAgentMessage(row.id);const result=(await deliveries())[0];expect(result).toMatchObject({status:'failed',messages:[],error_code:'AGENT_DELIVERY_EXPIRED'});expect(provider.push).not.toHaveBeenCalled();expect(provider.structured).not.toHaveBeenCalled();
 });
});
