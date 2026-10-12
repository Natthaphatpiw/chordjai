begin;

-- One eligibility definition for exports, owner counts and admin aggregates.
create view biometric.training_eligible_samples with (security_invoker=true,security_barrier=true) as
SELECT q.sample_id,s.id AS session_id,s.pet_id,s.owner_id,p.media_id,c.id AS check_id,r.id AS review_id,
    t.version::int AS consent_version,s.species,p.angle,p.captured_at,(p.captured_at AT TIME ZONE 'Asia/Bangkok')::date::text AS capture_day,
    q.image_sha256,q.decoded_sha256,q.dhash AS dhash64,q.width,q.height,s.created_at AS session_created_at,p.position AS sample_position
    FROM biometric.capture_sessions s JOIN biometric.training_consents t ON t.pet_id=s.pet_id AND t.owner_id=s.owner_id AND t.granted AND t.policy_version='petid-training-2026-10-12'
    JOIN identity.users u ON u.id=s.owner_id AND u.status='active' JOIN identity.consents service ON service.user_id=u.id AND service.purpose='service' AND service.granted
    JOIN pet.pets pet ON pet.id=s.pet_id AND pet.owner_id=s.owner_id
    JOIN LATERAL (SELECT * FROM biometric.capture_reviews rr WHERE rr.session_id=s.id ORDER BY rr.revision DESC LIMIT 1) r ON r.decision='approved' AND r.consent_version=t.version
    JOIN biometric.capture_checks c ON c.id=r.check_id AND c.session_id=s.id AND c.status='completed' AND c.consistency='possible_same' AND c.consent_version=t.version
      AND c.id=(SELECT cc.id FROM biometric.capture_checks cc WHERE cc.session_id=s.id ORDER BY cc.created_at DESC,cc.id DESC LIMIT 1)
    JOIN biometric.capture_check_samples q ON q.check_id=c.id AND q.quality='acceptable'
    JOIN biometric.capture_samples p ON p.id=q.sample_id AND p.session_id=s.id
    JOIN media.objects m ON m.id=p.media_id AND m.status='ready' AND m.user_id=s.owner_id AND m.pet_id=s.pet_id
    WHERE s.review_status='approved' AND s.review_consent_version=t.version
      AND (r.evidence_kind<>'verified_repeat_capture' OR EXISTS(SELECT 1 FROM biometric.capture_sessions anchor
        JOIN LATERAL (SELECT * FROM biometric.capture_reviews ar WHERE ar.session_id=anchor.id ORDER BY ar.revision DESC LIMIT 1) ar ON ar.decision='approved' AND ar.evidence_kind IN ('microchip_scan','clinic_record') AND ar.consent_version=t.version
        JOIN biometric.capture_checks ac ON ac.id=ar.check_id AND ac.status='completed' AND ac.consistency='possible_same' AND ac.consent_version=t.version
        WHERE anchor.id=r.reference_session_id AND anchor.pet_id=s.pet_id AND anchor.owner_id=s.owner_id AND anchor.review_status='approved' AND anchor.review_consent_version=t.version
          AND ac.id=(SELECT cc.id FROM biometric.capture_checks cc WHERE cc.session_id=anchor.id ORDER BY cc.created_at DESC,cc.id DESC LIMIT 1)
          AND anchor.sample_count=(SELECT count(*) FROM biometric.capture_check_samples aq JOIN biometric.capture_samples ap ON ap.id=aq.sample_id AND ap.session_id=anchor.id
            JOIN media.objects am ON am.id=ap.media_id AND am.status='ready' AND am.user_id=s.owner_id AND am.pet_id=s.pet_id WHERE aq.check_id=ac.id AND aq.quality='acceptable')))
      AND s.sample_count=(SELECT count(*) FROM biometric.capture_check_samples q2 JOIN biometric.capture_samples p2 ON p2.id=q2.sample_id AND p2.session_id=s.id
        JOIN media.objects m2 ON m2.id=p2.media_id AND m2.status='ready' AND m2.user_id=s.owner_id AND m2.pet_id=s.pet_id WHERE q2.check_id=c.id AND q2.quality='acceptable')
    ORDER BY s.created_at,s.id,p.position;
grant select on biometric.training_eligible_samples to chordjai_app,chordjai_worker;

