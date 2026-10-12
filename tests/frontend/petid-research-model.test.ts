import { describe, expect, it } from 'vitest';
import { dateTodayBangkok, researchDraftValid, researchFingerprint, validResearchDate, type ResearchPhotoDraft } from '../../frontend/owner-app/components/petid-research-model';
const photo: ResearchPhotoDraft = { mediaId: 'owned-photo', url: '/photo.jpg', angle: 'front', capturedDate: '2026-10-12', capturedTime: '09:00', source: 'library' };
describe('Research photo collection is owner dated and independent from training consent', () => {
  it('requires same-pet attestation and rejects duplicate or over-limit photos', () => {
    expect(researchDraftValid([photo], true, '2026-10-12')).toBe(true);
    expect(researchDraftValid([photo], false, '2026-10-12')).toBe(false);
    expect(researchDraftValid([], true, '2026-10-12')).toBe(false);
    expect(researchDraftValid(Array.from({ length: 6 }, (_, i) => ({ ...photo, mediaId: `${i}` })), true, '2026-10-12')).toBe(false);
    expect(researchDraftValid([photo, photo], true, '2026-10-12')).toBe(false);
  });
  it('checks real calendar dates, including leap days, and rejects future capture dates', () => {
    expect(validResearchDate('2024-02-29', '2026-10-12')).toBe(true);
    expect(validResearchDate('2026-02-29', '2026-10-12')).toBe(false);
    expect(validResearchDate('2026-10-13', '2026-10-12')).toBe(false);
    expect(validResearchDate('2026-1-2', '2026-10-12')).toBe(false);
    expect(dateTodayBangkok(new Date('2026-10-11T18:00:00Z'))).toBe('2026-10-12');
  });
  it('changes the fingerprint when the owner corrects an angle or capture date', () => {
    expect(researchFingerprint([photo])).not.toBe(researchFingerprint([{ ...photo, capturedDate: '2026-10-01' }]));
    expect(researchFingerprint([photo])).not.toBe(researchFingerprint([{ ...photo, angle: 'left' }]));
  });
});
