export const PETID_CHECK_VERSION = 'petid-review-v1';
export type PetidPhotoIssue = 'too_small' | 'too_dark' | 'too_bright' | 'blur_or_low_detail' | 'duplicate_exact' | 'near_duplicate';
export type PetidCheckQuality = 'acceptable' | 'retake' | 'review';
export type PetidCheckConsistency = 'possible_same' | 'different' | 'insufficient';
export type PetidCheckScope = 'within_session' | 'previous_session' | 'enrollment_anchor' | 'no_reference';
export interface PetidCheckSample {
  sampleId: string;
  quality: PetidCheckQuality;
  issues: PetidPhotoIssue[];
  width: number;
  height: number;
  metrics: { meanLuminance: number; clippedDarkFraction: number; clippedLightFraction: number; laplacianVariance: number };
}
export interface PetidCaptureCheck {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  consistency: PetidCheckConsistency;
  comparisonScope: PetidCheckScope;
  observations: string[];
  limitations: string;
  samples: PetidCheckSample[];
  consentVersion?: number;
  createdAt?: string;
}
export interface PetidCheckState {
  version: string;
  checks: PetidCaptureCheck[];
  reviews: { id?: string; decision: 'approved' | 'rejected'; evidenceKind: 'microchip_scan' | 'clinic_record' | 'verified_repeat_capture' | 'rejected_quality_or_identity'; consentVersion: number }[];
  identityProof: boolean;
}
export type PetidCheckRequest = { requestId: string; version: typeof PETID_CHECK_VERSION };
/** A retry uses this same object; a new check requires a new explicit action. */
export function newPetidCheckRequest(requestId = crypto.randomUUID()): PetidCheckRequest { return { requestId, version: PETID_CHECK_VERSION }; }
export function mergePetidCheck(state: PetidCheckState | null, check: PetidCaptureCheck): PetidCheckState {
  const checks = [check, ...(state?.checks ?? []).filter(item => item.id !== check.id)];
  checks.sort((first, second) => (second.createdAt ?? '').localeCompare(first.createdAt ?? '') || second.id.localeCompare(first.id));
  return { version: PETID_CHECK_VERSION, checks, reviews: state?.reviews ?? [], identityProof: false };
}
/** Never turn a visual-consistency suggestion into verified identity. */
export function petidCheckSummary(check: PetidCaptureCheck): 'processing' | 'failed' | 'retake' | 'different' | 'insufficient' | 'possible_same' {
  if (check.status !== 'completed') return check.status;
  if (check.samples.some(sample => sample.quality === 'retake')) return 'retake';
  return check.consistency;
}
