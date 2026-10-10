import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { verifySession } from '@chordjai/auth';
import { withUser } from '@chordjai/db';
import { z } from 'zod';
import { idempotency } from './idempotency';
import { errorDiagnosticCode } from './error-diagnostic';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
export type Actor={id:string;role:'owner'|'admin'|'vet'};
export type ServiceEnv={Variables:{actor:Actor|undefined;requestId:string}};
export type ServiceContext=Context<ServiceEnv>;
export class HttpError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
export function camel(value:unknown):unknown {
  if(value instanceof Date)return value.toISOString();
  if(Array.isArray(value))return value.map(camel);
  if(value&&typeof value==='object'&&!Buffer.isBuffer(value))return Object.fromEntries(Object.entries(value).map(([k,v])=>[k.replace(/_([a-z])/g,(_,l:string)=>l.toUpperCase()),camel(v)]));
  return value;
}
export function ok(c:ServiceContext,data:unknown,status:ContentfulStatusCode=200){return c.json({data:camel(data)},status);}
export function getActor(c:ServiceContext):Actor {
  const actor=c.get('actor');if(!actor)throw new HttpError(401,'UNAUTHORIZED','กรุณาเข้าสู่ระบบด้วย LINE');return actor;
}
export function requireRole(c:ServiceContext,roles:Actor['role'][]){const actor=getActor(c);if(!roles.includes(actor.role))throw new HttpError(403,'FORBIDDEN','คุณไม่มีสิทธิ์ใช้ส่วนนี้');return actor;}
export async function jsonBody<T extends z.ZodType>(c:ServiceContext,schema:T):Promise<z.infer<T>> {
  let body:unknown;try{body=await c.req.json();}catch{throw new HttpError(400,'INVALID_JSON','ข้อมูล JSON ไม่ถูกต้อง');}
  const parsed=schema.safeParse(body);if(!parsed.success)throw new HttpError(400,'VALIDATION_ERROR',parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '));return parsed.data;
}
export function uuid(value:string|undefined){const parsed=z.uuid().safeParse(value);if(!parsed.success)throw new HttpError(400,'INVALID_ID','ID ไม่ถูกต้อง');return parsed.data;}
export function createService(name:string){
  const app=new Hono<ServiceEnv>();
  app.use('*',secureHeaders());
  app.use('*',bodyLimit({maxSize:4*1024*1024,onError:c=>c.json({error:{code:'BODY_TOO_LARGE',message:'ไฟล์ต้องมีขนาดต่ำกว่า 4 MB'}},413)}));
  app.use('*',cors({origin:(origin)=>{
    const allowed=(process.env.ALLOWED_ORIGINS??'http://localhost:3000,http://localhost:3001,http://localhost:3002').split(',');return allowed.includes(origin)?origin:'';
  },allowHeaders:['Content-Type','Authorization','Idempotency-Key'],exposeHeaders:['X-Request-Id'],maxAge:600}));
  app.use('*',async(c,next)=>{
    const requestId=crypto.randomUUID();c.set('requestId',requestId);c.header('X-Request-Id',requestId);c.header('Cache-Control','private, no-store');
    const auth=c.req.header('Authorization');
    if(auth&&!c.req.path.startsWith('/internal/')){
      if(!auth.startsWith('Bearer '))throw new HttpError(401,'INVALID_TOKEN','Token ไม่ถูกต้อง');
      let actor:Actor;try{actor=await verifySession(auth.slice(7));}catch{throw new HttpError(401,'INVALID_TOKEN','เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง');}
      const current=await withUser(actor.id,async db=>(await db.query('SELECT id,role,status FROM identity.users WHERE id=$1',[actor.id])).rows[0]);
      if(!current||current.status!=='active')throw new HttpError(401,'ACCOUNT_INACTIVE','บัญชีไม่พร้อมใช้งาน');
      c.set('actor',{id:current.id,role:current.role});
    }
    await next();
  });
  app.use('*',idempotency);
  app.get('/healthz',c=>ok(c,{service:name,status:'ok',version:'0.1.0'}));
  app.onError((error,c)=>{
    const dbError=error as Error & {code?:string};
    let status=error instanceof HttpError?error.status:500;
    let code=error instanceof HttpError?error.code:'INTERNAL_ERROR';
    let message=error instanceof HttpError?error.message:'ระบบไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง';
    if(dbError.code==='42501'){status=403;code='FORBIDDEN';message='คุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้';}
    if(dbError.code==='23505'){status=409;code='CONFLICT';message='ข้อมูลนี้มีอยู่แล้ว';}
    if(dbError.code==='23503'||dbError.code==='23514'){status=400;code='INVALID_REFERENCE';message='ข้อมูลอ้างอิงไม่ถูกต้อง';}
    console.error(JSON.stringify({event:'request_error',service:name,requestId:c.get('requestId'),status,code,causeCode:errorDiagnosticCode(error)}));
    return c.json({error:{code,message},type:`https://api.chordjai.life/problems/${code.toLowerCase()}`,title:code,status,detail:message,requestId:c.get('requestId')},status as ContentfulStatusCode);
  });
  app.notFound(c=>c.json({error:{code:'NOT_FOUND',message:'ไม่พบ endpoint นี้'}},404));
  return app;
}
