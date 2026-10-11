import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ocrDraftSchema, ocrRequestSchema, normalizeOcrDraft, reviewedDate } from './ocr';
import { moveBookletPage, bookletSaveKey, humanBookletWarning, readyBookletEntry, specificBookletWarnings } from '../../../frontend/owner-app/components/booklet';

const mocks = vi.hoisted(() => ({ ai: vi.fn(), image: vi.fn(), query: vi.fn(), writable: true, matchingPhotos: true }));
const ownerId = '00000000-0000-4000-8000-000000000001';
const petId = '00000000-0000-4000-8000-000000000002';
const scanId = '00000000-0000-4000-8000-000000000003';
const mediaIds = Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`);
vi.mock('@chordjai/auth', () => ({ verifySession: vi.fn(async () => ({ id: '00000000-0000-4000-8000-000000000001', role: 'owner' })) }));
vi.mock('@chordjai/db', () => ({ withUser: vi.fn(async (_id, fn) => fn({ query: mocks.query })), withSystem: vi.fn(async fn => fn({ query: mocks.query })) }));
vi.mock('@chordjai/ai', () => ({ runStructured: mocks.ai }));
vi.mock('@chordjai/media', async importOriginal => ({ ...await importOriginal<typeof import('@chordjai/media')>(), loadOwnedImage: mocks.image }));
import { HttpError } from '@chordjai/service-kit';
import app from './app';

function record(sourcePage = 1) {
  return { kind: 'vaccine' as const, title: 'FVRCP', recordedAt: '2025-05-24', nextDueAt: null, notes: '', value: null, sourcePage };
}
async function request(body: unknown, path = '/api/v1/health/ocr') {
  const response = await app.request(path, { method: 'POST', headers: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json', 'Accept-Language': 'en' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
beforeEach(() => {
  vi.clearAllMocks();mocks.writable = true;mocks.matchingPhotos = true;
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live provider requests are forbidden in booklet tests'); }));
  mocks.query.mockImplementation(async (sql: string, parameters: unknown[] = []) => {
    if (sql.includes('FROM identity.users')) return { rowCount: 1, rows: [{ id: ownerId, role: 'owner', status: 'active' }] };
    if (sql.includes('FROM pet.pets')) return { rowCount: mocks.writable ? 1 : 0, rows: mocks.writable ? [{ id: petId }] : [] };
    if (sql.includes('FROM media.objects')) return { rowCount: mocks.matchingPhotos ? (parameters[0] as string[]).length : 0, rows: mocks.matchingPhotos ? (parameters[0] as string[]).map(id=>({id})) : [] };
    if (sql.includes('INSERT INTO health.scans')) return { rowCount: 1, rows: [{ id: scanId }] };
    if (sql.includes('INSERT INTO health.records')) return { rowCount: 1, rows: [{ id: 'health-record-fixture', title: parameters[3], recorded_at: parameters[4] }] };
    return { rowCount: 0, rows: [] };
  });
  mocks.image.mockImplementation(async (_userId, id) => `data:image/jpeg;base64,${id}`);
  mocks.ai.mockImplementation(async options => options.schema.parse({ records: [record(options.images.length)], warnings: [] }));
});

describe('booklet batch boundaries and safety', () => {
  it('accepts one to ten photos, retains legacy single-photo input, and rejects mixed input', () => {
    expect(ocrRequestSchema.parse({ petId, imageUrl: mediaIds[0] }).imageUrl).toBe(mediaIds[0]);
    expect(ocrRequestSchema.parse({ petId, imageUrls: mediaIds.slice(0, 10) }).imageUrls).toHaveLength(10);
    for (const imageUrls of [[], mediaIds]) expect(ocrRequestSchema.safeParse({ petId, imageUrls }).success).toBe(false);
    expect(ocrRequestSchema.safeParse({ petId, imageUrl: mediaIds[0], imageUrls: [mediaIds[1]] }).success).toBe(false);
  });
  it('does not invent unreadable dates or normalize impossible dates by rollover', () => {
    for (const value of [null, '', '2025-02-29', '2025-04-31', '2568-05-24', '24/05/2568', '2025-05-24T00:00:00Z']) expect(reviewedDate(value)).toBeNull();
    expect(reviewedDate('2024-02-29')).toBe('2024-02-29');
    const draft = normalizeOcrDraft({ records: [{ ...record(), recordedAt: '2568-05-24' }], warnings: ['Unclear date', ' Unclear date '] });
    expect(draft.records[0].recordedAt).toBeNull();expect(draft.warnings).toEqual(['Unclear date']);
  });
  it('requires a valid source page and bounds records and explanations', () => {
    expect(ocrDraftSchema(2).safeParse({ records: [record(3)], warnings: [] }).success).toBe(false);
    expect(ocrDraftSchema(10).safeParse({ records: Array.from({ length: 101 }, () => record()), warnings: [] }).success).toBe(false);
    expect(ocrDraftSchema(1).safeParse({ records: [], warnings: Array(21).fill('Read carefully') }).success).toBe(false);
    expect(ocrDraftSchema(1).parse({ records: [{ ...record(), recordedAt: null }], warnings: [] }).records[0].recordedAt).toBeNull();
  });
  it('orders pages without mutating previews and supplies stable retry identities', () => {
    const pages = ['first', 'second', 'third'];expect(moveBookletPage(pages, 2, 0)).toEqual(['third', 'first', 'second']);expect(pages).toEqual(['first', 'second', 'third']);
    expect(moveBookletPage(pages, 0, -1)).toBe(pages);
    expect(bookletSaveKey(scanId, 0)).toBe(bookletSaveKey(scanId, 0));expect(bookletSaveKey(scanId, 0)).not.toBe(bookletSaveKey(scanId, 1));
  });
  it('replaces technical empty-field warnings while retaining real uncertainty', () => {
    expect(humanBookletWarning('value was not present so null is used', true)).not.toMatch(/\bnull\b|\bvalue\b|\bISO\b/);
    expect(humanBookletWarning('EXP unclear', false)).toContain('วันหมดอายุ');
    expect(humanBookletWarning('The lot number could not be read clearly.', true)).toBe('The lot number could not be read clearly.');
    expect(specificBookletWarnings(['value is null','EXP unclear','The lot number could not be read clearly.'],true)).toEqual(['The lot number could not be read clearly.']);
    expect(specificBookletWarnings(['The lot value is null'],true)).toEqual(['The lot number could not be read clearly. Compare it with the original booklet.']);
  });
  it('prevents invalid or reversed dates from being submitted by the review form',()=>{
    expect(readyBookletEntry({title:'FVRCP',recordedAt:'2025-05-24',nextDueAt:'2025-05-23'})).toBe(false);
    expect(readyBookletEntry({title:'FVRCP',recordedAt:'2025-02-29'})).toBe(false);
    expect(readyBookletEntry({title:'FVRCP',recordedAt:'2025-05-24',nextDueAt:'2026-05-24'})).toBe(true);
    expect(readyBookletEntry({title:'FVRCP',recordedAt:'2025-05-24',nextDueAt:null})).toBe(true);
  });
});

describe('booklet batch HTTP contract with isolated providers', () => {
  it('loads all ten ordered owned images then makes exactly one structured request', async () => {
    const result = await request({ petId, imageUrls: mediaIds.slice(0, 10) });
    expect(result.status).toBe(200);expect(result.body.data).toMatchObject({ scanId, pageCount: 10, requiresConfirmation: true });
    expect(result.body.data.records[0].sourcePage).toBe(10);expect(mocks.image).toHaveBeenCalledTimes(10);expect(mocks.ai).toHaveBeenCalledTimes(1);
    expect(mocks.ai.mock.calls[0][0].images).toEqual(mediaIds.slice(0, 10).map(id => `data:image/jpeg;base64,${id}`));
    expect(mocks.ai.mock.calls[0][0].instructions).toContain('English');expect(mocks.ai.mock.calls[0][0].instructions).toContain('never today');
    const insertion=mocks.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO health.scans'));
    expect(JSON.parse(insertion![1][3])).toMatchObject({ mediaIds: mediaIds.slice(0,10), pageCount:10 });
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO health.records'))).toBe(false);
  });
  it('retains single-image compatibility while returning one source page', async () => {
    const result = await request({ petId, imageUrl: mediaIds[0] });
    expect(result.status).toBe(200);expect(result.body.data.pageCount).toBe(1);expect(result.body.data.records[0].sourcePage).toBe(1);
  });
  it('rejects empty, over-limit and duplicate batches before calling a provider', async () => {
    for (const imageUrls of [[], mediaIds, [mediaIds[0], mediaIds[0]]]) expect((await request({ petId, imageUrls })).status).toBe(400);
    expect(mocks.image).not.toHaveBeenCalled();expect(mocks.ai).not.toHaveBeenCalled();
  });
  it('checks each photo before AI, including a failure on the final page', async () => {
    mocks.image.mockImplementation(async (_userId, id) => { if (id === mediaIds[2]) throw new HttpError(404, 'IMAGE_NOT_FOUND', 'Unavailable');return 'data:image/jpeg;base64,owned'; });
    expect((await request({ petId, imageUrls: mediaIds.slice(0,3) })).status).toBe(404);
    expect(mocks.image).toHaveBeenCalledTimes(3);expect(mocks.ai).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO health.scans'))).toBe(false);
  });
  it('binds every photograph to the actor and the submitted pet before image reads',async()=>{
    mocks.matchingPhotos=false;
    const result=await request({petId,imageUrls:mediaIds.slice(0,3)});
    expect(result.status).toBe(403);expect(result.body.error.code).toBe('IMAGE_PET_MISMATCH');
    expect(mocks.image).not.toHaveBeenCalled();expect(mocks.ai).not.toHaveBeenCalled();
    const [sql,parameters]=mocks.query.mock.calls.find(([sql])=>sql.includes('FROM media.objects'))!;
    expect(sql).toContain('user_id=$2');expect(sql).toContain('pet_id=$3');expect(sql).toContain("status='ready'");expect(parameters).toEqual([mediaIds.slice(0,3),ownerId,petId]);
  });
  it('checks write access before reading images or spending an AI request', async () => {
    mocks.writable=false;expect((await request({ petId, imageUrls: [mediaIds[0]] })).status).toBe(404);
    expect(mocks.image).not.toHaveBeenCalled();expect(mocks.ai).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls.find(([sql]) => sql.includes('FROM pet.pets'))![0]).toContain('public.can_write_pet(id)');
  });
  it('requires idempotency for imported records and leaves general entries compatible', async () => {
    const body={petId,kind:'vaccine',title:'FVRCP',recordedAt:'2025-05-24',data:{scanId,sourcePage:1,scanRecordIndex:0}};
    const result=await request(body,'/api/v1/health/records');expect(result.status).toBe(400);expect(result.body.error.code).toBe('IDEMPOTENCY_REQUIRED');
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO health.records'))).toBe(false);
  });
  it('rejects impossible, non-Gregorian and reversed scanned dates with a friendly400',async()=>{
    const body={petId,kind:'vaccine',title:'FVRCP',recordedAt:'2025-05-24',data:{scanId,sourcePage:1,scanRecordIndex:0}};
    for(const recordedAt of ['2025-02-29','2568-05-24','2025-05-24T00:00:00Z']){
      const result=await request({...body,recordedAt},'/api/v1/health/records');expect(result.status).toBe(400);expect(result.body.error.code).toBe('INVALID_DATE');
    }
    const reversed=await request({...body,nextDueAt:'2025-05-23'},'/api/v1/health/records');expect(reversed.status).toBe(400);expect(reversed.body.error.code).toBe('INVALID_DUE_DATE');
    expect(mocks.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO health.records'))).toBe(false);
  });
  it('keeps legacy manualISOtimestamp requests compatible',async()=>{
    const result=await request({petId,kind:'note',title:'Manual observation',recordedAt:'2025-05-24T09:00:00Z'},'/api/v1/health/records');
    expect(result.status).toBe(201);expect(result.body.data.recordedAt).toBe('2025-05-24T09:00:00Z');expect(mocks.ai).not.toHaveBeenCalled();
  });
});
