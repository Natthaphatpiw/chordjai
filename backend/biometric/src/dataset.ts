import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Hono } from 'hono';
import { withSystem, type PoolClient } from '@chordjai/db';
import { loadOwnedImage } from '@chordjai/media';
import { PETID_TRAINING_POLICY_VERSION } from '@chordjai/contracts';
import { HttpError, getActor, jsonBody, ok, uuid, type ServiceEnv } from '@chordjai/service-kit';
import { trainingEligibleSamples } from './review.js';

export const DATASET_VERSION='petid-dataset-v1';
export function canonicalJson(value: unknown): string {
  if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;
  if(value!==null&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson((value as Record<string,unknown>)[key])}`).join(',')}}`;
  if(typeof value==='number'&&!Number.isSafeInteger(value))throw new Error('Dataset metadata must contain only safe integer numbers');
  return JSON.stringify(value);
}
export const sha256=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
type Eligible={sample_id:string;session_id:string;pet_id:string;owner_id:string;media_id:string;check_id:string;review_id:string;consent_version:number;species:string;angle:string;captured_at:string|Date;capture_day:string;image_sha256:string;decoded_sha256:string;dhash64:string;width:number;height:number};
type ManifestSample={sampleId:string;sessionId:string;petKey:string;ownerKey:string;species:string;angle:string;captureDay:string;capturedAt:string;imageSha256:string;decodedSha256:string;dhash64:string;width:number;height:number;consentVersion:number;checkId:string;reviewId:string};
type Manifest={version:typeof DATASET_VERSION;exportId:string;createdAt:string;policyVersion:string;samples:ManifestSample[]};
const base='/api/v1/biometric/review/datasets';
async function admin(db:PoolClient,id:string){
  const row=(await db.query(`select u.id from identity.users u where u.id=$1 and u.role='admin' and u.status='active'
    and exists(select 1 from identity.consents c where c.user_id=u.id and c.purpose='service' and c.granted) for share`,[id])).rows[0];
  if(!row)throw new HttpError(403,'FORBIDDEN','เฉพาะผู้ดูแลระบบที่ยังมีสิทธิ์และความยินยอมเพื่อให้บริการ');
}
function snapshot(row:Eligible,salt:string):ManifestSample{
  return {sampleId:row.sample_id,sessionId:row.session_id,petKey:sha256(`${salt}:pet:${row.pet_id}`),ownerKey:sha256(`${salt}:owner:${row.owner_id}`),
    species:row.species,angle:row.angle,captureDay:row.capture_day,capturedAt:new Date(row.captured_at).toISOString(),imageSha256:row.image_sha256,
    decodedSha256:row.decoded_sha256,dhash64:row.dhash64,width:Number(row.width),height:Number(row.height),consentVersion:Number(row.consent_version),checkId:row.check_id,reviewId:row.review_id};
}
function evidenceMatches(sample:ManifestSample,row:Eligible){
  return sample.sessionId===row.session_id&&sample.species===row.species&&sample.angle===row.angle&&sample.captureDay===row.capture_day
    &&sample.capturedAt===new Date(row.captured_at).toISOString()&&sample.imageSha256===row.image_sha256&&sample.decodedSha256===row.decoded_sha256
    &&sample.dhash64===row.dhash64&&sample.width===Number(row.width)&&sample.height===Number(row.height)&&sample.consentVersion===Number(row.consent_version)
    &&sample.checkId===row.check_id&&sample.reviewId===row.review_id;
}
async function current(db:PoolClient,actorId:string,exportId:string,hash?:string){
  await admin(db,actorId);
  const record=(await db.query('select * from biometric.dataset_exports where id=$1 and creator_id=$2 and expires_at>now() for share',[exportId,actorId])).rows[0];
  if(!record)throw new HttpError(410,'DATASET_INVALIDATED','ชุดข้อมูลหมดอายุ ถูกถอนสิทธิ์ หรือไม่พร้อมใช้ กรุณาสร้างชุดใหม่หลังตรวจสิทธิ์');
  const manifest=record.manifest as Manifest;
  if(manifest.version!==DATASET_VERSION||manifest.exportId!==exportId||!manifest.samples.length||sha256(canonicalJson(manifest))!==record.manifest_sha256||hash&&hash!==record.manifest_sha256)
    throw new HttpError(409,'DATASET_MANIFEST_MISMATCH','เอกสารชุดข้อมูลไม่ตรงกับที่ระบบอนุญาต');
  const rows=await trainingEligibleSamples(db,500,manifest.samples.map(s=>s.sampleId)) as Eligible[];
  const map=new Map(rows.map(row=>[row.sample_id,row]));
  if(rows.length!==manifest.samples.length||manifest.samples.some(sample=>!map.has(sample.sampleId)||!evidenceMatches(sample,map.get(sample.sampleId)!)))
    throw new HttpError(410,'DATASET_INVALIDATED','หลักฐานหรือความยินยอมของชุดข้อมูลเปลี่ยนแล้ว หยุดใช้ชุดนี้');
  const lineage=(await db.query('select * from biometric.dataset_export_samples where export_id=$1',[exportId])).rows;
  if(lineage.length!==rows.length||lineage.some(item=>{const row=map.get(item.sample_id);return !row||row.owner_id!==item.owner_id||row.pet_id!==item.pet_id||row.media_id!==item.media_id||row.session_id!==item.session_id||row.check_id!==item.check_id||row.review_id!==item.review_id||Number(row.consent_version)!==Number(item.consent_version);} ))
    throw new HttpError(410,'DATASET_INVALIDATED','ที่มาของชุดข้อมูลเปลี่ยนแล้ว');
  return {record,manifest,rows};
}
export function registerDatasetRoutes(app:Hono<ServiceEnv>){
  app.post(base,async c=>{
    const actor=getActor(c),body=await jsonBody(c,z.object({requestId:z.uuid(),limit:z.number().int().min(1).max(500).default(500)}));
    const result=await withSystem(async db=>{
      await admin(db,actor.id);
      await db.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`petid-export:${actor.id}:${body.requestId}`]);
      await db.query('delete from biometric.dataset_exports where expires_at<=now()');
      const prior=(await db.query('select id,request_hash from biometric.dataset_exports where creator_id=$1 and request_id=$2',[actor.id,body.requestId])).rows[0];
      const requestHash=sha256(canonicalJson(body));
      if(prior){if(prior.request_hash!==requestHash)throw new HttpError(409,'IDEMPOTENCY_CONFLICT','คำขอชุดข้อมูลซ้ำมีข้อมูลต่างกัน');const value=await current(db,actor.id,prior.id);return {manifest:value.manifest,manifestSha256:value.record.manifest_sha256,expiresAt:value.record.expires_at};}
      const rows=await trainingEligibleSamples(db,body.limit) as Eligible[];
      if(!rows.length)throw new HttpError(422,'DATASET_EMPTY','ยังไม่มีภาพที่ผ่านการตรวจและมีความยินยอมรุ่นปัจจุบัน');
      const id=randomUUID(),salt=randomUUID(),createdAt=new Date().toISOString();
      const manifest:Manifest={version:DATASET_VERSION,exportId:id,createdAt,policyVersion:PETID_TRAINING_POLICY_VERSION,samples:rows.map(row=>snapshot(row,salt))};
      const hash=sha256(canonicalJson(manifest));
      const record=(await db.query('insert into biometric.dataset_exports(id,creator_id,request_id,request_hash,manifest,manifest_sha256,created_at) values($1,$2,$3,$4,$5,$6,$7) returning expires_at',[id,actor.id,body.requestId,requestHash,manifest,hash,createdAt])).rows[0];
      await db.query(`insert into biometric.dataset_export_samples(export_id,sample_id,media_id,session_id,owner_id,pet_id,check_id,review_id,consent_version,export_created_at)
        select $1,x.sample_id,x.media_id,x.session_id,x.owner_id,x.pet_id,x.check_id,x.review_id,x.consent_version,$3::timestamptz
        from jsonb_to_recordset($2::jsonb) as x(sample_id uuid,media_id uuid,session_id uuid,owner_id uuid,pet_id uuid,check_id uuid,review_id uuid,consent_version integer)`,[id,JSON.stringify(rows),createdAt]);
      // Recheck after storing lineage, so a concurrent revocation cannot mint a usable snapshot.
      await current(db,actor.id,id,hash);
      return {manifest,manifestSha256:hash,expiresAt:record.expires_at};
    });
    return ok(c,result,201);
  });
  app.get(`${base}/:exportId`,async c=>{
    const actor=getActor(c),id=uuid(c.req.param('exportId'));
    const result=await withSystem(async db=>{const value=await current(db,actor.id,id);return {manifest:value.manifest,manifestSha256:value.record.manifest_sha256,expiresAt:value.record.expires_at};});
    return ok(c,result);
  });
  app.post(`${base}/:exportId/authorize`,async c=>{
    const actor=getActor(c),id=uuid(c.req.param('exportId')),body=await jsonBody(c,z.object({manifestSha256:z.string().regex(/^[a-f0-9]{64}$/)}));
    const result=await withSystem(async db=>{const value=await current(db,actor.id,id,body.manifestSha256);return {authorized:true,exportId:id,manifestSha256:value.record.manifest_sha256,checkedAt:new Date().toISOString(),expiresAt:value.record.expires_at};});
    return ok(c,result);
  });
  app.get(`${base}/:exportId/samples/:sampleId`,async c=>{
    const actor=getActor(c),id=uuid(c.req.param('exportId')),sampleId=uuid(c.req.param('sampleId'));
    const selected=await withSystem(async db=>{const value=await current(db,actor.id,id);const row=value.rows.find(row=>row.sample_id===sampleId);if(!row)throw new HttpError(404,'NOT_FOUND','รูปนี้ไม่อยู่ในชุดข้อมูลที่อนุญาต');return row;});
    const image=await loadOwnedImage(selected.owner_id,selected.media_id);
    const bytes=Buffer.from(image.split(',')[1]??'','base64');
    if(!bytes.length||sha256(bytes)!==selected.image_sha256)throw new HttpError(410,'DATASET_IMAGE_CHANGED','ข้อมูลรูปไม่ตรงกับหลักฐานที่ตรวจไว้');
    await withSystem(async db=>{const value=await current(db,actor.id,id);if(!value.rows.some(row=>row.sample_id===sampleId&&row.media_id===selected.media_id&&row.owner_id===selected.owner_id))throw new HttpError(410,'DATASET_INVALIDATED','สิทธิ์ของรูปเปลี่ยนแล้ว');});
    c.header('Content-Type','image/jpeg');c.header('Cache-Control','private, no-store');c.header('Referrer-Policy','no-referrer');
    return c.body(new Uint8Array(bytes));
  });
}
