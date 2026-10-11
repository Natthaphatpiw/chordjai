export type CareKind = 'daily' | 'symptom' | 'visit' | 'followup';
export type CareEpisodeStatus = 'ongoing' | 'improving' | 'resolved';
export interface CareObservations {
  symptoms: string[];
  severity: 'unknown' | 'mild' | 'moderate' | 'severe';
  appetite: 'unknown' | 'normal' | 'reduced' | 'none';
  energy: 'unknown' | 'normal' | 'low' | 'restless';
  trend: 'unknown' | 'new' | 'same' | 'better' | 'worse';
  water: 'unknown' | 'normal' | 'less' | 'more';
  toilet: 'unknown' | 'normal' | 'changed';
  onsetAt: string | null;
  frequency: string;
}
export interface CareVisit {
  clinicName: string;
  reason: string;
  vetReportedFindings: string;
  treatment: string;
  nextFollowupAt: string | null;
}
export interface CareCost { label: string; amountMinor: number; currency: 'THB' | 'USD'; kind: 'paid' | 'estimate'; }
export interface CarePhoto { mediaId: string; url: string; }
export interface CareEntryInput {
  episodeId: string | null;
  kind: CareKind;
  title: string;
  observedAt: string;
  narrative: string;
  clinicalNote: string;
  reflection: string;
  observations: CareObservations;
  visit: CareVisit | null;
  costs: CareCost[];
  mediaIds: string[];
  shareWithClinic: boolean;
  shareCosts: boolean;
}
export interface CareEntry extends CareEntryInput {
  id: string;
  petId: string;
  clientEntryId: string;
  createdBy: string;
  provenance: 'owner_reported';
  version: number;
  createdAt: string;
  updatedAt: string;
  photos: CarePhoto[];
  canEdit: boolean;
  canEditReflection: boolean;
}
export interface CareEpisode {
  id: string;
  petId: string;
  createdBy: string;
  clientEpisodeId: string;
  title: string;
  startedAt: string;
  resolvedAt: string | null;
  status: CareEpisodeStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  canEdit?: boolean;
}
export interface CareSummaryEntry {
  id: string;
  kind: CareKind;
  title: string;
  observedAt: string;
  clinicalNote: string;
  observations: CareObservations;
  visit: CareVisit | null;
  episode: Pick<CareEpisode, 'id' | 'title' | 'status'> | null;
  provenance: 'owner_reported';
  costs?: CareCost[];
}
export interface CareSummary { entries: CareSummaryEntry[]; generatedAt: string; provenance: 'owner_reported'; truncated?: boolean; sharedOnly?: boolean; }
/** This bridge only contains items explicitly selected in the memory dialog. */
export interface CareMemoryDraft { title: string; narrative: string; photoUrl?: string; storyDate: string; }
