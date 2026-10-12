import { z } from 'zod';
export const PETID_REVIEW_VERSION = 'petid-review-v1' as const;
export const petidCheckRequestSchema = z.object({ requestId: z.uuid(), version: z.literal(PETID_REVIEW_VERSION) });
export const petidConsistencySchema = z.object({
  verdict: z.enum(['possible_same', 'different', 'insufficient']),
  observations: z.array(z.string().max(300)).max(6),
  limitations: z.string().min(1).max(1000),
});
export const petidIndependentReviewSchema = z.object({
  requestId: z.uuid(), checkId: z.uuid(), expectedConsentVersion: z.number().int().positive(),
  decision: z.enum(['approved', 'rejected']),
  evidenceKind: z.enum(['microchip_scan', 'clinic_record', 'verified_repeat_capture', 'rejected_quality_or_identity']),
  evidenceReference: z.string().trim().min(3).max(200),
  evidenceNote: z.string().trim().min(10).max(1000),
  referenceSessionId: z.uuid().nullable(),
  independentEvidenceConfirmed: z.literal(true),
  privacyChecked: z.literal(true),
});
export type PetidConsistency = z.infer<typeof petidConsistencySchema>;
export type PetidIndependentReviewInput = z.infer<typeof petidIndependentReviewSchema>;
export type PetidQualityResult = {
  quality: 'acceptable' | 'retake' | 'review';
  imageSha256: string; decodedSha256: string; dhash: string;
  width: number; height: number;
  metrics: { meanLuminance: number; clippedDarkFraction: number; clippedLightFraction: number; laplacianVariance: number };
  issues: ('too_small' | 'too_dark' | 'too_bright' | 'blur_or_low_detail' | 'duplicate_exact' | 'near_duplicate')[];
};
