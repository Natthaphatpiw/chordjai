import type { Locale } from '../../shared/locale-core';
export const FOLLOWUP_POLICY = '2026-10-12.followup.v1';
export const FOLLOWUP_SOURCES = ['care', 'booklet', 'journal', 'assistantMemory'] as const;
export type FollowupSource = typeof FOLLOWUP_SOURCES[number];
export type FollowupSettings = { enabled: boolean; cadenceDays: 5 | 7; language: Locale; pausedUntil: string | null; sources: Record<FollowupSource, boolean>; consentVersion: string | null; version: number; followed: boolean; lastAcceptedAt: string | null; deliveryWindow: { timeZone: string; startHour: number; endHour: number } };
export function freshFollowupSettings(language: Locale): FollowupSettings {
  return { enabled: false, cadenceDays: 7, language, pausedUntil: null, sources: { care: false, booklet: false, journal: false, assistantMemory: false }, consentVersion: null, version: 0, followed: false, lastAcceptedAt: null, deliveryWindow: { timeZone: 'Asia/Bangkok', startHour: 9, endHour: 20 } };
}
export function canSaveFollowup(value: FollowupSettings, explicitConsent: boolean): boolean {
  return !value.enabled || (explicitConsent && FOLLOWUP_SOURCES.some(source => value.sources[source]));
}
export function followupPayload(value: FollowupSettings, explicitConsent: boolean) {
  if (!canSaveFollowup(value, explicitConsent)) throw new Error('FOLLOWUP_CONSENT_REQUIRED');
  return { enabled: value.enabled, cadenceDays: value.cadenceDays, language: value.language, pausedUntil: value.pausedUntil, sources: { care: value.sources.care, booklet: value.sources.booklet, journal: value.sources.journal, assistantMemory: value.sources.assistantMemory }, consentVersion: value.enabled ? FOLLOWUP_POLICY : null, expectedVersion: value.version };
}
export function followupFingerprint(value: FollowupSettings): string {
  return JSON.stringify({ enabled: value.enabled, cadenceDays: value.cadenceDays, language: value.language, pausedUntil: value.pausedUntil, sources: value.sources, consentVersion: value.consentVersion });
}
