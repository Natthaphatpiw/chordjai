begin;

create table biometric.capture_checks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references biometric.capture_sessions(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  request_id uuid not null,
  version text not null check (version='petid-review-v1'),
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  consent_version integer not null check (consent_version>=0),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  model text not null check (model='gpt-6.1-sol'),
  consistency text not null check (consistency in ('possible_same','different','insufficient')),
  comparison_scope text not null check (comparison_scope in ('within_session','previous_session','enrollment_anchor','no_reference')),
  reference_session_id uuid references biometric.capture_sessions(id) on delete set null,
  observations jsonb not null check (jsonb_typeof(observations)='array' and jsonb_array_length(observations)<=6),
  limitations text not null check (length(limitations) between 1 and 1000),
  sample_count integer not null check (sample_count between 1 and 5),
  created_at timestamptz not null default now(),
  unique(owner_id,request_id)
);
create index capture_checks_session_idx on biometric.capture_checks(session_id,created_at desc,id desc);
create table biometric.capture_check_samples (
  check_id uuid not null references biometric.capture_checks(id) on delete cascade,
  sample_id uuid not null references biometric.capture_samples(id) on delete cascade,
  quality text not null check (quality in ('acceptable','retake','review')),
  image_sha256 text not null check (image_sha256 ~ '^[a-f0-9]{64}$'),
  decoded_sha256 text not null check (decoded_sha256 ~ '^[a-f0-9]{64}$'),
  dhash text not null check (dhash ~ '^[a-f0-9]{16}$'),
  width integer not null check (width>0),height integer not null check (height>0),
  metrics jsonb not null check (jsonb_typeof(metrics)='object'),
  issues jsonb not null check (jsonb_typeof(issues)='array'),
  primary key(check_id,sample_id)
);
create index capture_check_samples_sha_idx on biometric.capture_check_samples(decoded_sha256);
create table biometric.capture_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references biometric.capture_sessions(id) on delete cascade,
  check_id uuid not null references biometric.capture_checks(id) on delete cascade,
  reviewer_id uuid not null references identity.users(id) on delete cascade,
  request_id uuid not null,
  consent_version integer not null check (consent_version>0),
  decision text not null check (decision in ('approved','rejected')),
  evidence_kind text not null check (evidence_kind in ('microchip_scan','clinic_record','verified_repeat_capture','rejected_quality_or_identity')),
  evidence_reference text not null check (length(evidence_reference) between 3 and 200),
  evidence_note text not null check (length(evidence_note) between 10 and 1000),
  reference_session_id uuid references biometric.capture_sessions(id) on delete set null,
  independent_evidence_confirmed boolean not null check (independent_evidence_confirmed),
  privacy_checked boolean not null check (privacy_checked),
  revision integer not null check (revision>0),
  created_at timestamptz not null default now(),
  unique(reviewer_id,request_id),unique(session_id,revision)
);
create index capture_reviews_session_idx on biometric.capture_reviews(session_id,revision desc);

alter table biometric.capture_checks enable row level security;
alter table biometric.capture_checks force row level security;
alter table biometric.capture_check_samples enable row level security;
alter table biometric.capture_check_samples force row level security;
alter table biometric.capture_reviews enable row level security;
alter table biometric.capture_reviews force row level security;
grant select on biometric.capture_checks,biometric.capture_check_samples,biometric.capture_reviews to chordjai_app;
grant select,insert,delete on biometric.capture_checks,biometric.capture_check_samples,biometric.capture_reviews to chordjai_worker;
grant update(status,consistency,observations,limitations) on biometric.capture_checks to chordjai_worker;
create policy system_worker on biometric.capture_checks for all to chordjai_worker using(true) with check(true);
create policy system_worker on biometric.capture_check_samples for all to chordjai_worker using(true) with check(true);
create policy system_worker on biometric.capture_reviews for all to chordjai_worker using(true) with check(true);
create policy checks_owner on biometric.capture_checks for select to chordjai_app using(owner_id=(select public.current_user_id()) and exists(select 1 from biometric.capture_sessions s where s.id=session_id and public.is_pet_owner(s.pet_id)));
create policy check_samples_owner on biometric.capture_check_samples for select to chordjai_app using(exists(select 1 from biometric.capture_checks c where c.id=check_id and c.owner_id=(select public.current_user_id())));
create policy reviews_owner on biometric.capture_reviews for select to chordjai_app using(exists(select 1 from biometric.capture_sessions s where s.id=session_id and s.owner_id=(select public.current_user_id()) and public.is_pet_owner(s.pet_id)));

