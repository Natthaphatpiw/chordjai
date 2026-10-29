import { PASSPORT_PROTOCOL, passportQuestion, type PassportAnswerStatus, type PassportClinicNote, type PassportLanguage, type PassportQuestionId, type PassportSession, type PassportSnapshot } from '../../../packages/contracts/src/passport';
import { relevantQuestions, passportEmergency, pendingQuestions, normalizePassportAnswerStatus, type AnswerMap } from '../../../packages/contracts/src/passport-plan';
import type { CareEntry, CareEpisode } from '../lib/care-types';
import type { Pet } from '../lib/types';
import { DEFAULT_OBSERVATIONS, careLocalToIso, moneyToMinor, validExpenseDate, type CareCostDraft } from './care-diary-model';
export interface PassportPhoto { mediaId: string; url: string; }

export interface PassportLink { id: string; sessionId: string; url: string | null; expiresAt: string; revokedAt?: string | null; revoked?: boolean; demo?: boolean; }
export interface AfterVisitDraft { clientEntryId: string; clinicNoteId: string | null; observedLocal: string; title: string; narrative: string; clinicName: string; findings: string; treatment: string; followupLocal: string; costs: CareCostDraft[]; photos: PassportPhoto[]; reflection: string; shareWithClinic: boolean; shareCosts: boolean; confirmed: boolean; }
function answerMap(session: Pick<PassportSession, 'answers'>): AnswerMap { return Object.fromEntries(session.answers.map(answer => [answer.questionId, { status: answer.status, value: answer.value, attempts: answer.attempts, updatedAt: answer.updatedAt }])); }
export function demoQuestionPlan(session: Pick<PassportSession, 'reason' | 'answers'>): PassportQuestionId[] {
  return relevantQuestions(session.reason, answerMap(session));
}
export function demoNextQuestion(session: PassportSession) {
  if (session.emergency.urgent) return null;
  for (const id of pendingQuestions(session.reason, answerMap(session))) {
    const answer = session.answers.find(item => item.questionId === id);
    if (!answer) return passportQuestion(id, session.language);
    if (answer.status === 'unknown' && answer.attempts === 1) return passportQuestion(id, session.language, true);
  }
  return null;
}
export function newDemoPassport(petId: string, language: PassportLanguage, reason: string, episodeId: string | null, history: PassportSession['history'], photos: PassportPhoto[], id: string, now: string): PassportSession {
  const session: PassportSession = { id, petId, version: 1, status: 'draft', language, reason: reason.trim(), episodeId, historyEntryIds: history.map(item => item.id), mediaIds: photos.map(photo => photo.mediaId), answers: [], nextQuestion: passportQuestion('danger_signs', language), emergency: { urgent: false, codes: [], message: '' }, readyForReview: false, history, photos, confirmation: null, clinicNotes: [], afterVisitEntryId: null, createdAt: now, updatedAt: now };
  session.emergency = passportEmergency(session.reason, {}, language); session.nextQuestion = demoNextQuestion(session); session.readyForReview = session.nextQuestion === null;
  return session;
}
export function answerDemoPassport(session: PassportSession, questionId: PassportQuestionId, status: PassportAnswerStatus, value: string, now: string): PassportSession {
  if (status === 'answered' && !value.trim()) throw new Error('ANSWER_REQUIRED');
  status = normalizePassportAnswerStatus(status, value);
  const previous = session.answers.find(answer => answer.questionId === questionId);
  const answer = { questionId, status, value: status === 'answered' || status === 'unknown' && normalizePassportAnswerStatus('answered', value) === 'unknown' ? value.trim() : '', attempts: (previous?.attempts ?? 0) + 1, updatedAt: now, question: passportQuestion(questionId, session.language, Boolean(previous)) };
  const answers = session.answers.some(item => item.questionId === questionId) ? session.answers.map(item => item.questionId === questionId ? answer : item) : [...session.answers, answer];
  const next = { ...session, answers, version: session.version + 1, status: 'draft' as const, confirmation: null, updatedAt: now, emergency: passportEmergency(session.reason, answerMap({ answers }), session.language) };
  next.nextQuestion = demoNextQuestion(next); next.readyForReview = next.nextQuestion === null;
  return next;
}
export function editDemoConcern(session: PassportSession, reason: string, historyEntryIds: string[], now: string): PassportSession {
  const next = { ...session, reason, historyEntryIds, history: session.history.filter(item => historyEntryIds.includes(item.id)), version: session.version + 1, status: 'draft' as const, confirmation: null, updatedAt: now, emergency: passportEmergency(reason, answerMap(session), session.language) };
  next.nextQuestion = demoNextQuestion(next); next.readyForReview = next.nextQuestion === null; return next;
}
export function snapshotDemoPassport(session: PassportSession, pet: Pet, publishToClinic: boolean, id: string, now: string): PassportSession {
  if (!session.readyForReview) throw new Error('REVIEW_INCOMPLETE');
  const document: PassportSnapshot = { protocol: PASSPORT_PROTOCOL, sessionId: session.id, petId: session.petId, language: session.language, pet: { name: pet.name, species: pet.species, sex: pet.sex, birthDate: pet.birthDate ?? null, weightKg: pet.weightKg ?? null }, concern: session.reason, episodeId: session.episodeId, answers: session.answers.map(answer => ({ ...answer, question: { ...answer.question, choices: [...answer.question.choices] } })), history: session.history.map(item => ({ ...item })), mediaIds: [...session.mediaIds], emergency: { ...session.emergency, codes: [...session.emergency.codes] }, summary: { concern: session.reason, answeredCount: session.answers.filter(answer => answer.status === 'answered').length, unknownQuestionIds: session.answers.filter(answer => answer.status === 'unknown').map(answer => answer.questionId), notApplicableQuestionIds: session.answers.filter(answer => answer.status === 'not_applicable').map(answer => answer.questionId) }, provenance: 'owner_reported', confirmedAt: now, sessionVersion: session.version + 1 };
  return { ...session, version: session.version + 1, status: 'confirmed', confirmation: { id, document, confirmedAt: now, publishedToClinic: publishToClinic }, updatedAt: now };
}
export function safeHistory(entries: CareEntry[], selectedIds: string[]): PassportSession['history'] {
  return entries.filter(entry => selectedIds.includes(entry.id) && entry.shareWithClinic && entry.clinicalNote.trim()).map(entry => ({ id: entry.id, kind: entry.kind, title: entry.title, observedAt: entry.observedAt, clinicalNote: entry.clinicalNote, visit: entry.visit ? { ...entry.visit } : null, provenance: 'owner_reported', requiresCurrentConfirmation: true }));
}
export function historyOptions(entries: CareEntry[]) { return entries.filter(entry => entry.shareWithClinic && entry.clinicalNote.trim()); }
export function uniqueDiaryPhotos(entries: CareEntry[]): PassportPhoto[] { const byId = new Map<string, PassportPhoto>(); for (const entry of entries) if (entry.canEdit) for (const photo of entry.photos) byId.set(photo.mediaId, photo); return [...byId.values()]; }
export function demoLinkState(link: PassportLink, now: number) { return link.revoked || link.revokedAt ? 'revoked' : new Date(link.expiresAt).getTime() <= now ? 'expired' : 'active'; }
export function validateAfterVisit(draft: AfterVisitDraft): 'date' | 'followup' | 'title' | 'details' | 'costs' | 'confirm' | null {
  if (!careLocalToIso(draft.observedLocal)) return 'date';
  if (draft.followupLocal && (!careLocalToIso(draft.followupLocal) || draft.followupLocal < draft.observedLocal)) return 'followup';
  if (!draft.title.trim()) return 'title';
  if (![draft.narrative, draft.findings, draft.treatment].some(value => value.trim())) return 'details';
  if (draft.costs.some(cost => !cost.label.trim() || moneyToMinor(cost.amount) === null || !validExpenseDate(cost.expenseDate))) return 'costs';
  if (!draft.confirmed) return 'confirm'; return null;
}
export function afterVisitPayload(draft: AfterVisitDraft, version: number) {
  const invalid = validateAfterVisit(draft); if (invalid) throw new Error(invalid);
  return { version, ownerConfirmed: true as const, clientEntryId: draft.clientEntryId, clinicNoteId: draft.clinicNoteId, observedAt: careLocalToIso(draft.observedLocal)!, title: draft.title.trim(), narrative: draft.narrative.trim(), clinicName: draft.clinicName.trim(), vetReportedFindings: draft.findings.trim(), treatment: draft.treatment.trim(), nextFollowupAt: draft.followupLocal ? careLocalToIso(draft.followupLocal) : null, costs: draft.costs.map(cost => ({ label: cost.label.trim(), amountMinor: moneyToMinor(cost.amount)!, currency: cost.currency, kind: cost.kind, expenseDate: cost.expenseDate || null })), mediaIds: draft.photos.map(photo => photo.mediaId), reflection: draft.reflection, shareWithClinic: draft.shareWithClinic, shareCosts: draft.shareWithClinic && draft.shareCosts };
}
export function afterVisitFromNote(note: PassportClinicNote, draft: AfterVisitDraft): AfterVisitDraft {
  return { ...draft, clinicNoteId: note.id, clinicName: note.clinicName, findings: note.findings, treatment: [note.treatment, note.careInstructions].filter(Boolean).join('\n'), followupLocal: note.nextFollowupAt ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(note.nextFollowupAt)).replace(' ', 'T') : '', confirmed: false };
}
export function demoAfterVisit(session: PassportSession, draft: AfterVisitDraft, now: string): { session: PassportSession; entry: CareEntry; episode?: CareEpisode } {
  const input = afterVisitPayload(draft, session.version), episodeId = session.episodeId ?? session.id;
  const entry: CareEntry = { id: input.clientEntryId, petId: session.petId, clientEntryId: input.clientEntryId, createdBy: 'demo-owner', kind: 'visit', episodeId, title: input.title, observedAt: input.observedAt, narrative: input.narrative || [input.vetReportedFindings, input.treatment].filter(Boolean).join('\n'), clinicalNote: [input.vetReportedFindings, input.treatment].filter(Boolean).join('\n'), reflection: input.reflection, observations: { ...DEFAULT_OBSERVATIONS, symptoms: [] }, visit: { clinicName: input.clinicName, reason: session.reason, vetReportedFindings: input.vetReportedFindings, treatment: input.treatment, nextFollowupAt: input.nextFollowupAt }, costs: input.costs, mediaIds: input.mediaIds, photos: draft.photos, shareWithClinic: input.shareWithClinic, shareCosts: input.shareCosts, provenance: 'owner_reported', passportSource: { kind: draft.clinicNoteId ? 'owner_confirmed_clinic_note' : 'owner_reported_visit', sessionId: session.id, snapshotId: session.confirmation?.id ?? 'demo', ...(draft.clinicNoteId ? { clinicNoteId: draft.clinicNoteId } : {}), confirmedBy: 'demo-owner', confirmedAt: now }, version: 1, createdAt: now, updatedAt: now, canEdit: true, canEditReflection: true };
  return { session: { ...session, episodeId, afterVisitEntryId: entry.id, updatedAt: now, version: session.version + 1 }, entry, ...(!session.episodeId ? { episode: { id: episodeId, petId: session.petId, clientEpisodeId: episodeId, createdBy: 'demo-owner', title: session.reason.slice(0, 160), status: 'ongoing' as const, startedAt: session.createdAt, resolvedAt: null, createdAt: now, updatedAt: now, version: 1, canEdit: true } } : {}) };
}
