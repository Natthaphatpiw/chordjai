import { describe, expect, it } from 'vitest';
import { mergePetidCheck, newPetidCheckRequest, petidCheckSummary, type PetidCaptureCheck } from '../../frontend/owner-app/components/petid-check-model';
const check = (patch: Partial<PetidCaptureCheck> = {}): PetidCaptureCheck => ({ id: 'check-2', createdAt: '2026-10-12T04:00:00Z', status: 'completed', consistency: 'possible_same', comparisonScope: 'previous_session', observations: ['Markings appear compatible.'], limitations: 'Visual consistency is not identity proof.', samples: [{ sampleId: 'sample-1', quality: 'acceptable', issues: [], width: 1200, height: 1600, metrics: { meanLuminance: 120, clippedDarkFraction: .01, clippedLightFraction: .01, laplacianVariance: 200 } }], ...patch });
describe('Owner PetID checks cannot become identity proof', () => {
  it('keeps an explicit request ID for the versioned image check', () => {
    const request = newPetidCheckRequest('00000000-0000-4000-8000-000000000001');
    expect(request).toEqual({ requestId: '00000000-0000-4000-8000-000000000001', version: 'petid-review-v1' });
    expect(newPetidCheckRequest().requestId).not.toBe(newPetidCheckRequest().requestId);
  });
  it('deduplicates a retry and preserves newer results while refusing identity proof', () => {
    const old = check({ id: 'check-1', createdAt: '2026-10-12T03:00:00Z' });
    const state = { version: 'petid-review-v1', checks: [check(), old], reviews: [], identityProof: true };
    const updated = mergePetidCheck(state, { ...old, observations: ['Retried result.'] });
    expect(updated.checks.map(item => item.id)).toEqual(['check-2', 'check-1']);
    expect(updated.checks[1].observations).toEqual(['Retried result.']);
    expect(updated.identityProof).toBe(false);
    expect(state.checks[1].observations).not.toEqual(updated.checks[1].observations);
  });
  it('prioritises incomplete or retake results over a possible-same visual suggestion', () => {
    expect(petidCheckSummary(check({ status: 'processing' }))).toBe('processing');
    expect(petidCheckSummary(check({ status: 'failed' }))).toBe('failed');
    expect(petidCheckSummary(check({ samples: [{ ...check().samples[0], quality: 'retake', issues: ['duplicate_exact'] }] }))).toBe('retake');
    expect(petidCheckSummary(check())).toBe('possible_same');
    expect(petidCheckSummary(check({ consistency: 'different' }))).toBe('different');
    expect(petidCheckSummary(check({ consistency: 'insufficient' }))).toBe('insufficient');
  });
});
