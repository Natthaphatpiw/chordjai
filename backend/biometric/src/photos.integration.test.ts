import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { withSystem, withUser, closeDatabase } from '@chordjai/db';
import { signSession, verifySession, verifyPetidDraft } from '@chordjai/auth';
import { loadOwnedImage } from '@chordjai/media';
import type { Hono } from 'hono';
import type { ServiceEnv } from '@chordjai/service-kit';

const providers = vi.hoisted(() => ({ ai: vi.fn(), embed: vi.fn(), blobGet: vi.fn(), blobPut: vi.fn() }));
vi.mock('@chordjai/ai', () => ({ runStructured: providers.ai, embedTexts: providers.embed }));
vi.mock('@vercel/blob', () => ({ get: providers.blobGet, put: providers.blobPut }));
// Media ownership/RLS and signed capability URLs run through the real package.
// Only the private Blob bytes and AI provider calls are mocked.
import app, { searchGallery } from './app';
import mediaApp from '../../media/src/app';

const url = process.env.TEST_DATABASE_URL;
const isolated = !!url && ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname);
const signature = { species: 'cat', usable: true, qualityIssues: [], global: 'brown tabby cat', face: 'cream chin', coat: 'brown stripes', marks: 'dark tail tip' };
const vector = Array.from({ length: 1536 }, (_, index) => index === 0 ? 1 : 0);

