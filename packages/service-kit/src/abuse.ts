import {createHash} from 'node:crypto';
import {withSystem,type PoolClient} from '@chordjai/db';
import {HttpError,type ServiceContext} from './index';

export const fingerprint=(text:string)=>createHash('sha256').update(text).digest('hex');
export function guardLimit(name:string,fallback:number){
 const n=Number(process.env[name]??fallback);
 if(!Number.isSafeInteger(n)||n<1||n>10000)throw new HttpError(503,'GUARD_CONFIG_INVALID',`${name} must be 1..10000`);
 return n;
}
export async function guardMetric(db:PoolClient,userId:string|null,reason:string){
 await db.query(`insert into ops.guard_metrics(bucket,user_key,user_id,reason) values(date_trunc('hour',now()),$1,$2,$3)
 on conflict(bucket,user_key,reason) do update set count=least(ops.guard_metrics.count+1,9223372036854775806)`,[userId??'system',userId,reason]);
}
/** Commit denials too: throwing inside this transaction would undo the counters. */
export async function takeLimits(userId:string|null,checks:{scope:string;key:string;seconds:number;limit:number}[],reason='request_limited'){
 return withSystem(async db=>{
  for(const check of checks){
   const allowed=(await db.query('select ops.take_rate_limit($1,$2,$3,$4) allowed',[check.scope,check.key,check.seconds,check.limit])).rows[0]?.allowed===true;
   if(!allowed){await guardMetric(db,userId,reason);return false;}
  }
  return true;
 });
}
// Best-effort warm-instance shield before authentication or database work.
// The fixed-size map never grows with arbitrary paths, headers or user input.
const buckets=new Map<string,{start:number;count:number}>();
export function warmAdmission(key:string,limit=120,now=Date.now()){
 const start=Math.floor(now/10000)*10000,prior=buckets.get(key);
 if(!prior||prior.start!==start){
  if(buckets.size>=2048){for(const [k,v] of buckets)if(v.start!==start)buckets.delete(k);if(buckets.size>=2048)return false;}
  buckets.set(key,{start,count:1});return true;
 }
 if(prior.count>=limit)return false;prior.count++;return true;
}
export function remoteBucket(c:ServiceContext){
 // Vercel overwrites this header. Never trust client-supplied X-Forwarded-For.
 const ip=process.env.VERCEL?c.req.header('x-vercel-forwarded-for'):'local';
 return fingerprint((ip??'unknown').slice(0,100));
}
export async function protectApi(c:ServiceContext,service:string){
 if(!c.req.path.startsWith('/api/v1/'))return;
 // LINE has a verified-source limiter after signature verification; one LINE IP
 // can deliver many different legitimate users. Dashboard has its own login gate.
 if(c.req.path==='/api/v1/notification/webhooks/line'||c.req.path.startsWith('/api/v1/analytics/admin/'))return;
 const user=c.get('actor')?.id,write=['POST','PUT','PATCH','DELETE'].includes(c.req.method),category=write?'write':'read';
 const checks=user?[
  {scope:`api-${category}-minute`,key:user,seconds:60,limit:guardLimit(write?'ABUSE_WRITE_PER_MINUTE':'ABUSE_READ_PER_MINUTE',write?60:240)},
  ...(write?[{scope:'api-write-day',key:user,seconds:86400,limit:guardLimit('ABUSE_WRITE_PER_DAY',500)}]:[])
 ]:[
  {scope:`public-${category}`,key:service,seconds:60,limit:guardLimit('ABUSE_PUBLIC_PER_MINUTE',600)},
  {scope:`public-ip-${category}`,key:remoteBucket(c),seconds:60,limit:guardLimit('ABUSE_PUBLIC_IP_PER_MINUTE',120)}
 ];
 if(user&&c.req.path==='/api/v1/media/upload')checks.push({scope:'media-upload-minute',key:user,seconds:60,limit:10},{scope:'media-upload-day',key:user,seconds:86400,limit:50});
 if(!await takeLimits(user??null,checks)){
  c.header('Retry-After','60');throw new HttpError(429,'REQUEST_RATE_LIMIT','ส่งคำขอถี่เกินไป กรุณารอสักครู่');
 }
}
