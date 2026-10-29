import { withUser,type PoolClient } from '@chordjai/db';
import {z} from 'zod';
import { createService,getActor,ok,jsonBody,uuid,HttpError , aiLanguage } from '@chordjai/service-kit';
import { recordSchema } from '@chordjai/contracts';
import { runStructured } from '@chordjai/ai';
import { loadOwnedImage,mediaIdFromUrl } from '@chordjai/media';
import { ocrRequestSchema, ocrDraftSchema, normalizeOcrDraft, scanRecordSchema, reviewedDate } from './ocr';
import {registerCareRoutes} from './care';
import {registerPassportRoutes} from './passport';
import {recordRevisionSchema,requireRecordMutations,optionalDeleteGuard} from './mutations';
const app=createService('health'),base='/api/v1/health';
registerCareRoutes(app);
registerPassportRoutes(app);
// A pet owner may correct a family-authored record. An outside-family source
// (including a clinic-authored original) is never silently rewritten as the
// owner's own history. Immutable attribution/OCR metadata stay on the row.
const recordWriteAccess=`public.can_write_pet(r.pet_id) AND (r.created_by=public.current_user_id() OR (public.is_pet_owner(r.pet_id) AND (r.created_by IS NULL OR EXISTS(SELECT 1 FROM pet.pets p WHERE p.id=r.pet_id AND p.owner_id=r.created_by) OR EXISTS(SELECT 1 FROM pet.members m WHERE m.pet_id=r.pet_id AND m.user_id=r.created_by))))`;
const recordColumns=`r.*,md5(row_to_json(r)::text) AS revision,(${recordWriteAccess}) AND to_regprocedure('health.sync_record_mutation()') IS NOT NULL AS can_edit,(${recordWriteAccess}) AND to_regprocedure('health.sync_record_mutation()') IS NOT NULL AS can_delete`;
async function healthRecord(db:PoolClient,id:string,lock=false){return(await db.query(`SELECT ${recordColumns} FROM health.records r WHERE r.id=$1 ${lock?'FOR UPDATE OF r':''}`,[id])).rows[0];}
const recordUpdateSchema=recordSchema.omit({petId:true,data:true}).extend({petId:z.uuid().optional(),kind:z.enum(['vaccine','weight','medication','parasite','checkin','note','visit']),revision:recordRevisionSchema}).strict();
function validateRecordDates(body:{recordedAt:string;nextDueAt?:string|null;kind:string;value?:number|null}){
  for(const value of [body.recordedAt,body.nextDueAt].filter((v):v is string=>!!v)){
    const valid=/^\d{4}-\d{2}-\d{2}$/.test(value)?!!reviewedDate(value):z.iso.datetime({offset:true}).safeParse(value).success;
    const stamp=Date.parse(value);if(!valid||!Number.isFinite(stamp)||stamp<Date.UTC(1900,0,1)||stamp>Date.UTC(2200,0,1))throw new HttpError(400,'INVALID_DATE','วันที่ไม่ถูกต้อง กรุณาตรวจวัน เดือน และปี');
  }
  if(body.nextDueAt&&Date.parse(body.nextDueAt)<Date.parse(body.recordedAt))throw new HttpError(400,'INVALID_DUE_DATE','วันนัดครั้งถัดไปอยู่ก่อนวันที่บันทึก');
  if(body.kind==='weight'&&(!body.value||body.value<0||body.value>150))throw new HttpError(400,'INVALID_WEIGHT','น้ำหนักไม่ถูกต้อง');
}
app.get(`${base}/records`,async c=>{
  const petId=uuid(c.req.query('petId'));return ok(c,await withUser(getActor(c).id,async db=>(await db.query(`SELECT ${recordColumns} FROM health.records r WHERE r.pet_id=$1 ORDER BY r.recorded_at DESC,r.created_at DESC,r.id DESC LIMIT 200`,[petId])).rows));
});
app.get(`${base}/records/:id`,async c=>{const row=await withUser(getActor(c).id,db=>healthRecord(db,uuid(c.req.param('id'))));if(!row)throw new HttpError(404,'HEALTH_RECORD_NOT_FOUND','ไม่พบประวัติสุขภาพ');return ok(c,row);});
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
      const previous=(await db.query(`SELECT ${recordColumns} FROM health.records r WHERE r.pet_id=$1 AND r.data->>'scanId'=$2 AND r.data->>'scanRecordIndex'=$3 LIMIT 1`,[b.petId,scanId,String(scanRecordIndex)])).rows[0];
      if(previous)return previous;
    }
    if(b.kind==='weight')await db.query('SELECT id FROM pet.pets WHERE id=$1 FOR UPDATE',[b.petId]);
    const {rows}=await db.query("INSERT INTO health.records AS r(pet_id,created_by,kind,title,recorded_at,next_due_at,notes,value,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING r.*,md5(row_to_json(r)::text) AS revision,public.can_write_pet(pet_id) AND to_regprocedure('health.sync_record_mutation()') IS NOT NULL AS can_edit,public.can_write_pet(pet_id) AND to_regprocedure('health.sync_record_mutation()') IS NOT NULL AS can_delete",[b.petId,actor.id,b.kind,b.title,b.recordedAt,b.nextDueAt??null,b.notes??null,b.value??null,JSON.stringify(b.data??{})]);
    if(b.kind==='weight')await db.query("UPDATE pet.pets SET weight_kg=(SELECT value FROM health.records WHERE pet_id=$1 AND kind='weight' ORDER BY recorded_at DESC,created_at DESC,id DESC LIMIT 1) WHERE id=$1",[b.petId]);
    if(b.nextDueAt)await db.query('INSERT INTO notify.reminders(pet_id,user_id,title,due_at,dedupe_key) VALUES($1,$2,$3,$4,$5)',[b.petId,actor.id,b.title,b.nextDueAt,`health:${rows[0].id}`]);
    await db.query("INSERT INTO analytics.events(user_id,pet_id,name) VALUES($1,$2,$3)",[actor.id,b.petId,b.kind==='vaccine'?'vaccine.recorded':'health.recorded']);return rows[0];
  });return ok(c,row,201);
});
app.patch(`${base}/records/:id`,async c=>{
  const actor=getActor(c),id=uuid(c.req.param('id')),body=await jsonBody(c,recordUpdateSchema);validateRecordDates(body);
  return ok(c,await withUser(actor.id,async db=>{
    await requireRecordMutations(db);const current=await healthRecord(db,id,true);
    if(!current)throw new HttpError(404,'HEALTH_RECORD_NOT_FOUND','ไม่พบประวัติสุขภาพ');
    if(!current.can_edit)throw new HttpError(403,'HEALTH_RECORD_EDIT_REQUIRED','แก้ไขได้เฉพาะบันทึกของคุณหรือข้อมูลครอบครัวที่คุณมีสิทธิ์');
    if(body.petId&&body.petId!==current.pet_id)throw new HttpError(400,'HEALTH_RECORD_PET_MISMATCH','ไม่สามารถย้ายบันทึกไปยังน้องตัวอื่น');
    if(current.revision!==body.revision)throw new HttpError(409,'VERSION_CONFLICT','รายการนี้เปลี่ยนจากที่อื่นแล้ว กรุณาโหลดฉบับล่าสุด');
    await db.query('UPDATE health.records SET kind=$2,title=$3,recorded_at=$4,next_due_at=$5,notes=$6,value=$7 WHERE id=$1',[id,body.kind,body.title,body.recordedAt,body.nextDueAt??null,body.notes??null,body.value??null]);
    return healthRecord(db,id);
  }));
});
app.delete(`${base}/records/:id`,async c=>{
  const actor=getActor(c),id=uuid(c.req.param('id')),body=await optionalDeleteGuard(c,'revision');await withUser(actor.id,async db=>{
    await requireRecordMutations(db);const current=await healthRecord(db,id,true);
    if(!current)throw new HttpError(404,'HEALTH_RECORD_NOT_FOUND','ไม่พบประวัติสุขภาพ');
    if(!current.can_delete)throw new HttpError(403,'HEALTH_RECORD_EDIT_REQUIRED','คุณไม่มีสิทธิ์ลบข้อมูลต้นฉบับรายการนี้');
    if(body.revision&&body.revision!==current.revision)throw new HttpError(409,'VERSION_CONFLICT','รายการนี้เปลี่ยนจากที่อื่นแล้ว กรุณาโหลดฉบับล่าสุดก่อนลบ');
    await db.query('DELETE FROM health.records WHERE id=$1',[id]);
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
