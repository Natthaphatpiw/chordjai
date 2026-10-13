import { createHash,randomBytes } from 'node:crypto';
import { z } from 'zod';
import { withUser,withSystem,careSummary } from '@chordjai/db';
import { createService,getActor,ok,jsonBody,uuid,HttpError } from '@chordjai/service-kit';
import {registerPassportShareRoutes} from './passport';
const app=createService('share'),base='/api/v1/share';
registerPassportShareRoutes(app);
app.get(`${base}/links`,async c=>ok(c,await withUser(getActor(c).id,async db=>(await db.query('SELECT id,pet_id,expires_at,revoked_at,created_at FROM share.links ORDER BY created_at DESC LIMIT 100')).rows)));
app.post(`${base}/links`,async c=>{
  const actor=getActor(c),b=await jsonBody(c,z.object({petId:z.uuid(),expiresInDays:z.number().int().min(1).max(14).default(7),includeCare:z.boolean().default(false),includeCosts:z.boolean().default(false)}));const token=randomBytes(32).toString('base64url');
  if(b.includeCosts&&!b.includeCare)throw new HttpError(400,'VALIDATION_ERROR','เลือกแชร์บันทึกการดูแลก่อนแชร์ค่าใช้จ่าย');
  const link=await withUser(actor.id,async db=>{
    const pet=(await db.query('SELECT name,species,sex,birth_date,breed,weight_kg,microchip FROM pet.pets WHERE id=$1',[b.petId])).rows[0];if(!pet)throw new HttpError(404,'PET_NOT_FOUND','ไม่พบโปรไฟล์น้อง');
    const records=(await db.query('SELECT kind,title,recorded_at,next_due_at,notes,value FROM health.records WHERE pet_id=$1 ORDER BY recorded_at DESC LIMIT 100',[b.petId])).rows;
    const care=b.includeCare?await careSummary(db,b.petId,{sharedOnly:true,includeCosts:b.includeCosts}):null;
    const {rows}=await db.query("INSERT INTO share.links(pet_id,owner_id,token_hash,snapshot,expires_at) VALUES($1,$2,$3,$4::jsonb,now()+($5*interval '1 day')) RETURNING id,expires_at",[b.petId,actor.id,createHash('sha256').update(token).digest('hex'),JSON.stringify({pet,records,careEntries:care?.entries??[],careTruncated:care?.truncated??false,createdAt:new Date().toISOString()}),b.expiresInDays]);return rows[0];
  });return ok(c,{...link,token,url:`${process.env.APP_ORIGIN??'https://www.chordjai.life'}/s/${token}`},201);
});
app.delete(`${base}/links/:id`,async c=>{
  const rows=await withUser(getActor(c).id,async db=>(await db.query('UPDATE share.links SET revoked_at=now() WHERE id=$1 RETURNING id',[uuid(c.req.param('id'))])).rows);if(!rows[0])throw new HttpError(404,'NOT_FOUND','ไม่พบลิงก์');return ok(c,{revoked:true});
});
app.get(`${base}/public/:token`,async c=>{
  c.header('Referrer-Policy','no-referrer');const token=c.req.param('token');if(!/^[\w-]{43}$/.test(token))throw new HttpError(404,'NOT_FOUND','ไม่พบลิงก์');
  const result=await withSystem(async db=>{
    const link=(await db.query('SELECT id,snapshot,expires_at FROM share.links WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()',[createHash('sha256').update(token).digest('hex')])).rows[0];
    if(!link)throw new HttpError(410,'SHARE_EXPIRED','ลิงก์หมดอายุหรือถูกเพิกถอนแล้ว');await db.query('INSERT INTO share.views(link_id) VALUES($1)',[link.id]);return {...link.snapshot,expiresAt:link.expires_at};
  });return ok(c,result);
});
export default app;
