import { z } from 'zod';
import { withUser,withSystem } from '@chordjai/db';
import { createService,getActor,requireRole,ok,jsonBody,uuid,HttpError } from '@chordjai/service-kit';
import { registerClinicPassportRoutes } from './passport';
const app=createService('clinic');
registerClinicPassportRoutes(app);
app.get('/api/v1/clinic/grants',async c=>{
  const actor=getActor(c),petId=uuid(c.req.query('petId'));
  return ok(c,await withUser(actor.id,async db=>(await db.query('SELECT g.id,g.pet_id,g.clinic_id,c.name AS clinic_name,g.scopes,g.expires_at,g.revoked_at,g.created_at FROM identity.grants g JOIN clinic.clinics c ON c.id=g.clinic_id WHERE g.pet_id=$1 AND public.is_pet_owner(g.pet_id) ORDER BY g.created_at DESC LIMIT 100',[petId])).rows));
});
app.get('/api/v1/clinics',async c=>{
  const rows=await withSystem(async db=>(await db.query('SELECT id,name,district,phone,address,is_24h,lat,lng,verified_at FROM clinic.clinics WHERE verified_at IS NOT NULL ORDER BY is_24h DESC,name LIMIT 500')).rows);
  c.header('Cache-Control','public, s-maxage=300, stale-while-revalidate=600');return ok(c,rows);
});
app.get('/api/v1/clinic/appointments',async c=>ok(c,await withUser(getActor(c).id,async db=>(await db.query('SELECT * FROM clinic.appointments ORDER BY requested_at DESC LIMIT 100')).rows)));
app.get('/api/v1/clinic/memberships',async c=>ok(c,await withUser(getActor(c).id,async db=>(await db.query('SELECT m.clinic_id,c.name,m.role FROM clinic.members m JOIN clinic.clinics c ON c.id=m.clinic_id WHERE m.user_id=$1 AND c.verified_at IS NOT NULL',[getActor(c).id])).rows)));
app.post('/api/v1/clinic/appointments',async c=>{
  const actor=getActor(c),b=await jsonBody(c,z.object({clinicId:z.uuid(),petId:z.uuid(),requestedAt:z.string().min(10),reason:z.string().trim().min(1).max(2000)}));
  if(!Number.isFinite(Date.parse(b.requestedAt))||Date.parse(b.requestedAt)<Date.now())throw new HttpError(400,'INVALID_DATE','กรุณาเลือกวันและเวลาในอนาคต');
  const row=await withUser(actor.id,async db=>(await db.query('INSERT INTO clinic.appointments(clinic_id,pet_id,user_id,requested_at,reason) VALUES($1,$2,$3,$4,$5) RETURNING *',[b.clinicId,b.petId,actor.id,b.requestedAt,b.reason])).rows[0]);return ok(c,row,201);
});
app.patch('/api/v1/clinic/appointments/:id',async c=>{
  const actor=getActor(c),id=uuid(c.req.param('id')),b=await jsonBody(c,z.object({status:z.enum(['accepted','declined','cancelled','completed'])}));
  const row=await withUser(actor.id,async db=>{
    const current=(await db.query('SELECT * FROM clinic.appointments WHERE id=$1',[id])).rows[0];if(!current)throw new HttpError(404,'NOT_FOUND','ไม่พบคำขอนัด');
    if(b.status!=='cancelled'&&!(await db.query('SELECT 1 FROM clinic.members WHERE clinic_id=$1 AND user_id=$2',[current.clinic_id,actor.id])).rowCount)throw new HttpError(403,'FORBIDDEN','เฉพาะพนักงานคลินิกที่รับคำขอ');
    if(b.status==='cancelled'&&current.user_id!==actor.id)throw new HttpError(403,'FORBIDDEN','เฉพาะผู้ขอนัดที่ยกเลิกได้');
    return (await db.query('UPDATE clinic.appointments SET status=$1 WHERE id=$2 RETURNING *',[b.status,id])).rows[0];
  });return ok(c,row);
});
app.post('/api/v1/clinic/grants',async c=>{
  const actor=getActor(c),b=await jsonBody(c,z.object({petId:z.uuid(),clinicId:z.uuid(),scopes:z.array(z.enum(['summary.read','vaccines.write','due_list.read','care.read','passport.read','passport.write'])).min(1),expiresInDays:z.number().int().min(1).max(14).default(7)}));
  const row=await withUser(actor.id,async db=>(await db.query("INSERT INTO identity.grants(pet_id,clinic_id,granted_by,scopes,expires_at) VALUES($1,$2,$3,$4,now()+($5*interval '1 day')) RETURNING *",[b.petId,b.clinicId,actor.id,b.scopes,b.expiresInDays])).rows[0]);return ok(c,row,201);
});
app.delete('/api/v1/clinic/grants/:id',async c=>{await withUser(getActor(c).id,db=>db.query('UPDATE identity.grants SET revoked_at=now() WHERE id=$1',[uuid(c.req.param('id'))]));return ok(c,{revoked:true});});
app.get('/api/v1/clinic/pets/:id/summary',async c=>{
  const actor=getActor(c),id=uuid(c.req.param('id'));
  const includeCosts=c.req.query('includeCosts');if(includeCosts!==undefined&&!['true','false'].includes(includeCosts))throw new HttpError(400,'VALIDATION_ERROR','includeCosts ต้องเป็น true หรือ false');
  const result=await withUser(actor.id,async db=>{
    const grant=(await db.query("SELECT g.id FROM identity.grants g JOIN clinic.members m ON m.clinic_id=g.clinic_id WHERE g.pet_id=$1 AND m.user_id=$2 AND g.revoked_at IS NULL AND g.expires_at>now() AND 'summary.read'=ANY(g.scopes)",[id,actor.id])).rows[0];
    if(!grant)throw new HttpError(403,'GRANT_REQUIRED','เจ้าของต้องให้สิทธิ์ที่ยังไม่หมดอายุ');
    const pet=(await db.query('SELECT name,species,sex,birth_date,breed,weight_kg FROM pet.pets WHERE id=$1',[id])).rows[0];const records=(await db.query('SELECT kind,title,recorded_at,next_due_at,notes,value FROM health.records WHERE pet_id=$1 ORDER BY recorded_at DESC LIMIT 100',[id])).rows;
    const careAllowed=(await db.query("SELECT public.has_clinic_grant($1,'care.read') AS allowed",[id])).rows[0].allowed;
    const care=careAllowed?(await db.query('SELECT health.clinic_care_summary($1,$2) AS summary',[id,includeCosts==='true'])).rows[0].summary:null;
    await db.query("INSERT INTO identity.audit_log(actor_id,action,resource_type,resource_id) VALUES($1,'clinic.summary.read','grant',$2)",[actor.id,grant.id]);
    if(careAllowed)await db.query("INSERT INTO identity.audit_log(actor_id,action,resource_type,resource_id) VALUES($1,'clinic.care.read','pet',$2)",[actor.id,id]);
    return {pet,records,careAccess:careAllowed,careEntries:care?.entries??[],careTruncated:care?.truncated??false};
  });return ok(c,result);
});
app.post('/api/v1/clinic/admin/clinics',async c=>{
  requireRole(c,['admin']);const b=await jsonBody(c,z.object({name:z.string().min(1).max(200),district:z.string().max(100),phone:z.string().max(30),address:z.string().max(500),is24h:z.boolean(),lat:z.number().min(-90).max(90).nullable(),lng:z.number().min(-180).max(180).nullable()}));
  const row=await withSystem(async db=>(await db.query('INSERT INTO clinic.clinics(name,district,phone,address,is_24h,lat,lng,verified_at,verified_by) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8) RETURNING *',[b.name,b.district,b.phone,b.address,b.is24h,b.lat,b.lng,getActor(c).id])).rows[0]);return ok(c,row,201);
});
export default app;
