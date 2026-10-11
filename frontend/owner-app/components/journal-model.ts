import type { JournalElement, JournalPage } from '../lib/types';
export const STORY_HEIGHT = 1422 as const;
export const LEGACY_HEIGHT = 1000 as const;
export function canvasHeight(page: Pick<JournalPage, 'canvasHeight'>): number { return page.canvasHeight === STORY_HEIGHT ? STORY_HEIGHT : LEGACY_HEIGHT; }
export function boundElement(item: JournalElement, height: number): JournalElement {
  const width = Math.max(24, Math.min(800, Number.isFinite(item.width) ? item.width : 180));
  const itemHeight = Math.max(24, Math.min(height, Number.isFinite(item.height) ? item.height : 180));
  return { ...item, width, height: itemHeight, x: Math.max(0, Math.min(800 - width, Number.isFinite(item.x) ? item.x : 0)), y: Math.max(0, Math.min(height - itemHeight, Number.isFinite(item.y) ? item.y : 0)), rotation: Math.max(-180, Math.min(180, Number.isFinite(item.rotation) ? item.rotation : 0)) };
}
export function scaleElement(item: JournalElement, factor: number, height: number): JournalElement {
  const safe = Math.max(24 / Math.min(item.width, item.height), Math.min(factor, 800 / item.width, height / item.height));
  const width = item.width * safe, nextHeight = item.height * safe;
  return boundElement({ ...item, width, height: nextHeight, x: item.x + (item.width - width) / 2, y: item.y + (item.height - nextHeight) / 2 }, height);
}
export function orderPages(pages: JournalPage[]): JournalPage[] { return [...pages].sort((a,b) => (a.pageOrder ?? 0) - (b.pageOrder ?? 0) || (a.createdAt ?? a.updatedAt ?? '').localeCompare(b.createdAt ?? b.updatedAt ?? '') || a.id.localeCompare(b.id)); }
export function safeJournalPhoto(value: string, demo = false): string {
  if (/^https:\/\//.test(value) || /^\/api\/v1\/media\/[0-9a-f-]{36}/i.test(value) || ['/images/pet-home-cat.webp', '/images/pet-home-dog.webp'].includes(value)) return value;
  return demo && /^data:image\/(?:jpeg|png|webp);base64,/.test(value) ? value : '';
}
