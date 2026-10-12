import { z } from 'zod';

export const PETID_CAPTURE_VERSION = 'petid-capture-v1' as const;
export const PETID_TRAINING_POLICY_VERSION = 'petid-training-2026-10-12' as const;
export const petidCaptureAngleSchema = z.enum(['front', 'left', 'right', 'full_body', 'nose_detail', 'distinctive_mark']);
export const petidCaptureSampleSchema = z.object({
  mediaId: z.uuid(),
  angle: petidCaptureAngleSchema,
  capturedAt: z.iso.datetime({ offset: true }),
  source: z.enum(['camera', 'library']),
});
export const petidCaptureSessionSchema = z.object({
  requestId: z.uuid(),
  protocolVersion: z.literal(PETID_CAPTURE_VERSION),
  samePetConfirmed: z.literal(true),
  identityBasis: z.literal('owner_recognition'),
  samples: z.array(petidCaptureSampleSchema).min(1).max(5)
    .refine(samples => new Set(samples.map(sample => sample.mediaId)).size === samples.length, 'Use distinct photos'),
});
export const petidTrainingConsentSchema = z.object({
  requestId: z.uuid(),
  granted: z.boolean(),
  policyVersion: z.literal(PETID_TRAINING_POLICY_VERSION),
  expectedVersion: z.number().int().min(0),
});
export type PetidCaptureSessionInput = z.infer<typeof petidCaptureSessionSchema>;
