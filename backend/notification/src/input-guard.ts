import {classifyInput,inputDecisionSchema,quickInputDecision,canonicalInput} from '@chordjai/ai';
import {passportEmergency} from '@chordjai/contracts';
import {withSystem,type PoolClient} from '@chordjai/db';
import {fingerprint,guardMetric,guardLimit} from '@chordjai/service-kit';

/** Called only after LINE HMAC verification, inside the event INSERT transaction. */
export async function admitLineEvent(db:PoolClient,event:{webhookEventId:string;type:string;timestamp?:number;source:{type:string;userId?:string};message?:{text?:string}},pauseControl=false){
 if(event.source.type!=='user'||!event.source.userId)return false;
 if(event.timestamp!==undefined&&(event.timestamp<Date.now()-86400000||event.timestamp>Date.now()+60000))return false;
 if((await db.query('select id from notify.webhook_events where event_id=$1',[event.webhookEventId])).rowCount)return false;
 const source=fingerprint(event.source.userId);
 const account=(await db.query(`select u.id,t.current_task_id,k.version from identity.users u left join assistant.agent_threads t on t.user_id=u.id left join assistant.agent_tasks k on k.id=t.current_task_id where u.line_user_id=$1 and u.status='active'`,[event.source.userId])).rows[0];
 for(const [scope,key,seconds,limit] of [
  ['line-global-minute','global',60,guardLimit('LINE_EVENTS_PER_MINUTE',600)],
  ['line-source-burst',source,10,guardLimit('LINE_USER_BURST',6)],
  ...((pauseControl&&account)?[]:[['line-source-day',source,86400,account?guardLimit('LINE_USER_EVENTS_PER_DAY',150):5] as const]),
 ] as const){
  if(!(await db.query('select ops.take_rate_limit($1,$2,$3,$4) allowed',[scope,key,seconds,limit])).rows[0]?.allowed){await guardMetric(db,account?.id??null,'line.limited');return false;}
 }
 if(account&&event.message?.text){
  await db.query("select pg_advisory_xact_lock(hashtextextended('line-admit:'||$1,0))",[account.id]);
  const key=fingerprint(canonicalInput(event.message.text)),context=`${account.current_task_id??''}:${account.version??''}`;
  const prior=(await db.query('select fingerprint,context_key,expires_at>now() fresh from ops.line_admissions where user_id=$1',[account.id])).rows[0];
  if(prior?.fresh&&prior.fingerprint===key&&prior.context_key===context){await guardMetric(db,account.id,'line.duplicate');return false;}
  await db.query(`insert into ops.line_admissions(user_id,fingerprint,context_key,expires_at) values($1,$2,$3,now()+interval '30 seconds') on conflict(user_id) do update set fingerprint=excluded.fingerprint,context_key=excluded.context_key,expires_at=excluded.expires_at`,[account.id,key,context]);
 }
 return true;
}

/** A signed event is classified once before ACK, Agent jobs, chat or record writes. */
export async function gateLineEvent(userId:string,eventId:string,text:string){
 const context=await withSystem(async db=>{
  const row=(await db.query(`select e.ingress_decision,t.language,t.current_task_id,k.status,k.version,k.question,left(k.request_text,700) request,
   (select left(a.input_text,500) from assistant.agent_turns a where a.user_id=$1 and a.state='done' and a.route in('chat','agent','followup_reply') order by a.created_at desc limit 1) recent_context,
   exists(select 1 from notify.followup_deliveries d where d.user_id=$1 and d.status='accepted' and d.accepted_at>now()-interval '14 days') recent_followup
   from notify.webhook_events e left join assistant.agent_threads t on t.user_id=$1 left join assistant.agent_tasks k on k.id=t.current_task_id where e.event_id=$2`,[userId,eventId])).rows[0];
  return row;
 });
 if(!context)return false;
 if(context.ingress_decision)return inputDecisionSchema.parse(context.ingress_decision).route!=='unsupported';
 const language=context.language==='en'?'en':'th';
 const emergency=passportEmergency(text,{},language).urgent;
 const decision=emergency?{route:'emergency' as const,language,reason:'pet_care' as const}:await classifyInput({userId,text,channel:'line',context:{language,pendingTask:context.status&&['collecting','awaiting_confirmation','failed'].includes(context.status)?{id:context.current_task_id,version:context.version,question:context.question,request:context.request}:null,recentContext:context.recent_context??null,recentFollowup:context.recent_followup}});
 await withSystem(async db=>{
  await db.query(`update notify.webhook_events set ingress_decision=$2::jsonb${decision.route==='unsupported'?",processed_at=now(),payload='{}'::jsonb":''} where event_id=$1`,[eventId,JSON.stringify(decision)]);
 });
 return decision.route!=='unsupported';
}
export {quickInputDecision};
