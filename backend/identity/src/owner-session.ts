import {createHash,randomBytes} from 'node:crypto';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import {withSystem,withUser} from '@chordjai/db';
import {signSession,type Actor} from '@chordjai/auth';
import {camel,HttpError,takeLimits,type ServiceContext} from '@chordjai/service-kit';

const age=30*24*3600;
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
const secure=()=>process.env.NODE_ENV==='production'||Boolean(process.env.VERCEL);
const cookie=()=>secure()?'__Host-chordjai_owner':'chordjai_owner';
let schema:{ready:boolean;until:number}|undefined;
export async function ownerSessionsReady(){
 if(schema&&schema.until>Date.now())return schema.ready;
 const ready=await withSystem(async db=>(await db.query("select to_regclass('identity.web_sessions') is not null ready")).rows[0]?.ready===true);
 schema={ready,until:Date.now()+30_000};return ready;
}
export function requireOwnerOrigin(c:ServiceContext){
 const origins=new Set([process.env.APP_ORIGIN??'https://www.chordjai.life',...(process.env.ALLOWED_ORIGINS??'http://localhost:3000,http://localhost:3001,http://localhost:3002').split(',').map(value=>value.trim())]);
 const origin=c.req.header('Origin');
 if(!origin||!origins.has(origin))throw new HttpError(403,'SESSION_ORIGIN_REJECTED','คำขอนี้มาจากเว็บไซต์ที่ไม่ได้รับอนุญาต');
}
export async function ownerBootstrap(userId:string){
 return withUser(userId,async db=>{
  const pets=(await db.query('select p.*,public.can_write_pet(p.id) can_edit from pet.pets p order by p.created_at desc limit 100')).rows;
  const consents=(await db.query('select purpose,granted,version,updated_at from identity.consents where user_id=$1',[userId])).rows;
  return camel({pets,consents});
 });
}
export async function issueOwnerSession(c:ServiceContext,actor:Actor,attemptId:string){
 requireOwnerOrigin(c);
 if(actor.role!=='owner'){await endOwnerSession(c);return {token:await signSession(actor),persistent:false};}
 if(!await ownerSessionsReady())return {token:await signSession(actor),persistent:false};
 if(!await takeLimits(actor.id,[{scope:'owner-session-hour',key:actor.id,seconds:3600,limit:30},{scope:'owner-session-day',key:actor.id,seconds:86400,limit:100}],'session.limited'))throw new HttpError(429,'REQUEST_RATE_LIMIT','เข้าสู่ระบบถี่เกินไป กรุณารอสักครู่');
 const raw=randomBytes(32).toString('hex');
 const session=await withSystem(async db=>{
  await db.query("select pg_advisory_xact_lock(hashtextextended('web-session:'||$1,0))",[actor.id]);
  const previous=getCookie(c,cookie());
  if(previous&&/^[a-f0-9]{64}$/.test(previous))await db.query("update identity.web_sessions set revoked_at=coalesce(revoked_at,now()),expires_at=least(expires_at,now()+interval '1 hour') where token_hash=$1",[digest(previous)]);
  // Keep a bounded number of devices. Revocation leaves a receipt until expiry.
  await db.query("update identity.web_sessions set revoked_at=now(),expires_at=least(expires_at,now()+interval '1 hour') where id in(select id from identity.web_sessions where user_id=$1 and revoked_at is null order by created_at desc offset 9)",[actor.id]);
  return(await db.query('insert into identity.web_sessions(attempt_id,user_id,token_hash) values($1,$2,$3) on conflict(attempt_id) do nothing returning id',[attemptId,actor.id,digest(raw)])).rows[0];
 });
 if(!session)throw new HttpError(409,'LOGIN_ATTEMPT_ENDED','การเข้าสู่ระบบครั้งนี้สิ้นสุดแล้ว กรุณาลองใหม่');
 setCookie(c,cookie(),raw,{httpOnly:true,secure:secure(),sameSite:'Strict',path:'/',maxAge:age});
 return {token:await signSession({...actor,sessionId:session.id}),persistent:true};
}
export async function restoreOwnerSession(c:ServiceContext){
 requireOwnerOrigin(c);
 const raw=getCookie(c,cookie());
 if(!raw||!/^[a-f0-9]{64}$/.test(raw)||!await ownerSessionsReady())throw new HttpError(401,'OWNER_SESSION_REQUIRED','กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง');
 const session=await withSystem(async db=>(await db.query(`update identity.web_sessions s set last_used_at=now() from identity.users u
  where s.token_hash=$1 and s.user_id=u.id and s.revoked_at is null and s.expires_at>now() and u.status='active' and u.role='owner'
  returning s.id,s.user_id,u.role`,[digest(raw)])).rows[0]);
 if(!session){deleteCookie(c,cookie(),{path:'/',secure:secure(),httpOnly:true,sameSite:'Strict'});throw new HttpError(401,'OWNER_SESSION_REQUIRED','เซสชันหมดอายุ กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง');}
 return {userId:session.user_id as string,token:await signSession({id:session.user_id,role:session.role,sessionId:session.id}),persistent:true,expiresIn:3600};
}
export async function endOwnerSession(c:ServiceContext,attemptId?:string,allUserId?:string){
 requireOwnerOrigin(c);
 const raw=getCookie(c,cookie());
 if(await ownerSessionsReady())await withSystem(async db=>{
  if(raw&&/^[a-f0-9]{64}$/.test(raw))await db.query("update identity.web_sessions set revoked_at=coalesce(revoked_at,now()),expires_at=least(expires_at,now()+interval '1 hour') where token_hash=$1",[digest(raw)]);
  if(attemptId)await db.query(`insert into identity.web_sessions(attempt_id,revoked_at,expires_at) values($1,now(),now()+interval '1 hour')
   on conflict(attempt_id) do update set revoked_at=coalesce(identity.web_sessions.revoked_at,now()),expires_at=least(identity.web_sessions.expires_at,now()+interval '1 hour')`,[attemptId]);
  if(allUserId)await db.query("update identity.web_sessions set revoked_at=coalesce(revoked_at,now()),expires_at=least(expires_at,now()+interval '1 hour') where user_id=$1",[allUserId]);
 });
 deleteCookie(c,cookie(),{path:'/',secure:secure(),httpOnly:true,sameSite:'Strict'});return {signedOut:true};
}
