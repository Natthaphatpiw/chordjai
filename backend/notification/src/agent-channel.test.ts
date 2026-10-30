import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHmac} from 'node:crypto';
const mock=vi.hoisted(()=>({query:vi.fn(),enqueue:vi.fn(),reply:vi.fn(),read:vi.fn(),loading:vi.fn(),capture:vi.fn(),command:vi.fn(),processCommand:vi.fn(),waitUntil:vi.fn(),order:[] as string[],pending:[] as Promise<unknown>[]}));
vi.mock('@chordjai/db',()=>({withSystem:async(fn:(tx:{query:typeof mock.query})=>Promise<unknown>)=>{mock.order.push('transaction.start');try{const result=await fn({query:mock.query});mock.order.push('transaction.commit');return result;}catch(error){mock.order.push('transaction.rollback');throw error;}},withUser:async(_id:string,fn:(tx:{query:typeof mock.query})=>Promise<unknown>)=>fn({query:mock.query})}));
vi.mock('@chordjai/queue',()=>({enqueue:mock.enqueue}));
vi.mock('@vercel/functions',()=>({waitUntil:mock.waitUntil}));
vi.mock('@chordjai/line',async()=>({...await vi.importActual<object>('@chordjai/line'),replyLine:mock.reply,markLineMessagesRead:mock.read,startLineLoading:mock.loading}));
vi.mock('./followup.js',()=>({registerFollowupRoutes:()=>{},processFollowups:vi.fn(),followupCommand:mock.command,processFollowupCommand:mock.processCommand,captureFollowupReply:mock.capture}));
// Feedback tests isolate the ingress gate; real admission is covered in input-guard.integration.test.ts.
vi.mock('./input-guard',async original=>({...await original<typeof import('./input-guard')>(),admitLineEvent:vi.fn(async()=>true),gateLineEvent:vi.fn(async()=>true)}));
import {isAgentLineEvent,queueAgentLineEvent} from './agent-channel.js';
import app,{processLineEvent} from './app.js';
import {LineApiError} from '@chordjai/line';

const userId='10101010-1010-4010-8010-101010101010';
const event={webhookEventId:'agent-event',type:'message',replyToken:'fixture-reply-token',source:{type:'user',userId:`U${'a'.repeat(32)}`},message:{type:'text',text:'วันนี้พาน้องถั่วเหลืองไปหยอดหลังคอมา บันทึกไว้ให้หน่อย',markAsReadToken:'fixture-read-token'}};
let currentEvent:unknown=event,processed=false,accountMatches=true,serviceConsent=true,webhookInserted=true,turnDone=false,threadLanguage='th';
beforeEach(()=>{
 vi.stubEnv('LINE_AGENT_ENABLED','true');vi.stubEnv('CRON_SECRET','private-test-secret-at-least-32-characters');
 vi.stubEnv('VERCEL','');vi.stubEnv('ASSISTANT_INTERNAL_URL','');vi.stubEnv('LINE_CHANNEL_SECRET','private-line-signature-fixture');
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected live network call');}));
 currentEvent=event;processed=false;accountMatches=true;serviceConsent=true;webhookInserted=true;turnDone=false;threadLanguage='th';mock.order.length=0;mock.pending.length=0;mock.command.mockReturnValue(null);mock.capture.mockResolvedValue(false);
 mock.reply.mockImplementation(async()=>{mock.order.push('ack');});mock.read.mockImplementation(async()=>{mock.order.push('read');});mock.loading.mockImplementation(async()=>{mock.order.push('loading');});
 mock.enqueue.mockImplementation(async(topic:string)=>{mock.order.push(`enqueue:${topic}`);return'job';});
 mock.waitUntil.mockImplementation((promise:Promise<unknown>)=>{mock.order.push('waitUntil');mock.pending.push(promise);});
 mock.query.mockImplementation(async(sql:string)=>{
  if(sql.startsWith('insert into notify.webhook_events'))mock.order.push('webhook.persist');
  if(sql.startsWith('update notify.webhook_events'))mock.order.push('webhook.processed');
  const rows=sql.startsWith('select payload,processed_at')?[{payload:currentEvent,processed_at:processed?new Date():null}]
   :sql.startsWith('select id from identity.users where line_user_id')?[{id:userId}]
   :sql.startsWith('select processed_at from notify.webhook_events')?[{processed_at:processed?new Date():null}]
   :sql.startsWith('select u.id,')?(accountMatches&&serviceConsent?[{id:userId,language:threadLanguage}]:[])
   :sql.startsWith('select state from assistant.agent_turns')?(turnDone?[{state:'done'}]:[])
   :sql.startsWith('insert into notify.webhook_events')?(webhookInserted?[{id:'webhook-fixture'}]:[])
   :[];
  return{rows,rowCount:rows.length};
 });
});
afterEach(async()=>{await drainBackground();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();vi.restoreAllMocks();});
async function drainBackground(){while(mock.pending.length)await Promise.allSettled(mock.pending.splice(0));}
async function signedWebhook(value:unknown=event,valid=true){const body=JSON.stringify({events:Array.isArray(value)?value:[value]});const signature=valid?createHmac('sha256',process.env.LINE_CHANNEL_SECRET!).update(body).digest('base64'):'invalid';return app.request('http://localhost/api/v1/notification/webhooks/line',{method:'POST',headers:{'Content-Type':'application/json','x-line-signature':signature},body});}

