import { careObservationsSchema } from '@chordjai/contracts';
const MAX_ENTRIES = 5;
const MAX_CONTEXT_CHARS = 6_000;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const option = (value: unknown, allowed: readonly string[]) => typeof value === 'string' && allowed.includes(value) ? value : null;
const date = (value: unknown) => {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  if (typeof value !== 'string' || value.length > 40) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

/** A deliberately small allowlist. Never serialize the original summary/entry JSON. */
export function buildClinicalCareContext(value: unknown) {
  const summary = object(value);
  const entries = (Array.isArray(summary.entries) ? summary.entries : []).slice(0, MAX_ENTRIES).map(raw => {
    const entry = object(raw), observations = object(entry.observations), visit = object(entry.visit), episode = object(entry.episode);
    return {
      provenance: 'owner_reported' as const,
      kind: option(entry.kind, ['daily', 'symptom', 'visit', 'followup']),
      title: text(entry.title, 160), observedAt: date(entry.observed_at),
      clinicalNote: text(entry.clinical_note, 600),
      observations: {
        symptoms: (Array.isArray(observations.symptoms) ? observations.symptoms : []).filter((item): item is string => typeof item === 'string').slice(0, 8).map(item => text(item, 80)),
        severity: option(observations.severity, careObservationsSchema.shape.severity.unwrap().options),
        appetite: option(observations.appetite, careObservationsSchema.shape.appetite.unwrap().options),
        energy: option(observations.energy, careObservationsSchema.shape.energy.unwrap().options),
        trend: option(observations.trend, careObservationsSchema.shape.trend.unwrap().options),
        water: option(observations.water, careObservationsSchema.shape.water.unwrap().options),
        toilet: option(observations.toilet, careObservationsSchema.shape.toilet.unwrap().options),
        onsetAt: date(observations.onsetAt), frequency: text(observations.frequency, 100)
      },
      visit: entry.visit !== null && typeof entry.visit === 'object' && !Array.isArray(entry.visit) ? { reason: text(visit.reason, 300), vetReportedFindings: text(visit.vetReportedFindings, 400), treatment: text(visit.treatment, 400), nextFollowupAt: date(visit.nextFollowupAt), provenance: 'owner_reported' as const } : null,
      episode: entry.episode ? { title: text(episode.title, 160), status: option(episode.status, ['ongoing', 'improving', 'resolved']), startedAt: date(episode.startedAt), resolvedAt: date(episode.resolvedAt) } : null
    };
  });
  const context = { provenance: 'owner_reported' as const, entries };
  // Remove oldest whole entries, preserving valid JSON and source labels.
  while (JSON.stringify(context).length > MAX_CONTEXT_CHARS && entries.length) entries.pop();
  return context;
}
