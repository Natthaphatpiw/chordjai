import { describe, expect, it } from 'vitest';
import { canSaveFollowup, FOLLOWUP_POLICY, followupPayload, freshFollowupSettings } from '../../frontend/owner-app/components/followup-settings-model';
describe('Proactive follow-up preferences', () => {
  it('defaults to off, seven days and every data source off', () => {
    const value = freshFollowupSettings('en');
    expect(value.enabled).toBe(false); expect(value.cadenceDays).toBe(7); expect(Object.values(value.sources)).toEqual([false, false, false, false]); expect(value.consentVersion).toBeNull();
    expect(canSaveFollowup(value, false)).toBe(true);
  });
  it('requires an explicitly selected source and dedicated consent before activation', () => {
    const value = { ...freshFollowupSettings('th'), enabled: true };
    expect(canSaveFollowup(value, true)).toBe(false);
    value.sources.care = true;
    expect(canSaveFollowup(value, false)).toBe(false); expect(canSaveFollowup(value, true)).toBe(true);
    expect(followupPayload(value, true)).toEqual({ enabled: true, cadenceDays: 7, language: 'th', pausedUntil: null, sources: { care: true, booklet: false, journal: false, assistantMemory: false }, consentVersion: FOLLOWUP_POLICY, expectedVersion: 0 });
    expect(() => followupPayload(value, false)).toThrow('FOLLOWUP_CONSENT_REQUIRED');
  });
  it('never expands caller source objects into private or unrecognised data permissions', () => {
    const value = freshFollowupSettings('en');
    Object.assign(value.sources, { privateReflections: true, costs: true });
    const payload = followupPayload(value, false);
    expect(payload.sources).not.toHaveProperty('privateReflections'); expect(payload.sources).not.toHaveProperty('costs');
  });
});
