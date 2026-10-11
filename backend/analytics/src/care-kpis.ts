import type { PoolClient } from '@chordjai/db';

/** Admin-only inventory and activity counts. No prose, expenses or per-pet rows. */
export async function careProductMetrics(db: PoolClient) {
  const care = (await db.query(`WITH recent AS (
    SELECT pet_id,created_at FROM health.care_entries WHERE created_at>=now()-interval '30 days'
  ), repeated AS (
    SELECT pet_id FROM recent GROUP BY pet_id
    HAVING count(DISTINCT date_trunc('week',created_at AT TIME ZONE 'Asia/Bangkok'))>=2
  ) SELECT
    (SELECT count(DISTINCT created_by) FROM health.care_entries)::int AS diary_authors,
    (SELECT count(*) FROM health.care_entries)::int AS diary_entries,
    (SELECT count(DISTINCT pet_id) FROM health.care_entries)::int AS diary_pets,
    (SELECT count(*) FROM health.care_entries WHERE created_at>=now()-interval '7 days')::int AS entries_last_7_days,
    (SELECT count(*) FROM recent)::int AS entries_last_30_days,
    (SELECT count(DISTINCT pet_id) FROM recent)::int AS active_pets_last_30_days,
    (SELECT count(DISTINCT (pet_id,date_trunc('week',created_at AT TIME ZONE 'Asia/Bangkok'))) FROM recent)::int AS recorded_pet_weeks_last_30_days,
    (SELECT count(*) FROM repeated)::int AS repeat_week_pets_last_30_days,
    (SELECT count(*) FROM health.care_episodes)::int AS episodes,
    (SELECT count(*) FROM health.care_episodes WHERE status IN ('ongoing','improving'))::int AS active_episodes,
    (SELECT count(*) FROM health.care_episodes WHERE status='resolved')::int AS resolved_episodes,
    (SELECT count(*) FROM health.care_entries WHERE kind='followup')::int AS followup_updates,
    (SELECT count(DISTINCT episode_id) FROM health.care_entries WHERE kind='followup' AND episode_id IS NOT NULL)::int AS episodes_with_followup,
    (SELECT count(*) FROM health.care_entries WHERE kind='visit')::int AS visits,
    (SELECT count(*) FROM health.care_entries e WHERE kind='visit' AND EXISTS(SELECT 1 FROM health.care_costs c WHERE c.entry_id=e.id))::int AS visits_with_recorded_costs,
    (SELECT count(*) FROM health.care_entries e WHERE kind='visit' AND EXISTS(SELECT 1 FROM health.care_media cm JOIN media.objects m ON m.id=cm.media_id AND m.status='ready' WHERE cm.entry_id=e.id))::int AS visits_with_attachments,
    (SELECT count(*) FROM health.care_entries WHERE share_with_clinic)::int AS entries_enabled_for_clinical_sharing`)).rows[0];
  const petid = (await db.query(`WITH pet_refs AS (
    SELECT e.pet_id,ep.media_id,m.created_at FROM biometric.enrollments e
    JOIN biometric.enrollment_photos ep ON ep.enrollment_id=e.id
    JOIN media.objects m ON m.id=ep.media_id AND m.status='ready'
    WHERE e.status='ready'
  ), multi AS (
    SELECT pet_id FROM pet_refs GROUP BY pet_id HAVING count(DISTINCT media_id)>=2
  ) SELECT
    (SELECT count(DISTINCT pet_id) FROM biometric.enrollments WHERE status='ready')::int AS enrolled_pets,
    (SELECT count(DISTINCT pet_id) FROM pet_refs)::int AS pets_with_available_reference_photos,
    (SELECT count(DISTINCT media_id) FROM pet_refs)::int AS available_reference_photos,
    (SELECT count(*) FROM multi)::int AS pets_with_multiple_reference_photos,
    (SELECT count(DISTINCT pet_id) FROM pet_refs WHERE created_at>=now()-interval '30 days')::int AS pets_with_reference_uploads_last_30_days`)).rows[0];
  return {
    care,
    petid: {
      ...petid,
      assessment: {
        referenceDates: 'upload_timestamps_not_capture_dates',
        captureQuality: 'not_measured',
        verifiedIdentityLabels: 'not_collected',
        biometricCalibration: 'pending',
        researchEligibility: 'not_established',
        certification: 'not_claimed'
      }
    },
    definitions: {
      activityWindow: 'record_creation_time',
      petWeekTimezone: 'Asia/Bangkok',
      repeatWeekPets: 'pets_with_records_in_at_least_two_calendar_weeks_within_30_days_not_a_retention_cohort',
      episodeStatus: 'owner_reported_not_clinical_outcome',
      recordedCosts: 'visit_has_cost_line_not_cost_amount',
      attachments: 'available_images_not_verified_receipts',
      provenance: 'owner_reported'
    }
  };
}
