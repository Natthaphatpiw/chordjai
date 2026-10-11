import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignJWT } from 'jose';
import { signPetidDraft, signSession, verifyPetidDraft, verifySession } from './index';
const owner = '00000000-0000-4000-8000-000000000001';
const pet = '00000000-0000-4000-8000-000000000002';
const photos = ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004'];
const secret = 'unit-test-petid-draft-secret-more-than-32-characters';
const signature = { species: 'cat', usable: true, qualityIssues: [], global: 'tabby cat', face: 'cream chin', coat: 'stripes', marks: 'dark tail tip' };
beforeEach(() => { vi.stubEnv('APP_JWT_SECRET', secret); vi.stubEnv('APP_JWT_ISSUER', 'https://www.chordjai.life'); });
afterEach(() => vi.unstubAllEnvs());
describe('PetID review capability tokens', () => {
  it('binds the reviewed signature to the owner, pet and exact ordered photo set', async () => {
    const ticket = await signPetidDraft(owner, pet, photos, signature);
    expect(await verifyPetidDraft(ticket, owner, pet, photos)).toEqual(signature);
    expect(await verifyPetidDraft(ticket, photos[0]!, pet, photos)).toBeNull();
    expect(await verifyPetidDraft(ticket, owner, photos[0]!, photos)).toBeNull();
    expect(await verifyPetidDraft(ticket, owner, pet, [...photos].reverse())).toBeNull();
    expect(await verifyPetidDraft(ticket, owner, pet, photos.slice(0, 1))).toBeNull();
  });
  it('never treats a review capability as an application login or vice versa', async () => {
    const draft = await signPetidDraft(owner, pet, photos, signature);
    const session = await signSession({ id: owner, role: 'owner' });
    await expect(verifySession(draft)).rejects.toThrow();
    expect(await verifyPetidDraft(session, owner, pet, photos)).toBeNull();
  });
  it('rejects expired, tampered and wrong-issuer capabilities without exposing JWT errors', async () => {
    const claims = { petId: pet, mediaIds: photos, signature };
    const key = new TextEncoder().encode(secret);
    const expired = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject(owner).setIssuer('https://www.chordjai.life').setAudience('chordjai-petid-draft').setExpirationTime(Math.floor(Date.now() / 1000) - 1).sign(key);
    const wrongIssuer = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject(owner).setIssuer('https://example.test').setAudience('chordjai-petid-draft').setExpirationTime('15m').sign(key);
    const valid = await signPetidDraft(owner, pet, photos, signature);
    const [header, payload, tokenSignature] = valid.split('.');
    const changedPayload = Buffer.from(JSON.stringify({ ...claims, signature: { ...signature, marks: 'tampered' }, sub: owner })).toString('base64url');
    for (const token of [expired, wrongIssuer, `${header}.${changedPayload}.${tokenSignature}`, 'not-a-jwt']) expect(await verifyPetidDraft(token, owner, pet, photos)).toBeNull();
    expect(payload).toBeTruthy();
  });
});
