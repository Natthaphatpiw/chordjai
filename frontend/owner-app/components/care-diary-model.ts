import type { CareCost, CareEntry, CareEntryInput, CareEpisode, CareKind, CareObservations, CareSummaryEntry } from '../lib/care-types';

export const CARE_PHOTO_LIMIT = 5;
export const CARE_PAGE_SIZE = 50;
export const DEFAULT_OBSERVATIONS: CareObservations = { symptoms: [], severity: 'unknown', appetite: 'unknown', energy: 'unknown', trend: 'unknown', water: 'unknown', toilet: 'unknown', onsetAt: null, frequency: '' };
export interface CareCostDraft { id: string; label: string; amount: string; currency: CareCost['currency']; kind: CareCost['kind']; }
export interface CareEntryDraft extends Omit<CareEntryInput, 'observedAt' | 'costs' | 'mediaIds' | 'visit' | 'observations'> {
  observedLocal: string;
  onsetLocal: string;
  followupLocal: string;
  symptomsText: string;
  observations: CareObservations;
  visit: { clinicName: string; reason: string; vetReportedFindings: string; treatment: string };
  costs: CareCostDraft[];
  photos: { mediaId: string; url: string }[];
  newEpisodeTitle: string;
}
/** Gregorian local dates in Bangkok, independent of the browser/host zone. */
export function bangkokLocalDateTime(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const fields = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const part = (name: string) => fields.find(item => item.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function careLocalToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  if (!Number.isFinite(date.getTime()) || bangkokLocalDateTime(date) !== value || Number(value.slice(0,4)) < 1900 || Number(value.slice(0,4)) > 2200) return null;
  return date.toISOString();
}
/** Decimal input is parsed as minor units; blank is unknown, never zero. */
export function moneyToMinor(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= 100_000_000 ? amount : null;
}
export function minorToMoney(value: number): string { return (value / 100).toFixed(2); }
export function moneyTotals(entries: Pick<CareEntry, 'costs'>[]): { currency: CareCost['currency']; paid: number | null; estimate: number | null; count: number }[] {
  const groups = new Map<CareCost['currency'], { paid: number | null; estimate: number | null; count: number }>();
  for (const entry of entries) for (const cost of entry.costs) {
    if (!Number.isSafeInteger(cost.amountMinor) || cost.amountMinor < 0) continue;
    const group = groups.get(cost.currency) ?? { paid: null, estimate: null, count: 0 };
    group[cost.kind] = (group[cost.kind] ?? 0) + cost.amountMinor;
    group.count++; groups.set(cost.currency, group);
  }
  return [...groups].map(([currency, group]) => ({currency, ...group})).sort((a,b) => a.currency.localeCompare(b.currency));
}
export function freshCareDraft(kind: CareKind = 'daily', episodeId: string | null = null): CareEntryDraft {
  return { kind, episodeId, title: '', observedLocal: bangkokLocalDateTime(), narrative: '', clinicalNote: '', reflection: '', observations: { ...DEFAULT_OBSERVATIONS, symptoms: [] }, symptomsText: '', onsetLocal: '', followupLocal: '', visit: { clinicName: '', reason: '', vetReportedFindings: '', treatment: '' }, costs: [], photos: [], newEpisodeTitle: '', shareWithClinic: false, shareCosts: false };
}
export function draftFromEntry(entry: CareEntry): CareEntryDraft {
  return { ...freshCareDraft(entry.kind, entry.episodeId), title: entry.title, observedLocal: bangkokLocalDateTime(entry.observedAt), narrative: entry.narrative, clinicalNote: entry.clinicalNote, reflection: entry.canEditReflection ? entry.reflection : '', observations: { ...DEFAULT_OBSERVATIONS, ...entry.observations }, symptomsText: entry.observations.symptoms.join(', '), onsetLocal: entry.observations.onsetAt ? bangkokLocalDateTime(entry.observations.onsetAt) : '', followupLocal: entry.visit?.nextFollowupAt ? bangkokLocalDateTime(entry.visit.nextFollowupAt) : '', visit: entry.visit ? { clinicName: entry.visit.clinicName, reason: entry.visit.reason, vetReportedFindings: entry.visit.vetReportedFindings, treatment: entry.visit.treatment } : freshCareDraft().visit, costs: entry.costs.map((cost,index) => ({ ...cost, id: `cost-${index}`, amount: minorToMoney(cost.amountMinor) })), photos: entry.photos.map(photo=>({...photo})), shareWithClinic: entry.shareWithClinic, shareCosts: entry.shareCosts };
}
export type CareValidation = 'narrative' | 'date' | 'onset' | 'followup' | 'symptoms' | 'cost' | 'sharing' | 'photos' | null;
export function validateCareDraft(draft: CareEntryDraft): CareValidation {
  if (!draft.narrative.trim() || draft.narrative.length > 6000) return 'narrative';
  if (!careLocalToIso(draft.observedLocal)) return 'date';
  if (draft.onsetLocal && (!careLocalToIso(draft.onsetLocal) || draft.onsetLocal > draft.observedLocal)) return 'onset';
  if (draft.followupLocal && (!careLocalToIso(draft.followupLocal) || draft.followupLocal < draft.observedLocal)) return 'followup';
  const symptoms = draft.symptomsText.split(/[,\n]/).map(item=>item.trim()).filter(Boolean);
  if (symptoms.length > 12 || symptoms.some(item=>item.length>80)) return 'symptoms';
  if (draft.costs.length > 30 || draft.costs.some(cost=>!cost.label.trim() || moneyToMinor(cost.amount) === null)) return 'cost';
  if (draft.shareWithClinic && !draft.clinicalNote.trim()) return 'sharing';
  if (draft.photos.length > CARE_PHOTO_LIMIT || new Set(draft.photos.map(item=>item.mediaId)).size !== draft.photos.length) return 'photos';
  return null;
}
export function payloadFromDraft(draft: CareEntryDraft, fallbackTitle: string): CareEntryInput {
  const validation = validateCareDraft(draft);
  if (validation) throw new Error(validation);
  const hasVisit = draft.kind === 'visit' || draft.followupLocal || Object.values(draft.visit).some(Boolean);
  return { kind: draft.kind, episodeId: draft.episodeId, title: draft.title.trim() || fallbackTitle, observedAt: careLocalToIso(draft.observedLocal)!, narrative: draft.narrative.trim(), clinicalNote: draft.clinicalNote.trim(), reflection: draft.reflection, observations: { ...draft.observations, symptoms: [...new Set(draft.symptomsText.split(/[,\n]/).map(item=>item.trim()).filter(Boolean))], onsetAt: draft.onsetLocal ? careLocalToIso(draft.onsetLocal) : null }, visit: hasVisit ? { ...draft.visit, nextFollowupAt: draft.followupLocal ? careLocalToIso(draft.followupLocal) : null } : null, costs: draft.costs.map(cost=>({ label:cost.label.trim(), amountMinor:moneyToMinor(cost.amount)!, currency:cost.currency, kind:cost.kind })), mediaIds:draft.photos.map(photo=>photo.mediaId), shareWithClinic:draft.shareWithClinic, shareCosts:draft.shareWithClinic && draft.shareCosts };
}
/** Compare UTC instants without losing PostgreSQL microseconds or changing a cursor. */
export function careInstantKey(value:string):string {
  const match=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  const date=new Date(value);
  if(!match||!Number.isFinite(date.getTime()))return value;
  return `${date.toISOString().slice(0,19)}.${(match[1]??'').padEnd(6,'0')}Z`;
}
export function orderCareEntries(entries: CareEntry[]): CareEntry[] { return [...entries].sort((a,b)=>careInstantKey(b.observedAt).localeCompare(careInstantKey(a.observedAt)) || b.id.localeCompare(a.id)); }
export function mergeCareEntries(current:CareEntry[],older:CareEntry[]):CareEntry[]{const byId=new Map(current.map(item=>[item.id,item]));for(const item of older)if(!byId.has(item.id))byId.set(item.id,item);return orderCareEntries([...byId.values()]);}
export function orderCareEpisodes(episodes:CareEpisode[]):CareEpisode[]{return [...episodes].sort((a,b)=>careInstantKey(b.startedAt).localeCompare(careInstantKey(a.startedAt))||b.id.localeCompare(a.id));}
export function clinicalProjection(entries: CareEntry[], episodes: CareEpisode[], includeCosts = false): CareSummaryEntry[] {
  return orderCareEntries(entries.filter(entry=>entry.shareWithClinic)).map(entry=>{ const episode = episodes.find(item=>item.id===entry.episodeId); return {id:entry.id,kind:entry.kind,title:entry.title,observedAt:entry.observedAt,clinicalNote:entry.clinicalNote,observations:entry.observations,visit:entry.visit,episode:episode ? {id:episode.id,title:episode.title,status:episode.status} : null,provenance:'owner_reported',...(includeCosts && entry.shareCosts ? {costs:entry.costs} : {})}; });
}
export function safeCarePhoto(url: string, demo: boolean): string {
  if (/^\/api\/v1\/media\/[0-9a-f-]{36}(?:[/?]|$)/i.test(url) || /^https:\/\//.test(url) || ['/images/pet-home-cat.webp','/images/pet-home-dog.webp'].includes(url)) return url;
  return demo && /^data:image\/(?:jpeg|png|webp);base64,/.test(url) ? url : '';
}
