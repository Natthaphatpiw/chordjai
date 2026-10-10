import { z } from 'zod';
import { withUser } from '@chordjai/db';
import { createService,getActor,ok,jsonBody,uuid,HttpError , aiLanguage } from '@chordjai/service-kit';
import { recordSchema } from '@chordjai/contracts';
import { runStructured } from '@chordjai/ai';
import { loadOwnedImage,mediaIdFromUrl } from '@chordjai/media';
const app=createService('health'),base='/api/v1/health';
app.get(`${base}/records`,async c=>{
  const petId=uuid(c.req.query('petId'));return ok(c,await withUser(getActor(c).id,async db=>(await db.query('SELECT * FROM health.records WHERE pet_id=$1 ORDER BY recorded_at DESC LIMIT 200',[petId])).rows));
});
app.post(`${base}/records`,async c=>{
  const actor=getActor(c),b=await jsonBody(c,recordSchema);
  if(Number.isNaN(Date.parse(b.recordedAt))||(b.nextDueAt&&Number.isNaN(Date.parse(b.nextDueAt))))throw new HttpError(400,'INVALID_DATE','วันที่ไม่ถูกต้อง');
  if(b.kind==='weight'&&(!b.value||b.value<0||b.value>150))throw new HttpError(400,'INVALID_WEIGHT','น้ำหนักไม่ถูกต้อง');
  const row=await withUser(actor.id,async db=>{
    const {rows}=await db.query('INSERT INTO health.records(pet_id,created_by,kind,title,recorded_at,next_due_at,notes,value,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *',[b.petId,actor.id,b.kind,b.title,b.recordedAt,b.nextDueAt??null,b.notes??null,b.value??null,JSON.stringify(b.data??{})]);
    if(b.kind==='weight')await db.query('UPDATE pet.pets SET weight_kg=$1 WHERE id=$2',[b.value,b.petId]);
    if(b.nextDueAt)await db.query('INSERT INTO notify.reminders(pet_id,user_id,title,due_at,dedupe_key) VALUES($1,$2,$3,$4,$5)',[b.petId,actor.id,b.title,b.nextDueAt,`health:${rows[0].id}`]);
    await db.query("INSERT INTO analytics.events(user_id,pet_id,name) VALUES($1,$2,$3)",[actor.id,b.petId,b.kind==='vaccine'?'vaccine.recorded':'health.recorded']);return rows[0];
  });return ok(c,row,201);
});
app.delete(`${base}/records/:id`,async c=>{
  const id=uuid(c.req.param('id'));await withUser(getActor(c).id,async db=>{
    await db.query('DELETE FROM notify.reminders WHERE dedupe_key=$1',[`health:${id}`]);const r=await db.query('DELETE FROM health.records WHERE id=$1 RETURNING id',[id]);if(!r.rowCount)throw new HttpError(404,'NOT_FOUND','ไม่พบรายการ');
  });return ok(c,{deleted:true});
});
const ocrSchema=z.object({records:z.array(z.object({kind:z.enum(['vaccine','medication','parasite']),title:z.string().max(200),recordedAt:z.string(),nextDueAt:z.string().nullable(),notes:z.string(),value:z.number().nullable()})).max(30),warnings:z.array(z.string()).max(20)});
app.post(`${base}/ocr`,async c=>{
  const actor=getActor(c),b=await jsonBody(c,z.object({petId:z.uuid(),imageUrl:z.string().max(2000)}));
  await withUser(actor.id,async db=>{if(!(await db.query('SELECT id FROM pet.pets WHERE id=$1',[b.petId])).rowCount)throw new HttpError(404,'PET_NOT_FOUND','ไม่พบโปรไฟล์น้อง');});
  const image=await loadOwnedImage(actor.id,mediaIdFromUrl(b.imageUrl));
  const draft=await runStructured({userId:actor.id,feature:'ocr.vaccine_book',instructions:`Transcribe the vaccination book as a draft for the owner to confirm. Preserve original vaccine/product names as written. Return explanations and warnings entirely in ${aiLanguage(c)}. Convert Buddhist years to Gregorian ISO dates. Never use lot EXP as a next-due date. Unclear fields must be null with warnings. Never invent dates or advise medication or dosage.`,input:'ถอดรายการจากรูปสมุดวัคซีน พร้อมคำเตือนความไม่แน่นอน',images:[image],schema:ocrSchema});
  const scan=await withUser(actor.id,async db=>(await db.query('INSERT INTO health.scans(pet_id,user_id,media_id,draft) VALUES($1,$2,$3,$4::jsonb) RETURNING id',[b.petId,actor.id,mediaIdFromUrl(b.imageUrl),JSON.stringify(draft)])).rows[0]);
  return ok(c,{...draft,scanId:scan.id,requiresConfirmation:true});
});
export default app;
