import { timingSafeEqual } from 'node:crypto';
import { del } from '@vercel/blob';
import { createService,ok,HttpError } from '@chordjai/service-kit';
import { runJobs, type Job } from '@chordjai/queue';
import { withSystem } from '@chordjai/db';
const app=createService('scheduler');
export function machineAuthorized(header:string|undefined){
  const expected=process.env.CRON_SECRET;if(!expected||expected.length<32||!header)return false;
  const a=Buffer.from(header),b=Buffer.from(`Bearer ${expected}`);return a.length===b.length&&timingSafeEqual(a,b);
}
async function notification(path:string,body:unknown){
  const origin=process.env.NOTIFICATION_INTERNAL_URL??(process.env.VERCEL?'':`http://localhost:${process.env.API_PORT??8787}`);
  if(!origin)throw new Error('missing_notification_binding');
  const res=await fetch(new URL(`/internal/${path}`,origin),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.CRON_SECRET}`},body:JSON.stringify(body),signal:AbortSignal.timeout(path==='followups'?85000:45000)});
  if(!res.ok)throw new Error('notification_failed');
}
async function assistant(path:'ingest'|'execute'|'deliver',body:unknown){
  const origin=process.env.ASSISTANT_INTERNAL_URL??(process.env.VERCEL?'':`http://localhost:${process.env.API_PORT??8787}`);
  if(!origin)throw new Error('missing_assistant_binding');
  const res=await fetch(new URL(`/internal/agent/${path}`,origin),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.CRON_SECRET}`},body:JSON.stringify(body),signal:AbortSignal.timeout(105000)});
  if(!res.ok)throw new Error(`assistant_${path}_failed`);
}
const handlers:Record<string,(payload:Record<string,unknown>,job:Job)=>Promise<void>>={
  'line-webhook':p=>notification('process-line',p),
  'job-line-webhook':p=>notification('process-line',p),
  'line.webhook':p=>notification('process-line',p),
  'line.event':p=>notification('process-line',p),
  'agent.turn':p=>assistant('ingest',p),
  'agent.execute':p=>assistant('execute',p),
  'agent.deliver':p=>assistant('deliver',p),
  'media.delete':async p=>{if(typeof p.pathname!=='string'||!p.pathname.startsWith('u/'))throw new Error('invalid_media_path');await del(p.pathname,{token:process.env.BLOB_READ_WRITE_TOKEN});},
  'delete-media':async p=>{if(typeof p.pathname!=='string'||!p.pathname.startsWith('u/'))throw new Error('invalid_media_path');await del(p.pathname,{token:process.env.BLOB_READ_WRITE_TOKEN});}
};
export async function cleanupExpiredData(){
  return withSystem(async db=>{
    const completedJobs=await db.query("delete from ops.jobs where id in(select id from ops.jobs where status='completed' and updated_at<now()-interval '30 days' order by updated_at limit 1000)");
    const cache=await db.query('delete from ops.input_cache where ctid in(select ctid from ops.input_cache where expires_at<=now() limit 1000)');
    const metrics=await db.query("delete from ops.guard_metrics where ctid in(select ctid from ops.guard_metrics where bucket<now()-interval '30 days' limit 1000)");
    const rates=await db.query('DELETE FROM ops.rate_limits WHERE ctid IN (SELECT ctid FROM ops.rate_limits WHERE expires_at<now() LIMIT 1000)');
    const requests=await db.query('DELETE FROM ops.idempotency WHERE ctid IN (SELECT ctid FROM ops.idempotency WHERE expires_at<now() LIMIT 1000)');
    const events=await db.query("DELETE FROM notify.webhook_events WHERE event_id IN (SELECT event_id FROM notify.webhook_events WHERE received_at<now()-interval '7 days' LIMIT 1000)");
    const followups=await db.query("DELETE FROM notify.followup_deliveries WHERE id IN (SELECT id FROM notify.followup_deliveries WHERE created_at<now()-interval '90 days' LIMIT 1000)");
    let agentTasks=0,agentTurns=0;
    if((await db.query("select to_regclass('assistant.agent_tasks') is not null available")).rows[0]?.available){
      await db.query("update assistant.agent_tasks set status='cancelled',version=version+1,question=null,error_code='AGENT_TASK_EXPIRED' where status in ('collecting','awaiting_confirmation','queued','running') and expires_at<=now()");
      await db.query("update assistant.agent_deliveries set status='failed',messages='[]'::jsonb,error_code='AGENT_DELIVERY_EXPIRED' where status='pending' and expires_at<=now()");
      await db.query("delete from assistant.agent_choices where id in(select id from assistant.agent_choices where expires_at<=now() limit 1000)");
      agentTasks=(await db.query("delete from assistant.agent_tasks where id in(select id from assistant.agent_tasks where created_at<now()-interval '30 days' limit 500)")).rowCount??0;
      agentTurns=(await db.query("delete from assistant.agent_turns where id in(select id from assistant.agent_turns where created_at<now()-interval '30 days' limit 1000)")).rowCount??0;
    }
    return {expiredCompletedJobs:completedJobs.rowCount,expiredInputCache:cache.rowCount,expiredGuardMetrics:metrics.rowCount,expiredRateLimits:rates.rowCount,expiredRequests:requests.rowCount,expiredWebhooks:events.rowCount,expiredFollowups:followups.rowCount,expiredAgentTasks:agentTasks,expiredAgentTurns:agentTurns};
  });
}
app.get('/internal/cron/jobs',async c=>{
  if(!machineAuthorized(c.req.header('Authorization')))throw new HttpError(401,'UNAUTHORIZED','ไม่อนุญาต');
  const cleanup=await cleanupExpiredData();
  return ok(c,{cleanup,jobs:await runJobs(handlers,5)});
});
app.get('/internal/cron/reminders',async c=>{
  if(!machineAuthorized(c.req.header('Authorization')))throw new HttpError(401,'UNAUTHORIZED','ไม่อนุญาต');
  await notification('reminders',{});return ok(c,{dispatched:true});
});
app.get('/internal/cron/followups',async c=>{
  if(!machineAuthorized(c.req.header('Authorization')))throw new HttpError(401,'UNAUTHORIZED','ไม่อนุญาต');
  await notification('followups',{});return ok(c,{dispatched:true});
});
export default app;
