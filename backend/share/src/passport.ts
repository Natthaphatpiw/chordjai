import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import type {Hono} from 'hono';
import {z} from 'zod';
import {withUser,withSystem,type PoolClient} from '@chordjai/db';
import {readMedia} from '@chordjai/media';
import {getActor,ok,jsonBody,uuid,HttpError,type ServiceEnv} from '@chordjai/service-kit';
import type {PassportSnapshot} from '@chordjai/contracts';

const base='/api/v1/share',publicBase=`${base}/public/passport`;
const createSchema=z.object({sessionId:z.uuid(),version:z.number().int().positive(),requestId:z.uuid(),expiresInDays:z.number().int().min(1).max(14).default(7)});
const digest=(body:unknown)=>createHash('sha256').update(JSON.stringify(body)).digest('hex');
type Link={id:string;session_id:string;snapshot_id:string;owner_id:string;request_id:string;request_hash:string;token_hash:string;expires_at:Date|string;revoked_at:Date|string|null;created_at:Date|string};
function capability(link:Pick<Link,'owner_id'|'request_id'|'snapshot_id'>){
  const secret=process.env.APP_JWT_SECRET;
  if(!secret||secret.length<32)throw new HttpError(503,'AUTH_NOT_CONFIGURED','ระบบยืนยันตัวตนยังไม่พร้อม');
  return createHmac('sha256',secret).update(`passport-link-v1:${link.owner_id}:${link.request_id}:${link.snapshot_id}`).digest('base64url');
}
function url(link:Link){
  const token=capability(link),hash=digestToken(token);
  if(!timingSafeEqual(Buffer.from(hash),Buffer.from(link.token_hash)))return null;
  return `${process.env.APP_ORIGIN??'https://www.chordjai.life'}/passport/${token}`;
}
const digestToken=(token:string)=>createHash('sha256').update(token).digest('hex');
const activeOwner=`p.owner_id=s.owner_id AND u.status='active' AND EXISTS(SELECT 1 FROM identity.consents consent WHERE consent.user_id=u.id AND consent.purpose='service' AND consent.granted)`;
const currentSnapshot=`s.status='confirmed' AND s.current_snapshot_id=sn.id`;
async function publicSnapshot(db:PoolClient,token:string){
  if(!/^[\w-]{43}$/.test(token))throw new HttpError(410,'SHARE_EXPIRED','ลิงก์หมดอายุหรือถูกเพิกถอนแล้ว');
  const row=(await db.query(`SELECT l.id,l.session_id,l.snapshot_id,l.owner_id,l.expires_at,sn.document
    FROM health.passport_share_links l JOIN health.passport_sessions s ON s.id=l.session_id
    JOIN health.passport_snapshots sn ON sn.id=l.snapshot_id AND sn.session_id=s.id
    JOIN pet.pets p ON p.id=s.pet_id JOIN identity.users u ON u.id=s.owner_id
    WHERE l.token_hash=$1 AND l.revoked_at IS NULL AND l.expires_at>now() AND l.owner_id=s.owner_id
    AND ${activeOwner} AND ${currentSnapshot}`,[digestToken(token)])).rows[0];
  if(!row)throw new HttpError(410,'SHARE_EXPIRED','ลิงก์หมดอายุหรือถูกเพิกถอนแล้ว');
  return row as {id:string;session_id:string;snapshot_id:string;owner_id:string;expires_at:Date;document:PassportSnapshot};
}
async function publicPhoto(token:string,mediaId:string){
  return withSystem(async db=>{
    const link=await publicSnapshot(db,token);
    const asset=(await db.query(`SELECT m.id,m.user_id FROM health.passport_snapshot_media sm JOIN media.objects m ON m.id=sm.media_id
      JOIN health.passport_sessions s ON s.id=$3 WHERE sm.snapshot_id=$1 AND m.id=$2 AND m.status='ready'
      AND m.user_id=$4 AND m.pet_id=s.pet_id`,[link.snapshot_id,mediaId,link.session_id,link.owner_id])).rows[0];
    if(!asset)throw new HttpError(404,'IMAGE_NOT_FOUND','รูปนี้ไม่ได้อยู่ในสรุปที่เลือกแชร์');
    return {id:asset.id as string,userId:asset.user_id as string,linkId:link.id,snapshotId:link.snapshot_id};
  });
}
export function registerPassportShareRoutes(app:Hono<ServiceEnv>){
  app.post(`${base}/passports`,async c=>{
    const actor=getActor(c),body=await jsonBody(c,createSchema);
    const link=await withUser(actor.id,async db=>{
      const session=(await db.query(`SELECT s.id,s.owner_id,s.version,s.current_snapshot_id FROM health.passport_sessions s
        JOIN pet.pets p ON p.id=s.pet_id JOIN identity.users u ON u.id=s.owner_id
        WHERE s.id=$1 AND s.owner_id=$2 AND public.is_pet_owner(s.pet_id) AND ${activeOwner} AND s.status='confirmed'
        AND s.current_snapshot_id IS NOT NULL FOR SHARE OF s`,[body.sessionId,actor.id])).rows[0];
      if(!session)throw new HttpError(409,'PASSPORT_CONFIRM_REQUIRED','กรุณาตรวจและยืนยันสรุปก่อนแชร์');
      if(session.version!==body.version)throw new HttpError(409,'VERSION_CONFLICT','สรุปเปลี่ยนไปแล้ว กรุณาโหลดและยืนยันฉบับล่าสุด');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`passport-share:${actor.id}:${body.requestId}`]);
      const previous=(await db.query('SELECT * FROM health.passport_share_links WHERE owner_id=$1 AND request_id=$2',[actor.id,body.requestId])).rows[0] as Link|undefined;
      if(previous){
        if(previous.request_hash!==digest(body))throw new HttpError(409,'IDEMPOTENCY_CONFLICT','รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว');
        if(previous.snapshot_id!==session.current_snapshot_id||previous.revoked_at||Date.parse(String(previous.expires_at))<=Date.now())throw new HttpError(410,'SHARE_EXPIRED','ลิงก์หมดอายุหรือถูกเพิกถอนแล้ว');
        return previous;
      }
      const linkData={owner_id:actor.id,request_id:body.requestId,snapshot_id:session.current_snapshot_id};
      return(await db.query(`INSERT INTO health.passport_share_links(session_id,snapshot_id,owner_id,request_id,request_hash,token_hash,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,now()+($7*interval '1 day')) RETURNING *`,[body.sessionId,linkData.snapshot_id,actor.id,body.requestId,digest(body),digestToken(capability(linkData)),body.expiresInDays])).rows[0] as Link;
    });
    const shareUrl=url(link);if(!shareUrl)throw new HttpError(410,'SHARE_EXPIRED','กรุณาสร้างลิงก์ใหม่');
    return ok(c,{id:link.id,url:shareUrl,sessionId:link.session_id,expiresAt:link.expires_at},201);
  });
  app.get(`${base}/passports`,async c=>{
    const actor=getActor(c),petId=uuid(c.req.query('petId'));
    const links=await withUser(actor.id,async db=>(await db.query(`SELECT l.* FROM health.passport_share_links l
      JOIN health.passport_sessions s ON s.id=l.session_id WHERE s.pet_id=$1 AND l.owner_id=$2 AND public.is_pet_owner(s.pet_id)
      ORDER BY l.created_at DESC LIMIT 100`,[petId,actor.id])).rows as Link[]);
    return ok(c,links.map(link=>({id:link.id,sessionId:link.session_id,expiresAt:link.expires_at,revokedAt:link.revoked_at,createdAt:link.created_at,status:link.revoked_at?'revoked':Date.parse(String(link.expires_at))<=Date.now()?'expired':'active',url:!link.revoked_at&&Date.parse(String(link.expires_at))>Date.now()?url(link):null})));
  });
  app.delete(`${base}/passports/:id`,async c=>{
    const actor=getActor(c),id=uuid(c.req.param('id'));
    const result=await withUser(actor.id,db=>db.query('UPDATE health.passport_share_links SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND owner_id=$2 RETURNING id',[id,actor.id]));
    if(!result.rowCount)throw new HttpError(404,'NOT_FOUND','ไม่พบลิงก์ที่คุณสร้าง');return ok(c,{revoked:true});
  });
  app.get(`${publicBase}/:token`,async c=>{
    c.header('Referrer-Policy','no-referrer');c.header('X-Robots-Tag','noindex, nofollow');
    const link=await withSystem(db=>publicSnapshot(db,c.req.param('token')));
    return ok(c,{document:link.document,expiresAt:link.expires_at,photos:link.document.mediaIds.map(mediaId=>({mediaId,url:`${publicBase}/${c.req.param('token')}/media/${mediaId}`}))});
  });
  app.get(`${publicBase}/:token/media/:mediaId`,async c=>{
    c.header('Referrer-Policy','no-referrer');c.header('X-Robots-Tag','noindex, nofollow');
    const token=c.req.param('token'),mediaId=uuid(c.req.param('mediaId')),before=await publicPhoto(token,mediaId);
    const bytes=await readMedia(mediaId,before.userId);
    const after=await publicPhoto(token,mediaId);
    if(before.linkId!==after.linkId||before.snapshotId!==after.snapshotId)throw new HttpError(410,'SHARE_EXPIRED','สรุปที่แชร์เปลี่ยนไปแล้ว');
    c.header('Content-Type','image/jpeg');return c.body(new Uint8Array(bytes));
  });
}
