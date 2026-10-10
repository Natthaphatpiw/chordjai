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
  const res=await fetch(new URL(`/internal/${path}`,origin),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.CRON_SECRET}`},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  if(!res.ok)throw new Error('notification_failed');
}
const handlers:Record<string,(payload:Record<string,unknown>,job:Job)=>Promise<void>>={
  'line-webhook':p=>notification('process-line',p),
  'job-line-webhook':p=>notification('process-line',p),
  'line.webhook':p=>notification('process-line',p),
  'line.event':p=>notification('process-line',p),
  'media.delete':async p=>{if(typeof p.pathname!=='string'||!p.pathname.startsWith('u/'))throw new Error('invalid_media_path');await del(p.pathname,{token:process.env.BLOB_READ_WRITE_TOKEN});},
  'delete-media':async p=>{if(typeof p.pathname!=='string'||!p.pathname.startsWith('u/'))throw new Error('invalid_media_path');await del(p.pathname,{token:process.env.BLOB_READ_WRITE_TOKEN});}
};
export async function cleanupExpiredData(){
  return withSystem(async db=>{
    const rates=await db.query('DELETE FROM ops.rate_limits WHERE ctid IN (SELECT ctid FROM ops.rate_limits WHERE expires_at<now() LIMIT 1000)');
    const requests=await db.query('DELETE FROM ops.idempotency WHERE ctid IN (SELECT ctid FROM ops.idempotency WHERE expires_at<now() LIMIT 1000)');
    const events=await db.query("DELETE FROM notify.webhook_events WHERE event_id IN (SELECT event_id FROM notify.webhook_events WHERE received_at<now()-interval '7 days' LIMIT 1000)");
    return {expiredRateLimits:rates.rowCount,expiredRequests:requests.rowCount,expiredWebhooks:events.rowCount};
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
export default app;
