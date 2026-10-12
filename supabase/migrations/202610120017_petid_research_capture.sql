begin;

-- Collection is independent of model-training participation. Owner claims are
-- kept as claims, never promoted to a verified identity by this collector.
create table biometric.capture_sessions (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  request_id uuid not null,
  create_hash text not null check (create_hash ~ '^[a-f0-9]{64}$'),
  protocol_version text not null check (protocol_version='petid-capture-v1'),
  same_pet_confirmed boolean not null check (same_pet_confirmed),
  identity_basis text not null check (identity_basis='owner_recognition'),
  identity_status text not null default 'owner_attested_unverified' check (identity_status='owner_attested_unverified'),
  species text not null check (species in ('cat','dog')),
  enrollment_anchor_id uuid,
  microchip_fingerprint text check (microchip_fingerprint ~ '^[a-f0-9]{64}$'),
  anchor_provenance text not null default 'owner_record_unverified' check (anchor_provenance='owner_record_unverified'),
  sample_count integer not null check (sample_count between 1 and 5),
  review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
  review_consent_version integer check (review_consent_version>0),
  created_at timestamptz not null default now(),
  unique(owner_id,request_id)
);
create index capture_sessions_pet_time_idx on biometric.capture_sessions(pet_id,created_at desc,id desc);

create table biometric.capture_samples (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references biometric.capture_sessions(id) on delete cascade,
  media_id uuid not null references media.objects(id) on delete cascade,
  position integer not null check (position between 0 and 4),
  angle text not null check (angle in ('front','left','right','full_body','nose_detail','distinctive_mark')),
  captured_at timestamptz not null check (captured_at>='1900-01-01'::timestamptz),
  capture_source text not null check (capture_source in ('camera','library')),
  time_provenance text not null default 'owner_declared' check (time_provenance='owner_declared'),
  source_provenance text not null default 'owner_declared' check (source_provenance='owner_declared'),
  uploaded_at timestamptz not null,
  unique(session_id,position),
  -- Reusing an existing upload does not create a new longitudinal observation.
  unique(media_id)
);

