import type {PoolClient} from 'pg';

/** Counts only. No image URLs, owner identifiers, messages or health prose. */
export async function ipFollowupMetrics(db:PoolClient){
  const research=(await db.query(`WITH available AS (
    SELECT s.id session_id,s.pet_id,s.owner_id,s.review_status,s.review_consent_version,p.id sample_id,p.captured_at
    FROM biometric.capture_sessions s JOIN biometric.capture_samples p ON p.session_id=s.id
    JOIN media.objects m ON m.id=p.media_id AND m.status='ready'
  ), repeated AS (
    SELECT pet_id FROM available GROUP BY pet_id HAVING count(DISTINCT (captured_at AT TIME ZONE 'Asia/Bangkok')::date)>=2
  ) SELECT
    (SELECT count(*) FROM biometric.capture_sessions)::int sessions,
    (SELECT count(*) FROM available)::int available_samples,
    (SELECT count(*) FROM repeated)::int pets_with_multiple_capture_days,
    (SELECT count(*) FROM biometric.training_consents WHERE granted)::int training_opted_in_pets,
    (SELECT count(*) FROM available a JOIN biometric.training_consents c ON c.pet_id=a.pet_id AND c.owner_id=a.owner_id
      WHERE c.granted AND a.review_status='approved' AND a.review_consent_version=c.version)::int samples_reviewed_under_current_consent`)).rows[0];
  const followups=(await db.query(`SELECT
    (SELECT count(*) FROM notify.followup_preferences WHERE enabled)::int enabled_users,
    (SELECT count(*) FROM notify.followup_preferences WHERE enabled AND paused_until>now())::int paused_users,
    (SELECT count(*) FROM notify.followup_deliveries WHERE status='accepted' AND accepted_at>=now()-interval '30 days')::int line_accepted_last_30_days,
    (SELECT count(*) FROM notify.followup_deliveries WHERE opened_at>=now()-interval '30 days')::int opened_from_link_last_30_days,
    (SELECT count(DISTINCT delivery_id) FROM notify.followup_replies WHERE created_at>=now()-interval '30 days')::int followups_with_replies_last_30_days,
    (SELECT count(*) FROM notify.followup_deliveries WHERE status='uncertain')::int uncertain_requests`)).rows[0];
  return {petid_research:research,personalized_followups:followups};
}
