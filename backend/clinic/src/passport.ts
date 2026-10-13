import { createHash } from 'node:crypto';
import type { Hono } from 'hono';
import { withUser, type PoolClient } from '@chordjai/db';
import { readMedia } from '@chordjai/media';
import { passportClinicNoteSchema,type PassportSnapshot } from '@chordjai/contracts';
import { getActor, HttpError, jsonBody, ok, uuid,type ServiceEnv } from '@chordjai/service-kit';

type Snapshot={id:string;session_id:string;pet_id:string;owner_id:string;session_version:number;document:PassportSnapshot;confirmed_at:Date|string;can_write?:boolean};
const missing=()=>new HttpError(403,'PASSPORT_GRANT_REQUIRED','เจ้าของต้องยืนยัน Passport และให้คลินิกนี้มีสิทธิ์ที่ยังไม่หมดอายุ');
async function access(db:PoolClient,sessionId:string,clinicId:string,scope='passport.read'){
  const allowed=(await db.query('SELECT health.passport_clinic_access($1,$2,$3) AS allowed',[sessionId,clinicId,scope])).rows[0]?.allowed;
  if(!allowed)throw missing();
}
async function currentSnapshot(db:PoolClient,sessionId:string,clinicId:string){
  await access(db,sessionId,clinicId);
  const value=(await db.query<Snapshot>('SELECT p.* FROM health.passport_snapshots p JOIN health.passport_sessions s ON s.current_snapshot_id=p.id WHERE s.id=$1',[sessionId])).rows[0];
  if(!value)throw missing();return value;
}
function snapshotProjection(value:Snapshot){return{id:value.id,sessionId:value.session_id,petId:value.pet_id,sessionVersion:value.session_version,document:value.document,confirmedAt:value.confirmed_at};}
async function audit(db:PoolClient,actorId:string,action:string,snapshotId:string){await db.query('INSERT INTO identity.audit_log(actor_id,action,resource_type,resource_id) VALUES($1,$2,\'passport_snapshot\',$3)',[actorId,action,snapshotId]);}

