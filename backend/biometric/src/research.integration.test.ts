import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closeDatabase, withSystem, withUser } from '@chordjai/db';
import { signSession } from '@chordjai/auth';
import { PETID_CAPTURE_VERSION, PETID_TRAINING_POLICY_VERSION } from '@chordjai/contracts';
import app from './app';
import mediaApp from '../../media/src/app';

const url = process.env.TEST_DATABASE_URL;
const isolated = !!url && ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname);
describe.skipIf(!isolated)('PetID longitudinal collector on isolated PostgreSQL', () => {
  const owner = randomUUID(), viewer = randomUUID(), outsider = randomUUID(), pet = randomUUID(), otherPet = randomUUID();
  const images = Array.from({ length: 40 }, () => randomUUID()), wrong = randomUUID(), missing = randomUUID();
  const tokens = new Map<string, string>();
  let firstSession = '', consentVersion = 0;
  const path = (petId = pet) => `/api/v1/biometric/pets/${petId}/research`;
  const sample = (mediaId: string, angle = 'front', capturedAt = '2026-01-01T08:00:00+07:00') => ({ mediaId, angle, capturedAt, source: 'library' });
  const capture = (photos = [sample(images[0]!)]) => ({ requestId: randomUUID(), protocolVersion: PETID_CAPTURE_VERSION, samePetConfirmed: true, identityBasis: 'owner_recognition', samples: photos });
  const choice = (granted: boolean, expectedVersion = consentVersion) => ({ requestId: randomUUID(), policyVersion: PETID_TRAINING_POLICY_VERSION, granted, expectedVersion });
  async function call(endpoint: string, actor = owner, method = 'GET', body?: unknown, key = randomUUID()) {
    const response = await app.request(endpoint, { method, headers: { Authorization: `Bearer ${tokens.get(actor)}`, 'Accept-Language': 'en', ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', url!); vi.stubEnv('APP_JWT_SECRET', 'petid-research-isolated-secret-longer-than-32-characters');
    vi.stubEnv('APP_JWT_ISSUER', 'https://www.chordjai.life');
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live providers are forbidden in collector tests'); }));
    await withSystem(async db => {
      for (const user of [owner, viewer, outsider]) await db.query("INSERT INTO identity.users(id,line_user_id,display_name) VALUES($1,$2,'Research Fixture')", [user, `capture-test-${user}`]);
      for (const id of [pet, otherPet]) await db.query("INSERT INTO pet.pets(id,owner_id,name,species,microchip) VALUES($1,$2,'Research Cat','cat','123456789012345')", [id, owner]);
      await db.query("INSERT INTO pet.members(pet_id,user_id,role) VALUES($1,$2,'viewer')", [pet, viewer]);
      for (const image of [...images, wrong, missing]) await db.query("INSERT INTO media.objects(id,user_id,pet_id,pathname,mime,size,status) VALUES($1,$2,$3,$4,'image/jpeg',100,$5)", [image, owner, image === wrong ? otherPet : pet, `u/${owner}/${image}.jpg`, image === missing ? 'deleted' : 'ready']);
    });
    for (const user of [owner, viewer, outsider]) tokens.set(user, await signSession({ id: user, role: 'owner' }));
  });
  afterAll(async () => {
    await withSystem(async db => { await db.query('DELETE FROM identity.users WHERE id=ANY($1::uuid[])', [[owner, viewer, outsider]]); await db.query('DELETE FROM ops.jobs WHERE dedupe_key=ANY($1::text[])', [[...images, wrong, missing].map(id => `media-delete:${id}`)]); });
    await closeDatabase(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  });
  it('starts with separate declined training consent and stores photos without consenting', async () => {
    const initial = await call(path()); expect(initial.status).toBe(200); expect(initial.body.data.consent).toMatchObject({ granted: false, version: 0, purpose: 'petid_model_training' });
    const body = capture([sample(images[0]!, 'front'), sample(images[1]!, 'left'), sample(images[2]!, 'right')]);
    const created = await call(`${path()}/sessions`, owner, 'POST', body); expect(created.status).toBe(201); firstSession = created.body.data.id;
    expect(created.body.data).toMatchObject({ identityStatus: 'owner_attested_unverified', reviewStatus: 'pending', samePetConfirmed: true, species: 'cat', sampleCount: 3 });
    expect(created.body.data.identityAnchor).toMatchObject({ hasMicrochip: true, provenance: 'owner_record_unverified' });
    expect(created.body.data.samples.map((row: { angle: string }) => row.angle)).toEqual(['front', 'left', 'right']);
    expect(created.body.data.samples[0]).toMatchObject({ capturedAt: '2026-01-01T01:00:00.000000Z', timeProvenance: 'owner_declared', sourceProvenance: 'owner_declared' });
    expect(JSON.stringify(created.body)).not.toContain('123456789012345'); expect(created.body.data).not.toHaveProperty('microchipFingerprint');
    const current = await call(path()); expect(current.body.data.trainingEligibleCount).toBe(0); expect(current.body.data.consent.granted).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('supports one to five distinct photos and rejects missing attestation, six and duplicate images', async () => {
    let offset = 3;
    for (let count = 1; count <= 5; count++) { expect((await call(`${path()}/sessions`, owner, 'POST', capture(images.slice(offset, offset + count).map(id => sample(id))))).status).toBe(201); offset += count; }
    for (const samples of [[], images.slice(18, 24).map(id => sample(id)), [sample(images[20]!), sample(images[20]!)]]) expect((await call(`${path()}/sessions`, owner, 'POST', capture(samples))).status).toBe(400);
    expect((await call(`${path()}/sessions`, owner, 'POST', { ...capture([sample(images[20]!)]), samePetConfirmed: false })).status).toBe(400);
  });
  it('rejects cross-pet/deleted media and prevents viewers or strangers from collection and consent', async () => {
    for (const image of [wrong, missing, randomUUID()]) expect((await call(`${path()}/sessions`, owner, 'POST', capture([sample(image)]))).body.error.code).toBe('IMAGE_PET_MISMATCH');
    for (const user of [viewer, outsider]) {
      expect((await call(path(), user)).status).toBe(403);
      expect((await call(`${path()}/sessions`, user, 'POST', capture([sample(images[20]!)]))).status).toBe(403);
      expect((await call(`${path()}/consent`, user, 'POST', choice(true))).status).toBe(403);
      for (const table of ['capture_sessions', 'capture_samples', 'training_consents', 'training_consent_events']) expect(await withUser(user, async db => (await db.query(`SELECT * FROM biometric.${table}`)).rows)).toEqual([]);
    }
  });
  it('deduplicates domain requests even after HTTP cache loss and rejects altered retries or reused media', async () => {
    const body = capture([sample(images[18]!)]), first = await call(`${path()}/sessions`, owner, 'POST', body);
    expect(first.status).toBe(201); await withSystem(db => db.query('DELETE FROM ops.idempotency WHERE user_id=$1', [owner]));
    const replies = await Promise.all([call(`${path()}/sessions`, owner, 'POST', body), call(`${path()}/sessions`, owner, 'POST', body)]);
    for (const response of replies) expect(response.body.data.id).toBe(first.body.data.id);
    expect((await call(`${path()}/sessions`, owner, 'POST', { ...body, samples: [sample(images[19]!)] })).status).toBe(409);
    expect((await call(`${path()}/sessions`, owner, 'POST', capture([sample(images[18]!)]))).body.error.code).toBe('CAPTURE_IMAGE_REUSED');
  });
  it('preserves new capture days and keyset cursor precision at repeated creation times', async () => {
    const first = await call(`${path()}/sessions`, owner, 'POST', capture([sample(images[19]!, 'full_body', '2026-02-01T08:00:00.123456+07:00')])); expect(first.status).toBe(201);
    expect(first.body.data.samples[0].capturedAt).toBe('2026-02-01T01:00:00.123456Z');
    const seen: string[] = []; let cursor = '';
    for (let index = 0; index < 20; index++) {
      const result = await call(`${path()}?limit=2${cursor}`); expect(result.status).toBe(200); const rows = result.body.data.sessions;
      seen.push(...rows.map((row: { id: string }) => row.id)); if (!result.body.data.hasMore) break;
      const last = rows.at(-1); cursor = `&before=${encodeURIComponent(last.createdAt)}&beforeId=${last.id}`;
    }
    const expected = await withUser(owner, async db => (await db.query('SELECT id FROM biometric.capture_sessions WHERE pet_id=$1 ORDER BY created_at DESC,id DESC', [pet])).rows.map(row => row.id));
    expect(seen).toEqual(expected); expect(new Set(seen).size).toBe(expected.length);
    expect((await call(path())).body.data.stats.captureDayCount).toBe(2);
    for (const suffix of ['?limit=0', '?limit=101', '?limit=1.5', '?before=2026-01-01', '?beforeId=bad']) expect((await call(`${path()}${suffix}`)).status).toBe(400);
  });
  it('rejects future timestamps both at the API and database boundary', async () => {
    const invalid = await call(`${path()}/sessions`, owner, 'POST', capture([sample(images[20]!, 'front', new Date(Date.now() + 86400000).toISOString())])); expect(invalid.status).toBe(400);
    await expect(withUser(owner, async db => {
      const row = (await db.query("INSERT INTO biometric.capture_sessions(pet_id,owner_id,request_id,create_hash,protocol_version,same_pet_confirmed,identity_basis,species,sample_count) VALUES($1,$2,$3,repeat('a',64),'petid-capture-v1',true,'owner_recognition','cat',1) RETURNING id", [pet, owner, randomUUID()])).rows[0];
      await db.query("INSERT INTO biometric.capture_samples(session_id,media_id,position,angle,captured_at,capture_source,uploaded_at) SELECT $1,id,0,'front',now()+interval '1 day','library',created_at FROM media.objects WHERE id=$2", [row.id, images[20]]);
    })).rejects.toMatchObject({ code: '23514' });
  });
  it('keeps microseconds in session cursors and rejects SQL-level cross-pet attachments', async () => {
    const ids = [randomUUID(), randomUUID(), randomUUID()], fractions = ['000900','000800','000700'];
    const baseTime = new Date(Date.now() - 2 * 86400000).toISOString().slice(0,19);
    await withSystem(async db => {
      for (const [index,id] of ids.entries()) {
        await db.query("INSERT INTO biometric.capture_sessions(id,pet_id,owner_id,request_id,create_hash,protocol_version,same_pet_confirmed,identity_basis,species,sample_count,created_at) VALUES($1,$2,$3,$4,repeat('b',64),'petid-capture-v1',true,'owner_recognition','cat',1,$5)", [id,pet,owner,randomUUID(),`${baseTime}.${fractions[index]}Z`]);
        await db.query("INSERT INTO biometric.capture_samples(session_id,media_id,position,angle,captured_at,capture_source,uploaded_at) SELECT $1,id,0,'front','2026-01-01T08:00:00+07:00','library',created_at FROM media.objects WHERE id=$2", [id,images[21+index]]);
      }
    });
    const first = await call(`${path()}?limit=2&before=${encodeURIComponent(`${baseTime}.001000Z`)}&beforeId=${randomUUID()}`);
    expect(first.body.data.sessions.map((row:{id:string})=>row.id)).toEqual(ids.slice(0,2));
    const last=first.body.data.sessions.at(-1); expect(last.createdAt).toBe(`${baseTime}.000800Z`);
    const second=await call(`${path()}?limit=2&before=${encodeURIComponent(last.createdAt)}&beforeId=${last.id}`); expect(second.body.data.sessions.map((row:{id:string})=>row.id)).toEqual(ids.slice(2));
    await expect(withUser(owner,async db=>{
      const row=(await db.query("INSERT INTO biometric.capture_sessions(pet_id,owner_id,request_id,create_hash,protocol_version,same_pet_confirmed,identity_basis,species,sample_count) VALUES($1,$2,$3,repeat('c',64),'petid-capture-v1',true,'owner_recognition','cat',1) RETURNING id",[pet,owner,randomUUID()])).rows[0];
      await db.query("INSERT INTO biometric.capture_samples(session_id,media_id,position,angle,captured_at,capture_source,uploaded_at) SELECT $1,id,0,'front','2026-01-01T08:00:00+07:00','library',created_at FROM media.objects WHERE id=$2",[row.id,wrong]);
    })).rejects.toMatchObject({code:'42501'});
  });
  it('prevents SQL approval forgery, mutable submitted sets and unaudited consent changes', async () => {
    await expect(withUser(owner, db => db.query("UPDATE biometric.capture_sessions SET review_status='approved' WHERE id=$1", [firstSession]))).rejects.toMatchObject({ code: '42501' });
    await expect(withUser(owner, db => db.query("INSERT INTO biometric.capture_samples(session_id,media_id,position,angle,captured_at,capture_source,uploaded_at) SELECT $1,id,3,'full_body','2026-01-01','library',created_at FROM media.objects WHERE id=$2", [firstSession, images[20]]))).rejects.toMatchObject({ code: '23514' });
    await expect(withUser(owner, db => db.query("INSERT INTO biometric.training_consents(pet_id,owner_id,policy_version,granted) VALUES($1,$2,$3,true)", [pet, owner, PETID_TRAINING_POLICY_VERSION]))).rejects.toMatchObject({ code: '23514' });
    const forced = await withSystem(async db => (await db.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='biometric' AND c.relname=ANY($1::text[]) AND c.relrowsecurity AND c.relforcerowsecurity", [['capture_sessions','capture_samples','training_consents','training_consent_events']])).rows[0].count); expect(forced).toBe(4);
  });
  it('keeps training consent distinct, versions it, and requires review before any eligible samples', async () => {
    await withUser(owner, db => db.query("INSERT INTO identity.consents(user_id,purpose,granted,version) VALUES($1,'ai_improvement',true,'legacy')", [owner]));
    expect((await call(path())).body.data.consent.granted).toBe(false);
    const accepted = await call(`${path()}/consent`, owner, 'POST', choice(true)); expect(accepted.status).toBe(200); expect(accepted.body.data.version).toBe(1); consentVersion = 1;
    expect((await call(path())).body.data.trainingEligibleCount).toBe(0);
    expect((await call(`${path()}/consent`, owner, 'POST', choice(false, 0))).status).toBe(409);
    expect((await call(`${path()}/consent`, owner, 'POST', { ...choice(true), policyVersion: 'unknown' })).status).toBe(400);
    expect(await withSystem(async db => (await db.query('SELECT granted,version FROM biometric.training_consent_events WHERE pet_id=$1 ORDER BY version', [pet])).rows)).toEqual([{ granted: true, version: 1 }]);
  });
  it('withdrawal invalidates ALL review epochs; an old retried grant cannot re-enable consent', async () => {
    const oldGrant = choice(true), oldHttpKey=randomUUID(); const granted = await call(`${path()}/consent`, owner, 'POST', oldGrant,oldHttpKey); expect(granted.status).toBe(200); consentVersion = 2;
    await withSystem(db => db.query("UPDATE biometric.capture_sessions SET review_status='approved',review_consent_version=$2 WHERE pet_id=$1", [pet, consentVersion]));
    expect((await call(path())).body.data.trainingEligibleCount).toBeGreaterThan(0);
    const withdrawn = await call(`${path()}/consent`, owner, 'POST', choice(false)); expect(withdrawn.status).toBe(200); expect(withdrawn.body.data.version).toBe(3); consentVersion = 3;
    const view = await call(path()); expect(view.body.data.trainingEligibleCount).toBe(0); expect(view.body.data.sessions.every((row: { reviewStatus: string }) => row.reviewStatus === 'pending')).toBe(true);
    const replayed = await call(`${path()}/consent`, owner, 'POST', oldGrant,oldHttpKey); expect(replayed.status).toBe(200); expect(replayed.body.data.granted).toBe(false); expect(replayed.body.data.version).toBe(3);
    const rejoined = await call(`${path()}/consent`, owner, 'POST', choice(true)); expect(rejoined.status).toBe(200); consentVersion = 4; expect((await call(path())).body.data.trainingEligibleCount).toBe(0);
  });
  it('photo erasure invalidates the full reviewed set including non-primary images', async () => {
    await withSystem(db => db.query("UPDATE biometric.capture_sessions SET review_status='approved',review_consent_version=$2 WHERE id=$1", [firstSession, consentVersion]));
    const response = await mediaApp.request(`/api/v1/media/${images[1]}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tokens.get(owner)}` } }); expect(response.status).toBe(200);
    const result = await call(path()); const session = result.body.data.sessions.find((row: { id: string }) => row.id === firstSession);
    expect(session.reviewStatus).toBe('pending'); expect(session.samples.map((row: { mediaId: string }) => row.mediaId)).toEqual([images[0], images[2]]); expect(result.body.data.trainingEligibleCount).toBe(0);
    expect(await withSystem(async db => (await db.query('SELECT review_consent_version FROM biometric.capture_sessions WHERE id=$1', [firstSession])).rows[0].review_consent_version)).toBeNull();
  });
  it('deletes immutable sets without deleting shared original media, and account erasure cascades all lineage', async () => {
    expect((await call(`${path()}/sessions/${firstSession}`, viewer, 'DELETE')).status).toBe(403);
    expect((await call(`${path()}/sessions/${firstSession}`, owner, 'DELETE')).status).toBe(200);
    expect(await withSystem(async db => (await db.query("SELECT id FROM media.objects WHERE id=$1 AND status='ready'", [images[0]])).rowCount)).toBe(1);
    await withSystem(db => db.query('DELETE FROM identity.users WHERE id=$1', [owner]));
    for (const table of ['capture_sessions','training_consents','training_consent_events']) expect(await withSystem(async db => (await db.query(`SELECT id FROM ${table === 'training_consents' ? '(SELECT pet_id AS id,owner_id FROM biometric.training_consents)' : `biometric.${table}`} AS t WHERE owner_id=$1`, [owner])).rows)).toEqual([]);
    expect(await withSystem(async db => (await db.query('SELECT id FROM biometric.capture_samples WHERE media_id=ANY($1::uuid[])', [images])).rows)).toEqual([]);
  });
});
