import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Hono } from 'hono';
import { withUser, type PoolClient } from '@chordjai/db';
import { mediaUrl } from '@chordjai/media';
import { getActor, jsonBody, ok, uuid, HttpError, type ServiceEnv } from '@chordjai/service-kit';
import { PETID_CAPTURE_VERSION, PETID_TRAINING_POLICY_VERSION, petidCaptureSessionSchema, petidTrainingConsentSchema, type PetidCaptureSessionInput } from '@chordjai/contracts';

const base = '/api/v1/biometric/pets/:petId/research';
const digest = (body: unknown) => createHash('sha256').update(JSON.stringify(body)).digest('hex');
const utc = (field: string) => `to_char(${field} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const consentColumns = 'pet_id,owner_id,purpose,policy_version,granted,version,updated_at';
async function ownPet(db: PoolClient, petId: string, actorId: string) {
  const pet = (await db.query('SELECT id,species,microchip FROM pet.pets WHERE id=$1 AND owner_id=$2 FOR SHARE', [petId, actorId])).rows[0];
  if (!pet)
    throw new HttpError(403, 'PET_OWNER_REQUIRED', 'เฉพาะเจ้าของน้องเท่านั้นที่เก็บชุดรูปและจัดการความยินยอมได้');
  return pet;
}
async function consent(db: PoolClient, petId: string) {
  return (await db.query(`SELECT ${consentColumns} FROM biometric.training_consents WHERE pet_id=$1`, [petId])).rows[0]
    ?? { pet_id: petId, purpose: 'petid_model_training', policy_version: PETID_TRAINING_POLICY_VERSION, granted: false, version: 0, updated_at: null };
}
const sessionProjection = `s.id,s.pet_id,s.protocol_version,s.same_pet_confirmed,s.identity_basis,s.identity_status,s.review_status,s.sample_count,
  s.species,jsonb_build_object('hasMicrochip',s.microchip_fingerprint IS NOT NULL,'hasPetidEnrollment',s.enrollment_anchor_id IS NOT NULL,'provenance',s.anchor_provenance) AS identity_anchor,
  ${utc('s.created_at')} AS created_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'mediaId',p.media_id,'angle',p.angle,'capturedAt',${utc('p.captured_at')},
    'source',p.capture_source,'timeProvenance',p.time_provenance,'sourceProvenance',p.source_provenance,'uploadedAt',${utc('p.uploaded_at')}) ORDER BY p.position)
    FROM biometric.capture_samples p JOIN media.objects m ON m.id=p.media_id AND m.status='ready' WHERE p.session_id=s.id),'[]'::jsonb) AS samples`;
async function hydrateSession(row: Record<string, unknown>, actorId: string) {
  const samples = row.samples as { mediaId: string }[];
  return { ...row, samples: await Promise.all(samples.map(async sample => ({ ...sample, url: await mediaUrl({ id: sample.mediaId, user_id: actorId }) }))) };
}
async function getSession(db: PoolClient, id: string) {
  return (await db.query(`SELECT ${sessionProjection} FROM biometric.capture_sessions s WHERE s.id=$1`, [id])).rows[0];
}
export function validateCaptureDates(body: Pick<PetidCaptureSessionInput, 'samples'>, now = Date.now()) {
  for (const sample of body.samples) {
    const time = Date.parse(sample.capturedAt);
    if (!Number.isFinite(time) || time < Date.UTC(1900, 0, 1) || time > now)
      throw new HttpError(400, 'CAPTURE_DATE_INVALID', 'วันที่ถ่ายรูปต้องไม่อยู่ในอนาคตและต้องเป็นวันที่ถูกต้อง');
  }
}
function pageQuery(query: Record<string, string>) {
  const limit = query.limit === undefined ? 50 : Number(query.limit), before = query.before ?? null, beforeId = query.beforeId ?? null;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || query.limit !== undefined && !/^\d+$/.test(query.limit))
    throw new HttpError(400, 'VALIDATION_ERROR', 'จำนวนชุดรูปต้องอยู่ระหว่าง 1 ถึง 100');
  if (before !== null || beforeId !== null) {
    if (!before || !beforeId || !z.iso.datetime({ offset: true }).safeParse(before).success)
      throw new HttpError(400, 'VALIDATION_ERROR', 'ข้อมูลหน้าถัดไปไม่ถูกต้อง');
    uuid(beforeId);
  }
  return { limit, before, beforeId };
}

export function registerResearchRoutes(app: Hono<ServiceEnv>) {
  app.get(base, async c => {
    const actor = getActor(c), petId = uuid(c.req.param('petId')), page = pageQuery(c.req.query());
    const result = await withUser(actor.id, async db => {
      await ownPet(db, petId, actor.id);
      const rows = (await db.query(`SELECT ${sessionProjection} FROM biometric.capture_sessions s WHERE s.pet_id=$1 AND s.owner_id=$2
        AND ($3::timestamptz IS NULL OR (s.created_at,s.id)<($3::timestamptz,$4::uuid)) ORDER BY s.created_at DESC,s.id DESC LIMIT $5`,
      [petId, actor.id, page.before, page.beforeId, page.limit + 1])).rows;
      const stats = (await db.query(`SELECT (SELECT count(*)::int FROM biometric.capture_sessions WHERE pet_id=$1) AS session_count,
        count(DISTINCT p.angle)::int AS angle_count,count(DISTINCT (p.captured_at AT TIME ZONE 'Asia/Bangkok')::date)::int AS capture_day_count,
        count(*)::int AS ready_sample_count FROM biometric.capture_samples p JOIN biometric.capture_sessions s ON s.id=p.session_id
        JOIN media.objects m ON m.id=p.media_id AND m.status='ready' WHERE s.pet_id=$1`, [petId])).rows[0];
      const trainingEligibleCount = (await db.query(`SELECT count(*)::int AS count FROM biometric.capture_samples p
        JOIN biometric.capture_sessions s ON s.id=p.session_id JOIN biometric.training_consents c ON c.pet_id=s.pet_id AND c.owner_id=s.owner_id
        JOIN media.objects m ON m.id=p.media_id AND m.status='ready' WHERE s.pet_id=$1 AND c.granted AND c.policy_version=$2
          AND s.review_status='approved' AND s.review_consent_version=c.version
          AND s.sample_count=(SELECT count(*) FROM biometric.capture_samples p2 JOIN media.objects m2 ON m2.id=p2.media_id AND m2.status='ready' WHERE p2.session_id=s.id)`,
      [petId, PETID_TRAINING_POLICY_VERSION])).rows[0].count;
      const consentEvents = (await db.query('SELECT purpose,policy_version,granted,version,created_at FROM biometric.training_consent_events WHERE pet_id=$1 ORDER BY version DESC LIMIT 20', [petId])).rows;
      return { collectorVersion: PETID_CAPTURE_VERSION, policyVersion: PETID_TRAINING_POLICY_VERSION, consent: await consent(db, petId),
        sessions: rows.slice(0, page.limit), hasMore: rows.length > page.limit, trainingEligibleCount, stats, consentEvents,
        collectionNotice: 'Owner-attested photos and capture dates await independent review. No automatic model training or partner export.' };
    });
    return ok(c, { ...result, sessions: await Promise.all(result.sessions.map(row => hydrateSession(row, actor.id))) });
  });
  app.post(`${base}/sessions`, async c => {
    const actor = getActor(c), petId = uuid(c.req.param('petId')), body = await jsonBody(c, petidCaptureSessionSchema);
    validateCaptureDates(body);
    const session = await withUser(actor.id, async db => {
      const pet = await ownPet(db, petId, actor.id);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`petid-capture:${actor.id}:${body.requestId}`]);
      const existing = (await db.query('SELECT id,pet_id,create_hash FROM biometric.capture_sessions WHERE owner_id=$1 AND request_id=$2', [actor.id, body.requestId])).rows[0];
      if (existing) {
        if (existing.pet_id !== petId || existing.create_hash !== digest(body)) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'รหัสชุดรูปนี้ถูกใช้กับข้อมูลอื่นแล้ว');
        return getSession(db, existing.id);
      }
      const ids = body.samples.map(sample => sample.mediaId);
      const media = await db.query(`SELECT id,created_at FROM media.objects WHERE id=ANY($1::uuid[]) AND user_id=$2 AND pet_id=$3 AND status='ready' ORDER BY id FOR SHARE`, [ids, actor.id, petId]);
      if (media.rowCount !== ids.length) throw new HttpError(403, 'IMAGE_PET_MISMATCH', 'กรุณาใช้รูปที่คุณอัปโหลดสำหรับน้องตัวนี้เท่านั้น');
      if ((await db.query('SELECT id FROM biometric.capture_samples WHERE media_id=ANY($1::uuid[])', [ids])).rowCount)
        throw new HttpError(409, 'CAPTURE_IMAGE_REUSED', 'รูปนี้ถูกเก็บในชุดรูปแล้ว กรุณาถ่ายหรืออัปโหลดรูปใหม่');
      const enrollment = (await db.query('SELECT id FROM biometric.enrollments WHERE pet_id=$1 AND user_id=$2', [petId, actor.id])).rows[0];
      const microchipFingerprint = pet.microchip ? createHash('sha256').update(`${petId}:${pet.microchip}`).digest('hex') : null;
      const row = (await db.query(`INSERT INTO biometric.capture_sessions(pet_id,owner_id,request_id,create_hash,protocol_version,same_pet_confirmed,identity_basis,sample_count,species,enrollment_anchor_id,microchip_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [petId, actor.id, body.requestId, digest(body), body.protocolVersion, body.samePetConfirmed, body.identityBasis, body.samples.length,pet.species,enrollment?.id??null,microchipFingerprint])).rows[0];
      for (const [position, sample] of body.samples.entries()) await db.query(`INSERT INTO biometric.capture_samples(session_id,media_id,position,angle,captured_at,capture_source,uploaded_at)
        SELECT $1,m.id,$3,$4,$5,$6,m.created_at FROM media.objects m WHERE m.id=$2 AND m.user_id=$7 AND m.pet_id=$8 AND m.status='ready'`,
      [row.id, sample.mediaId, position, sample.angle, sample.capturedAt, sample.source, actor.id, petId]);
      return getSession(db, row.id);
    });
    return ok(c, await hydrateSession(session, actor.id), 201);
  });
  app.post(`${base}/consent`, async c => {
    const actor = getActor(c), petId = uuid(c.req.param('petId')), body = await jsonBody(c, petidTrainingConsentSchema);
    const result = await withUser(actor.id, async db => {
      await ownPet(db, petId, actor.id);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`petid-consent:${actor.id}:${petId}`]);
      const previous = (await db.query('SELECT pet_id,create_hash FROM biometric.training_consent_events WHERE owner_id=$1 AND request_id=$2', [actor.id, body.requestId])).rows[0];
      if (previous) {
        if (previous.pet_id !== petId || previous.create_hash !== digest(body)) throw new HttpError(409, 'IDEMPOTENCY_CONFLICT', 'รหัสความยินยอมนี้ถูกใช้กับข้อมูลอื่นแล้ว');
        // A retry after withdrawal cannot re-enable the old consent request.
        return consent(db, petId);
      }
      const current = await consent(db, petId);
      if (current.version !== body.expectedVersion) throw new HttpError(409, 'VERSION_CONFLICT', 'ความยินยอมถูกเปลี่ยนจากที่อื่น กรุณาโหลดสถานะล่าสุด');
      const nextVersion = current.version + 1;
      if (current.version === 0) await db.query('INSERT INTO biometric.training_consents(pet_id,owner_id,policy_version,granted,version) VALUES($1,$2,$3,$4,1)', [petId,actor.id,body.policyVersion,body.granted]);
      else await db.query('UPDATE biometric.training_consents SET policy_version=$3,granted=$4,version=$5,updated_at=now() WHERE pet_id=$1 AND owner_id=$2', [petId,actor.id,body.policyVersion,body.granted,nextVersion]);
      await db.query(`INSERT INTO biometric.training_consent_events(pet_id,owner_id,request_id,create_hash,policy_version,granted,version) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [petId, actor.id, body.requestId, digest(body), body.policyVersion, body.granted, nextVersion]);
      return consent(db, petId);
    });
    return ok(c, result);
  });
  app.delete(`${base}/sessions/:sessionId`, async c => {
    const actor = getActor(c), petId = uuid(c.req.param('petId')), sessionId = uuid(c.req.param('sessionId'));
    const result = await withUser(actor.id, async db => {
      await ownPet(db, petId, actor.id);
      return db.query('DELETE FROM biometric.capture_sessions WHERE id=$1 AND pet_id=$2 AND owner_id=$3 RETURNING id', [sessionId, petId, actor.id]);
    });
    if (!result.rowCount) throw new HttpError(404, 'CAPTURE_NOT_FOUND', 'ไม่พบชุดรูปนี้');
    return ok(c, { deleted: true });
  });
}