create function biometric.guard_check_sample_lineage() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from biometric.capture_checks c join biometric.capture_samples p on p.session_id=c.session_id where c.id=new.check_id and p.id=new.sample_id) then
    raise exception 'Quality evidence must belong to the checked session' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function biometric.guard_check_sample_lineage() from public,chordjai_app,chordjai_worker;
create trigger check_sample_lineage before insert on biometric.capture_check_samples for each row execute function biometric.guard_check_sample_lineage();

-- These labels document a human decision supported by independent evidence.
-- They do not upgrade the owner attestation or claim biometrics is infallible.
create function biometric.guard_independent_review() returns trigger language plpgsql security definer set search_path='' as $$
declare target biometric.capture_sessions; checked biometric.capture_checks; consent biometric.training_consents;
begin
  select * into target from biometric.capture_sessions where id=new.session_id for update;
  select * into checked from biometric.capture_checks where id=new.check_id and session_id=new.session_id;
  select * into consent from biometric.training_consents where pet_id=target.pet_id and owner_id=target.owner_id for share;
  if target.id is null or checked.id is null or checked.status<>'completed' or checked.id<>(select id from biometric.capture_checks where session_id=target.id order by created_at desc,id desc limit 1) or consent.pet_id is null or not consent.granted or consent.policy_version<>'petid-training-2026-10-12' or consent.version<>new.consent_version or checked.consent_version<>consent.version then
    raise exception 'Review requires current consent and matching checked epoch' using errcode='23514';
  end if;
  perform 1 from identity.users where id=new.reviewer_id and role='admin' and status='active' for share;
  if not found or new.reviewer_id=target.owner_id then
    raise exception 'Independent active reviewer required' using errcode='23514';
  end if;
  if new.revision<>(select coalesce(max(revision),0)+1 from biometric.capture_reviews where session_id=target.id) then
    raise exception 'Review revisions must be consecutive' using errcode='23514';
  end if;
  if new.decision='approved' then
    if new.evidence_kind='rejected_quality_or_identity' or checked.consistency<>'possible_same' or checked.sample_count<>target.sample_count or
      target.sample_count<>(select count(*) from biometric.capture_check_samples q join biometric.capture_samples p on p.id=q.sample_id join media.objects m on m.id=p.media_id and m.status='ready' and m.user_id=target.owner_id and m.pet_id=target.pet_id where q.check_id=checked.id and q.quality='acceptable') then
      raise exception 'All submitted photos must pass quality and consistency' using errcode='23514';
    end if;
    if new.evidence_kind='verified_repeat_capture' and not exists(select 1 from biometric.capture_sessions s join biometric.capture_reviews r on r.session_id=s.id and r.decision='approved' and r.consent_version=consent.version and r.evidence_kind in ('microchip_scan','clinic_record') and r.revision=(select max(revision) from biometric.capture_reviews where session_id=s.id) where s.id=new.reference_session_id and s.id<>target.id and s.pet_id=target.pet_id and s.owner_id=target.owner_id and s.review_status='approved' and s.review_consent_version=consent.version and s.sample_count=(select count(*) from biometric.capture_check_samples q join biometric.capture_samples p on p.id=q.sample_id and p.session_id=s.id join media.objects m on m.id=p.media_id and m.status='ready' where q.check_id=r.check_id and q.quality='acceptable')) then
      raise exception 'Repeat capture requires a current independent approved anchor' using errcode='23514';
    end if;
  end if;
  return new;
end $$;
revoke all on function biometric.guard_independent_review() from public,chordjai_app,chordjai_worker;
create trigger independent_review_guard before insert on biometric.capture_reviews for each row execute function biometric.guard_independent_review();
create function biometric.apply_independent_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update biometric.capture_sessions set review_status=new.decision,review_consent_version=new.consent_version where id=new.session_id;
  return new;
end $$;
revoke all on function biometric.apply_independent_review() from public,chordjai_app,chordjai_worker;
create trigger independent_review_apply after insert on biometric.capture_reviews for each row execute function biometric.apply_independent_review();

create function biometric.invalidate_review_on_check() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update biometric.capture_sessions set review_status='pending',review_consent_version=null where id=new.session_id;
  return new;
end $$;
revoke all on function biometric.invalidate_review_on_check() from public,chordjai_app,chordjai_worker;
create trigger new_check_invalidates_review after insert on biometric.capture_checks for each row execute function biometric.invalidate_review_on_check();

commit;
