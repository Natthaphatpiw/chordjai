import { createHash } from 'node:crypto';
import { withSystem } from '@chordjai/db';
import type { MiddlewareHandler } from 'hono';
import type { ServiceEnv } from './index';
import { HttpError } from './index';
export const idempotency:MiddlewareHandler<ServiceEnv>=async(c,next)=>{
  const key=c.req.header('Idempotency-Key');
  // Authentication exchanges return bearer tokens; their responses must never enter a cache.
  // Public webhook events and capability writes have their own domain-level deduplication.
  // Mutable consent and source-dependent previews must revalidate current
  // permissions. Research consent carries its own durable request ID; follow-up
  // preferences use a revision check rather than replaying an old opt-in.
  const currentPermissionRoute=/^\/api\/v1\/biometric\/pets\/[^/]+\/research\/consent$/.test(c.req.path)
    || /^\/api\/v1\/biometric\/review\//.test(c.req.path)
    || /^\/api\/v1\/biometric\/pets\/[^/]+\/research\/sessions\/[^/]+\/checks$/.test(c.req.path)
    || /^\/api\/v1\/notification\/followup\/(?:preferences|preview)$/.test(c.req.path);
  if(!key||!c.get('actor')||!['POST','PATCH','DELETE'].includes(c.req.method)||c.req.path.startsWith('/internal/')||c.req.path==='/api/v1/identity/line'||currentPermissionRoute)return next();
  if(!/^[\w-]{8,80}$/.test(key))throw new HttpError(400,'INVALID_IDEMPOTENCY_KEY','Idempotency-Key ไม่ถูกต้อง');
  const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
  const scope=digest(`${c.get('actor')?.id??'anonymous'}:${c.req.method}:${c.req.path}`);
  const requestHash=digest(Buffer.from(await c.req.raw.clone().arrayBuffer()));
  const cached=await withSystem(async db=>{
    await db.query('DELETE FROM ops.idempotency WHERE scope=$1 AND key=$2 AND expires_at<now()',[scope,key]);
    const inserted=await db.query("INSERT INTO ops.idempotency(scope,key,request_hash,status,locked_until,user_id) VALUES($1,$2,$3,'pending',now()+interval '180 seconds',$4) ON CONFLICT DO NOTHING RETURNING key",[scope,key,requestHash,c.get('actor')?.id??null]);
    if(inserted.rowCount)return null;
    const row=(await db.query('SELECT *,locked_until>now() AS locked FROM ops.idempotency WHERE scope=$1 AND key=$2 FOR UPDATE',[scope,key])).rows[0];
    if(row.request_hash!==requestHash)throw new HttpError(409,'IDEMPOTENCY_CONFLICT','คำขอซ้ำมีข้อมูลต่างจากคำขอเดิม');
    if(row.status==='completed')return row;
    if(row.locked)throw new HttpError(409,'REQUEST_IN_PROGRESS','คำขอนี้กำลังประมวลผล กรุณารอสักครู่');
    await db.query("UPDATE ops.idempotency SET locked_until=now()+interval '180 seconds' WHERE scope=$1 AND key=$2",[scope,key]);return null;
  });
  if(cached){c.header('Idempotency-Replayed','true');return c.json(cached.response,cached.response_status);}
  await next();
  if(c.res.status>=500){await withSystem(db=>db.query('DELETE FROM ops.idempotency WHERE scope=$1 AND key=$2',[scope,key]));return;}
  const body=await c.res.clone().text();
  if(body.length>150000){await withSystem(db=>db.query('DELETE FROM ops.idempotency WHERE scope=$1 AND key=$2',[scope,key]));return;}
  try{const response=JSON.parse(body);await withSystem(db=>db.query("UPDATE ops.idempotency SET status='completed',response=$3::jsonb,response_status=$4 WHERE scope=$1 AND key=$2",[scope,key,JSON.stringify(response),c.res.status]));}catch{await withSystem(db=>db.query('DELETE FROM ops.idempotency WHERE scope=$1 AND key=$2',[scope,key]));}
};
