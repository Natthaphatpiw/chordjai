import {createHash,randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import {withSystem} from '@chordjai/db';
import {HttpError,type ServiceContext} from '@chordjai/service-kit';
const scrypt=promisify(scryptCallback),cookie='chordjai_dashboard',path='/api/v1/analytics/admin';
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function dashboardConfig(){
 const username=process.env.ADMIN_DASHBOARD_USERNAME?.trim(),hash=process.env.ADMIN_DASHBOARD_PASSWORD_HASH;
 if(!username||!hash||!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash))throw new HttpError(503,'DASHBOARD_NOT_CONFIGURED','ตั้งค่า ADMIN_DASHBOARD_USERNAME และ ADMIN_DASHBOARD_PASSWORD_HASH ใน backend ก่อน');
 return {username,hash,version:digest(username+'\0'+hash)};
}
export async function verifyPassword(password:string,hash:string){
 const [,salt,expected]=hash.split(':');
 const actual=await scrypt(password,salt!,64) as Buffer;
 return timingSafeEqual(actual,Buffer.from(expected!,'hex'));
}
export function requireDashboardOrigin(c:ServiceContext){
 const configured=process.env.ADMIN_DASHBOARD_ORIGIN??'https://admin.chordjai.life';
 if(c.req.header('Origin')!==configured)throw new HttpError(403,'DASHBOARD_ORIGIN_REJECTED','คำขอเข้าสู่ระบบมาจากเว็บไซต์ที่ไม่ได้รับอนุญาต');
}
export async function dashboardSession(c:ServiceContext){
 const config=dashboardConfig(),token=getCookie(c,cookie);
 if(!token||!/^[a-f0-9]{64}$/.test(token))throw new HttpError(401,'DASHBOARD_LOGIN_REQUIRED','กรุณาเข้าสู่ระบบผู้ดูแล');
 const session=await withSystem(async db=>(await db.query('select username,expires_at from ops.dashboard_sessions where token_hash=$1 and credential_version=$2 and expires_at>now()',[digest(token),config.version])).rows[0]);
 if(!session)throw new HttpError(401,'DASHBOARD_LOGIN_REQUIRED','เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');
 return session;
}
export async function loginDashboard(c:ServiceContext,username:string,password:string){
 requireDashboardOrigin(c);const config=dashboardConfig();
 const allowed=await withSystem(async db=>{
  const global=(await db.query("select ops.take_rate_limit('dashboard-login','global',900,100) allowed")).rows[0].allowed;
  const account=(await db.query("select ops.take_rate_limit('dashboard-login',$1,900,10) allowed",[digest(username.toLowerCase())])).rows[0].allowed;
  return global&&account;
 });
 if(!allowed)throw new HttpError(429,'DASHBOARD_LOGIN_LIMIT','เข้าสู่ระบบถี่เกินไป กรุณารอ 15 นาที');
 const valid=await verifyPassword(password,config.hash);
 if(!valid||username!==config.username)throw new HttpError(401,'DASHBOARD_LOGIN_FAILED','ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
 const token=randomBytes(32).toString('hex');
 await withSystem(async db=>{
  await db.query('delete from ops.dashboard_sessions where expires_at<=now()');
  await db.query('insert into ops.dashboard_sessions(token_hash,credential_version,username,expires_at) values($1,$2,$3,now()+interval \'8 hours\')',[digest(token),config.version,config.username]);
 });
 setCookie(c,cookie,token,{httpOnly:true,secure:!new URL(process.env.ADMIN_DASHBOARD_ORIGIN??'https://admin.chordjai.life').hostname.match(/^(localhost|127\.0\.0\.1)$/),sameSite:'Strict',path,maxAge:28800});
 return {username:config.username};
}
export async function logoutDashboard(c:ServiceContext){
 requireDashboardOrigin(c);const token=getCookie(c,cookie);
 if(token)await withSystem(db=>db.query('delete from ops.dashboard_sessions where token_hash=$1',[digest(token)]));
 deleteCookie(c,cookie,{path});return {signedOut:true};
}
