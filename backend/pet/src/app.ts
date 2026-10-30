import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { withUser, withSystem } from '@chordjai/db';
import { createService, getActor, ok, jsonBody, uuid, HttpError } from '@chordjai/service-kit';
import { petSchema } from '@chordjai/contracts';
const app=createService('pet');
const base='/api/v1/pets';
app.get(base,async c=>ok(c,await withUser(getActor(c).id,async db=>(await db.query('SELECT p.*,public.can_write_pet(p.id) AS can_edit FROM pet.pets p ORDER BY p.created_at DESC LIMIT 100')).rows)));
app.get(`${base}/:id`,async c=>{
  const rows=await withUser(getActor(c).id,async db=>(await db.query('SELECT p.*,public.can_write_pet(p.id) AS can_edit FROM pet.pets p WHERE p.id=$1',[uuid(c.req.param('id'))])).rows);
  if(!rows[0])throw new HttpError(404,'PET_NOT_FOUND','ไม่พบโปรไฟล์น้อง');return ok(c,rows[0]);
});
app.post(base,async c=>{
  const actor=getActor(c);const b=await jsonBody(c,petSchema);
  const pet=await withUser(actor.id,async db=>{
    const {rows}=await db.query('INSERT INTO pet.pets(owner_id,name,species,sex,birth_date,breed,weight_kg,photo_url,microchip,neutered) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[actor.id,b.name,b.species,b.sex,b.birthDate??null,b.breed??null,b.weightKg??null,b.photoUrl??null,b.microchip??null,b.neutered??null]);
    await db.query("INSERT INTO analytics.events(user_id,pet_id,name) VALUES($1,$2,'pet.created')",[actor.id,rows[0].id]);return rows[0];
  });return ok(c,pet,201);
});
app.patch(`${base}/:id`,async c=>{
  const b=await jsonBody(c,petSchema.partial());const fields:Record<string,string>={name:'name',species:'species',sex:'sex',neutered:'neutered',birthDate:'birth_date',breed:'breed',weightKg:'weight_kg',photoUrl:'photo_url',microchip:'microchip'};
  const entries=Object.entries(b);if(!entries.length)throw new HttpError(400,'EMPTY_UPDATE','ไม่มีข้อมูลให้แก้ไข');
  const row=await withUser(getActor(c).id,async db=>(await db.query(`UPDATE pet.pets SET ${entries.map(([k],i)=>`${fields[k]}=$${i+2}`).join(',')},updated_at=now() WHERE id=$1 RETURNING *`,[uuid(c.req.param('id')),...entries.map(([,v])=>v)])).rows[0]);
  if(!row)throw new HttpError(404,'PET_NOT_FOUND','ไม่พบข้อมูลหรือไม่มีสิทธิ์แก้ไข');return ok(c,row);
});
app.delete(`${base}/:id`,async c=>{
  const actor=getActor(c),id=uuid(c.req.param('id'));
  // Media cascade triggers enqueue private Blob erasure before metadata disappears.
  const result=await withUser(actor.id,db=>db.query('DELETE FROM pet.pets WHERE id=$1 AND owner_id=$2 RETURNING id',[id,actor.id]));
  if(!result.rowCount)throw new HttpError(404,'PET_NOT_FOUND','ไม่พบข้อมูลหรือไม่มีสิทธิ์ลบ');return ok(c,{deleted:true});
});
app.get(`${base}/:id/members`,async c=>ok(c,await withUser(getActor(c).id,async db=>(await db.query('SELECT * FROM pet.members WHERE pet_id=$1',[uuid(c.req.param('id'))])).rows)));
app.post(`${base}/:id/invitations`,async c=>{
  const b=await jsonBody(c,z.object({role:z.enum(['carer','viewer'])}));const actor=getActor(c),petId=uuid(c.req.param('id'));const token=randomBytes(24).toString('base64url');
  const invitation=await withUser(actor.id,async db=>(await db.query('INSERT INTO pet.invitations(pet_id,invited_by,role,token_hash) VALUES($1,$2,$3,$4) RETURNING id,expires_at,role',[petId,actor.id,b.role,createHash('sha256').update(token).digest('hex')])).rows[0]);
  return ok(c,{...invitation,url:`${process.env.APP_ORIGIN??'https://www.chordjai.life'}/invite/${token}`},201);
});
app.post('/api/v1/invitations/:token/accept',async c=>{
  const actor=getActor(c);const token=c.req.param('token');if(!/^[\w-]{32}$/.test(token))throw new HttpError(400,'INVALID_TOKEN','ลิงก์ไม่ถูกต้อง');
  const member=await withSystem(async db=>{
    const {rows}=await db.query('SELECT * FROM pet.invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE',[createHash('sha256').update(token).digest('hex')]);
    if(!rows[0])throw new HttpError(410,'INVITATION_EXPIRED','คำเชิญหมดอายุหรือถูกใช้แล้ว');
    if(rows[0].invited_by===actor.id)throw new HttpError(400,'OWN_INVITE','คุณเป็นเจ้าของน้องอยู่แล้ว');
    const inserted=await db.query('INSERT INTO pet.members(pet_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING role',[rows[0].pet_id,actor.id,rows[0].role]);
    if(!inserted.rowCount)throw new HttpError(409,'ALREADY_MEMBER','คุณเป็นสมาชิกของน้องอยู่แล้ว กรุณาให้เจ้าของจัดการสิทธิ์เดิม');
    await db.query('UPDATE pet.invitations SET accepted_at=now(),accepted_by=$1 WHERE id=$2',[actor.id,rows[0].id]);return {petId:rows[0].pet_id,role:rows[0].role};
  });return ok(c,member);
});
app.delete(`${base}/:id/members/:userId`,async c=>{
  const actor=getActor(c);await withUser(actor.id,db=>db.query("DELETE FROM pet.members WHERE pet_id=$1 AND user_id=$2 AND role<>'owner'",[uuid(c.req.param('id')),uuid(c.req.param('userId'))]));return ok(c,{removed:true});
});
export default app;
