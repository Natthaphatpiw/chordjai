import { z } from 'zod';

export const MAX_BOOKLET_PAGES = 10;
const imageReference = z.string().min(1).max(2000);
export const ocrRequestSchema = z.union([
  z.object({ petId: z.uuid(), imageUrls: z.array(imageReference).min(1).max(MAX_BOOKLET_PAGES), imageUrl: z.never().optional() }),
  z.object({ petId: z.uuid(), imageUrl: imageReference, imageUrls: z.never().optional() }),
]);

export function ocrDraftSchema(pageCount: number) {
  return z.object({
    records: z.array(z.object({
      kind: z.enum(['vaccine', 'medication', 'parasite']),
      title: z.string().min(1).max(200),
      recordedAt: z.string().max(35).nullable(),
      nextDueAt: z.string().max(35).nullable(),
      notes: z.string().max(2000),
      value: z.number().nullable(),
      sourcePage: z.number().int().min(1).max(pageCount),
    })).max(100),
    warnings: z.array(z.string().max(600)).max(20),
  });
}
export type OcrDraft = z.infer<ReturnType<typeof ocrDraftSchema>>;

/** Missing or invalid dates stay blank. Never infer an appointment or an expiry. */
export function reviewedDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2200) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export function normalizeOcrDraft(draft: OcrDraft): OcrDraft {
  return {
    records: draft.records.map(record => ({ ...record, recordedAt: reviewedDate(record.recordedAt), nextDueAt: reviewedDate(record.nextDueAt) })),
    warnings: [...new Set(draft.warnings.map(warning => warning.trim()).filter(Boolean))],
  };
}

export const scanRecordSchema = z.object({
  scanId: z.uuid(),
  sourcePage: z.number().int().min(1).max(MAX_BOOKLET_PAGES),
  scanRecordIndex: z.number().int().min(0).max(99),
});
