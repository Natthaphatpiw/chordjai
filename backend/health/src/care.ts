import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Hono} from 'hono';
import {withUser,careSummary,type PoolClient} from '@chordjai/db';
import {careEntryCreateSchema,careEntryUpdateSchema,careEpisodeCreateSchema,careEpisodeUpdateSchema,type CareEntryInput} from '@chordjai/contracts';
import {mediaUrl} from '@chordjai/media';
import {getActor,ok,jsonBody,uuid,HttpError,type ServiceEnv} from '@chordjai/service-kit';
import {requireRecordMutations,optionalDeleteGuard} from './mutations';

const base='/api/v1/health/care';
const digest=(body:unknown)=>createHash('sha256').update(JSON.stringify(body)).digest('hex');
function pageQuery(query:Record<string,string>){
  const limit=query.limit===undefined?50:Number(query.limit);
  if(!Number.isInteger(limit)||limit<1||limit>200||query.limit!==undefined&&!/^\d+$/.test(query.limit))throw new HttpError(400,'VALIDATION_ERROR','จำนวนรายการต้องอยู่ระหว่าง 1 ถึง 200');
  const before=query.before??null,beforeId=query.beforeId??null;
  if(before!==null||beforeId!==null){
    if(!before||!beforeId||!z.iso.datetime({offset:true}).safeParse(before).success)throw new HttpError(400,'VALIDATION_ERROR','ข้อมูลหน้ารายการถัดไปไม่ถูกต้อง');
    uuid(beforeId);
  }
  return{limit,before,beforeId};
}
// pg's JavaScript Date parser drops microseconds. Cursor fields must retain
// PostgreSQL's full precision in a canonical UTC string on every response.
const episodeTimestamps=`to_char(started_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS started_at,to_char(resolved_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS resolved_at`;
const entryColumns=`e.id,e.pet_id,e.created_by,e.client_entry_id,e.episode_id,e.kind,e.title,to_char(e.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at,e.narrative,e.clinical_note,e.observations,e.visit,e.share_with_clinic,e.share_costs,e.provenance,e.passport_session_id,e.passport_clinic_note_id,e.passport_source,e.version,e.edited_by,e.created_at,e.updated_at,
  (public.can_write_pet(e.pet_id) AND (e.created_by=public.current_user_id() OR public.is_pet_owner(e.pet_id)) AND to_regprocedure('health.sync_record_mutation()') IS NOT NULL) AS can_edit,
  (public.can_write_pet(e.pet_id) AND (e.created_by=public.current_user_id() OR public.is_pet_owner(e.pet_id))) AS can_delete,
  e.created_by=public.current_user_id() AS can_edit_reflection,
  coalesce((SELECT r.content FROM health.care_reflections r WHERE r.entry_id=e.id),'') AS reflection,
  coalesce((SELECT jsonb_agg(jsonb_build_object('label',c.label,'amountMinor',c.amount_minor,'currency',c.currency,'kind',c.kind) ORDER BY c.position) FROM health.care_costs c WHERE c.entry_id=e.id),'[]'::jsonb) AS costs,
  coalesce((SELECT jsonb_agg(jsonb_build_object('mediaId',m.id,'userId',m.user_id) ORDER BY cm.position) FROM health.care_media cm JOIN media.objects m ON m.id=cm.media_id AND m.status='ready' WHERE cm.entry_id=e.id),'[]'::jsonb) AS assets`;
