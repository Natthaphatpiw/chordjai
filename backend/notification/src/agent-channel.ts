import {z} from 'zod';
import {createHash} from 'node:crypto';
import {withSystem} from '@chordjai/db';
import {enqueue} from '@chordjai/queue';
import {waitUntil} from '@vercel/functions';
import {replyLine,startLineLoading,markLineMessagesRead,LineApiError} from '@chordjai/line';

/** Only a verified, private LINE event may enter the durable agent queue. */
const eventSchema=z.object({
  webhookEventId:z.string().min(1).max(100),
  type:z.string(),
  replyToken:z.string().min(1).max(200).optional(),
  timestamp:z.number().optional(),
  deliveryContext:z.object({isRedelivery:z.boolean().optional()}).passthrough().optional(),
  source:z.object({type:z.string(),userId:z.string().min(1).max(100).optional()}),
  message:z.object({type:z.string(),text:z.string().max(5000).optional(),markAsReadToken:z.string().min(1).max(4096).optional()}).passthrough().optional(),
  postback:z.object({data:z.string().min(1).max(300)}).passthrough().optional(),
}).passthrough();

export function agentChannelEnabled(){return process.env.LINE_AGENT_ENABLED==='true';}
function feedbackFresh(event:z.infer<typeof eventSchema>){
  return !event.deliveryContext?.isRedelivery&&(event.timestamp===undefined||Date.now()-event.timestamp<=60_000&&event.timestamp<=Date.now()+30_000);
}
function feedbackWarning(operation:'read'|'ack'|'loading',error:unknown){
  // Provider exceptions may embed credentials, request bodies or user IDs.
  // Deliberately record only operation and a bounded, system-generated code.
  const code=error instanceof LineApiError?`LINE_HTTP_${error.status}`:'UNAVAILABLE';
  console.warn(JSON.stringify({event:'line_feedback_unavailable',operation,code}));
}
function feedbackAccepted(operation:'read'|'ack'|'loading',event:z.infer<typeof eventSchema>){
  console.info(JSON.stringify({event:'line_feedback_stage',operation,status:'accepted',eventRef:createHash('sha256').update(event.webhookEventId).digest('hex').slice(0,16)}));
}
export async function markAcceptedLineEventRead(value:unknown){
  const parsed=eventSchema.safeParse(value);
  if(!parsed.success||parsed.data.source.type!=='user'||parsed.data.type!=='message'||!parsed.data.message?.markAsReadToken)return;
  try{await markLineMessagesRead(parsed.data.message.markAsReadToken);feedbackAccepted('read',parsed.data);}catch(error){feedbackWarning('read',error);}
}
async function acknowledgeAgentEvent(event:z.infer<typeof eventSchema>,language:'th'|'en'){
  if(!event.replyToken)return;
  try{await replyLine(event.replyToken,[{type:'text',text:language==='en'?'Message received. I’m processing it.':'รับข้อความแล้วครับ กำลังประมวลผลให้'}],3000);feedbackAccepted('ack',event);}
  catch(error){feedbackWarning('ack',error);/* An expired reply is never replaced by a paid push. */}
}
async function showAgentLoading(event:z.infer<typeof eventSchema>){
  try{await startLineLoading(event.source.userId!,60);feedbackAccepted('loading',event);}catch(error){feedbackWarning('loading',error);}
}
export function isAgentLineEvent(value:unknown){
  const parsed=eventSchema.safeParse(value);
  if(!parsed.success||parsed.data.source.type!=='user'||!parsed.data.source.userId)return false;
  const event=parsed.data;
  return event.type==='message'&&event.message?.type==='text'&&Boolean(event.message.text?.trim())
    ||event.type==='postback'&&Boolean(event.postback?.data);
}

/**
 * The webhook row and enqueue share a transaction. A duplicate worker cannot
 * enqueue twice or fall back to a second generic reply. Keep the signed
 * original payload until agent ingest has persisted/scrubbed its turn.
 */
export async function queueAgentLineEvent(userId:string,value:unknown):Promise<boolean>{
  if(!agentChannelEnabled()||!z.uuid().safeParse(userId).success||!isAgentLineEvent(value))return false;
  const event=eventSchema.parse(value);
  const accepted=await withSystem(async tx=>{
    const stored=(await tx.query<{processed_at:Date|null}>(
      'select processed_at from notify.webhook_events where event_id=$1 for update',[event.webhookEventId]
    )).rows[0];
    if(!stored)return {handled:false,queued:false};
    if(stored.processed_at)return {handled:true,queued:false};
    // Recheck the account/source mapping in the transaction; caller identity
    // is never inferred from text, postback data or an LLM-produced user ID.
    const account=await tx.query("select u.id,(select t.language from assistant.agent_threads t where t.user_id=u.id) as language from identity.users u join identity.consents c on c.user_id=u.id and c.purpose='service' and c.granted where u.id=$1 and u.line_user_id=$2 and u.status='active' for share of u,c",[userId,event.source.userId]);
    if(!account.rowCount)return {handled:false,queued:false};
    await enqueue('agent.turn',{eventId:event.webhookEventId,userId},`agent-turn:${event.webhookEventId}`,tx);
    await tx.query('update notify.webhook_events set processed_at=now() where event_id=$1',[event.webhookEventId]);
    const text=event.message?.text??'';
    const language:'th'|'en'=/[ก-๙]/u.test(text)?'th':/[A-Za-z]/.test(text)?'en':account.rows[0]?.language==='en'?'en':'th';
    return {handled:true,queued:true,language};
  });
  // Respond promptly without relying on the next Cron tick. The committed
  // queue entry still retries if this best-effort request cannot finish.
  if(accepted.queued){
    // Also catch synchronous config/fetch construction failures. Once durable
    // work is committed, a best-effort latency optimisation cannot undo it.
    const background=Promise.resolve().then(async()=>{
      const keyboardOnly=event.type==='postback'&&Boolean(event.postback?.data.startsWith('agent:compose:'));
      let fresh=!keyboardOnly&&feedbackFresh(event);
      if(fresh)try{
        const turn=await withSystem(async tx=>(await tx.query<{state:string}>('select state from assistant.agent_turns where event_id=$1 and user_id=$2',[event.webhookEventId,userId])).rows[0]);
        if(turn?.state==='done')fresh=false;
      }catch(error){fresh=false;feedbackWarning('ack',error);}
      // Complete the short ACK attempt before model processing can send a
      // result; an ACK arriving after the final answer is misleading. Native
      // loading starts after the ACK, which would otherwise hide it.
      if(fresh)await acknowledgeAgentEvent(event,accepted.language??'th');
      const work:Promise<unknown>[]=[];
      if(fresh&&(event.type==='message'||event.postback?.data.startsWith('agent:choice:')))work.push(showAgentLoading(event));
      if(process.env.VERCEL&&process.env.ASSISTANT_INTERNAL_URL){
        const origin=process.env.ASSISTANT_INTERNAL_URL;
        work.push(Promise.resolve().then(()=>fetch(new URL('/internal/agent/ingest',origin),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.CRON_SECRET}`},body:JSON.stringify({eventId:event.webhookEventId,userId}),signal:AbortSignal.timeout(105000)})).then(response=>{if(!response.ok)throw new Error('agent_fast_path_unavailable');}).catch(()=>{console.warn(JSON.stringify({event:'agent_fast_path_deferred_to_queue'}));}));
      }
      await Promise.allSettled(work);
    });
    if(process.env.VERCEL)waitUntil(background);else await background;
  }
  return accepted.handled;
}
