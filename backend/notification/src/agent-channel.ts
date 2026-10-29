import {z} from 'zod';
import {withSystem} from '@chordjai/db';
import {enqueue} from '@chordjai/queue';
import {waitUntil} from '@vercel/functions';

/** Only a verified, private LINE event may enter the durable agent queue. */
const eventSchema=z.object({
  webhookEventId:z.string().min(1).max(100),
  type:z.string(),
  source:z.object({type:z.string(),userId:z.string().min(1).max(100).optional()}),
  message:z.object({type:z.string(),text:z.string().max(5000).optional()}).passthrough().optional(),
  postback:z.object({data:z.string().min(1).max(300)}).passthrough().optional(),
}).passthrough();

export function agentChannelEnabled(){return process.env.LINE_AGENT_ENABLED==='true';}
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
    const account=await tx.query("select u.id from identity.users u join identity.consents c on c.user_id=u.id and c.purpose='service' and c.granted where u.id=$1 and u.line_user_id=$2 and u.status='active' for share of u,c",[userId,event.source.userId]);
    if(!account.rowCount)return {handled:false,queued:false};
    await enqueue('agent.turn',{eventId:event.webhookEventId,userId},`agent-turn:${event.webhookEventId}`,tx);
    await tx.query('update notify.webhook_events set processed_at=now() where event_id=$1',[event.webhookEventId]);
    return {handled:true,queued:true};
  });
  // Respond promptly without relying on the next Cron tick. The committed
  // queue entry still retries if this best-effort request cannot finish.
  if(accepted.queued&&process.env.VERCEL&&process.env.ASSISTANT_INTERNAL_URL){
    // Also catch synchronous config/fetch construction failures. Once durable
    // work is committed, a best-effort latency optimisation cannot undo it.
    const origin=process.env.ASSISTANT_INTERNAL_URL;
    waitUntil(Promise.resolve().then(()=>fetch(new URL('/internal/agent/ingest',origin),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.CRON_SECRET}`},body:JSON.stringify({eventId:event.webhookEventId,userId}),signal:AbortSignal.timeout(105000)})).then(response=>{if(!response.ok)throw new Error('agent_fast_path_unavailable');}).catch(()=>{console.warn(JSON.stringify({event:'agent_fast_path_deferred_to_queue'}));}));
  }
  return accepted.handled;
}
