import { withUser } from '@chordjai/db';
import { createService,getActor,ok,jsonBody,uuid,HttpError , aiLanguage } from '@chordjai/service-kit';
import { recordSchema } from '@chordjai/contracts';
import { runStructured } from '@chordjai/ai';
import { loadOwnedImage,mediaIdFromUrl } from '@chordjai/media';
import { ocrRequestSchema, ocrDraftSchema, normalizeOcrDraft, scanRecordSchema, reviewedDate } from './ocr';
import {registerCareRoutes} from './care';
const app=createService('health'),base='/api/v1/health';
registerCareRoutes(app);
app.get(`${base}/records`,async c=>{
  const petId=uuid(c.req.query('petId'));return ok(c,await withUser(getActor(c).id,async db=>(await db.query('SELECT * FROM health.records WHERE pet_id=$1 ORDER BY recorded_at DESC LIMIT 200',[petId])).rows));
});
app.post(`${base}/records`,async c=>{
  const actor=getActor(c),b=await jsonBody(c,recordSchema);
  if(Number.isNaN(Date.parse(b.recordedAt))||(b.nextDueAt&&Number.isNaN(Date.parse(b.nextDueAt))))throw new HttpError(400,'INVALID_DATE','วันที่ไม่ถูกต้อง');
  if(b.kind==='weight'&&(!b.value||b.value<0||b.value>150))throw new HttpError(400,'INVALID_WEIGHT','น้ำหนักไม่ถูกต้อง');
  const importing=b.data?.scanId!==undefined||b.data?.sourcePage!==undefined||b.data?.scanRecordIndex!==undefined;
  const scanRecord=importing?scanRecordSchema.safeParse(b.data):null;
  if(scanRecord&&!scanRecord.success)throw new HttpError(400,'INVALID_SCAN_RECORD','ข้อมูลหน้าสมุดไม่ครบ กรุณาสแกนใหม่');
  if(importing){
    if(!reviewedDate(b.recordedAt)||(b.nextDueAt&&!reviewedDate(b.nextDueAt)))throw new HttpError(400,'INVALID_DATE','กรุณาตรวจวันที่และปีให้ตรงกับสมุดต้นฉบับ');
    if(b.nextDueAt&&b.nextDueAt<b.recordedAt)throw new HttpError(400,'INVALID_DUE_DATE','วันนัดครั้งถัดไปอยู่ก่อนวันที่บันทึก กรุณาตรวจวันที่และปีในสมุดอีกครั้ง');
  }
  if(importing&&!c.req.header('Idempotency-Key'))throw new HttpError(400,'IDEMPOTENCY_REQUIRED','กรุณาส่งรหัสคำขอเพื่อป้องกันบันทึกซ้ำ');
  const row=await withUser(actor.id,async db=>{
    if(scanRecord?.success){
      const {scanId,sourcePage,scanRecordIndex}=scanRecord.data;
      const scan=(await db.query('SELECT draft FROM health.scans WHERE id=$1 AND pet_id=$2 AND user_id=$3 AND public.can_write_pet(pet_id)',[scanId,b.petId,actor.id])).rows[0];
      if(!scan||sourcePage>(scan.draft.pageCount??1))throw new HttpError(404,'SCAN_NOT_FOUND','ไม่พบหน้าสมุดที่สแกน');
      // Keep import deduplication in the same transaction as the record and
      // reminder. This also covers a lost response before middleware caching.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`health-scan:${scanId}:${scanRecordIndex}`]);
      const previous=(await db.query("SELECT * FROM health.records WHERE pet_id=$1 AND data->>'scanId'=$2 AND data->>'scanRecordIndex'=$3 LIMIT 1",[b.petId,scanId,String(scanRecordIndex)])).rows[0];
      if(previous)return previous;
    }
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
app.post(`${base}/ocr`,async c=>{
  const actor=getActor(c),b=await jsonBody(c,ocrRequestSchema);
  const imageUrls=b.imageUrls??[b.imageUrl!];
  const mediaIds=imageUrls.map(imageUrl=>uuid(mediaIdFromUrl(imageUrl)).toLowerCase());
  if(new Set(mediaIds).size!==mediaIds.length)throw new HttpError(400,'DUPLICATE_PAGE','มีรูปหน้าสมุดซ้ำ กรุณาเลือกรูปแต่ละหน้าเพียงครั้งเดียว');
  await withUser(actor.id,async db=>{
    if(!(await db.query('SELECT id FROM pet.pets WHERE id=$1 AND public.can_write_pet(id)',[b.petId])).rowCount)throw new HttpError(404,'PET_NOT_FOUND','ไม่พบโปรไฟล์น้องหรือไม่มีสิทธิ์บันทึก');
    const photos=await db.query("SELECT id FROM media.objects WHERE id=ANY($1::uuid[]) AND user_id=$2 AND pet_id=$3 AND status='ready'",[mediaIds,actor.id,b.petId]);
    if(photos.rows.length!==mediaIds.length)throw new HttpError(403,'IMAGE_PET_MISMATCH','กรุณาใช้รูปหน้าสมุดที่อัปโหลดสำหรับน้องตัวนี้เท่านั้น');
  });
  // Check every page's ownership before spending a provider request. Sequential
  // reads bound peak memory for ten uploaded photographs.
  const images:string[]=[];
  for(const mediaId of mediaIds)images.push(await loadOwnedImage(actor.id,mediaId));
  const schema=ocrDraftSchema(images.length);
  const draft=normalizeOcrDraft(await runStructured({userId:actor.id,feature:'ocr.vaccine_book',maxOutputTokens:8000,instructions:`Transcribe all ${images.length} ordered vaccination-book pages together as one draft for the owner to review. sourcePage is the 1-based input image number and must identify the actual source of every record. Preserve original vaccine/product names exactly as written. Deduplicate a vaccination only when the same administered product and date clearly repeat across pages. Return short, plain-language warnings entirely in ${aiLanguage(c)}; do not mention technical field names or the word null. Convert a clearly legible Buddhist Era year to a Gregorian YYYY-MM-DD date. A missing, illegible or uncertain administration date or next appointment must be null, never today or an inferred date. Printed product names alone are not evidence of administration. Never use a vaccine expiry date or a lot sticker's EXP as the next appointment. Include only an appointment written as an appointment. Never invent dates, recommend medication or suggest a dose. Use at most100 records and20 brief warnings across the whole batch.`,input:{pageCount:images.length,task:'Read the photographed pages as a single booklet draft, retaining source page numbers.'},images,schema}));
  const scan=await withUser(actor.id,async db=>(await db.query('INSERT INTO health.scans(pet_id,user_id,media_id,draft) VALUES($1,$2,$3,$4::jsonb) RETURNING id',[b.petId,actor.id,mediaIds[0],JSON.stringify({...draft,mediaIds,pageCount:images.length})])).rows[0]);
  return ok(c,{...draft,scanId:scan.id,pageCount:images.length,requiresConfirmation:true});
});
export default app;