-- Private, short-lived manifests. A snapshot never substitutes for live consent.
create table biometric.dataset_exports (
  id uuid primary key,
  creator_id uuid not null references identity.users(id) on delete cascade,
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  manifest jsonb not null check (jsonb_typeof(manifest)='object'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  unique(creator_id,request_id)
);
create table biometric.dataset_export_samples (
  export_id uuid not null references biometric.dataset_exports(id) on delete cascade,
  sample_id uuid not null references biometric.capture_samples(id) on delete cascade,
  media_id uuid not null references media.objects(id) on delete cascade,
  session_id uuid not null references biometric.capture_sessions(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  pet_id uuid not null references pet.pets(id) on delete cascade,
  check_id uuid not null references biometric.capture_checks(id) on delete cascade,
  review_id uuid not null references biometric.capture_reviews(id) on delete cascade,
  consent_version integer not null check (consent_version>0),
  export_created_at timestamptz not null,
  primary key(export_id,sample_id)
);
alter table biometric.dataset_exports enable row level security;
alter table biometric.dataset_exports force row level security;
alter table biometric.dataset_export_samples enable row level security;
alter table biometric.dataset_export_samples force row level security;
grant select,insert,delete on biometric.dataset_exports,biometric.dataset_export_samples to chordjai_worker;
-- PostgreSQL row locks require an UPDATE privilege. The only granted column is
-- immutable, so this enables FOR SHARE without allowing manifest/TTL mutation.
grant update(id) on biometric.dataset_exports to chordjai_worker;
create trigger dataset_export_id_immutable before update on biometric.dataset_exports for each row execute function public.prevent_actor_reassignment('id');
grant select on biometric.dataset_export_samples to chordjai_app;
create policy system_worker on biometric.dataset_exports for all to chordjai_worker using(true) with check(true);
create policy system_worker on biometric.dataset_export_samples for all to chordjai_worker using(true) with check(true);
create policy dataset_participation_owner on biometric.dataset_export_samples for select to chordjai_app using(owner_id=(select public.current_user_id()) and public.is_pet_owner(pet_id));

-- Erasure of any member invalidates the entire manifest, including its payload.
create function biometric.invalidate_export_member() returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from biometric.dataset_exports where id=old.export_id;
  return old;
end $$;
revoke all on function biometric.invalidate_export_member() from public,chordjai_app,chordjai_worker;
create trigger dataset_member_erasure after delete on biometric.dataset_export_samples for each row execute function biometric.invalidate_export_member();

create function biometric.invalidate_export_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from biometric.dataset_exports where id in (select export_id from biometric.dataset_export_samples where pet_id=new.pet_id);
  return new;
end $$;
revoke all on function biometric.invalidate_export_consent() from public,chordjai_app,chordjai_worker;
create trigger dataset_training_revision after update on biometric.training_consents for each row execute function biometric.invalidate_export_consent();

create function biometric.invalidate_export_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.review_status is distinct from old.review_status or new.review_consent_version is distinct from old.review_consent_version then
    delete from biometric.dataset_exports where id in (select export_id from biometric.dataset_export_samples where pet_id=new.pet_id);
  end if;
  return new;
end $$;
revoke all on function biometric.invalidate_export_review() from public,chordjai_app,chordjai_worker;
create trigger dataset_review_change after update on biometric.capture_sessions for each row execute function biometric.invalidate_export_review();

create function biometric.invalidate_export_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status<>'active' then
    delete from biometric.dataset_exports where id in (select export_id from biometric.dataset_export_samples where owner_id=new.id) or creator_id=new.id;
  end if;
  return new;
end $$;
revoke all on function biometric.invalidate_export_account() from public,chordjai_app,chordjai_worker;
create trigger dataset_account_status after update of status on identity.users for each row execute function biometric.invalidate_export_account();

create function biometric.invalidate_export_service_consent() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
  if tg_op='DELETE' then
    if old.purpose<>'service' then return old; end if;
    owner=old.user_id;
  else
    if new.purpose<>'service' or new.granted then return new; end if;
    owner=new.user_id;
  end if;
  delete from biometric.dataset_exports where id in (select export_id from biometric.dataset_export_samples where owner_id=owner) or creator_id=owner;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function biometric.invalidate_export_service_consent() from public,chordjai_app,chordjai_worker;
create trigger dataset_service_consent_change after update or delete on identity.consents for each row execute function biometric.invalidate_export_service_consent();

commit;