export function registerClinicPassportRoutes(app:Hono<ServiceEnv>){
  app.get('/api/v1/clinic/pets/:petId/passports',async c=>{
    const actor=getActor(c),petId=uuid(c.req.param('petId')),clinicId=uuid(c.req.query('clinicId'));
    const result=await withUser(actor.id,async db=>{
      const member=(await db.query('SELECT m.role FROM clinic.members m JOIN clinic.clinics c ON c.id=m.clinic_id WHERE m.clinic_id=$1 AND m.user_id=$2 AND c.verified_at IS NOT NULL',[clinicId,actor.id])).rows[0];
      if(!member)throw missing();
      const rows=(await db.query<Snapshot>("SELECT p.id,p.session_id,p.pet_id,p.session_version,p.confirmed_at,jsonb_build_object('pet',jsonb_build_object('name',p.document->'pet'->'name','species',p.document->'pet'->'species'),'concern',p.document->'concern') AS document,health.passport_clinic_access(s.id,$2,'passport.write') AS can_write FROM health.passport_snapshots p JOIN health.passport_sessions s ON s.current_snapshot_id=p.id WHERE s.pet_id=$1 AND health.passport_clinic_access(s.id,$2,'passport.read') ORDER BY p.confirmed_at DESC,p.id DESC LIMIT 100",[petId,clinicId])).rows;
      return {clinicId,sessions:rows.map(row=>({...snapshotProjection(row),canWrite:row.can_write}))};
    });return ok(c,result);
  });
  app.get('/api/v1/clinic/passports/:sessionId',async c=>{
    const actor=getActor(c),sessionId=uuid(c.req.param('sessionId')),clinicId=uuid(c.req.query('clinicId'));
    const result=await withUser(actor.id,async db=>{
      const snapshot=await currentSnapshot(db,sessionId,clinicId);
      const noteRows=(await db.query("SELECT n.id,n.session_id,n.clinic_id,c.name AS clinic_name,n.author_id,n.findings,n.treatment,n.care_instructions,n.next_followup_at,n.created_at,n.snapshot_id,'clinician_authored' AS provenance FROM health.passport_clinic_notes n JOIN clinic.clinics c ON c.id=n.clinic_id WHERE n.session_id=$1 AND n.clinic_id=$2 ORDER BY n.created_at DESC,n.id DESC LIMIT 101",[sessionId,clinicId])).rows;
      const notes=noteRows.slice(0,100).reverse();
      const media=(await db.query('SELECT media_id FROM health.passport_snapshot_media WHERE snapshot_id=$1 ORDER BY position',[snapshot.id])).rows.map(row=>({id:row.media_id,url:`/api/v1/clinic/passports/${sessionId}/media/${row.media_id}?clinicId=${clinicId}`}));
      const canWrite=(await db.query("SELECT health.passport_clinic_access($1,$2,'passport.write') AS allowed",[sessionId,clinicId])).rows[0].allowed;
      await audit(db,actor.id,'clinic.passport.read',snapshot.id);return{snapshot:snapshotProjection(snapshot),notes,notesTruncated:noteRows.length>100,media,clinicId,canWrite};
    });return ok(c,result);
  });
  app.get('/api/v1/clinic/passports/:sessionId/media/:mediaId',async c=>{
    const actor=getActor(c),sessionId=uuid(c.req.param('sessionId')),mediaId=uuid(c.req.param('mediaId')),clinicId=uuid(c.req.query('clinicId'));
    async function permitted(){return withUser(actor.id,async db=>{
      await access(db,sessionId,clinicId);
      const value=(await db.query<{id:string;user_id:string;snapshot_id:string}>('SELECT * FROM health.passport_clinic_media($1,$2,$3)',[sessionId,clinicId,mediaId])).rows[0];
      if(!value)throw new HttpError(404,'PASSPORT_PHOTO_UNAVAILABLE','รูปนี้ไม่พร้อมหรือไม่มีสิทธิ์ใน Passport ปัจจุบัน');return value;
    });}
    const before=await permitted(),bytes=await readMedia(before.id,before.user_id),after=await permitted();
    if(before.snapshot_id!==after.snapshot_id||before.user_id!==after.user_id)throw new HttpError(409,'PASSPORT_CHANGED','Passport เปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุด');
    await withUser(actor.id,db=>audit(db,actor.id,'clinic.passport.photo.read',after.snapshot_id));
    c.header('Cache-Control','private, no-store');c.header('Content-Type','image/jpeg');c.header('X-Content-Type-Options','nosniff');return c.body(new Uint8Array(bytes));
  });
  app.post('/api/v1/clinic/passports/:sessionId/notes',async c=>{
    const actor=getActor(c),sessionId=uuid(c.req.param('sessionId')),body=await jsonBody(c,passportClinicNoteSchema);
    const hash=createHash('sha256').update(JSON.stringify({sessionId,...body})).digest('hex');
    const note=await withUser(actor.id,async db=>{
      await access(db,sessionId,body.clinicId,'passport.write');
      const snapshot=await currentSnapshot(db,sessionId,body.clinicId);
      if(snapshot.id!==body.snapshotId)throw new HttpError(409,'PASSPORT_CHANGED','Passport เปลี่ยนแล้ว กรุณาอ่านและตรวจข้อมูลล่าสุดก่อนบันทึก');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`passport-note:${actor.id}:${body.clientNoteId}`]);
      const existing=(await db.query('SELECT * FROM health.passport_clinic_notes WHERE author_id=$1 AND client_note_id=$2',[actor.id,body.clientNoteId])).rows[0];
      if(existing){if(existing.create_hash!==hash)throw new HttpError(409,'IDEMPOTENCY_CONFLICT','คำขอเดิมมีข้อมูลต่างกัน');return existing;}
      const value=(await db.query('INSERT INTO health.passport_clinic_notes(session_id,snapshot_id,pet_id,clinic_id,author_id,client_note_id,create_hash,findings,treatment,care_instructions,next_followup_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',[sessionId,snapshot.id,snapshot.pet_id,body.clinicId,actor.id,body.clientNoteId,hash,body.findings,body.treatment,body.careInstructions,body.nextFollowupAt])).rows[0];
      await audit(db,actor.id,'clinic.passport.note.create',snapshot.id);return value;
    });return ok(c,note,201);
  });
}