describe('private LINE event handoff to durable agent turns',()=>{
 it('does nothing while rollout flag is disabled',async()=>{vi.stubEnv('LINE_AGENT_ENABLED','false');expect(await queueAgentLineEvent(userId,event)).toBe(false);expect(mock.query).not.toHaveBeenCalled();});
 it('rejects group/room, empty, image, missing source and oversized postbacks',()=>{
  expect(isAgentLineEvent(event)).toBe(true);
  for(const sourceType of ['group','room'])expect(isAgentLineEvent({...event,source:{...event.source,type:sourceType}})).toBe(false);
  expect(isAgentLineEvent({...event,message:{type:'image'}})).toBe(false);
  expect(isAgentLineEvent({...event,message:{type:'text',text:'   '}})).toBe(false);
  expect(isAgentLineEvent({...event,source:{type:'user'}})).toBe(false);
  expect(isAgentLineEvent({...event,type:'postback',postback:{data:'x'.repeat(301)}})).toBe(false);
  expect(isAgentLineEvent({...event,type:'postback',postback:{data:'agent:choice:fixture'}})).toBe(true);
 });
 it('enqueues identifiers in the locked event transaction and retains original payload',async()=>{
  expect(await queueAgentLineEvent(userId,event)).toBe(true);
  expect(mock.query.mock.calls[0][0]).toContain('for update');
  expect(mock.enqueue).toHaveBeenCalledWith('agent.turn',{eventId:event.webhookEventId,userId},`agent-turn:${event.webhookEventId}`,expect.objectContaining({query:mock.query}));
  const updates=mock.query.mock.calls.filter(([sql])=>String(sql).startsWith('update notify.webhook_events'));
  expect(updates).toHaveLength(1);expect(updates[0][0]).not.toContain('payload=');
 });
 it('does not act on a stale account/source mapping',async()=>{accountMatches=false;expect(await queueAgentLineEvent(userId,event)).toBe(false);expect(mock.enqueue).not.toHaveBeenCalled();});
 it('keeps accounts without current service consent on the onboarding path',async()=>{serviceConsent=false;expect(await queueAgentLineEvent(userId,event)).toBe(false);expect(mock.enqueue).not.toHaveBeenCalled();expect(mock.query.mock.calls.some(([sql])=>String(sql).includes("c.purpose='service' and c.granted"))).toBe(true);expect(mock.query.mock.calls.some(([sql])=>String(sql).startsWith('update notify.webhook_events'))).toBe(false);});
 it('treats a duplicate processed handoff as handled without enqueue or reply',async()=>{processed=true;expect(await queueAgentLineEvent(userId,event)).toBe(true);expect(mock.enqueue).not.toHaveBeenCalled();});
 it('does not mark the event processed if enqueue fails',async()=>{mock.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));await expect(queueAgentLineEvent(userId,event)).rejects.toThrow('queue unavailable');expect(mock.query.mock.calls.some(([sql])=>String(sql).startsWith('update notify.webhook_events'))).toBe(false);});
 it('sends only the accepted ACK, skipping legacy generic reply and follow-up capture after command handoff',async()=>{await processLineEvent(event.webhookEventId);expect(mock.enqueue).toHaveBeenCalled();expect(mock.reply).toHaveBeenCalledExactlyOnceWith(event.replyToken,[{type:'text',text:'รับข้อความแล้วครับ กำลังประมวลผลให้'}],3000);expect(mock.capture).not.toHaveBeenCalled();expect(mock.loading).toHaveBeenCalledExactlyOnceWith(event.source.userId,60);});
 it('routes card postbacks with one ACK and no second generic reply',async()=>{currentEvent={...event,type:'postback',postback:{data:'agent:choice:fixture'},message:undefined};await processLineEvent(event.webhookEventId);expect(mock.enqueue).toHaveBeenCalled();expect(mock.reply).toHaveBeenCalledOnce();expect(mock.loading).toHaveBeenCalledOnce();});
 it('keeps deterministic PAUSE precedence ahead of the agent',async()=>{mock.command.mockReturnValue('pause');mock.processCommand.mockResolvedValue({changed:true,language:'th'});await processLineEvent(event.webhookEventId);expect(mock.processCommand).toHaveBeenCalledWith(userId,'pause');expect(mock.enqueue).not.toHaveBeenCalled();expect(mock.reply).toHaveBeenCalledOnce();expect(mock.capture).not.toHaveBeenCalled();});
 it('keeps the pre-rollout fallback when agent is disabled',async()=>{vi.stubEnv('LINE_AGENT_ENABLED','false');await processLineEvent(event.webhookEventId);expect(mock.enqueue).not.toHaveBeenCalled();expect(mock.capture).toHaveBeenCalled();expect(mock.reply).toHaveBeenCalledOnce();});
 it('protects classified follow-up capture with machine auth and strict input',async()=>{
  const path='http://localhost/internal/agent/capture-followup',body={userId,eventId:event.webhookEventId,text:'อาการดีขึ้นแล้ว'};
  expect((await app.request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status).toBe(401);
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${process.env.CRON_SECRET}`};
  expect((await app.request(path,{method:'POST',headers,body:JSON.stringify({...body,extra:'injection'})})).status).toBe(400);
  mock.capture.mockResolvedValueOnce(true);const response=await app.request(path,{method:'POST',headers,body:JSON.stringify(body)});
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({data:{captured:true}});expect(mock.capture).toHaveBeenCalledWith(userId,event.webhookEventId,body.text);expect(fetch).not.toHaveBeenCalled();
 });
});

describe('best-effort Vercel fast path follows durable commits',()=>{
 function production(){vi.stubEnv('VERCEL','1');vi.stubEnv('ASSISTANT_INTERNAL_URL','https://assistant.internal.test');}
 function successfulFetch(){vi.stubGlobal('fetch',vi.fn(async()=>{mock.order.push('assistant.post');return new Response('{}',{status:200});}));}
 it('commits the agent queue before scheduling or posting the fast path',async()=>{
  production();successfulFetch();expect(await queueAgentLineEvent(userId,event)).toBe(true);await drainBackground();
  const commit=mock.order.indexOf('transaction.commit');expect(mock.order.indexOf('enqueue:agent.turn')).toBeLessThan(commit);
  expect(mock.order.indexOf('webhook.processed')).toBeLessThan(commit);expect(commit).toBeLessThan(mock.order.indexOf('waitUntil'));expect(commit).toBeLessThan(mock.order.indexOf('assistant.post'));
  expect(fetch).toHaveBeenCalledOnce();const [url,init]=(fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(String(url)).toBe('https://assistant.internal.test/internal/agent/ingest');expect(init).toMatchObject({method:'POST',redirect:'error',headers:{Authorization:`Bearer ${process.env.CRON_SECRET}`}});expect(JSON.parse(init.body)).toEqual({eventId:event.webhookEventId,userId});
 });
 it('never schedules a duplicate already handed-off event',async()=>{production();successfulFetch();processed=true;expect(await queueAgentLineEvent(userId,event)).toBe(true);expect(mock.enqueue).not.toHaveBeenCalled();expect(mock.waitUntil).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();});
 it('keeps durable ingestion fallback while local or missing a binding, and sends no feedback while disabled',async()=>{
  successfulFetch();await queueAgentLineEvent(userId,event);expect(fetch).not.toHaveBeenCalled();expect(mock.waitUntil).not.toHaveBeenCalled();
  production();vi.stubEnv('LINE_AGENT_ENABLED','false');await queueAgentLineEvent(userId,event);expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv('LINE_AGENT_ENABLED','true');vi.stubEnv('ASSISTANT_INTERNAL_URL','');await queueAgentLineEvent(userId,event);await drainBackground();expect(fetch).not.toHaveBeenCalled();expect(mock.reply).toHaveBeenCalledTimes(2);expect(mock.loading).toHaveBeenCalledTimes(2);
 });
 it('does not schedule before a failed durable enqueue, missing consent, or source mismatch',async()=>{
  production();successfulFetch();serviceConsent=false;expect(await queueAgentLineEvent(userId,event)).toBe(false);
  serviceConsent=true;accountMatches=false;expect(await queueAgentLineEvent(userId,event)).toBe(false);
  accountMatches=true;mock.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));await expect(queueAgentLineEvent(userId,event)).rejects.toThrow('queue unavailable');
  expect(mock.order).toContain('transaction.rollback');expect(mock.waitUntil).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('leaves durable fallback intact on HTTP rejection, network throw, and malformed binding',async()=>{
  production();const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  for(const mode of ['status','throw','binding']){
   if(mode==='binding')vi.stubEnv('ASSISTANT_INTERNAL_URL','not-a-url');
   vi.stubGlobal('fetch',vi.fn(()=>{if(mode==='throw')throw new Error('contains-private-provider-details');return Promise.resolve(new Response('{}',{status:503}));}));
   expect(await queueAgentLineEvent(userId,event)).toBe(true);await drainBackground();
  }
  expect(mock.enqueue).toHaveBeenCalledTimes(3);expect(warn).toHaveBeenCalledTimes(3);expect(warn.mock.calls.every(([message])=>message===JSON.stringify({event:'agent_fast_path_deferred_to_queue'}))).toBe(true);
 });
 it('persists webhook and initial queue transaction before registering background processing',async()=>{
  production();successfulFetch();const response=await signedWebhook();expect(response.status).toBe(200);await drainBackground();
  const commit=mock.order.indexOf('transaction.commit');expect(mock.order.indexOf('webhook.persist')).toBeLessThan(mock.order.indexOf('enqueue:line.event'));expect(mock.order.indexOf('enqueue:line.event')).toBeLessThan(commit);expect(commit).toBeLessThan(mock.order.indexOf('waitUntil'));
  expect(mock.enqueue.mock.calls.map(([topic])=>topic)).toEqual(['line.event','agent.turn']);expect(fetch).toHaveBeenCalledOnce();expect(mock.reply).toHaveBeenCalledOnce();expect(mock.read).toHaveBeenCalledExactlyOnceWith('fixture-read-token');expect(mock.order.indexOf('read')).toBeGreaterThan(commit);
 });
 it('keeps invalid signatures and malformed bodies out of DB and background processing',async()=>{
  production();successfulFetch();expect((await signedWebhook(event,false)).status).toBe(401);expect((await signedWebhook({...event,postback:{data:'x'.repeat(301)}})).status).toBe(400);
  expect(mock.query).not.toHaveBeenCalled();expect(mock.waitUntil).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('keeps a disabled webhook durable without starting background work',async()=>{
  production();successfulFetch();vi.stubEnv('LINE_AGENT_ENABLED','false');expect((await signedWebhook()).status).toBe(200);await drainBackground();expect(mock.enqueue.mock.calls.map(([topic])=>topic)).toEqual(['line.event']);expect(mock.read).toHaveBeenCalledOnce();expect(mock.reply).not.toHaveBeenCalled();expect(mock.loading).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('does not schedule background work when webhook persistence fails',async()=>{
  production();successfulFetch();mock.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));expect((await signedWebhook()).status).toBe(500);expect(mock.order).toContain('transaction.rollback');expect(mock.waitUntil).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
});

describe('receipt, ACK and loading follow accepted private messages',()=>{
 function production(){vi.stubEnv('VERCEL','1');vi.stubEnv('ASSISTANT_INTERNAL_URL','https://assistant.internal.test');vi.stubGlobal('fetch',vi.fn(async()=>{mock.order.push('assistant.post');return new Response('{}',{status:200});}));}
 it('marks a signed message read only after durable acceptance, with deterministic local completion',async()=>{
  expect((await signedWebhook()).status).toBe(200);
  expect(mock.read).toHaveBeenCalledExactlyOnceWith('fixture-read-token');expect(mock.order.indexOf('transaction.commit')).toBeLessThan(mock.order.indexOf('read'));
  expect(mock.reply).not.toHaveBeenCalled();expect(mock.loading).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('logs accepted feedback only after provider success with hashed references and no message, token or account data',async()=>{
  production();const info=vi.spyOn(console,'info').mockImplementation(()=>{});
  expect((await signedWebhook()).status).toBe(200);await drainBackground();
  const entries=info.mock.calls.flatMap(([line])=>{try{const row=JSON.parse(line);return row.event==='line_feedback_stage'?[row]:[];}catch{return[];}});
  expect(entries).toHaveLength(3);expect(entries.map(row=>row.operation).sort()).toEqual(['ack','loading','read']);
  for(const row of entries){expect(row).toMatchObject({status:'accepted',eventRef:expect.stringMatching(/^[a-f0-9]{16}$/)});expect(Object.keys(row).sort()).toEqual(['event','eventRef','operation','status']);}
  expect(new Set(entries.map(row=>row.eventRef)).size).toBe(1);expect(JSON.stringify(entries)).not.toMatch(/fixture|Uaaaa|บันทึก|ถั่วเหลือง/);
 });
 it('does not repeat read, ACK, animation, enqueue or fast path for a duplicate webhook',async()=>{
  production();webhookInserted=false;expect((await signedWebhook()).status).toBe(200);await drainBackground();
  expect(mock.read).not.toHaveBeenCalled();expect(mock.reply).not.toHaveBeenCalled();expect(mock.loading).not.toHaveBeenCalled();expect(mock.enqueue).not.toHaveBeenCalled();expect(mock.waitUntil).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('never feeds back on invalid signatures, invalid bodies, failed persistence or LINE verification events',async()=>{
  production();expect((await signedWebhook(event,false)).status).toBe(401);expect((await signedWebhook({...event,source:undefined})).status).toBe(400);expect((await signedWebhook([])).status).toBe(200);
  mock.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));expect((await signedWebhook()).status).toBe(500);await drainBackground();
  expect(mock.read).not.toHaveBeenCalled();expect(mock.reply).not.toHaveBeenCalled();expect(mock.loading).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('does not mark or animate group and room messages despite a user ID and read token',async()=>{
  production();for(const type of ['group','room']){currentEvent={...event,source:{...event.source,type}};expect((await signedWebhook(currentEvent)).status).toBe(200);await drainBackground();}
  expect(mock.read).not.toHaveBeenCalled();expect(mock.reply).not.toHaveBeenCalled();expect(mock.loading).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('awaits the bounded ACK attempt before starting native loading and assistant processing',async()=>{
  production();let releaseAck!:()=>void;let started!:()=>void;const ackStarted=new Promise<void>(resolve=>{started=resolve;});
  mock.reply.mockImplementation(()=>{mock.order.push('ack.start');started();return new Promise<void>(resolve=>{releaseAck=()=>{mock.order.push('ack.end');resolve();};});});
  expect(await queueAgentLineEvent(userId,event)).toBe(true);await ackStarted;
  try{expect(fetch).not.toHaveBeenCalled();expect(mock.loading).not.toHaveBeenCalled();expect(mock.reply.mock.calls[0]?.[2]).toBe(3000);}finally{releaseAck();}
  await drainBackground();expect(mock.order.indexOf('ack.end')).toBeLessThan(mock.order.indexOf('loading'));expect(mock.order.indexOf('ack.end')).toBeLessThan(mock.order.indexOf('assistant.post'));
  expect(mock.loading).toHaveBeenCalledExactlyOnceWith(event.source.userId,60);expect(fetch).toHaveBeenCalledOnce();
 });
 it('does not let a slow loading endpoint block assistant ingestion',async()=>{
  production();let finishLoading!:()=>void;mock.loading.mockImplementation(()=>new Promise<void>(resolve=>{finishLoading=resolve;}));
  expect(await queueAgentLineEvent(userId,event)).toBe(true);
  try{await vi.waitFor(()=>expect(fetch).toHaveBeenCalledOnce());}finally{finishLoading?.();}
  await drainBackground();
 });
 it('continues ingestion after read/expired-ACK/loading failures and logs no provider detail or identifiers',async()=>{
  production();const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  mock.read.mockRejectedValueOnce(new Error('PRIVATE_READ_TOKEN private-read-token'));
  mock.reply.mockImplementationOnce(async()=>{mock.order.push('ack.failed');throw new LineApiError(400);});
  mock.loading.mockRejectedValueOnce(new Error(`PRIVATE_CHAT_ID ${event.source.userId}`));
  expect((await signedWebhook()).status).toBe(200);await drainBackground();
  expect(mock.enqueue.mock.calls.map(([topic])=>topic)).toEqual(['line.event','agent.turn']);expect(fetch).toHaveBeenCalledOnce();expect(mock.reply).toHaveBeenCalledOnce();expect(mock.order.indexOf('ack.failed')).toBeLessThan(mock.order.indexOf('assistant.post'));
  expect(warn.mock.calls.map(([line])=>JSON.parse(line))).toEqual(expect.arrayContaining([
   {event:'line_feedback_unavailable',operation:'read',code:'UNAVAILABLE'},
   {event:'line_feedback_unavailable',operation:'ack',code:'LINE_HTTP_400'},
   {event:'line_feedback_unavailable',operation:'loading',code:'UNAVAILABLE'},
  ]));expect(warn).toHaveBeenCalledTimes(3);expect(JSON.stringify(warn.mock.calls)).not.toMatch(/PRIVATE_|private-read-token|Uaaaa/);
 });
 it('processes stale/redelivered/completed turns without late ACKs or animations',async()=>{
  production();for(const value of [{...event,timestamp:Date.now()-61_000},{...event,deliveryContext:{isRedelivery:true}}]){expect(await queueAgentLineEvent(userId,value)).toBe(true);await drainBackground();}
  turnDone=true;expect(await queueAgentLineEvent(userId,event)).toBe(true);await drainBackground();
  expect(fetch).toHaveBeenCalledTimes(3);expect(mock.reply).not.toHaveBeenCalled();expect(mock.loading).not.toHaveBeenCalled();
 });
 it('uses English for English text and retains thread language for a card answer',async()=>{
  currentEvent={...event,message:{type:'text',text:'Please save a care update for Peony'}};await processLineEvent(event.webhookEventId);
  threadLanguage='en';currentEvent={...event,type:'postback',postback:{data:'agent:choice:fixture'},message:undefined};await processLineEvent(event.webhookEventId);
  expect(mock.reply).toHaveBeenCalledTimes(2);for(const call of mock.reply.mock.calls)expect(call[1]).toEqual([{type:'text',text:'Message received. I’m processing it.'}]);
 });
 it('processes a keyboard-only postback without claiming to process an answer or displaying loading',async()=>{
  production();currentEvent={...event,type:'postback',message:undefined,postback:{data:'agent:compose:11111111-1111-4111-8111-111111111111'}};
  await processLineEvent(event.webhookEventId);await drainBackground();
  expect(mock.enqueue).toHaveBeenCalledWith('agent.turn',expect.anything(),expect.anything(),expect.anything());expect(fetch).toHaveBeenCalledOnce();
  expect(mock.reply).not.toHaveBeenCalled();expect(mock.loading).not.toHaveBeenCalled();expect(mock.read).not.toHaveBeenCalled();
 });
 it('keeps PAUSE and unconsented onboarding on their own response path without an agent ACK or animation',async()=>{
  serviceConsent=false;await processLineEvent(event.webhookEventId);expect(mock.reply).toHaveBeenCalledOnce();expect(mock.reply.mock.calls[0]?.[1]?.[0]?.text).not.toContain('รับข้อความแล้ว');expect(mock.loading).not.toHaveBeenCalled();
  mock.reply.mockClear();serviceConsent=true;mock.command.mockReturnValue('pause');mock.processCommand.mockResolvedValue({changed:true,language:'en'});await processLineEvent(event.webhookEventId);
  expect(mock.reply).toHaveBeenCalledOnce();expect(mock.reply.mock.calls[0]?.[1]?.[0]?.text).toContain('Personalized check-ins are paused');expect(mock.loading).not.toHaveBeenCalled();
 });
});