async function hydrate(entry:Record<string,unknown>){
  const {assets,...rest}=entry;
  const photos=await Promise.all((assets as {mediaId:string;userId:string}[]).map(async asset=>({mediaId:asset.mediaId,url:await mediaUrl({id:asset.mediaId,user_id:asset.userId})})));
  return {...rest,mediaIds:photos.map(photo=>photo.mediaId),photos};
}
async function getEntry(db:PoolClient,id:string){return(await db.query(`SELECT ${entryColumns} FROM health.care_entries e WHERE e.id=$1`,[id])).rows[0];}
async function writeAccess(db:PoolClient,petId:string){
  if(!(await db.query('SELECT id FROM pet.pets WHERE id=$1 AND public.can_write_pet(id) FOR SHARE',[petId])).rowCount)throw new HttpError(403,'CARE_WRITE_REQUIRED','คุณไม่มีสิทธิ์บันทึกการดูแลของน้องตัวนี้');
}
async function validateRelations(db:PoolClient,petId:string,actorId:string,body:Pick<CareEntryInput,'episodeId'|'mediaIds'>){
  if(body.episodeId&&!(await db.query('SELECT id FROM health.care_episodes WHERE id=$1 AND pet_id=$2',[body.episodeId,petId])).rowCount)throw new HttpError(400,'CARE_EPISODE_MISMATCH','เรื่องการดูแลต้องเป็นของน้องตัวเดียวกัน');
  if(body.mediaIds.length){
    const owned=await db.query("SELECT id FROM media.objects WHERE id=ANY($1::uuid[]) AND pet_id=$2 AND user_id=$3 AND status='ready' AND mime LIKE 'image/%' ORDER BY id FOR SHARE",[body.mediaIds,petId,actorId]);
    if(owned.rowCount!==body.mediaIds.length)throw new HttpError(403,'IMAGE_PET_MISMATCH','กรุณาใช้รูปที่คุณอัปโหลดสำหรับน้องตัวนี้เท่านั้น');
  }
}
export function validateCareDates(body:Pick<CareEntryInput,'observedAt'|'observations'|'visit'>){
  const observed=Date.parse(body.observedAt);
  if(observed<Date.UTC(1900,0,1)||observed>Date.UTC(2200,0,1)||observed>Date.now()+86_400_000)throw new HttpError(400,'INVALID_DATE','วันที่บันทึกอาการไม่ถูกต้อง');
  if(body.observations.onsetAt&&Date.parse(body.observations.onsetAt)>observed)throw new HttpError(400,'INVALID_DATE','วันที่เริ่มอาการต้องไม่อยู่หลังวันที่สังเกต');
  if(body.visit?.nextFollowupAt&&Date.parse(body.visit.nextFollowupAt)<observed)throw new HttpError(400,'INVALID_DUE_DATE','วันติดตามอาการต้องไม่อยู่ก่อนวันที่บันทึก');
}
async function saveAttachments(db:PoolClient,id:string,actorId:string,entryAuthor:string,body:Pick<CareEntryInput,'reflection'|'costs'|'mediaIds'>){
  // A pet owner may edit clinical facts written by a carer, but never reads or
  // overwrites that carer's private reflection.
  if(actorId===entryAuthor){
    if(body.reflection)await db.query('INSERT INTO health.care_reflections(entry_id,author_id,content) VALUES($1,$2,$3) ON CONFLICT(entry_id) DO UPDATE SET content=excluded.content,updated_at=now()',[id,actorId,body.reflection]);
    else await db.query('DELETE FROM health.care_reflections WHERE entry_id=$1',[id]);
  }
  await db.query('DELETE FROM health.care_costs WHERE entry_id=$1',[id]);
  for(const[position,cost]of body.costs.entries())await db.query('INSERT INTO health.care_costs(entry_id,position,label,amount_minor,currency,kind) VALUES($1,$2,$3,$4,$5,$6)',[id,position,cost.label,cost.amountMinor,cost.currency,cost.kind]);
  await db.query('DELETE FROM health.care_media WHERE entry_id=$1',[id]);
  for(const[position,mediaId]of body.mediaIds.entries())await db.query('INSERT INTO health.care_media(entry_id,media_id,position) VALUES($1,$2,$3)',[id,mediaId,position]);
}
export function registerCareRoutes(app:Hono<ServiceEnv>){
  app.get(`${base}/entries`,async c=>{
    const actor=getActor(c),petId=uuid(c.req.query('petId')),episodeId=c.req.query('episodeId')?uuid(c.req.query('episodeId')):null,page=pageQuery(c.req.query());
    const entries=await withUser(actor.id,async db=>{
      if(!(await db.query('SELECT id FROM pet.pets WHERE id=$1 AND public.is_pet_member(id)',[petId])).rowCount)throw new HttpError(404,'PET_NOT_FOUND','ไม่พบโปรไฟล์น้อง');
      return(await db.query(`SELECT ${entryColumns} FROM health.care_entries e WHERE e.pet_id=$1 AND ($2::uuid IS NULL OR e.episode_id=$2)
        AND ($3::timestamptz IS NULL OR (e.observed_at,e.id)<($3::timestamptz,$4::uuid))
        ORDER BY e.observed_at DESC,e.id DESC LIMIT $5`,[petId,episodeId,page.before,page.beforeId,page.limit])).rows;
    });
    return ok(c,await Promise.all(entries.map(hydrate)));
  });
  app.get(`${base}/entries/:id`,async c=>{
    const actor=getActor(c),entry=await withUser(actor.id,db=>getEntry(db,uuid(c.req.param('id'))));
    if(!entry)throw new HttpError(404,'CARE_ENTRY_NOT_FOUND','ไม่พบบันทึกการดูแล');return ok(c,await hydrate(entry));
  });
  app.post(`${base}/entries`,async c=>{
    const actor=getActor(c),body=await jsonBody(c,careEntryCreateSchema);validateCareDates(body);
    const entry=await withUser(actor.id,async db=>{
      await writeAccess(db,body.petId);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`care-entry:${actor.id}:${body.clientEntryId}`]);
      const existing=(await db.query('SELECT id,create_hash FROM health.care_entries WHERE created_by=$1 AND client_entry_id=$2',[actor.id,body.clientEntryId])).rows[0];
      if(existing){if(existing.create_hash!==digest(body))throw new HttpError(409,'IDEMPOTENCY_CONFLICT','รหัสบันทึกนี้ถูกใช้กับข้อมูลอื่นแล้ว');return getEntry(db,existing.id);}
      await validateRelations(db,body.petId,actor.id,body);
      const inserted=(await db.query(`INSERT INTO health.care_entries(pet_id,created_by,client_entry_id,create_hash,episode_id,kind,title,observed_at,narrative,clinical_note,observations,visit,share_with_clinic,share_costs)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14) RETURNING id`,[body.petId,actor.id,body.clientEntryId,digest(body),body.episodeId,body.kind,body.title,body.observedAt,body.narrative,body.clinicalNote,JSON.stringify(body.observations),body.visit?JSON.stringify(body.visit):null,body.shareWithClinic,body.shareCosts])).rows[0];
      await saveAttachments(db,inserted.id,actor.id,actor.id,body);
      await db.query("INSERT INTO analytics.events(user_id,pet_id,name,properties) VALUES($1,$2,'care.entry.saved',$3::jsonb)",[actor.id,body.petId,JSON.stringify({kind:body.kind,hasEpisode:!!body.episodeId,hasPhotos:!!body.mediaIds.length,hasCosts:!!body.costs.length})]);
      return getEntry(db,inserted.id);
    });return ok(c,await hydrate(entry),201);
  });
  app.patch(`${base}/entries/:id`,async c=>{
    const actor=getActor(c),id=uuid(c.req.param('id')),body=await jsonBody(c,careEntryUpdateSchema);validateCareDates(body);
    const entry=await withUser(actor.id,async db=>{
      await requireRecordMutations(db);
      const current=(await db.query('SELECT * FROM health.care_entries WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!current)throw new HttpError(404,'CARE_ENTRY_NOT_FOUND','ไม่พบบันทึกการดูแล');
      await writeAccess(db,current.pet_id);
      if(!(await db.query('SELECT 1 WHERE $1::uuid=$2::uuid OR public.is_pet_owner($3)',[current.created_by,actor.id,current.pet_id])).rowCount)throw new HttpError(403,'CARE_EDIT_REQUIRED','แก้ไขได้เฉพาะผู้เขียนหรือเจ้าของน้อง');
      if(current.version!==body.version)throw new HttpError(409,'VERSION_CONFLICT','บันทึกนี้มีการแก้ไขจากที่อื่น กรุณาโหลดฉบับล่าสุด');
      // Retained family photos can remain when the pet owner edits a carer's
      // entry; newly attached photos must belong to the actor making the edit.
      const oldPhotos=(await db.query('SELECT media_id FROM health.care_media WHERE entry_id=$1',[id])).rows.map(row=>row.media_id);
      await validateRelations(db,current.pet_id,actor.id,{episodeId:body.episodeId,mediaIds:body.mediaIds.filter(media=>!oldPhotos.includes(media))});
      if(body.mediaIds.length){
        const valid=await db.query("SELECT id FROM media.objects WHERE id=ANY($1::uuid[]) AND pet_id=$2 AND status='ready' AND mime LIKE 'image/%' ORDER BY id FOR SHARE",[body.mediaIds,current.pet_id]);
        if(valid.rowCount!==body.mediaIds.length)throw new HttpError(403,'IMAGE_PET_MISMATCH','ไม่พบรูปของน้องที่พร้อมใช้งาน');
      }
      await db.query(`UPDATE health.care_entries SET episode_id=$2,kind=$3,title=$4,observed_at=$5,narrative=$6,clinical_note=$7,observations=$8::jsonb,visit=$9::jsonb,share_with_clinic=$10,share_costs=$11,version=version+1,edited_by=$12 WHERE id=$1`,[id,body.episodeId,body.kind,body.title,body.observedAt,body.narrative,body.clinicalNote,JSON.stringify(body.observations),body.visit?JSON.stringify(body.visit):null,body.shareWithClinic,body.shareCosts,actor.id]);
      await saveAttachments(db,id,actor.id,current.created_by,body);
      return getEntry(db,id);
    });return ok(c,await hydrate(entry));
  });
  app.delete(`${base}/entries/:id`,async c=>{
    const actor=getActor(c),id=uuid(c.req.param('id')),body=await optionalDeleteGuard(c,'version');
    await withUser(actor.id,async db=>{
      const current=(await db.query('SELECT * FROM health.care_entries WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!current)throw new HttpError(404,'CARE_ENTRY_NOT_FOUND','ไม่พบบันทึกการดูแล');
      await writeAccess(db,current.pet_id);
      if(current.created_by!==actor.id&&!(await db.query('SELECT 1 WHERE public.is_pet_owner($1)',[current.pet_id])).rowCount)throw new HttpError(403,'CARE_EDIT_REQUIRED','ลบได้เฉพาะผู้เขียนหรือเจ้าของน้อง');
      if(body.version!==undefined&&body.version!==current.version)throw new HttpError(409,'VERSION_CONFLICT','บันทึกนี้เปลี่ยนจากที่อื่นแล้ว กรุณาโหลดฉบับล่าสุดก่อนลบ');
      await db.query('DELETE FROM health.care_entries WHERE id=$1',[id]);
    });return ok(c,{deleted:true});
  });
  app.get(`${base}/episodes/:id`,async c=>{
    const actor=getActor(c),id=uuid(c.req.param('id'));
    const found=await withUser(actor.id,async db=>(await db.query(`SELECT id,pet_id,created_by,client_episode_id,title,status,${episodeTimestamps},version,created_at,updated_at,
      (public.can_write_pet(pet_id) AND (created_by=public.current_user_id() OR public.is_pet_owner(pet_id)) AND to_regprocedure('health.sync_record_mutation()') IS NOT NULL) AS can_edit,
      (public.can_write_pet(pet_id) AND (created_by=public.current_user_id() OR public.is_pet_owner(pet_id)) AND to_regprocedure('health.sync_record_mutation()') IS NOT NULL) AS can_delete FROM health.care_episodes WHERE id=$1`,[id])).rows[0]);
    if(!found)throw new HttpError(404,'CARE_EPISODE_NOT_FOUND','ไม่พบเรื่องการดูแล');return ok(c,found);
  });
  app.get(`${base}/episodes`,async c=>{
    const actor=getActor(c),petId=uuid(c.req.query('petId')),page=pageQuery(c.req.query()),status=c.req.query('status')??null;
    if(status!==null&&!['active','ongoing','improving','resolved'].includes(status))throw new HttpError(400,'VALIDATION_ERROR','สถานะเรื่องการดูแลไม่ถูกต้อง');
    return ok(c,await withUser(actor.id,async db=>(await db.query(`SELECT id,pet_id,created_by,client_episode_id,title,status,${episodeTimestamps},version,created_at,updated_at,
      (public.can_write_pet(pet_id) AND (created_by=public.current_user_id() OR public.is_pet_owner(pet_id)) AND to_regprocedure('health.sync_record_mutation()') IS NOT NULL) AS can_edit,
      (public.can_write_pet(pet_id) AND (created_by=public.current_user_id() OR public.is_pet_owner(pet_id)) AND to_regprocedure('health.sync_record_mutation()') IS NOT NULL) AS can_delete FROM health.care_episodes WHERE pet_id=$1
      AND ($2::timestamptz IS NULL OR (started_at,id)<($2::timestamptz,$3::uuid))
      AND ($4::text IS NULL OR ($4='active' AND status IN ('ongoing','improving')) OR status=$4)
      ORDER BY health.care_episodes.started_at DESC,id DESC LIMIT $5`,[petId,page.before,page.beforeId,status,page.limit])).rows));
  });
  app.post(`${base}/episodes`,async c=>{
    const actor=getActor(c),body=await jsonBody(c,careEpisodeCreateSchema);
    if(Date.parse(body.startedAt)>Date.now()+86_400_000)throw new HttpError(400,'INVALID_DATE','วันเริ่มติดตามอาการไม่ถูกต้อง');
    const episode=await withUser(actor.id,async db=>{
      await writeAccess(db,body.petId);await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`care-episode:${actor.id}:${body.clientEpisodeId}`]);
      const existing=(await db.query(`SELECT *,${episodeTimestamps} FROM health.care_episodes WHERE created_by=$1 AND client_episode_id=$2`,[actor.id,body.clientEpisodeId])).rows[0];
      if(existing){if(existing.create_hash!==digest(body))throw new HttpError(409,'IDEMPOTENCY_CONFLICT','รหัสเรื่องการดูแลนี้มีข้อมูลอื่นแล้ว');return existing;}
      return(await db.query(`INSERT INTO health.care_episodes(pet_id,created_by,client_episode_id,create_hash,title,started_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *,${episodeTimestamps}`,[body.petId,actor.id,body.clientEpisodeId,digest(body),body.title,body.startedAt])).rows[0];
    });const{create_hash,...publicEpisode}=episode;return ok(c,{...publicEpisode,canEdit:true},201);
  });
  app.patch(`${base}/episodes/:id`,async c=>{
    const actor=getActor(c),body=await jsonBody(c,careEpisodeUpdateSchema),id=uuid(c.req.param('id'));
    const episode=await withUser(actor.id,async db=>{
      await requireRecordMutations(db);
      const current=(await db.query('SELECT * FROM health.care_episodes WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!current)throw new HttpError(404,'CARE_EPISODE_NOT_FOUND','ไม่พบเรื่องการดูแล');
      await writeAccess(db,current.pet_id);
      if(!(await db.query('SELECT 1 WHERE $1::uuid=$2::uuid OR public.is_pet_owner($3)',[current.created_by,actor.id,current.pet_id])).rowCount)throw new HttpError(403,'CARE_EDIT_REQUIRED','แก้ไขได้เฉพาะผู้เขียนหรือเจ้าของน้อง');
      if(body.resolvedAt&&Date.parse(body.resolvedAt)<Date.parse(current.started_at))throw new HttpError(400,'INVALID_DATE','วันสิ้นสุดต้องไม่อยู่ก่อนวันเริ่ม');
      const changed=(await db.query(`UPDATE health.care_episodes SET title=$2,status=$3,resolved_at=$4,version=version+1 WHERE id=$1 AND version=$5 RETURNING *,${episodeTimestamps}`,[id,body.title,body.status,body.resolvedAt,body.version])).rows[0];
      if(!changed)throw new HttpError(409,'VERSION_CONFLICT','เรื่องการดูแลนี้เปลี่ยนจากที่อื่นหรือคุณไม่มีสิทธิ์แก้ไข');return changed;
    });const{create_hash,...publicEpisode}=episode;return ok(c,{...publicEpisode,canEdit:true});
  });
  app.delete(`${base}/episodes/:id`,async c=>{
    const actor=getActor(c),id=uuid(c.req.param('id')),body=await jsonBody(c,z.object({version:z.number().int().positive()}).strict());
    await withUser(actor.id,async db=>{
      await requireRecordMutations(db);
      const current=(await db.query('SELECT * FROM health.care_episodes WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!current)throw new HttpError(404,'CARE_EPISODE_NOT_FOUND','ไม่พบเรื่องการดูแล');
      await writeAccess(db,current.pet_id);
      if(current.created_by!==actor.id&&!(await db.query('SELECT 1 WHERE public.is_pet_owner($1)',[current.pet_id])).rowCount)throw new HttpError(403,'CARE_EDIT_REQUIRED','ลบได้เฉพาะผู้เขียนหรือเจ้าของน้อง');
      if(body.version!==current.version)throw new HttpError(409,'VERSION_CONFLICT','เรื่องการดูแลนี้เปลี่ยนจากที่อื่นแล้ว กรุณาโหลดฉบับล่าสุดก่อนลบ');
      await db.query('DELETE FROM health.care_episodes WHERE id=$1',[id]);
    });return ok(c,{deleted:true,entriesPreserved:true});
  });
  app.get(`${base}/summary`,async c=>{
    const actor=getActor(c),petId=uuid(c.req.query('petId')),includeCosts=c.req.query('includeCosts');
    if(includeCosts!==undefined&&!['true','false'].includes(includeCosts))throw new HttpError(400,'VALIDATION_ERROR','includeCosts ต้องเป็น true หรือ false');
    const summary=await withUser(actor.id,async db=>{
      if(!(await db.query('SELECT id FROM pet.pets WHERE id=$1 AND public.is_pet_member(id)',[petId])).rowCount)throw new HttpError(404,'PET_NOT_FOUND','ไม่พบโปรไฟล์น้อง');
      return careSummary(db,petId,{sharedOnly:true,includeCosts:includeCosts==='true'});
    });return ok(c,summary);
  });
}