create table biometric.training_consents (
  pet_id uuid primary key references pet.pets(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  purpose text not null default 'petid_model_training' check (purpose='petid_model_training'),
  policy_version text not null check (policy_version='petid-training-2026-10-12'),
  granted boolean not null default false,
  version integer not null default 1 check (version>0),
  updated_at timestamptz not null default now()
);
create table biometric.training_consent_events (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  request_id uuid not null,
  create_hash text not null check (create_hash ~ '^[a-f0-9]{64}$'),
  purpose text not null default 'petid_model_training' check (purpose='petid_model_training'),
  policy_version text not null check (policy_version='petid-training-2026-10-12'),
  granted boolean not null,
  version integer not null check (version>0),
  created_at timestamptz not null default now(),
  unique(owner_id,request_id),
  unique(pet_id,version)
);

alter table biometric.capture_sessions enable row level security;
alter table biometric.capture_sessions force row level security;
alter table biometric.capture_samples enable row level security;
alter table biometric.capture_samples force row level security;
alter table biometric.training_consents enable row level security;
alter table biometric.training_consents force row level security;
alter table biometric.training_consent_events enable row level security;
alter table biometric.training_consent_events force row level security;
grant select,insert,delete on biometric.capture_sessions to chordjai_app;
grant select,insert on biometric.capture_samples to chordjai_app;
grant select,insert,update on biometric.training_consents to chordjai_app;
grant select,insert on biometric.training_consent_events to chordjai_app;
grant select,insert,update,delete on biometric.capture_sessions,biometric.capture_samples,biometric.training_consents,biometric.training_consent_events to chordjai_worker;
create policy system_worker on biometric.capture_sessions for all to chordjai_worker using(true) with check(true);
create policy system_worker on biometric.capture_samples for all to chordjai_worker using(true) with check(true);
create policy system_worker on biometric.training_consents for all to chordjai_worker using(true) with check(true);
create policy system_worker on biometric.training_consent_events for all to chordjai_worker using(true) with check(true);
create policy capture_owner_read on biometric.capture_sessions for select to chordjai_app using(owner_id=(select public.current_user_id()) and public.is_pet_owner(pet_id));
create policy capture_owner_create on biometric.capture_sessions for insert to chordjai_app with check(owner_id=(select public.current_user_id()) and public.is_pet_owner(pet_id) and review_status='pending' and review_consent_version is null);
create policy capture_owner_delete on biometric.capture_sessions for delete to chordjai_app using(owner_id=(select public.current_user_id()) and public.is_pet_owner(pet_id));
create policy samples_owner_read on biometric.capture_samples for select to chordjai_app using(exists(select 1 from biometric.capture_sessions s where s.id=session_id and s.owner_id=(select public.current_user_id()) and public.is_pet_owner(s.pet_id)));
create policy samples_owner_create on biometric.capture_samples for insert to chordjai_app with check(exists(select 1 from biometric.capture_sessions s where s.id=session_id and s.owner_id=(select public.current_user_id()) and public.is_pet_owner(s.pet_id) and exists(select 1 from media.objects m where m.id=media_id and m.user_id=s.owner_id and m.pet_id=s.pet_id and m.status='ready' and m.created_at=uploaded_at)));
create policy training_consent_owner on biometric.training_consents for all to chordjai_app using(owner_id=(select public.current_user_id()) and public.is_pet_owner(pet_id)) with check(owner_id=(select public.current_user_id()) and public.is_pet_owner(pet_id));
create policy training_history_owner_read on biometric.training_consent_events for select to chordjai_app using(owner_id=(select public.current_user_id()) and public.is_pet_owner(pet_id));
create policy training_history_owner_create on biometric.training_consent_events for insert to chordjai_app with check(owner_id=(select public.current_user_id()) and public.is_pet_owner(pet_id));

create trigger capture_session_immutable before update on biometric.capture_sessions for each row execute function public.prevent_actor_reassignment('id','pet_id','owner_id','request_id','create_hash','protocol_version','same_pet_confirmed','identity_basis','identity_status','species','enrollment_anchor_id','microchip_fingerprint','anchor_provenance','sample_count','created_at');
create trigger capture_sample_immutable before update on biometric.capture_samples for each row execute function public.prevent_actor_reassignment('id','session_id','media_id','position','angle','captured_at','capture_source','time_provenance','source_provenance','uploaded_at');
create trigger training_consent_immutable before update on biometric.training_consents for each row execute function public.prevent_actor_reassignment('pet_id','owner_id','purpose');
create trigger training_history_immutable before update on biometric.training_consent_events for each row execute function public.prevent_actor_reassignment('id','pet_id','owner_id','request_id','create_hash','purpose','policy_version','granted','version','created_at');

create function biometric.guard_capture_time() returns trigger language plpgsql set search_path='' as $$
begin
  if new.captured_at>now() then raise exception 'Capture time cannot be in the future' using errcode='23514'; end if;
  return new;
end $$;
revoke all on function biometric.guard_capture_time() from public,chordjai_app,chordjai_worker;
create trigger capture_time_guard before insert on biometric.capture_samples for each row execute function biometric.guard_capture_time();

-- An immutable submitted set must have exactly its declared number of photos.
-- Only insertions are checked: FK photo erasure must remain possible later.
create function biometric.check_submitted_sample_count() returns trigger language plpgsql set search_path='' as $$
declare target uuid;
begin
  if tg_table_name='capture_sessions' then target=new.id; else target=new.session_id; end if;
  if exists(select 1 from biometric.capture_sessions s where s.id=target and s.sample_count<>(select count(*) from biometric.capture_samples p where p.session_id=target)) then
    raise exception 'Submitted capture set has a different photo count' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function biometric.check_submitted_sample_count() from public,chordjai_app,chordjai_worker;
create constraint trigger submitted_capture_count after insert on biometric.capture_sessions deferrable initially deferred for each row execute function biometric.check_submitted_sample_count();
create constraint trigger submitted_sample_count after insert on biometric.capture_samples deferrable initially deferred for each row execute function biometric.check_submitted_sample_count();

create function biometric.guard_training_revision() returns trigger language plpgsql set search_path='' as $$
begin
  if (tg_op='INSERT' and new.version<>1) or (tg_op='UPDATE' and new.version<>old.version+1) then
    raise exception 'Consent revisions must be consecutive' using errcode='23514';
  end if;
  new.updated_at=now();
  return new;
end $$;
revoke all on function biometric.guard_training_revision() from public,chordjai_app,chordjai_worker;
create trigger training_revision_guard before insert or update on biometric.training_consents for each row execute function biometric.guard_training_revision();
create function biometric.check_training_history() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from biometric.training_consent_events h where h.pet_id=new.pet_id and h.owner_id=new.owner_id and h.version=new.version and h.granted=new.granted and h.policy_version=new.policy_version) then
    raise exception 'Each consent revision requires an audit event' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function biometric.check_training_history() from public,chordjai_app,chordjai_worker;
create constraint trigger training_revision_history after insert or update on biometric.training_consents deferrable initially deferred for each row execute function biometric.check_training_history();

-- Any consent revision invalidates prior reviews. Withdrawal is effective for
-- all stored captures immediately; rejoining requires a review under the new
-- consent revision, not an old export/approval. No model or export jobs exist.
create function biometric.invalidate_training_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update biometric.capture_sessions set review_status='pending',review_consent_version=null where pet_id=new.pet_id;
  return new;
end $$;
revoke all on function biometric.invalidate_training_review() from public,chordjai_app,chordjai_worker;
create trigger training_revision_review after insert or update on biometric.training_consents for each row execute function biometric.invalidate_training_review();

-- A deleted/unavailable image invalidates the whole capture review, including
-- non-primary photographs. Ineligible bytes are never in the owner projection.
create function biometric.invalidate_capture_media() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.status='ready' then return new; end if;
  update biometric.capture_sessions s set review_status='pending',review_consent_version=null
    where exists(select 1 from biometric.capture_samples p where p.session_id=s.id and p.media_id=old.id)
      and exists(select 1 from pet.pets p where p.id=s.pet_id)
      and exists(select 1 from identity.users u where u.id=s.owner_id);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function biometric.invalidate_capture_media() from public,chordjai_app,chordjai_worker;
create trigger capture_photo_delete before delete on media.objects for each row execute function biometric.invalidate_capture_media();
create trigger capture_photo_unavailable before update of status on media.objects for each row execute function biometric.invalidate_capture_media();

commit;