describe.skipIf(!isolated)('real Postgres multi-photo PetID ownership, signed review drafts and privacy', () => {
  const owner = randomUUID(), stranger = randomUUID(), viewer = randomUUID();
  const pet = randomUUID(), otherPet = randomUUID(), strangerPet = randomUUID(), legacyPet = randomUUID(), removedPet = randomUUID();
  const photoIds = Array.from({ length: 6 }, () => randomUUID());
  const duringAiPet = randomUUID(), racePet = randomUUID();
  const duringAiPhotos = [randomUUID(), randomUUID()], racePhotos = [randomUUID(), randomUUID()];
  const otherPhoto = randomUUID(), strangerPhoto = randomUUID(), deletedPhoto = randomUUID(), legacyPhoto = randomUUID();
  const removedPhotos = [randomUUID(), randomUUID()];
  const allPhotoIds = [...photoIds, otherPhoto, strangerPhoto, deletedPhoto, legacyPhoto, ...removedPhotos, ...duringAiPhotos, ...racePhotos];
  let ownerToken = '', strangerToken = '', viewerToken = '', draftToken = '', enrollmentId = '', removedEnrollmentId = '';
  async function call(service: Hono<ServiceEnv>, path: string, token?: string, method = 'GET', body?: unknown, key?: string) {
    const response = await service.request(path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), 'Accept-Language': 'en', ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json(), replayed: response.headers.get('Idempotency-Replayed') };
  }
  const describePhotos = (ids: string[], actor = ownerToken, chosenPet = pet) => call(app, '/api/v1/biometric/describe', actor, 'POST', { petId: chosenPet, mediaIds: ids });
  const register = (body: unknown, actor = ownerToken, key = randomUUID()) => call(app, '/api/v1/biometric/enrollments', actor, 'POST', body, key);
  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('APP_JWT_SECRET', 'isolated-multiple-photos-test-secret-more-than-32-characters');
    vi.stubEnv('APP_JWT_ISSUER', 'https://www.chordjai.life');
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live provider calls are forbidden in isolated multi-photo tests'); }));
    const imageBytes = new Map<string, Buffer>(await Promise.all(allPhotoIds.map(async (id, index) => [id, await sharp({ create: { width: 20, height: 20, channels: 3, background: {r:(index*37)%256,g:(index*61)%256,b:(index*83)%256} } }).jpeg().toBuffer()] as const)));
    providers.blobGet.mockImplementation(async (pathname: string) => {
      const id = pathname.split('/').at(-1)?.replace('.jpg', '') || '';
      const bytes = imageBytes.get(id);
      if (!bytes) throw new Error('Unexpected fixture image');
      return { statusCode: 200, stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(bytes)); controller.close(); } }) };
    });
    providers.blobPut.mockImplementation(() => { throw new Error('No live uploads are allowed in multi-photo tests'); });
    providers.embed.mockResolvedValue([vector]);
    providers.ai.mockImplementation(async (options: {feature:string}) => options.feature === 'petid.verify_pair' ? { verdict: 'possible', observations: ['Visible tabby markings may be similar.'], limitations: 'The owner must confirm.' } : { ...signature, description: 'Tabby cat with a cream chin and dark tail tip.' });
    await withSystem(async db => {
      for (const id of [owner, stranger, viewer]) await db.query("insert into identity.users(id,line_user_id,display_name) values($1,$2,'Multi-photo Test')", [id, `photo-test-${id}`]);
      for (const id of [pet, otherPet, legacyPet, removedPet, duringAiPet, racePet]) await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'PetID Test Cat','cat')", [id, owner]);
      await db.query("insert into pet.pets(id,owner_id,name,species) values($1,$2,'Stranger Cat','cat')", [strangerPet, stranger]);
      await db.query("insert into pet.members(pet_id,user_id,role) values($1,$2,'viewer')", [pet, viewer]);
      const assets = [
        ...photoIds.map(id => ({ id, user: owner, pet, status: 'ready' })),
        { id: otherPhoto, user: owner, pet: otherPet, status: 'ready' },
        { id: strangerPhoto, user: stranger, pet: strangerPet, status: 'ready' },
        { id: deletedPhoto, user: owner, pet, status: 'deleted' },
        { id: legacyPhoto, user: owner, pet: legacyPet, status: 'ready' },
        ...removedPhotos.map(id => ({ id, user: owner, pet: removedPet, status: 'ready' })),
        ...duringAiPhotos.map(id => ({ id, user: owner, pet: duringAiPet, status: 'ready' })),
        ...racePhotos.map(id => ({ id, user: owner, pet: racePet, status: 'ready' })),
      ];
      for (const asset of assets) await db.query("insert into media.objects(id,user_id,pet_id,pathname,mime,size,status) values($1,$2,$3,$4,'image/jpeg',100,$5)", [asset.id, asset.user, asset.pet, `u/${asset.user}/${asset.id}.jpg`, asset.status]);
    });
    [ownerToken, strangerToken, viewerToken] = await Promise.all([owner, stranger, viewer].map(id => signSession({ id, role: 'owner' })));
  });
  afterAll(async () => {
    await withSystem(async db => {
      await db.query('delete from identity.users where id=any($1::uuid[])', [[owner, stranger, viewer]]);
      await db.query('delete from ops.jobs where dedupe_key=any($1::text[])', [allPhotoIds.map(id => `media-delete:${id}`)]);
    });
    await closeDatabase();
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
  });
  it('accepts one to five ordered photos and rejects zero, duplicate and six-photo requests before AI', async () => {
    for (let count = 1; count <= 5; count++) {
      const result = await describePhotos(photoIds.slice(0, count));
      expect(result.status).toBe(200);
      expect(result.body.data.requiresReview).toBe(true);
      expect(result.body.data.description).toContain('Tabby');
      expect(providers.ai.mock.calls.at(-1)![0].images).toHaveLength(count);
      expect(providers.ai.mock.calls.at(-1)![0].instructions).toContain('entirely in English');
      if (count === 5) draftToken = result.body.data.draftToken;
    }
    const before = providers.ai.mock.calls.length;
    for (const invalid of [[], photoIds, [photoIds[0]!, photoIds[0]!]]) {
      expect((await describePhotos(invalid)).status).toBe(400);
      expect((await register({ petId: pet, description: 'Reviewed', mediaIds: invalid })).status).toBe(400);
    }
    expect(providers.ai).toHaveBeenCalledTimes(before);
  });
  it('requires the pet owner and privately owned ready photos belonging to the same pet', async () => {
    const before = providers.ai.mock.calls.length;
    expect((await describePhotos([photoIds[0]!], ownerToken, pet)).status).toBe(200);
    expect((await call(app, '/api/v1/biometric/describe', undefined, 'POST', { petId: pet, mediaIds: [photoIds[0]] })).status).toBe(401);
    expect((await describePhotos([photoIds[0]!], strangerToken)).body.error.code).toBe('PET_OWNER_REQUIRED');
    expect((await describePhotos([photoIds[0]!], viewerToken)).body.error.code).toBe('PET_OWNER_REQUIRED');
    for (const id of [otherPhoto, strangerPhoto, deletedPhoto, randomUUID()]) {
      const response = await describePhotos([id]);
      expect(response.status).toBe(403); expect(response.body.error.code).toBe('IMAGE_PET_MISMATCH');
      expect((await register({ petId: pet, description: 'Reviewed', mediaIds: [id] })).status).toBe(403);
    }
    expect(providers.ai).toHaveBeenCalledTimes(before + 1);
    expect(await withUser(stranger, async db => (await db.query('select id from media.objects where id=any($1::uuid[])', [photoIds])).rows)).toEqual([]);
  });
  it('rejects unusable or incompatible pet photos without creating a vector or registration', async () => {
    const embeds = providers.embed.mock.calls.length;
    providers.ai.mockResolvedValueOnce({ ...signature, usable: false, qualityIssues: ['The photos show different animals.'], description: '' });
    const unusable = await describePhotos(photoIds.slice(0, 2));
    expect(unusable.status).toBe(422); expect(unusable.body.error.code).toBe('PET_IMAGE_UNUSABLE');
    providers.ai.mockResolvedValueOnce({ ...signature, species: 'dog', description: 'A dog, not the selected cat.' });
    const mismatched = await register({ petId: pet, description: 'The selected cat.', mediaIds: photoIds.slice(0, 2) });
    expect(mismatched.status).toBe(422); expect(mismatched.body.error.code).toBe('PET_IMAGE_UNUSABLE');
    expect(providers.embed).toHaveBeenCalledTimes(embeds);
    expect(await withSystem(async db => (await db.query('select id from biometric.enrollments where pet_id=$1', [pet])).rows)).toEqual([]);
  });
  it('binds signed review drafts to owner, pet and photo order and rejects them as application bearer tokens', async () => {
    expect(await verifyPetidDraft(draftToken, owner, pet, photoIds.slice(0, 5))).toEqual(signature);
    expect(await verifyPetidDraft(draftToken, stranger, pet, photoIds.slice(0, 5))).toBeNull();
    expect(await verifyPetidDraft(draftToken, owner, otherPet, photoIds.slice(0, 5))).toBeNull();
    expect(await verifyPetidDraft(draftToken, owner, pet, photoIds.slice(0, 5).reverse())).toBeNull();
    expect(await verifyPetidDraft(draftToken, owner, pet, photoIds.slice(0, 4))).toBeNull();
    expect(await verifyPetidDraft(ownerToken, owner, pet, photoIds.slice(0, 5))).toBeNull();
    await expect(verifySession(draftToken)).rejects.toThrow();
    const denied = await call(app, '/api/v1/biometric/enrollments', draftToken);
    expect(denied.status).toBe(401); expect(denied.body.error.code).toBe('INVALID_TOKEN');
  });
  it('persists an edited description, five photos and one vector while reusing a reviewed signature', async () => {
    const before = providers.ai.mock.calls.length, embeds = providers.embed.mock.calls.length;
    const body = { petId: pet, description: 'Owner correction: amber eyes and dark tail tip.', mediaIds: photoIds.slice(0, 5), draftToken, searchMode: 'lost_only' };
    const key = randomUUID();
    const created = await register(body, ownerToken, key);
    expect(created.status).toBe(201); enrollmentId = created.body.data.id;
    expect(created.body.data.description).toBe(body.description);
    expect(created.body.data.mediaId).toBe(photoIds[0]);
    expect(created.body.data.mediaIds).toEqual(body.mediaIds);
    expect(created.body.data.photos).toHaveLength(5);
    expect(providers.ai).toHaveBeenCalledTimes(before);
    expect(providers.embed).toHaveBeenCalledTimes(embeds + 1);
    const replayed = await register(body, ownerToken, key);
    expect(replayed.status).toBe(201); expect(replayed.replayed).toBe('true'); expect(replayed.body.data.id).toBe(enrollmentId);
    expect(providers.embed).toHaveBeenCalledTimes(embeds + 1);
    await withSystem(async db => {
      const rows = (await db.query('select id,description,signature,extensions.vector_dims(embedding) dimensions from biometric.enrollments where pet_id=$1', [pet])).rows;
      expect(rows).toHaveLength(1); expect(rows[0].dimensions).toBe(1536); expect(rows[0].signature).toEqual(signature);
      expect((await db.query('select media_id,position from biometric.enrollment_photos where enrollment_id=$1 order by position', [enrollmentId])).rows.map(row => row.media_id)).toEqual(body.mediaIds);
    });
    const ownerRead = await call(app, '/api/v1/biometric/enrollments', ownerToken);
    expect(ownerRead.body.data.find((row: { id: string }) => row.id === enrollmentId).mediaIds).toEqual(body.mediaIds);
    expect((await call(app, '/api/v1/biometric/enrollments', strangerToken)).body.data).toEqual([]);
    expect((await call(app, '/api/v1/biometric/enrollments', viewerToken)).body.data).toEqual([]);
    const capability = new URL(created.body.data.photos[0].url, 'https://www.chordjai.life');
    const visible = await mediaApp.request(`${capability.pathname}${capability.search}`);
    expect(visible.status).toBe(200); expect(visible.headers.get('Cache-Control')).toBe('private, no-store');
    expect((await mediaApp.request(capability.pathname)).status).toBe(404);
    const wrong = new URL(capability.href); wrong.pathname = `/api/v1/media/${strangerPhoto}`;
    expect((await mediaApp.request(`${wrong.pathname}${wrong.search}`)).status).toBe(401);
  });
  it('compares one found photo against all five ordered references under the six-image model limit', async () => {
    await withSystem(db => db.query("insert into lostfound.cases(pet_id,owner_id,public_slug,description,district,status) values($1,$2,$3,'Five-angle lost cat','Test area','active')", [pet, owner, `photo-test-${pet}`]));
    const before = providers.ai.mock.calls.filter(([options]) => options.feature === 'petid.verify_pair').length;
    const result = await call(app, '/api/v1/biometric/identify', strangerToken, 'POST', { mediaId: strangerPhoto });
    expect(result.status).toBe(200); expect(result.body.data.status).toBe('possible');
    expect(result.body.data.candidates).toHaveLength(1);
    expect(result.body.data.candidates[0]).toMatchObject({ publicSlug: `photo-test-${pet}`, status: 'owner_confirmation_required' });
    const comparisons = providers.ai.mock.calls.filter(([options]) => options.feature === 'petid.verify_pair');
    expect(comparisons).toHaveLength(before + 1);
    const pair = comparisons.at(-1)![0];
    expect(pair.images).toHaveLength(6);
    expect(new Set(pair.images).size).toBe(6);
    expect(pair.images).toEqual(await Promise.all([loadOwnedImage(stranger, strangerPhoto), ...photoIds.slice(0, 5).map(id => loadOwnedImage(owner, id))]));
    expect(pair.instructions).toContain('entirely in English');
    expect(JSON.stringify(result.body)).not.toContain(owner);
    expect(JSON.stringify(result.body)).not.toContain('read=');
    const stored = await withSystem(async db => (await db.query('select owner_confirmed,evidence from biometric.matches where id=$1', [result.body.data.candidates[0].matchId])).rows[0]);
    expect(stored.owner_confirmed).toBeNull(); expect(stored.evidence.identityProof).toBe(false);
    expect(stored.evidence.mediaId).toBe(strangerPhoto);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('updates photo order/removes old references and invalidates a mismatched signed draft', async () => {
    const ids = [photoIds[2]!, photoIds[0]!, photoIds[4]!];
    const before = providers.ai.mock.calls.length;
    const changed = await register({ petId: pet, description: 'Updated to three angles.', mediaIds: ids, draftToken, searchMode: 'lost_only' });
    expect(changed.status).toBe(201); expect(changed.body.data.id).toBe(enrollmentId);
    expect(changed.body.data.mediaId).toBe(ids[0]); expect(changed.body.data.mediaIds).toEqual(ids);
    expect(providers.ai).toHaveBeenCalledTimes(before + 1); expect(providers.ai.mock.calls.at(-1)![0].images).toHaveLength(3);
    const joins = await withSystem(async db => (await db.query('select media_id from biometric.enrollment_photos where enrollment_id=$1 order by position', [enrollmentId])).rows);
    expect(joins.map(row => row.media_id)).toEqual(ids);
    expect(await withUser(stranger, async db => (await db.query('select enrollment_id from biometric.enrollment_photos where enrollment_id=$1', [enrollmentId])).rows)).toEqual([]);
    await expect(withUser(owner, db => db.query('insert into biometric.enrollment_photos(enrollment_id,media_id,position) values($1,$2,3)', [enrollmentId, otherPhoto]))).rejects.toMatchObject({ code: '42501' });
  });
  it('supports legacy mediaId enrollment and excludes search-off pets from the public gallery', async () => {
    const legacy = await register({ petId: legacyPet, description: 'Legacy single reference.', mediaId: legacyPhoto, searchMode: 'off' });
    expect(legacy.status).toBe(201); expect(legacy.body.data.mediaIds).toEqual([legacyPhoto]);
    await withSystem(db => db.query("insert into lostfound.cases(pet_id,owner_id,public_slug,description,district,status) values($1,$2,$3,'Test lost cat','Test area','active')", [legacyPet, owner, `photo-test-${legacyPet}`]));
    expect((await searchGallery(stranger, 'cat', vector)).map(row => row.id)).not.toContain(legacy.body.data.id);
  });
  it('erases derived PetID data and gallery eligibility when any reference photo is deleted', async () => {
    const registered = await register({ petId: removedPet, description: 'A two-view registration.', mediaIds: removedPhotos, searchMode: 'lost_only' });
    expect(registered.status).toBe(201); removedEnrollmentId = registered.body.data.id;
    await withSystem(db => db.query("insert into lostfound.cases(pet_id,owner_id,public_slug,description,district,status) values($1,$2,$3,'Test lost cat','Test area','active')", [removedPet, owner, `photo-test-${removedPet}`]));
    expect((await searchGallery(stranger, 'cat', vector)).map(row => row.id)).toContain(removedEnrollmentId);
    expect((await call(mediaApp, `/api/v1/media/${removedPhotos[1]}`, strangerToken, 'DELETE')).status).toBe(404);
    expect((await call(mediaApp, `/api/v1/media/${removedPhotos[1]}`, ownerToken, 'DELETE')).status).toBe(200);
    expect((await searchGallery(stranger, 'cat', vector)).map(row => row.id)).not.toContain(removedEnrollmentId);
    await withSystem(async db => {
      const row = (await db.query('select embedding,signature,status from biometric.enrollments where id=$1', [removedEnrollmentId])).rows[0];
      expect(row.embedding).toBeNull(); expect(row.signature).toEqual({}); expect(row.status).not.toBe('ready');
      expect((await db.query("select id from ops.jobs where topic='media.delete' and dedupe_key=$1", [`media-delete:${removedPhotos[1]}`])).rows).toHaveLength(1);
    });
    const read = await call(app, '/api/v1/biometric/enrollments', ownerToken);
    expect(read.body.data.find((row: { id: string }) => row.id === removedEnrollmentId).mediaIds).toEqual([removedPhotos[0]]);
    expect((await register({ petId: removedPet, description: 'Deleted photo cannot be reused.', mediaIds: removedPhotos })).status).toBe(403);
  });
  it('rechecks photo availability when a reference is erased while AI is processing', async () => {
    providers.embed.mockImplementationOnce(async () => {
      await withSystem(db => db.query("update media.objects set status='deleted' where id=$1", [duringAiPhotos[1]]));
      return [vector];
    });
    const response = await register({ petId: duringAiPet, description: 'Erased while processing.', mediaIds: duringAiPhotos, searchMode: 'lost_only' });
    expect(response.status).toBe(403); expect(response.body.error.code).toBe('IMAGE_PET_MISMATCH');
    expect(await withSystem(async db => (await db.query('select id from biometric.enrollments where pet_id=$1', [duringAiPet])).rows)).toEqual([]);
  });
  it('serializes photo publication with an uncommitted media-erasure transaction', async () => {
    let notifyDeleted: () => void = () => {}, releaseDeletion: () => void = () => {}, notifyEmbedded: () => void = () => {};
    const deleted = new Promise<void>(resolve => { notifyDeleted = resolve; });
    const release = new Promise<void>(resolve => { releaseDeletion = resolve; });
    const embedded = new Promise<void>(resolve => { notifyEmbedded = resolve; });
    let deletionTransaction = '';
    const deletion = withUser(owner, async db => {
      deletionTransaction = (await db.query('select txid_current()::text as id')).rows[0].id;
      await db.query("update media.objects set status='deleted' where id=$1", [racePhotos[1]]);
      notifyDeleted();
      await release;
    });
    await deleted;
    providers.embed.mockImplementationOnce(async () => { notifyEmbedded(); return [vector]; });
    const registration = register({ petId: racePet, description: 'Concurrent erasure cannot be republished.', mediaIds: racePhotos, searchMode: 'lost_only' });
    try {
      await embedded;
      // The FOR SHARE validation must actually wait on this specific deleting
      // transaction, rather than committing a new join after its trigger ran.
      await vi.waitFor(async () => {
        const waiting = await withSystem(async db => (await db.query("select count(*)::int as count from pg_locks where locktype='transactionid' and transactionid::text=$1 and not granted", [deletionTransaction])).rows[0].count);
        expect(waiting).toBeGreaterThan(0);
      }, { timeout: 3000, interval: 20 });
    } finally { releaseDeletion(); await deletion; }
    const response = await registration;
    expect(response.status).toBe(403); expect(response.body.error.code).toBe('IMAGE_PET_MISMATCH');
    expect(await withSystem(async db => (await db.query('select id from biometric.enrollments where pet_id=$1', [racePet])).rows)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('withdraws all references with the enrollment and prevents cross-owner writes', async () => {
    expect((await call(app, `/api/v1/biometric/enrollments/${enrollmentId}`, strangerToken, 'DELETE')).status).toBe(404);
    expect((await call(app, `/api/v1/biometric/enrollments/${enrollmentId}`, ownerToken, 'DELETE')).status).toBe(200);
    await withSystem(async db => {
      expect((await db.query('select id from biometric.enrollments where id=$1', [enrollmentId])).rows).toHaveLength(0);
      expect((await db.query('select enrollment_id from biometric.enrollment_photos where enrollment_id=$1', [enrollmentId])).rows).toHaveLength(0);
    });
    expect(fetch).not.toHaveBeenCalled(); expect(providers.blobPut).not.toHaveBeenCalled();
  });
});
