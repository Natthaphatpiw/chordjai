import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHmac} from 'node:crypto';
const mock=vi.hoisted(()=>({query:vi.fn(),enqueue:vi.fn(),reply:vi.fn(),capture:vi.fn(),command:vi.fn(),processCommand:vi.fn(),waitUntil:vi.fn(),order:[] as string[],pending:[] as Promise<unknown>[]}));
vi.mock('@chordjai/db',()=>({withSystem:async(fn:(tx:{query:typeof mock.query})=>Promise<unknown>)=>{mock.order.push('transaction.start');try{const result=await fn({query:mock.query});mock.order.push('transaction.commit');return result;}catch(error){mock.order.push('transaction.rollback');throw error;}},withUser:async(_id:string,fn:(tx:{query:typeof mock.query})=>Promise<unknown>)=>fn({query:mock.query})}));
vi.mock('@chordjai/queue',()=>({enqueue:mock.enqueue}));
vi.mock('@vercel/functions',()=>({waitUntil:mock.waitUntil}));
vi.mock('@chordjai/line',async()=>({...await vi.importActual<object>('@chordjai/line'),replyLine:mock.reply}));
vi.mock('./followup.js',()=>({registerFollowupRoutes:()=>{},processFollowups:vi.fn(),followupCommand:mock.command,processFollowupCommand:mock.processCommand,captureFollowupReply:mock.capture}));
import {isAgentLineEvent,queueAgentLineEvent} from './agent-channel.js';
import app,{processLineEvent} from './app.js';

const userId='10101010-1010-4010-8010-101010101010';
const event={webhookEventId:'agent-event',type:'message',replyToken:'fixture-reply-token',source:{type:'user',userId:'Ufixture'},message:{type:'text',text:'วันนี้พาน้องถั่วเหลืองไปหยอดหลังคอมา บันทึกไว้ให้หน่อย'}};
let currentEvent:unknown=event,processed=false,accountMatches=true,serviceConsent=true;
beforeEach(()=>{
 vi.stubEnv('LINE_AGENT_ENABLED','true');vi.stubEnv('CRON_SECRET','private-test-secret-at-least-32-characters');
 vi.stubEnv('VERCEL','');vi.stubEnv('ASSISTANT_INTERNAL_URL','');vi.stubEnv('LINE_CHANNEL_SECRET','private-line-signature-fixture');
 vi.stubGlobal('fetch',vi.fn(()=>{throw new Error('Unexpected live network call');}));
 currentEvent=event;processed=false;accountMatches=true;serviceConsent=true;mock.order.length=0;mock.pending.length=0;mock.command.mockReturnValue(null);mock.capture.mockResolvedValue(false);mock.reply.mockResolvedValue(undefined);
 mock.enqueue.mockImplementation(async(topic:string)=>{mock.order.push(`enqueue:${topic}`);return'job';});
 mock.waitUntil.mockImplementation((promise:Promise<unknown>)=>{mock.order.push('waitUntil');mock.pending.push(promise);});
 mock.query.mockImplementation(async(sql:string)=>{
  if(sql.startsWith('insert into notify.webhook_events'))mock.order.push('webhook.persist');
  if(sql.startsWith('update notify.webhook_events'))mock.order.push('webhook.processed');
  const rows=sql.startsWith('select payload,processed_at')?[{payload:currentEvent,processed_at:processed?new Date():null}]
   :sql.startsWith('select id from identity.users where line_user_id')?[{id:userId}]
   :sql.startsWith('select processed_at from notify.webhook_events')?[{processed_at:processed?new Date():null}]
   :sql.startsWith('select u.id from identity.users')?(accountMatches&&serviceConsent?[{id:userId}]:[])
   :sql.startsWith('insert into notify.webhook_events')?[{id:'webhook-fixture'}]
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
 it('skips legacy generic replies and follow-up capture after command handoff',async()=>{await processLineEvent(event.webhookEventId);expect(mock.enqueue).toHaveBeenCalled();expect(mock.reply).not.toHaveBeenCalled();expect(mock.capture).not.toHaveBeenCalled();});
 it('routes card postbacks without a second generic reply',async()=>{currentEvent={...event,type:'postback',postback:{data:'agent:choice:fixture'},message:undefined};await processLineEvent(event.webhookEventId);expect(mock.enqueue).toHaveBeenCalled();expect(mock.reply).not.toHaveBeenCalled();});
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
 it('does not post while disabled, local, or missing the private binding',async()=>{
  successfulFetch();await queueAgentLineEvent(userId,event);expect(fetch).not.toHaveBeenCalled();expect(mock.waitUntil).not.toHaveBeenCalled();
  production();vi.stubEnv('LINE_AGENT_ENABLED','false');await queueAgentLineEvent(userId,event);expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv('LINE_AGENT_ENABLED','true');vi.stubEnv('ASSISTANT_INTERNAL_URL','');await queueAgentLineEvent(userId,event);expect(fetch).not.toHaveBeenCalled();
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
  expect(mock.enqueue.mock.calls.map(([topic])=>topic)).toEqual(['line.event','agent.turn']);expect(fetch).toHaveBeenCalledOnce();expect(mock.reply).not.toHaveBeenCalled();
 });
 it('keeps invalid signatures and malformed bodies out of DB and background processing',async()=>{
  production();successfulFetch();expect((await signedWebhook(event,false)).status).toBe(401);expect((await signedWebhook({...event,postback:{data:'x'.repeat(301)}})).status).toBe(400);
  expect(mock.query).not.toHaveBeenCalled();expect(mock.waitUntil).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('keeps a disabled webhook durable without starting background work',async()=>{
  production();successfulFetch();vi.stubEnv('LINE_AGENT_ENABLED','false');expect((await signedWebhook()).status).toBe(200);expect(mock.enqueue.mock.calls.map(([topic])=>topic)).toEqual(['line.event']);expect(mock.waitUntil).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
 it('does not schedule background work when webhook persistence fails',async()=>{
  production();successfulFetch();mock.enqueue.mockRejectedValueOnce(new Error('queue unavailable'));expect((await signedWebhook()).status).toBe(500);expect(mock.order).toContain('transaction.rollback');expect(mock.waitUntil).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
 });
});
