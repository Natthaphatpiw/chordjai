export const RESEARCH_PHOTO_LIMIT = 5;
export const RESEARCH_ANGLES = ['front', 'left', 'right', 'full_body', 'nose_detail', 'distinctive_mark'] as const;
export type ResearchAngle = typeof RESEARCH_ANGLES[number];
export type ResearchPhotoDraft = { mediaId: string; url: string; angle: ResearchAngle; capturedDate: string; capturedTime: string; source: 'camera' | 'library'; local?: boolean };

/** Camera metadata is stripped; the owner supplies the date, never inferred from upload time. */
export function dateTodayBangkok(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(value => value.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validResearchDate(value: string, today = dateTodayBangkok()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today || value < '2000-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function researchDraftValid(photos: readonly ResearchPhotoDraft[], samePet: boolean, today = dateTodayBangkok()): boolean {
  return samePet && photos.length > 0 && photos.length <= RESEARCH_PHOTO_LIMIT
    && new Set(photos.map(photo => photo.mediaId)).size === photos.length
    && photos.every(photo => RESEARCH_ANGLES.includes(photo.angle) && validResearchDate(photo.capturedDate, today) && /^([01]\d|2[0-3]):[0-5]\d$/.test(photo.capturedTime));
}
export function researchFingerprint(photos: readonly ResearchPhotoDraft[]): string {
  return JSON.stringify(photos.map(({ mediaId, angle, capturedDate, capturedTime, source }) => ({ mediaId, angle, capturedDate, capturedTime, source })));
}
