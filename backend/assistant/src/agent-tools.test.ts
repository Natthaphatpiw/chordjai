import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
const mocked = vi.hoisted(() => ({ fetch: vi.fn(), sign: vi.fn(), consentQuery: vi.fn() }));
vi.mock('@chordjai/auth', () => ({ signSession: mocked.sign }));
vi.mock('@chordjai/db', () => ({ withUser: async (_id: string, work: (db: {query: typeof mocked.consentQuery}) => unknown) => work({query: mocked.consentQuery}) }));
vi.mock('@chordjai/pet/src/app.ts', () => ({ default: { fetch: mocked.fetch } }));
vi.mock('@chordjai/health/src/app.ts', () => ({ default: { fetch: mocked.fetch } }));
vi.mock('@chordjai/journal-service', () => ({ default: { fetch: mocked.fetch } }));
vi.mock('@chordjai/notification-service', () => ({ default: { fetch: mocked.fetch } }));
vi.mock('@chordjai/clinic/src/app.ts', () => ({ default: { fetch: mocked.fetch } }));
vi.mock('@chordjai/biometric-service', () => ({ default: { fetch: mocked.fetch } }));
vi.mock('@chordjai/lostfound/src/app.ts', () => ({ default: { fetch: mocked.fetch } }));
vi.mock('@chordjai/share/src/app.ts', () => ({ default: { fetch: mocked.fetch } }));
vi.mock('./app', () => ({ default: { fetch: mocked.fetch } }));
import { AGENT_TOOLS, AGENT_MANUAL_ACTIONS, agentRequestId, agentVisibleData, getAgentTool, toolCatalog, validateAgentArguments, assertAgentToolAccess, resolveAgentActionPetId } from './agent-tools';

const petId = '11111111-1111-4111-8111-111111111111', entryId = '22222222-2222-4222-8222-222222222222';
const actor = { id: '33333333-3333-4333-8333-333333333333', role: 'owner' as const };
const response = (data: unknown, status = 200) => Response.json({ data }, { status });
beforeEach(() => { vi.clearAllMocks(); mocked.sign.mockResolvedValue('test-owner-token'); mocked.consentQuery.mockResolvedValue({rows:[{granted:true}]}); mocked.fetch.mockImplementation((request: Request) => Promise.resolve(response(request.url.endsWith('/assistant/preferences') ? {memoryEnabled:true} : { id: entryId, petId }))); });

