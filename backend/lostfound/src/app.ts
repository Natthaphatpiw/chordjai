import { randomBytes,createHash } from 'node:crypto';
import { z } from 'zod';
import { withUser,withSystem } from '@chordjai/db';
import { createService,getActor,ok,jsonBody,uuid,HttpError } from '@chordjai/service-kit';
const app=createService('lostfound'),base='/api/v1/lostfound';
app.get(`${base}/cases`,async c=>ok(c,await withUser(getActor(c).id,async db=>(await db.query('SELECT c.*,p.name AS pet_name,p.species FROM lostfound.cases c JOIN pet.pets p ON p.id=c.pet_id ORDER BY c.created_at DESC LIMIT 100')).rows)));
app.post(`${base}/cases`,async c=>{
  const actor=getActor(c),b=await jsonBody(c,z.object({petId:z.uuid(),description:z.string().trim().min(1).max(3000),district:z.string().trim().min(1).max(100)}));
  const row=await withUser(actor.id,async db=>(await db.query('INSERT INTO lostfound.cases(pet_id,owner_id,public_slug,description,district) VALUES($1,$2,$3,$4,$5) RETURNING *',[b.petId,actor.id,randomBytes(12).toString('base64url'),b.description,b.district])).rows[0]);return ok(c,{...row,url:`${process.env.APP_ORIGIN??'https://www.chordjai.life'}/lost/${row.public_slug}`},201);
});
app.patch(`${base}/cases/:id`,async c=>{
  const b=await jsonBody(c,z.object({status:z.enum(['resolved','closed'])}));const row=await withUser(getActor(c).id,async db=>(await db.query('UPDATE lostfound.cases SET status=$1,updated_at=now() WHERE id=$2 RETURNING *',[b.status,uuid(c.req.param('id'))])).rows[0]);if(!row)throw new HttpError(404,'NOT_FOUND','ไม่พบประกาศ');return ok(c,row);
});
app.get(`${base}/cases/:id/tips`,async c=>ok(c,await withUser(getActor(c).id,async db=>(await db.query('SELECT id,content,district,created_at FROM lostfound.tips WHERE case_id=$1 ORDER BY created_at DESC',[uuid(c.req.param('id'))])).rows)));
app.get(`${base}/public/:slug`,async c=>{
  const row=await withSystem(async db=>(await db.query("SELECT c.id,c.public_slug,c.description,c.district,c.created_at,p.name AS pet_name,p.species,p.breed,p.sex FROM lostfound.cases c JOIN pet.pets p ON p.id=c.pet_id WHERE c.public_slug=$1 AND c.status='active'",[c.req.param('slug')])).rows[0]);
  if(!row)throw new HttpError(404,'CASE_CLOSED','ไม่พบประกาศที่เปิดอยู่');return ok(c,row);
});
app.post(`${base}/public/:slug/tips`,async c=>{
  const b=await jsonBody(c,z.object({content:z.string().trim().min(1).max(3000),district:z.string().max(100).optional(),website:z.string().max(0).optional()}));
  const ip=c.req.header('x-vercel-forwarded-for')??c.req.header('x-forwarded-for')??'local';const ipHash=createHash('sha256').update(`${process.env.APP_JWT_SECRET}:${ip}`).digest('hex');
  const tip=await withSystem(async db=>{
    const rate=await db.query('SELECT ops.take_rate_limit($1,$2,60,5) AS allowed',['lost_tip',ipHash]);if(!rate.rows[0].allowed)throw new HttpError(429,'RATE_LIMIT','ส่งเบาะแสมากเกินไป กรุณารอสักครู่');
    const row=(await db.query("SELECT id,owner_id FROM lostfound.cases WHERE public_slug=$1 AND status='active'",[c.req.param('slug')])).rows[0];if(!row)throw new HttpError(404,'CASE_CLOSED','ประกาศนี้ปิดแล้ว');
    const tip=(await db.query('INSERT INTO lostfound.tips(case_id,content,district) VALUES($1,$2,$3) RETURNING id',[row.id,b.content,b.district??null])).rows[0];
    await db.query('INSERT INTO notify.inbox(user_id,title,body,dedupe_key) VALUES($1,$2,$3,$4)',[row.owner_id,'มีเบาะแสน้องที่หาย',b.content,`lost_tip:${tip.id}`]);return tip;
  });return ok(c,{...tip,warning:/https?:\/\/|(?:โอน|บัญชี|มัดจำ)/i.test(b.content)?'อย่าโอนเงินก่อนตรวจสอบว่าเป็นน้องจริง':null},201);
});
export default app;
