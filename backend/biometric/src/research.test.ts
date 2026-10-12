import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PETID_CAPTURE_VERSION, PETID_TRAINING_POLICY_VERSION, petidCaptureSessionSchema, petidTrainingConsentSchema } from '@chordjai/contracts';
import { validateCaptureDates } from './research';

const sample = () => ({ mediaId: randomUUID(), angle: 'front' as const, capturedAt: '2026-01-01T08:00:00+07:00', source: 'library' as const });
const session = () => ({ requestId: randomUUID(), protocolVersion: PETID_CAPTURE_VERSION, samePetConfirmed: true as const, identityBasis: 'owner_recognition' as const, samples: [sample()] });
describe('PetID research capture validation and consent isolation', () => {
  it('requires a positive owner attestation and rejects fake verification states', () => {
    expect(petidCaptureSessionSchema.safeParse({ ...session(), samePetConfirmed: false }).success).toBe(false);
    expect(petidCaptureSessionSchema.safeParse({ ...session(), identityBasis: 'vet_verified' }).success).toBe(false);
    expect(petidCaptureSessionSchema.parse({ ...session(), reviewStatus: 'approved', identityStatus: 'verified' })).not.toHaveProperty('reviewStatus');
  });
  it('allows one to five distinct photographs but does not require training consent for collection', () => {
    for (let count = 1; count <= 5; count++) expect(petidCaptureSessionSchema.safeParse({ ...session(), samples: Array.from({ length: count }, sample) }).success).toBe(true);
    for (const samples of [[], Array.from({ length: 6 }, sample), (() => { const photo = sample(); return [photo, photo]; })()])
      expect(petidCaptureSessionSchema.safeParse({ ...session(), samples }).success).toBe(false);
    expect(petidCaptureSessionSchema.parse(session())).not.toHaveProperty('trainingConsent');
  });
  it('requires offset-aware capture timestamps and stable policy versions', () => {
    expect(petidCaptureSessionSchema.safeParse({ ...session(), samples: [{ ...sample(), capturedAt: '2026-01-01' }] }).success).toBe(false);
    for (const capturedAt of ['2026-02-30T12:00:00+07:00','2026-02-29T12:00:00+07:00','2026-04-31T12:00:00+07:00'])
      expect(petidCaptureSessionSchema.safeParse({ ...session(), samples: [{ ...sample(), capturedAt }] }).success).toBe(false);
    expect(petidCaptureSessionSchema.safeParse({ ...session(), samples: [{ ...sample(), capturedAt: '2024-02-29T12:00:00+07:00' }] }).success).toBe(true);
    expect(petidCaptureSessionSchema.safeParse({ ...session(), protocolVersion: 'unknown' }).success).toBe(false);
    expect(petidTrainingConsentSchema.safeParse({ requestId: randomUUID(), granted: true, expectedVersion: 0, policyVersion: 'ai_improvement' }).success).toBe(false);
    expect(petidTrainingConsentSchema.parse({ requestId: randomUUID(), granted: false, expectedVersion: 1, policyVersion: PETID_TRAINING_POLICY_VERSION }).granted).toBe(false);
  });
  it('rejects future and historically invalid capture dates while accepting actual earlier timestamps', () => {
    const now = Date.parse('2026-10-12T12:00:00+07:00');
    expect(() => validateCaptureDates(session(), now)).not.toThrow();
    for (const capturedAt of ['2026-10-12T12:00:01+07:00', '1899-12-31T00:00:00Z', 'not-a-date'])
      expect(() => validateCaptureDates({ samples: [{ ...sample(), capturedAt }] }, now)).toThrow();
  });
});