describe('bounded authorized agent tool adapters', () => {
  it('has a unique JSON-safe catalog and refuses unknown tools', () => {
    expect(AGENT_TOOLS.length).toBeGreaterThan(30);
    expect(new Set(AGENT_TOOLS.map(tool => tool.name)).size).toBe(AGENT_TOOLS.length);
    expect(() => JSON.stringify(toolCatalog)).not.toThrow();
    expect(toolCatalog.every(tool => tool.parameters && ['read', 'write', 'confirm'].includes(tool.risk))).toBe(true);
    expect(getAgentTool('sql.execute')).toBeUndefined();
    expect(() => validateAgentArguments('sql.execute', {})).toThrow();
  });
  it('uses the fixed real API path with owner auth, deterministic client UUID and unknown defaults', async () => {
    const args = { petId, kind: 'visit', title: 'ไปหยอดหลังคอ', observedAt: '2026-10-29T08:00:00+07:00', narrative: 'วันนี้พาถั่วเหลืองไปหยอดหลังคอกำจัดไรหูมา' };
    const result = await getAgentTool('care.entries.create')!.execute(actor, args, 'task-one-step-one');
    expect(mocked.fetch).toHaveBeenCalledTimes(2); // Current pet access, then normal domain API.
    const request = mocked.fetch.mock.calls[1][0] as Request;
    expect(request.url).toBe('https://agent.internal/api/v1/health/care/entries');
    expect(request.headers.get('authorization')).toBe('Bearer test-owner-token');
    expect(request.headers.get('idempotency-key')).toBe(agentRequestId('task-one-step-one'));
    const body = await request.json();
    expect(body).toMatchObject({ ...args, shareWithClinic: false, shareCosts: false, clientEntryId: agentRequestId('task-one-step-one'), observations: { appetite: 'unknown', trend: 'unknown' } });
    expect(z.uuid().safeParse(body.clientEntryId).success).toBe(true);
    expect(result.path).toContain(`petId=${petId}`);
    expect(result.path).toContain(`resourceId=${entryId}`);
    expect(result.path).toContain(`entryId=${entryId}`);
  });
  it('rejects path/host/permission injection before loading or calling a service', async () => {
    for (const args of [{ id: '../../identity/users' }, { id: petId, url: 'https://attacker.invalid' }, { id: petId, ownerId: actor.id }, { id: petId, method: 'DELETE' }]) {
      await expect(getAgentTool('pets.get')!.execute(actor, args, 'bad-input')).rejects.toMatchObject({ code: 'AGENT_TOOL_ARGUMENTS_INVALID' });
    }
    expect(mocked.sign).not.toHaveBeenCalled(); expect(mocked.fetch).not.toHaveBeenCalled();
  });
  it('does not auto-enable clinical sharing while creating a diary', () => {
    expect(() => validateAgentArguments('care.entries.create', { petId, kind: 'daily', title: 'Today', observedAt: '2026-10-29T00:00:00Z', shareWithClinic: true })).toThrow();
  });
  it('preserves the underlying fresh permission denial before a cached mutation can replay', async () => {
    mocked.fetch.mockResolvedValue(Response.json({ error: { code: 'PET_NOT_FOUND', message: 'No permission' } }, { status: 404 }));
    await expect(getAgentTool('pets.update')!.execute(actor, { id: petId, changes: { name: 'Peony' } }, 'existing-task')).rejects.toMatchObject({ status: 404, code: 'PET_NOT_FOUND' });
    expect(mocked.fetch).toHaveBeenCalledTimes(1);
    expect((mocked.fetch.mock.calls[0][0] as Request).method).toBe('GET');
  });
  it('propagates permission/version failures and never fabricates success', async () => {
    mocked.fetch.mockResolvedValueOnce(response({ id: petId })).mockResolvedValueOnce(Response.json({ error: { code: 'VERSION_CONFLICT', message: 'Changed elsewhere' } }, { status: 409 }));
    await expect(getAgentTool('pets.update')!.execute(actor, { id: petId, changes: { name: 'Peony' } }, 'task-two')).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  });
  it('keeps changes, publication, appointment dispatch and Passport attestation behind confirmation metadata', () => {
    for (const name of ['pets.update', 'care.entries.update', 'reminders.complete', 'reminders.snooze', 'appointments.create', 'appointments.cancel', 'lost.cases.publish', 'lost.cases.close', 'passport.after_visit.save', 'share.links.revoke', 'assistant.memories.update', 'assistant.memories.delete']) expect(getAgentTool(name)?.risk).toBe('confirm');
    for (const name of ['identity.consents.update', 'clinic.grants.create', 'petid.training.approve', 'identity.delete', 'pets.delete', 'passport.confirm', 'journal.decorate.preview']) expect(getAgentTool(name)).toBeUndefined();
    expect(AGENT_MANUAL_ACTIONS.consent_and_permissions).toBe('/app?tab=settings');
    expect(AGENT_MANUAL_ACTIONS.journal_decoration_preview).toBe('/app?tab=journal');
  });
  it('redacts private reflections and temporary/capability URLs while retaining stable photo references', () => {
    const clean = agentVisibleData({ narrative: 'Owner-reported fact', reflection: 'SECRET', photos: [{ url: 'PRIVATE' }], token: 'CAPABILITY', elements: [{ type: 'photo', content: `/api/v1/media/${petId}?token=PRIVATE`, x: 1 }], url: 'CAPABILITY_LINK' });
    expect(JSON.stringify(clean)).not.toMatch(/SECRET|PRIVATE|CAPABILITY/);
    expect(clean).toMatchObject({ narrative: 'Owner-reported fact', elements: [{ content: `/api/v1/media/${petId}` }] });
  });
  it('preserves a private reflection internally during a reviewed care update without putting it in agent output', async () => {
    mocked.fetch.mockResolvedValueOnce(response({ id: entryId })).mockResolvedValueOnce(response({ id: entryId, reflection: 'KEEP_PRIVATE' })).mockResolvedValueOnce(response({ id: entryId, reflection: 'KEEP_PRIVATE' }));
    const result = await getAgentTool('care.entries.update')!.execute(actor, { id: entryId, version: 1, kind: 'daily', title: 'Owner corrected title', observedAt: '2026-10-29T00:00:00Z' }, 'task-update');
    const request = mocked.fetch.mock.calls[2][0] as Request;
    expect((await request.json()).reflection).toBe('KEEP_PRIVATE');
    expect(JSON.stringify(result)).not.toContain('KEEP_PRIVATE');
  });
  it('rejects AI-invented idempotency IDs and arbitrary fields on resumable Passport creation', () => {
    expect(() => validateAgentArguments('passport.sessions.create', { petId, reason: 'Owner concern', clientSessionId: entryId })).toThrow();
    const args = validateAgentArguments('passport.sessions.create', { petId, reason: 'Owner concern' });
    expect(args.mediaIds).toEqual([]); expect(args.historyEntryIds).toEqual([]);
  });
  it('performs only current permission reads before showing a confirmation', async () => {
    await assertAgentToolAccess('pets.update', actor, { id: petId, changes: { name: 'Peony' } });
    expect(mocked.fetch).toHaveBeenCalledTimes(1);
    expect((mocked.fetch.mock.calls[0][0] as Request).method).toBe('GET');
    await expect(assertAgentToolAccess('pets.update', actor, { id: 'bad', changes: {} })).rejects.toMatchObject({ code: 'AGENT_TOOL_ARGUMENTS_INVALID' });
    expect(mocked.fetch).toHaveBeenCalledTimes(1);
  });
  it('resolves actual pet behind existing resources rather than trusting a model pet field', async () => {
    mocked.fetch.mockResolvedValueOnce(response({ id: entryId, petId }));
    expect(await resolveAgentActionPetId(actor, 'care.entries.update', { id: entryId, version: 1, kind: 'daily', title: 'Correction', observedAt: '2026-10-29T00:00:00Z' })).toBe(petId);
    const otherPetId = '44444444-4444-4444-8444-444444444444';
    mocked.fetch.mockResolvedValueOnce(response([{ id: entryId, petId: otherPetId }]));
    await expect(resolveAgentActionPetId(actor, 'care.episodes.update', { id: entryId, petId, version: 1, title: 'Changed title', status: 'improving' })).rejects.toMatchObject({ code: 'AGENT_PET_MISMATCH' });
  });
  it('fails closed when a current resource lacks a valid pet reference and allows global owner memory', async () => {
    mocked.fetch.mockResolvedValueOnce(response({ id: entryId }));
    await expect(resolveAgentActionPetId(actor, 'passport.sessions.get', { id: entryId })).rejects.toMatchObject({ code: 'AGENT_RESOURCE_PET_UNKNOWN' });
    mocked.fetch.mockResolvedValueOnce(response({memoryEnabled:true})).mockResolvedValueOnce(response([{ id: entryId, petId: null }]));
    expect(await resolveAgentActionPetId(actor, 'assistant.memories.update', { id: entryId, content: 'Owner preference' })).toBeUndefined();
  });
  it('passes the owner task language to the real domain API', async () => {
    await getAgentTool('pets.get')!.execute(actor, {id:petId}, 'english-task', {language:'en'});
    expect((mocked.fetch.mock.calls[0][0] as Request).headers.get('accept-language')).toBe('en');
  });
  it('validates fixed GET access without preflight and never mutates during inspection', async () => {
    mocked.fetch.mockResolvedValueOnce(Response.json({error:{code:'PET_NOT_FOUND'}},{status:404}));
    await expect(assertAgentToolAccess('pets.get', actor, {id:petId})).rejects.toMatchObject({code:'PET_NOT_FOUND'});
    expect(mocked.fetch).toHaveBeenCalledTimes(1);
    expect((mocked.fetch.mock.calls[0][0] as Request).method).toBe('GET');
  });
  it('requires both fresh optional memory preferences and consent before exposing or writing memories', async () => {
    mocked.fetch.mockResolvedValueOnce(response({memoryEnabled:false}));
    await expect(getAgentTool('assistant.memories.list')!.execute(actor, {}, 'memory-disabled')).rejects.toMatchObject({code:'MEMORY_DISABLED'});
    expect(mocked.fetch.mock.calls.every(([request]) => (request as Request).url.endsWith('/assistant/preferences'))).toBe(true);
    mocked.fetch.mockClear(); mocked.consentQuery.mockResolvedValue({rows:[{granted:false}]});
    await expect(assertAgentToolAccess('assistant.memories.create', actor, {content:'Please remember this'})).rejects.toMatchObject({code:'MEMORY_DISABLED'});
    expect(mocked.fetch).toHaveBeenCalledTimes(1);
    expect((mocked.fetch.mock.calls[0][0] as Request).method).toBe('GET');
    expect(mocked.consentQuery).toHaveBeenCalledWith(expect.stringContaining("purpose='ai_memory'"),[actor.id]);
  });
  it('validates malformed memory input before consulting preferences or consent', async () => {
    await expect(assertAgentToolAccess('assistant.memories.create', actor, {content:'', url:'https://attacker.invalid'})).rejects.toMatchObject({code:'AGENT_TOOL_ARGUMENTS_INVALID'});
    expect(mocked.fetch).not.toHaveBeenCalled(); expect(mocked.consentQuery).not.toHaveBeenCalled();
  });
});
