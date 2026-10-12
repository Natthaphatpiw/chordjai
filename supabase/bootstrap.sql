-- Generated concatenation of supabase/migrations in filename order.
-- Run ONCE on a fresh Supabase project using SQL Editor as postgres.
-- Existing installations: apply only unapplied migration files; never reset production.

-- Migration: 202610100001_core.sql
-- ChordJai pilot: shared Postgres, logical service schemas.
-- Run as postgres in Supabase SQL Editor. No browser-facing table grants.
begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'chordjai_app') then
    create role chordjai_app nologin nosuperuser nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'chordjai_worker') then
    create role chordjai_worker nologin nosuperuser nobypassrls;
  end if;
end $$;
grant chordjai_app, chordjai_worker to postgres;

create schema if not exists identity;
create schema if not exists pet;
create schema if not exists health;
create schema if not exists journal;
create schema if not exists assistant;
create schema if not exists ai_ops;
create schema if not exists triage;
create schema if not exists clinic;
create schema if not exists lostfound;
create schema if not exists biometric;
create schema if not exists share;
create schema if not exists notify;
create schema if not exists media;
create schema if not exists analytics;
create schema if not exists ops;

create table identity.users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null unique,
  display_name text not null default '' check (length(display_name) <= 120),
  avatar_url text,
  role text not null default 'owner' check (role in ('owner','admin','vet')),
  district text,
  status text not null default 'active' check (status in ('active','suspended','deleting')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Current state supports ON CONFLICT (user_id,purpose); append-only history is separate.
create table identity.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  purpose text not null check (purpose in ('service','ai_improvement','location_alerts','marketing','ai_memory')),
  granted boolean not null,
  version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,purpose)
);
create table identity.consent_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  purpose text not null,
  granted boolean not null,
  version text not null,
  created_at timestamptz not null default now()
);
create table identity.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references identity.users(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table pet.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references identity.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  species text not null check (species in ('cat','dog')),
  sex text not null default 'unknown' check (sex in ('male','female','unknown')),
  birth_date date,
  breed text,
  weight_kg numeric(7,3) check (weight_kg > 0 and weight_kg <= 300),
  photo_url text,
  microchip text check (microchip is null or microchip ~ '^[0-9]{15}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table pet.members (
  pet_id uuid not null references pet.pets(id) on delete cascade,
  user_id uuid not null references identity.users(id) on delete cascade,
  role text not null check (role in ('owner','carer','viewer')),
  created_at timestamptz not null default now(),
  primary key (pet_id,user_id)
);
create index members_user_idx on pet.members(user_id);
create table pet.invitations (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  invited_by uuid not null references identity.users(id) on delete cascade,
  token_hash text not null unique,
  role text not null check (role in ('carer','viewer')),
  expires_at timestamptz not null default now() + interval '72 hours',
  accepted_by uuid references identity.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table health.records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  created_by uuid not null references identity.users(id) on delete cascade,
  kind text not null check (kind in ('vaccine','medication','parasite','weight','checkin','note','visit')),
  title text not null check (length(title) between 1 and 200),
  recorded_at timestamptz not null default now(),
  next_due_at timestamptz,
  notes text check (length(notes) <= 10000),
  value numeric,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'weight' or (value > 0 and value <= 300))
);
create index records_pet_timeline_idx on health.records(pet_id,recorded_at desc);
create index records_due_idx on health.records(next_due_at) where next_due_at is not null;
create table health.scans (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  user_id uuid not null references identity.users(id) on delete cascade,
  status text not null default 'needs_review' check (status in ('queued','processing','needs_review','confirmed','failed')),
  media_id uuid,
  draft jsonb not null default '{}',
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table journal.pages (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  title text not null default 'สมุดของน้อง' check (length(title) <= 200),
  theme jsonb not null default '{"background":"#fff9f1","accent":"#cc6d3d"}',
  elements jsonb not null default '[]',
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(theme) = 'object'),
  check (jsonb_typeof(elements) = 'array'),
  check (jsonb_array_length(elements) <= 100)
);
create index pages_pet_idx on journal.pages(pet_id,updated_at desc);

create table assistant.preferences (
  user_id uuid primary key references identity.users(id) on delete cascade,
  assistant_name text not null default 'ChordJai' check (length(assistant_name) between 1 and 80),
  tone text not null default 'warm' check (tone in ('warm','concise','playful','professional')),
  about_user text not null default '' check (length(about_user) <= 2000),
  memory_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table assistant.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  pet_id uuid references pet.pets(id) on delete cascade,
  title text not null default 'คุยกับผู้ช่วย' check (length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table assistant.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references assistant.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null check (length(content) <= 30000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on assistant.messages(conversation_id,created_at);
create table assistant.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  pet_id uuid references pet.pets(id) on delete cascade,
  kind text not null default 'preference' check (kind in ('preference','fact','care','summary','personality')),
  content text not null check (length(content) between 1 and 4000),
  enabled boolean not null default true,
  source text not null default 'user' check (source in ('user','assistant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index memories_user_idx on assistant.memories(user_id,enabled);

create table ai_ops.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references identity.users(id) on delete cascade,
  pet_id uuid references pet.pets(id) on delete cascade,
  feature text not null,
  model text not null default 'gpt-6.1-sol',
  model_resolved text,
  prompt_version text not null default '1',
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  latency_ms integer check (latency_ms >= 0),
  cost_usd numeric(12,8),
  status text not null default 'ok' check (status in ('ok','error','timeout','refused','invalid_output','budget_blocked','reserved')),
  error_code text,
  correlation_id text,
  created_at timestamptz not null default now()
);
create index requests_user_day_idx on ai_ops.requests(user_id,created_at desc);

create table triage.sessions (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  user_id uuid not null references identity.users(id) on delete cascade,
  symptoms text not null check (length(symptoms) between 1 and 10000),
  severity integer not null check (severity between 0 and 3),
  rule_level integer not null default 0 check (rule_level between 0 and 3),
  llm_level integer check (llm_level between 0 and 3),
  result jsonb not null default '{}',
  degraded boolean not null default false,
  rule_set_version text not null default 'pilot-1',
  created_at timestamptz not null default now(),
  check (severity >= rule_level and severity >= coalesce(llm_level,0)),
  check (not degraded or severity >= 1)
);
create table triage.followups (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references triage.sessions(id) on delete cascade,
  user_id uuid not null references identity.users(id) on delete cascade,
  due_at timestamptz not null,
  answer jsonb,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
-- Governance tables are schema groundwork; approval needs a vet-reviewed eval harness.
create table triage.rule_sets (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique,
  status text not null default 'draft' check (status in ('draft','approved','active','retired')),
  rules jsonb not null,
  checksum text not null,
  approved_by uuid references identity.users(id) on delete set null,
  approved_at timestamptz,
  eval_run_id uuid,
  created_at timestamptz not null default now()
);
create table triage.eval_runs (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid references triage.rule_sets(id) on delete cascade,
  model text not null,
  cases_count integer not null check (cases_count > 0),
  under_triage_count integer not null check (under_triage_count >= 0),
  passed boolean not null,
  report jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (not passed or under_triage_count = 0)
);
alter table triage.rule_sets add constraint rule_sets_eval_fk foreign key (eval_run_id) references triage.eval_runs(id);

create table clinic.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text,
  phone text,
  address text,
  is_24h boolean not null default false,
  lat numeric(10,7) check (lat between -90 and 90),
  lng numeric(10,7) check (lng between -180 and 180),
  verified_at timestamptz,
  verified_by uuid references identity.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table clinic.members (
  clinic_id uuid not null references clinic.clinics(id) on delete cascade,
  user_id uuid not null references identity.users(id) on delete cascade,
  role text not null check (role in ('admin','vet','staff')),
  created_at timestamptz not null default now(),
  primary key (clinic_id,user_id)
);
create table identity.grants (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  clinic_id uuid not null references clinic.clinics(id) on delete cascade,
  granted_by uuid not null references identity.users(id) on delete cascade,
  scopes text[] not null default '{summary.read}',
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (scopes <@ array['summary.read','vaccines.write','due_list.read','identity.verify']::text[])
);
create index grants_live_idx on identity.grants(pet_id,clinic_id) where revoked_at is null;
create table clinic.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinic.clinics(id) on delete cascade,
  pet_id uuid not null references pet.pets(id) on delete cascade,
  user_id uuid not null references identity.users(id) on delete cascade,
  requested_at timestamptz not null,
  reason text not null check (length(reason) between 1 and 2000),
  status text not null default 'requested' check (status in ('requested','accepted','declined','cancelled','completed')),
  created_at timestamptz not null default now()
);

create table lostfound.cases (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  public_slug text not null unique,
  description text not null check (length(description) between 1 and 10000),
  district text not null,
  status text not null default 'active' check (status in ('active','resolved','closed','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_lost_case_idx on lostfound.cases(pet_id) where status = 'active';
create table lostfound.tips (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references lostfound.cases(id) on delete cascade,
  content text not null check (length(content) between 1 and 3000),
  district text,
  reporter_id uuid references identity.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table lostfound.relay_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references lostfound.cases(id) on delete cascade,
  sender_id uuid not null references identity.users(id) on delete cascade,
  content text not null check (length(content) between 1 and 3000),
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create table biometric.enrollments (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null unique references pet.pets(id) on delete cascade,
  user_id uuid not null references identity.users(id) on delete cascade,
  description text not null,
  signature jsonb not null default '{}',
  search_mode text not null default 'lost_only' check (search_mode in ('lost_only','off')),
  status text not null default 'draft' check (status in ('draft','ready','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Text signatures are useful pilot metadata, not biometric proof or trained matching.
create table biometric.matches (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references biometric.enrollments(id) on delete cascade,
  finder_id uuid not null references identity.users(id) on delete cascade,
  evidence jsonb not null default '{}',
  owner_confirmed boolean,
  created_at timestamptz not null default now()
);

create table share.links (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  token_hash text not null unique,
  snapshot jsonb not null,
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create table share.views (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references share.links(id) on delete cascade,
  clinic_id uuid references clinic.clinics(id) on delete set null,
  created_at timestamptz not null default now()
);

create table notify.inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create table notify.reminders (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  user_id uuid not null references identity.users(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  sent_at timestamptz,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index reminders_due_idx on notify.reminders(due_at) where sent_at is null;
create table notify.line_accounts (
  user_id uuid primary key references identity.users(id) on delete cascade,
  followed boolean not null default false,
  updated_at timestamptz not null default now()
);
create table notify.webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create table notify.deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  dedupe_key text not null unique,
  channel text not null check (channel in ('line','inbox')),
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create table notify.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  token_hash text not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table media.objects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references identity.users(id) on delete cascade,
  pet_id uuid references pet.pets(id) on delete cascade,
  pathname text not null unique,
  url text,
  mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
  size integer not null check (size > 0 and size <= 10485760),
  purpose text not null default 'journal',
  status text not null default 'pending' check (status in ('pending','ready','rejected','deleted')),
  ai_consent boolean not null default false,
  created_at timestamptz not null default now()
);
create table analytics.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references identity.users(id) on delete cascade,
  pet_id uuid references pet.pets(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  properties jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_name_time_idx on analytics.events(name,created_at desc);

commit;


-- Migration: 202610100002_security.sql
begin;

create or replace function public.current_user_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('app.user_id',true),'')::uuid
$$;

create or replace function public.is_pet_owner(p_pet_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from pet.pets p where p.id = p_pet_id and p.owner_id = public.current_user_id())
$$;
create or replace function public.is_pet_member(p_pet_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_pet_owner(p_pet_id) or exists(
    select 1 from pet.members m where m.pet_id = p_pet_id and m.user_id = public.current_user_id())
$$;
create or replace function public.can_write_pet(p_pet_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_pet_owner(p_pet_id) or exists(
    select 1 from pet.members m where m.pet_id = p_pet_id and m.user_id = public.current_user_id()
      and m.role in ('owner','carer'))
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from identity.users u where u.id = public.current_user_id()
    and u.role = 'admin' and u.status = 'active')
$$;
create or replace function public.is_clinic_member(p_clinic_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from clinic.members m join clinic.clinics c on c.id = m.clinic_id
    where m.clinic_id = p_clinic_id and m.user_id = public.current_user_id() and c.verified_at is not null)
$$;
create or replace function public.has_clinic_grant(p_pet_id uuid,p_scope text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from identity.grants g
    where g.pet_id = p_pet_id and p_scope = any(g.scopes)
    and g.revoked_at is null and g.expires_at > now() and public.is_clinic_member(g.clinic_id))
$$;
create or replace function public.owns_conversation(p_conversation_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from assistant.conversations c where c.id = p_conversation_id
    and c.user_id = public.current_user_id()
    and (c.pet_id is null or public.is_pet_member(c.pet_id)))
$$;

-- Owners are enrolled automatically; no query can forge another owner at creation.
create function pet.add_owner_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into pet.members(pet_id,user_id,role) values(new.id,new.owner_id,'owner');
  return new;
end $$;
create trigger pets_owner_membership after insert on pet.pets for each row execute function pet.add_owner_member();

create function identity.record_consent_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into identity.consent_history(user_id,purpose,granted,version)
    values(new.user_id,new.purpose,new.granted,new.version);
  if new.purpose = 'ai_improvement' and not new.granted then
    update media.objects set ai_consent = false where user_id = new.user_id;
  end if;
  if new.purpose = 'ai_memory' and not new.granted then
    update assistant.preferences set memory_enabled = false where user_id = new.user_id;
  end if;
  return new;
end $$;
create trigger consents_history after insert or update on identity.consents for each row execute function identity.record_consent_change();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['identity.users','identity.consents','pet.pets','journal.pages',
    'health.records','assistant.preferences','assistant.conversations','assistant.memories',
    'lostfound.cases','biometric.enrollments'] loop
    execute format('create trigger set_updated_at before update on %s for each row execute function public.touch_updated_at()',t);
  end loop;
end $$;

create function public.prevent_actor_reassignment() returns trigger
language plpgsql set search_path = '' as $$
declare key text;
begin
  if current_user = 'chordjai_app' then
    foreach key in array tg_argv loop
      if (to_jsonb(old)->key) is distinct from (to_jsonb(new)->key) then
        raise exception 'Immutable ownership field: %',key using errcode='42501';
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger pets_immutable before update on pet.pets for each row execute function public.prevent_actor_reassignment('id','owner_id');
create trigger records_immutable before update on health.records for each row execute function public.prevent_actor_reassignment('id','pet_id','created_by');
create trigger pages_immutable before update on journal.pages for each row execute function public.prevent_actor_reassignment('id','pet_id','owner_id');
create trigger conv_immutable before update on assistant.conversations for each row execute function public.prevent_actor_reassignment('id','user_id','pet_id');
create trigger memory_immutable before update on assistant.memories for each row execute function public.prevent_actor_reassignment('id','user_id','pet_id');
create trigger cases_immutable before update on lostfound.cases for each row execute function public.prevent_actor_reassignment('id','pet_id','owner_id');
create trigger reminders_immutable before update on notify.reminders for each row execute function public.prevent_actor_reassignment('id','pet_id','user_id');
create trigger media_immutable before update on media.objects for each row execute function public.prevent_actor_reassignment('id','pet_id','user_id');
create trigger grants_immutable before update on identity.grants for each row execute function public.prevent_actor_reassignment('id','pet_id','clinic_id','granted_by','scopes');

create function triage.prevent_downgrade() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.severity < old.severity then
    raise exception 'Triage severity cannot decrease' using errcode='23514';
  end if;
  return new;
end $$;
create trigger sessions_monotonic before update on triage.sessions for each row execute function triage.prevent_downgrade();
create function triage.protect_approved_rules() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.status <> 'draft' then
    raise exception 'Approved rules are immutable' using errcode='23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (new.rules is distinct from old.rules or new.checksum <> old.checksum or new.version <> old.version) then
      raise exception 'Approved rules are immutable' using errcode='23514';
    end if;
    if new.status in ('approved','active') and old.status = 'draft' then
      if new.approved_by is null or new.approved_at is null or not exists(
        select 1 from triage.eval_runs e where e.id = new.eval_run_id and e.rule_set_id = new.id
          and e.passed and e.under_triage_count = 0) then
        raise exception 'Approval requires passing eval evidence' using errcode='23514';
      end if;
      if not exists(select 1 from identity.users u where u.id = new.approved_by and u.role = 'vet') then
        raise exception 'Approval requires veterinary reviewer' using errcode='23514';
      end if;
    end if;
    return new;
  end if;
  return old;
end $$;
create trigger immutable_approved_rules before update or delete on triage.rule_sets for each row execute function triage.protect_approved_rules();

-- Lock down all service schemas including any Supabase default grants.
do $$ declare s text; t record; r text; begin
  foreach s in array array['identity','pet','health','journal','assistant','ai_ops','triage','clinic',
    'lostfound','biometric','share','notify','media','analytics','ops'] loop
    execute format('revoke all on schema %I from public',s);
    execute format('revoke all on all tables in schema %I from public',s);
    execute format('revoke all on all functions in schema %I from public',s);
    execute format('grant usage on schema %I to chordjai_app,chordjai_worker',s);
    execute format('grant select,insert,update,delete on all tables in schema %I to chordjai_worker',s);
    execute format('alter default privileges in schema %I revoke execute on functions from public',s);
    foreach r in array array['anon','authenticated','service_role'] loop
      if exists(select 1 from pg_roles where rolname=r) then
        execute format('revoke all on schema %I from %I',s,r);
        execute format('revoke all on all tables in schema %I from %I',s,r);
        execute format('revoke all on all functions in schema %I from %I',s,r);
      end if;
    end loop;
  end loop;
  for t in select schemaname,tablename from pg_tables where schemaname = any(array[
    'identity','pet','health','journal','assistant','ai_ops','triage','clinic','lostfound',
    'biometric','share','notify','media','analytics','ops']) loop
    execute format('alter table %I.%I enable row level security',t.schemaname,t.tablename);
    execute format('create policy system_worker on %I.%I for all to chordjai_worker using (true) with check (true)',t.schemaname,t.tablename);
  end loop;
end $$;

revoke all on function public.current_user_id(),public.is_pet_owner(uuid),public.is_pet_member(uuid),
  public.can_write_pet(uuid),public.is_admin(),public.is_clinic_member(uuid),public.has_clinic_grant(uuid,text),
  public.owns_conversation(uuid),public.touch_updated_at(),public.prevent_actor_reassignment() from public;
grant execute on function public.current_user_id(),public.is_pet_owner(uuid),public.is_pet_member(uuid),
  public.can_write_pet(uuid),public.is_admin(),public.is_clinic_member(uuid),public.has_clinic_grant(uuid,text),
  public.owns_conversation(uuid) to chordjai_app,chordjai_worker;

grant select,delete on identity.users to chordjai_app;
grant update(display_name,avatar_url,district,updated_at) on identity.users to chordjai_app;
create policy users_self on identity.users for select to chordjai_app using (id = (select public.current_user_id()));
create policy users_update_self on identity.users for update to chordjai_app using (id = (select public.current_user_id())) with check (id = (select public.current_user_id()));
create policy users_delete_self on identity.users for delete to chordjai_app using (id = (select public.current_user_id()));
grant select,insert,update on identity.consents to chordjai_app;
create policy consents_self on identity.consents for all to chordjai_app using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));
grant select on identity.consent_history to chordjai_app;
create policy consent_history_self on identity.consent_history for select to chordjai_app using (user_id = (select public.current_user_id()));
grant select,insert on identity.audit_log to chordjai_app;
create policy audit_self on identity.audit_log for select to chordjai_app using (actor_id = (select public.current_user_id()));
create policy audit_insert_self on identity.audit_log for insert to chordjai_app with check (actor_id = (select public.current_user_id()));

grant select,insert,update,delete on pet.pets,pet.members,pet.invitations to chordjai_app;
create policy pets_read on pet.pets for select to chordjai_app using (public.is_pet_member(id) or public.has_clinic_grant(id,'summary.read'));
create policy pets_insert on pet.pets for insert to chordjai_app with check (owner_id = (select public.current_user_id()));
create policy pets_update on pet.pets for update to chordjai_app using (public.can_write_pet(id)) with check (public.can_write_pet(id));
create policy pets_delete on pet.pets for delete to chordjai_app using (public.is_pet_owner(id));
create policy members_read on pet.members for select to chordjai_app using (public.is_pet_member(pet_id));
create policy members_insert on pet.members for insert to chordjai_app with check (public.is_pet_owner(pet_id) and (role <> 'owner' or user_id = public.current_user_id()));
create policy members_update on pet.members for update to chordjai_app using (public.is_pet_owner(pet_id) and role <> 'owner') with check (public.is_pet_owner(pet_id) and role in ('carer','viewer'));
create policy members_delete on pet.members for delete to chordjai_app using (public.is_pet_owner(pet_id) and role <> 'owner');
create policy invitations_read on pet.invitations for select to chordjai_app using (public.is_pet_owner(pet_id));
create policy invitations_insert on pet.invitations for insert to chordjai_app with check (public.is_pet_owner(pet_id) and invited_by = (select public.current_user_id()));
create policy invitations_delete on pet.invitations for delete to chordjai_app using (public.is_pet_owner(pet_id));

grant select,insert,update,delete on health.records,health.scans to chordjai_app;
create policy records_read on health.records for select to chordjai_app using (public.is_pet_member(pet_id) or public.has_clinic_grant(pet_id,'summary.read'));
create policy records_insert on health.records for insert to chordjai_app with check (created_by = (select public.current_user_id()) and (public.can_write_pet(pet_id) or (kind = 'vaccine' and public.has_clinic_grant(pet_id,'vaccines.write'))));
create policy records_update on health.records for update to chordjai_app using (public.can_write_pet(pet_id)) with check (public.can_write_pet(pet_id));
create policy records_delete on health.records for delete to chordjai_app using (public.can_write_pet(pet_id));
create policy scans_read on health.scans for select to chordjai_app using (public.is_pet_member(pet_id));
create policy scans_insert on health.scans for insert to chordjai_app with check (user_id = (select public.current_user_id()) and public.can_write_pet(pet_id));
create policy scans_update on health.scans for update to chordjai_app using (user_id = (select public.current_user_id()) and public.can_write_pet(pet_id)) with check (user_id = (select public.current_user_id()) and public.can_write_pet(pet_id));

grant select,insert,update,delete on journal.pages to chordjai_app;
create policy pages_read on journal.pages for select to chordjai_app using (public.is_pet_member(pet_id));
create policy pages_insert on journal.pages for insert to chordjai_app with check (owner_id = (select public.current_user_id()) and public.can_write_pet(pet_id));
create policy pages_update on journal.pages for update to chordjai_app using (public.can_write_pet(pet_id)) with check (public.can_write_pet(pet_id));
create policy pages_delete on journal.pages for delete to chordjai_app using (public.can_write_pet(pet_id));

grant select,insert,update,delete on assistant.preferences,assistant.conversations,assistant.messages,assistant.memories to chordjai_app;
create policy preferences_self on assistant.preferences for all to chordjai_app using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));
create policy conversations_self on assistant.conversations for all to chordjai_app using (user_id = (select public.current_user_id()) and (pet_id is null or public.is_pet_member(pet_id))) with check (user_id = (select public.current_user_id()) and (pet_id is null or public.is_pet_member(pet_id)));
create policy messages_self on assistant.messages for all to chordjai_app using (public.owns_conversation(conversation_id)) with check (public.owns_conversation(conversation_id));
create policy memories_self on assistant.memories for all to chordjai_app using (user_id = (select public.current_user_id()) and (pet_id is null or public.is_pet_member(pet_id))) with check (user_id = (select public.current_user_id()) and (pet_id is null or public.is_pet_member(pet_id)));
grant select,insert,update on ai_ops.requests to chordjai_app;
create policy ai_requests_self on ai_ops.requests for all to chordjai_app using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));

grant select,insert,update on triage.sessions,triage.followups to chordjai_app;
create policy sessions_read on triage.sessions for select to chordjai_app using (public.is_pet_member(pet_id));
create policy sessions_insert on triage.sessions for insert to chordjai_app with check (user_id = (select public.current_user_id()) and public.is_pet_member(pet_id));
create policy sessions_update on triage.sessions for update to chordjai_app using (user_id = (select public.current_user_id()) and public.is_pet_member(pet_id)) with check (user_id = (select public.current_user_id()) and public.is_pet_member(pet_id));
create policy followups_self on triage.followups for all to chordjai_app using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()) and exists(select 1 from triage.sessions s where s.id = session_id and s.user_id = public.current_user_id()));

grant select,insert,update,delete on clinic.clinics to chordjai_app;
create policy clinics_read on clinic.clinics for select to chordjai_app using (verified_at is not null or (select public.is_admin()));
create policy clinics_admin on clinic.clinics for all to chordjai_app using ((select public.is_admin())) with check ((select public.is_admin()));
grant select on clinic.members to chordjai_app;
create policy clinic_members_read on clinic.members for select to chordjai_app using (user_id = (select public.current_user_id()));
grant select,insert,update on clinic.appointments to chordjai_app;
create policy appointments_read on clinic.appointments for select to chordjai_app using (user_id = (select public.current_user_id()) or public.is_clinic_member(clinic_id));
create policy appointments_insert on clinic.appointments for insert to chordjai_app with check (user_id = (select public.current_user_id()) and public.can_write_pet(pet_id) and exists(select 1 from clinic.clinics c where c.id = clinic_id and c.verified_at is not null));
create policy appointments_update on clinic.appointments for update to chordjai_app using (user_id = (select public.current_user_id()) or public.is_clinic_member(clinic_id)) with check (user_id = (select public.current_user_id()) or public.is_clinic_member(clinic_id));
create trigger appointments_immutable before update on clinic.appointments for each row execute function public.prevent_actor_reassignment('id','clinic_id','pet_id','user_id','requested_at','reason');
grant select,insert,update on identity.grants to chordjai_app;
create policy grants_read on identity.grants for select to chordjai_app using (public.is_pet_owner(pet_id) or public.is_clinic_member(clinic_id));
create policy grants_insert on identity.grants for insert to chordjai_app with check (public.is_pet_owner(pet_id) and granted_by = (select public.current_user_id()));
create policy grants_update on identity.grants for update to chordjai_app using (public.is_pet_owner(pet_id)) with check (public.is_pet_owner(pet_id));

grant select,insert,update,delete on lostfound.cases to chordjai_app;
create policy cases_read on lostfound.cases for select to chordjai_app using (public.is_pet_member(pet_id));
create policy cases_insert on lostfound.cases for insert to chordjai_app with check (owner_id = (select public.current_user_id()) and public.can_write_pet(pet_id));
create policy cases_update on lostfound.cases for update to chordjai_app using (public.can_write_pet(pet_id)) with check (public.can_write_pet(pet_id));
create policy cases_delete on lostfound.cases for delete to chordjai_app using (public.can_write_pet(pet_id));
grant select on lostfound.tips to chordjai_app;
create policy tips_owner_read on lostfound.tips for select to chordjai_app using (exists(select 1 from lostfound.cases c where c.id = case_id and public.is_pet_member(c.pet_id)));
grant select,insert on lostfound.relay_messages to chordjai_app;
create policy relay_owner_read on lostfound.relay_messages for select to chordjai_app using (sender_id = (select public.current_user_id()) or exists(select 1 from lostfound.cases c where c.id = case_id and public.is_pet_member(c.pet_id)));
create policy relay_member_insert on lostfound.relay_messages for insert to chordjai_app with check (sender_id = (select public.current_user_id()) and exists(select 1 from lostfound.cases c where c.id = case_id and c.status = 'active' and public.is_pet_member(c.pet_id)));

grant select,insert,update,delete on biometric.enrollments to chordjai_app;
create policy enroll_read on biometric.enrollments for select to chordjai_app using (public.is_pet_member(pet_id));
create policy enroll_insert on biometric.enrollments for insert to chordjai_app with check (user_id = (select public.current_user_id()) and public.is_pet_owner(pet_id));
create policy enroll_update on biometric.enrollments for update to chordjai_app using (public.is_pet_owner(pet_id)) with check (public.is_pet_owner(pet_id));
create policy enroll_delete on biometric.enrollments for delete to chordjai_app using (public.is_pet_owner(pet_id));
grant select,update on biometric.matches to chordjai_app;
create policy matches_owner on biometric.matches for select to chordjai_app using (finder_id = (select public.current_user_id()) or exists(select 1 from biometric.enrollments e where e.id = enrollment_id and public.is_pet_owner(e.pet_id)));
create policy matches_confirm on biometric.matches for update to chordjai_app using (exists(select 1 from biometric.enrollments e where e.id = enrollment_id and public.is_pet_owner(e.pet_id))) with check (exists(select 1 from biometric.enrollments e where e.id = enrollment_id and public.is_pet_owner(e.pet_id)));
create trigger matches_immutable before update on biometric.matches for each row execute function public.prevent_actor_reassignment('id','enrollment_id','finder_id','evidence');

grant select,insert,update,delete on share.links to chordjai_app;
create policy links_read on share.links for select to chordjai_app using (owner_id = (select public.current_user_id()) and public.is_pet_member(pet_id));
create policy links_insert on share.links for insert to chordjai_app with check (owner_id = (select public.current_user_id()) and public.can_write_pet(pet_id));
create policy links_update on share.links for update to chordjai_app using (owner_id = (select public.current_user_id())) with check (owner_id = (select public.current_user_id()));
create policy links_delete on share.links for delete to chordjai_app using (owner_id = (select public.current_user_id()));
create trigger links_immutable before update on share.links for each row execute function public.prevent_actor_reassignment('id','pet_id','owner_id','token_hash','snapshot','expires_at');
grant select on share.views to chordjai_app;
create policy views_owner on share.views for select to chordjai_app using (exists(select 1 from share.links l where l.id = link_id and l.owner_id = public.current_user_id()));

grant select on notify.inbox,notify.line_accounts,notify.deliveries to chordjai_app;
grant update(read_at) on notify.inbox to chordjai_app;
create policy inbox_self on notify.inbox for all to chordjai_app using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));
create policy line_account_self on notify.line_accounts for select to chordjai_app using (user_id = (select public.current_user_id()));
create policy deliveries_self on notify.deliveries for select to chordjai_app using (user_id = (select public.current_user_id()));
grant select,insert,update,delete on notify.reminders,notify.calendar_feeds to chordjai_app;
create policy reminders_read on notify.reminders for select to chordjai_app using (user_id = (select public.current_user_id()) and public.is_pet_member(pet_id));
create policy reminders_insert on notify.reminders for insert to chordjai_app with check (user_id = (select public.current_user_id()) and public.can_write_pet(pet_id));
create policy reminders_update on notify.reminders for update to chordjai_app using (user_id = (select public.current_user_id()) and public.can_write_pet(pet_id)) with check (user_id = (select public.current_user_id()) and public.can_write_pet(pet_id));
create policy reminders_delete on notify.reminders for delete to chordjai_app using (user_id = (select public.current_user_id()) and public.can_write_pet(pet_id));
create policy calendar_self on notify.calendar_feeds for all to chordjai_app using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));

grant select,insert,update,delete on media.objects to chordjai_app;
create policy objects_self on media.objects for all to chordjai_app using (user_id = (select public.current_user_id()) and (pet_id is null or public.is_pet_member(pet_id))) with check (user_id = (select public.current_user_id()) and (pet_id is null or public.can_write_pet(pet_id)));
grant insert on analytics.events to chordjai_app;
create policy analytics_insert_self on analytics.events for insert to chordjai_app with check (user_id = (select public.current_user_id()) and (pet_id is null or public.is_pet_member(pet_id)));

commit;


-- Migration: 202610100003_jobs.sql
begin;

create table ops.jobs (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  payload jsonb not null,
  dedupe_key text not null,
  created_by uuid references identity.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','running','completed','dead')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  run_at timestamptz not null default now(),
  locked_until timestamptz,
  locked_by text,
  lease_token uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(topic,dedupe_key)
);
create index jobs_ready_idx on ops.jobs(run_at,created_at) where status in ('queued','running');
alter table ops.jobs enable row level security;
create policy jobs_worker on ops.jobs for all to chordjai_worker using (true) with check (true);
create policy jobs_owner on ops.jobs for select to chordjai_app using (created_by = (select public.current_user_id()));
grant select,insert,update,delete on ops.jobs to chordjai_worker;
grant select on ops.jobs to chordjai_app;

create table ops.idempotency (
  user_id uuid not null references identity.users(id) on delete cascade,
  scope text not null,
  key text not null,
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key(user_id,scope,key)
);
alter table ops.idempotency enable row level security;
create policy idempotency_worker on ops.idempotency for all to chordjai_worker using (true) with check (true);
create policy idempotency_self on ops.idempotency for all to chordjai_app using (user_id = (select public.current_user_id())) with check (user_id = (select public.current_user_id()));
grant select,insert,update,delete on ops.idempotency to chordjai_app,chordjai_worker;

create function ops.enqueue(
  p_topic text,p_payload jsonb,p_dedupe_key text,
  p_run_at timestamptz default now(),p_max_attempts integer default 5
) returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid; actor uuid; invoking_role text;
begin
  actor := public.current_user_id();
  invoking_role := current_setting('role',true);
  if invoking_role = 'chordjai_app' then
    if actor is null then raise exception 'Authenticated actor required' using errcode='42501'; end if;
    if p_topic like 'cron%' or p_topic like '%webhook%' or p_topic like 'admin%' then
      raise exception 'System topic denied' using errcode='42501';
    end if;
    if coalesce(p_payload->>'user_id',p_payload->>'userId',actor::text) <> actor::text then
      raise exception 'Job actor mismatch' using errcode='42501';
    end if;
    if coalesce(p_payload->>'pet_id',p_payload->>'petId') is not null
      and not public.is_pet_member(coalesce(p_payload->>'pet_id',p_payload->>'petId')::uuid) then
      raise exception 'Pet access denied' using errcode='42501';
    end if;
  elsif invoking_role <> 'chordjai_worker' then
    raise exception 'Worker or application context required' using errcode='42501';
  end if;
  if length(p_topic) not between 1 and 120 or length(p_dedupe_key) not between 1 and 300
    or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid job input' using errcode='22023';
  end if;
  insert into ops.jobs(topic,payload,dedupe_key,created_by,run_at,max_attempts)
    values(p_topic,p_payload,p_dedupe_key,actor,p_run_at,p_max_attempts)
    on conflict(topic,dedupe_key) do update set dedupe_key = excluded.dedupe_key
      where ops.jobs.created_by is not distinct from excluded.created_by
    returning id into result_id;
  if result_id is null then raise exception 'Dedupe key belongs to another actor' using errcode='42501'; end if;
  return result_id;
end $$;

create function ops.claim_jobs(p_worker_id text,p_limit integer default 10,p_lease_seconds integer default 120)
returns setof ops.jobs language plpgsql security definer set search_path = '' as $$
begin
  if p_limit not between 1 and 100 or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid claim limits' using errcode='22023';
  end if;
  -- A crash on the final attempt is also a visible dead letter after its lease expires.
  update ops.jobs set status='dead',last_error=coalesce(last_error,'Lease expired on final attempt'),
    locked_until=null,lease_token=null,updated_at=clock_timestamp()
    where status='running' and locked_until <= clock_timestamp() and attempts >= max_attempts;
  return query
    with next_jobs as (
      select j.id from ops.jobs j
      where (j.status='queued' and j.run_at <= clock_timestamp()
        or j.status='running' and j.locked_until <= clock_timestamp())
        and j.attempts < j.max_attempts
      order by j.run_at,j.created_at
      for update skip locked limit p_limit
    )
    update ops.jobs j set status='running',attempts=j.attempts+1,
      locked_by=p_worker_id,locked_until=clock_timestamp()+make_interval(secs=>p_lease_seconds),
      lease_token=gen_random_uuid(),updated_at=clock_timestamp()
    from next_jobs n where j.id=n.id returning j.*;
end $$;

create function ops.complete_job(p_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare touched integer;
begin
  update ops.jobs set status='completed',completed_at=clock_timestamp(),updated_at=clock_timestamp(),
    locked_until=null,lease_token=null,last_error=null
    where id=p_id and status='running' and lease_token=p_lease_token and locked_until > clock_timestamp();
  get diagnostics touched = row_count;
  return touched = 1;
end $$;
create function ops.fail_job(p_id uuid,p_lease_token uuid,p_error text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare touched integer;
begin
  update ops.jobs set status=case when attempts >= max_attempts then 'dead' else 'queued' end,
    run_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,attempts-1)::integer)),
    locked_until=null,lease_token=null,last_error=left(p_error,1000),updated_at=clock_timestamp()
    where id=p_id and status='running' and lease_token=p_lease_token and locked_until > clock_timestamp();
  get diagnostics touched = row_count;
  return touched = 1;
end $$;
revoke all on function ops.enqueue(text,jsonb,text,timestamptz,integer),ops.claim_jobs(text,integer,integer),
  ops.complete_job(uuid,uuid),ops.fail_job(uuid,uuid,text) from public;
grant execute on function ops.enqueue(text,jsonb,text,timestamptz,integer) to chordjai_app,chordjai_worker;
grant execute on function ops.claim_jobs(text,integer,integer),ops.complete_job(uuid,uuid),ops.fail_job(uuid,uuid,text) to chordjai_worker;

commit;


-- Migration: 202610100004_ai_context.sql
begin;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to chordjai_app,chordjai_worker;

alter table assistant.messages add column request_id uuid;
alter table assistant.messages add constraint messages_request_unique unique(conversation_id,role,request_id);
alter table assistant.conversations add column processing_token uuid;
alter table assistant.conversations add column processing_started_at timestamptz;
alter table biometric.enrollments add column media_id uuid references media.objects(id) on delete set null;
alter table biometric.enrollments add column embedding extensions.vector(1536);
-- Tiny pilot gallery: exact filtered cosine search is preferable to an uncalibrated ANN index.
create index enrollments_search_mode_idx on biometric.enrollments(search_mode,status);
commit;


-- Migration: 202610100005_rate_limits.sql
begin;
create table ops.rate_limits (
  scope text not null,
  key text not null,
  window_started_at timestamptz not null,
  count integer not null default 1 check (count > 0),
  expires_at timestamptz not null,
  primary key(scope,key,window_started_at)
);
create index rate_limits_expiry_idx on ops.rate_limits(expires_at);
alter table ops.rate_limits enable row level security;
create policy rate_limits_worker on ops.rate_limits for all to chordjai_worker using (true) with check (true);
grant select,insert,update,delete on ops.rate_limits to chordjai_worker;

create function ops.take_rate_limit(p_scope text,p_key text,p_window_seconds integer,p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare bucket timestamptz; result_count integer;
begin
  if p_window_seconds not between 1 and 86400 or p_limit not between 1 and 10000
    or length(p_scope) not between 1 and 120 or length(p_key) not between 1 and 300 then
    raise exception 'Invalid rate-limit input' using errcode='22023';
  end if;
  bucket := to_timestamp(floor(extract(epoch from clock_timestamp())/p_window_seconds)*p_window_seconds);
  insert into ops.rate_limits(scope,key,window_started_at,count,expires_at)
    values(p_scope,p_key,bucket,1,bucket+make_interval(secs=>p_window_seconds*2))
    on conflict(scope,key,window_started_at) do update set count=ops.rate_limits.count+1
      where ops.rate_limits.count < p_limit
    returning count into result_count;
  return result_count is not null;
end $$;
revoke all on function ops.take_rate_limit(text,text,integer,integer) from public;
grant execute on function ops.take_rate_limit(text,text,integer,integer) to chordjai_app,chordjai_worker;
commit;


-- Migration: 202610100006_reminder_completion.sql
begin;
alter table notify.reminders add column completed_at timestamptz;
commit;


-- Migration: 202610100007_http_idempotency.sql
begin;
-- HTTP cache is worker-only; authenticated rows retain erasure FK, public rows use NULL.
alter table ops.idempotency drop constraint idempotency_pkey;
alter table ops.idempotency alter column user_id drop not null;
alter table ops.idempotency add primary key(scope,key);
alter table ops.idempotency add column status text not null default 'pending' check (status in ('pending','completed'));
alter table ops.idempotency add column response_status integer check (response_status between 100 and 599);
alter table ops.idempotency add column locked_until timestamptz;
drop policy idempotency_self on ops.idempotency;
revoke all on ops.idempotency from chordjai_app;
create index idempotency_expiry_idx on ops.idempotency(expires_at);
commit;


-- Migration: 202610100008_pet_creation_returning.sql
begin;
-- INSERT RETURNING checks SELECT before an AFTER trigger's membership is visible.
-- The row's verified owner is an explicit read predicate, independent of helpers.
drop policy pets_read on pet.pets;
create policy pets_read on pet.pets for select to chordjai_app using (
  owner_id = (select public.current_user_id()) or public.is_pet_member(id)
  or public.has_clinic_grant(id,'summary.read')
);
commit;


-- Migration: 202610100009_governance_guards.sql
begin;
create or replace function triage.protect_approved_rules() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'Create draft rules before approval' using errcode='23514'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' and old.status <> 'draft' then
    raise exception 'Approved rules are immutable' using errcode='23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (new.rules is distinct from old.rules or new.checksum <> old.checksum or new.version <> old.version) then
      raise exception 'Approved rules are immutable' using errcode='23514';
    end if;
    if new.status in ('approved','active') and old.status = 'draft' then
      if new.approved_by is null or new.approved_at is null or not exists(
        select 1 from triage.eval_runs e where e.id = new.eval_run_id and e.rule_set_id = new.id
          and e.passed and e.under_triage_count = 0) then
        raise exception 'Approval requires passing eval evidence' using errcode='23514';
      end if;
      if not exists(select 1 from identity.users u where u.id = new.approved_by and u.role = 'vet') then
        raise exception 'Approval requires veterinary reviewer' using errcode='23514';
      end if;
    end if;
    return new;
  end if;
  return old;
end $$;
drop trigger immutable_approved_rules on triage.rule_sets;
create trigger immutable_approved_rules before insert or update or delete on triage.rule_sets
  for each row execute function triage.protect_approved_rules();
revoke update on biometric.matches from chordjai_app;
grant update(owner_confirmed) on biometric.matches to chordjai_app;
commit;


-- Migration: 202610100010_durable_blob_erasure.sql
begin;
-- Blob deletion must survive the very account/pet cascade that removes metadata.
-- Trigger runs after RLS has admitted the write and reads only OLD row's pathname.
create function media.queue_blob_erasure() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.status <> 'deleted' or old.status='deleted') then return new; end if;
  insert into ops.jobs(topic,payload,dedupe_key,created_by)
    values('media.delete',jsonb_build_object('pathname',old.pathname),'media-delete:'||old.id::text,null)
    on conflict(topic,dedupe_key) do update set created_by=null;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function media.queue_blob_erasure() from public;
create trigger media_durable_delete before delete on media.objects for each row execute function media.queue_blob_erasure();
create trigger media_durable_mark_deleted before update of status on media.objects for each row execute function media.queue_blob_erasure();
commit;


-- Migration: 202610100011_pet_neutered.sql
begin;
-- NULL = unknown/not entered; existing profiles remain valid.
alter table pet.pets add column neutered boolean;
commit;


-- Migration: 202610100012_health_creator_erasure.sql
begin;
-- Health records belong to the pet. Erasing a carer anonymizes attribution;
-- erasing the pet still cascades the medical record through records.pet_id.
alter table health.records drop constraint records_created_by_fkey;
alter table health.records alter column created_by drop not null;
alter table health.records add constraint records_created_by_fkey
  foreign key(created_by) references identity.users(id) on delete set null;
commit;


-- Migration: 202610100013_webhook_retention_index.sql
begin;
create index webhook_events_retention_idx on notify.webhook_events(received_at);
commit;


-- Migration: 202610100014_petid_hnsw_cosine.sql
begin;
-- Match the current 1536-dimensional, single-vector enrollment representation.
-- HNSW is approximate; eligibility remains enforced by live joins in the API.
-- Queries must use these literal predicates plus ORDER BY embedding <=> vector ASC.
create index enrollments_embedding_hnsw_lost_ready_idx
  on biometric.enrollments using hnsw (embedding extensions.vector_cosine_ops)
  with (m=16,ef_construction=64)
  where status='ready' and search_mode='lost_only' and embedding is not null;
comment on index biometric.enrollments_embedding_hnsw_lost_ready_idx is
  'ANN cosine candidate search; filter active lost cases, species and ready media at query time. Use exact filtered fallback for incomplete candidates.';
commit;


-- Migration: 202610110015_memory_books_petid_photos.sql
begin;

-- Existing pages retain their original 800x1000 canvas and saved content.
alter table journal.pages
  add column canvas_height integer not null default 1000 check (canvas_height in (1000,1422)),
  add column story_date date,
  add column location text not null default '' check (length(location)<=160),
  add column page_order integer not null default 0 check (page_order>=0);
alter table journal.pages disable trigger set_updated_at;
with positions as (
  select id,row_number() over(partition by pet_id,owner_id order by created_at,id)-1 as position
  from journal.pages
)
update journal.pages p set page_order=positions.position from positions where p.id=positions.id;
alter table journal.pages enable trigger set_updated_at;
create index pages_book_order_idx on journal.pages(pet_id,owner_id,page_order,created_at);

create table journal.books (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  cover_theme jsonb not null check (jsonb_typeof(cover_theme)='object'),
  cover_elements jsonb not null default '[]' check (jsonb_typeof(cover_elements)='array' and jsonb_array_length(cover_elements)<=100),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(pet_id,owner_id)
);
alter table journal.books enable row level security;
alter table journal.books force row level security;
grant select,insert,update,delete on journal.books to chordjai_app,chordjai_worker;
create policy system_worker on journal.books for all to chordjai_worker using (true) with check (true);
create policy books_read on journal.books for select to chordjai_app
  using (owner_id=(select public.current_user_id()) and public.is_pet_member(pet_id));
create policy books_insert on journal.books for insert to chordjai_app
  with check (owner_id=(select public.current_user_id()) and public.can_write_pet(pet_id));
create policy books_update on journal.books for update to chordjai_app
  using (owner_id=(select public.current_user_id()) and public.can_write_pet(pet_id))
  with check (owner_id=(select public.current_user_id()) and public.can_write_pet(pet_id));
create policy books_delete on journal.books for delete to chordjai_app
  using (owner_id=(select public.current_user_id()) and public.can_write_pet(pet_id));
create trigger set_updated_at before update on journal.books for each row execute function public.touch_updated_at();
create trigger books_immutable before update on journal.books for each row execute function public.prevent_actor_reassignment('id','pet_id','owner_id');

-- Foreign keys preserve ownership/asset deletion behavior for up to five photos.
create table biometric.enrollment_photos (
  enrollment_id uuid not null references biometric.enrollments(id) on delete cascade,
  media_id uuid not null references media.objects(id) on delete cascade,
  position integer not null check (position between 0 and 4),
  primary key(enrollment_id,media_id),
  unique(enrollment_id,position)
);
insert into biometric.enrollment_photos(enrollment_id,media_id,position)
  select id,media_id,0 from biometric.enrollments where media_id is not null;
alter table biometric.enrollment_photos enable row level security;
alter table biometric.enrollment_photos force row level security;
grant select,insert,update,delete on biometric.enrollment_photos to chordjai_app,chordjai_worker;
create policy system_worker on biometric.enrollment_photos for all to chordjai_worker using (true) with check (true);
create policy enrollment_photos_owner on biometric.enrollment_photos for all to chordjai_app
  using (exists(select 1 from biometric.enrollments e where e.id=enrollment_photos.enrollment_id and e.user_id=(select public.current_user_id()) and public.is_pet_owner(e.pet_id)))
  with check (exists(select 1 from biometric.enrollments e where e.id=enrollment_photos.enrollment_id and e.user_id=(select public.current_user_id()) and public.is_pet_owner(e.pet_id)
    and exists(select 1 from media.objects m where m.id=enrollment_photos.media_id and m.user_id=(select public.current_user_id()) and m.pet_id=e.pet_id and m.status='ready')));

-- A vector/signature derived from several photos must stop being searchable
-- when any of those photos is erased, including a non-primary reference.
-- Run before FK cascades remove the reference that identifies the enrollment.
create function biometric.invalidate_photo_signature() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and new.status='ready' then return new; end if;
  update biometric.enrollments e set signature='{}',embedding=null,
    status=case when e.status='withdrawn' then 'withdrawn' else 'draft' end
    where exists(select 1 from biometric.enrollment_photos p
      where p.enrollment_id=e.id and p.media_id=old.id);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function biometric.invalidate_photo_signature() from public,chordjai_app,chordjai_worker;
create trigger petid_photo_delete before delete on media.objects
  for each row execute function biometric.invalidate_photo_signature();
create trigger petid_photo_unavailable before update of status on media.objects
  for each row execute function biometric.invalidate_photo_signature();

commit;


-- Migration: 202610120016_care_diary.sql
begin;

-- Longitudinal owner-reported care. Clinical sharing is an explicit new grant;
-- legacy summary.read grants never gain access to care diary entries.
-- Authored care diaries are personal owner-reported content, so erasing an
-- author cascades that author's entries/reflections/photos/expenses/episodes.
-- Existing health.records remain pet clinical records with anonymized creator
-- under migration 12. This migration does not change that retention behavior.
alter table identity.grants drop constraint grants_scopes_check;
alter table identity.grants add constraint grants_scopes_check
  check(scopes <@ array['summary.read','vaccines.write','due_list.read','identity.verify','care.read']::text[]);

create table health.care_episodes (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  created_by uuid not null references identity.users(id) on delete cascade,
  client_episode_id uuid not null,
  create_hash text not null check(length(create_hash)=64),
  title text not null check(length(title) between 1 and 160),
  status text not null default 'ongoing' check(status in ('ongoing','improving','resolved')),
  started_at timestamptz not null,
  resolved_at timestamptz,
  version integer not null default 1 check(version>0),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(created_by,client_episode_id),unique(id,pet_id),
  check(resolved_at is null or (status='resolved' and resolved_at>=started_at))
);
create index care_episodes_pet_idx on health.care_episodes(pet_id,started_at desc);
create table health.care_entries (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  created_by uuid not null references identity.users(id) on delete cascade,
  client_entry_id uuid not null,
  create_hash text not null check(length(create_hash)=64),
  episode_id uuid,
  kind text not null check(kind in ('daily','symptom','visit','followup')),
  title text not null check(length(title) between 1 and 160),
  observed_at timestamptz not null,
  narrative text not null default '' check(length(narrative)<=6000),
  clinical_note text not null default '' check(length(clinical_note)<=4000),
  observations jsonb not null default '{}' check(jsonb_typeof(observations)='object' and octet_length(observations::text)<=20000),
  visit jsonb check(visit is null or (jsonb_typeof(visit)='object' and octet_length(visit::text)<=16000)),
  share_with_clinic boolean not null default false,share_costs boolean not null default false,
  provenance text not null default 'owner_reported' check(provenance='owner_reported'),
  version integer not null default 1 check(version>0),
  edited_by uuid references identity.users(id) on delete set null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(created_by,client_entry_id),
  foreign key(episode_id,pet_id) references health.care_episodes(id,pet_id) on delete set null(episode_id)
);
create index care_entries_pet_timeline_idx on health.care_entries(pet_id,observed_at desc,id);
create index care_entries_episode_idx on health.care_entries(episode_id,observed_at) where episode_id is not null;
create table health.care_reflections (
  entry_id uuid primary key references health.care_entries(id) on delete cascade,
  author_id uuid not null references identity.users(id) on delete cascade,
  content text not null check(length(content)<=6000),updated_at timestamptz not null default now()
);
create table health.care_costs (
  entry_id uuid not null references health.care_entries(id) on delete cascade,
  position integer not null check(position between 0 and 29),
  label text not null check(length(label) between 1 and 120),
  amount_minor integer not null check(amount_minor between 0 and 100000000),
  currency text not null check(currency in ('THB','USD')),
  kind text not null default 'paid' check(kind in ('paid','estimate')),
  primary key(entry_id,position)
);
create table health.care_media (
  entry_id uuid not null references health.care_entries(id) on delete cascade,
  media_id uuid not null references media.objects(id) on delete cascade,
  position integer not null check(position between 0 and 4),
  primary key(entry_id,media_id),unique(entry_id,position)
);

do $$ declare t text; begin
  foreach t in array array['care_episodes','care_entries','care_reflections','care_costs','care_media'] loop
    execute format('alter table health.%I enable row level security',t);
    execute format('alter table health.%I force row level security',t);
    execute format('revoke all on health.%I from public',t);
    execute format('grant select,insert,update,delete on health.%I to chordjai_app,chordjai_worker',t);
    execute format('create policy system_worker on health.%I for all to chordjai_worker using(true) with check(true)',t);
  end loop;
end $$;
create policy episodes_family_read on health.care_episodes for select to chordjai_app using(public.is_pet_member(pet_id));
create policy episodes_create on health.care_episodes for insert to chordjai_app with check(created_by=(select public.current_user_id()) and public.can_write_pet(pet_id));
create policy episodes_edit on health.care_episodes for update to chordjai_app
  using(public.can_write_pet(pet_id) and (created_by=(select public.current_user_id()) or public.is_pet_owner(pet_id)))
  with check(public.can_write_pet(pet_id) and (created_by=(select public.current_user_id()) or public.is_pet_owner(pet_id)));
create policy episodes_delete on health.care_episodes for delete to chordjai_app using(public.can_write_pet(pet_id) and (created_by=(select public.current_user_id()) or public.is_pet_owner(pet_id)));
create policy entries_family_read on health.care_entries for select to chordjai_app using(public.is_pet_member(pet_id));
create policy entries_create on health.care_entries for insert to chordjai_app with check(created_by=(select public.current_user_id()) and public.can_write_pet(pet_id));
create policy entries_edit on health.care_entries for update to chordjai_app
  using(public.can_write_pet(pet_id) and (created_by=(select public.current_user_id()) or public.is_pet_owner(pet_id)))
  with check(public.can_write_pet(pet_id) and (created_by=(select public.current_user_id()) or public.is_pet_owner(pet_id)));
create policy entries_delete on health.care_entries for delete to chordjai_app using(public.can_write_pet(pet_id) and (created_by=(select public.current_user_id()) or public.is_pet_owner(pet_id)));
create policy reflections_author on health.care_reflections for all to chordjai_app
  using(author_id=(select public.current_user_id()) and exists(select 1 from health.care_entries e where e.id=entry_id))
  with check(author_id=(select public.current_user_id()) and exists(select 1 from health.care_entries e where e.id=entry_id and e.created_by=(select public.current_user_id()) and public.can_write_pet(e.pet_id)));
create policy costs_family_read on health.care_costs for select to chordjai_app using(exists(select 1 from health.care_entries e where e.id=entry_id));
create policy costs_edit on health.care_costs for all to chordjai_app
  using(exists(select 1 from health.care_entries e where e.id=entry_id and public.can_write_pet(e.pet_id) and (e.created_by=(select public.current_user_id()) or public.is_pet_owner(e.pet_id))))
  with check(exists(select 1 from health.care_entries e where e.id=entry_id and public.can_write_pet(e.pet_id) and (e.created_by=(select public.current_user_id()) or public.is_pet_owner(e.pet_id))));
create policy care_media_family_read on health.care_media for select to chordjai_app using(exists(select 1 from health.care_entries e where e.id=entry_id));
create policy care_media_edit on health.care_media for all to chordjai_app
  using(exists(select 1 from health.care_entries e where e.id=entry_id and public.can_write_pet(e.pet_id) and (e.created_by=(select public.current_user_id()) or public.is_pet_owner(e.pet_id))))
  with check(exists(select 1 from health.care_entries e where e.id=entry_id and public.can_write_pet(e.pet_id) and (e.created_by=(select public.current_user_id()) or public.is_pet_owner(e.pet_id))
    and exists(select 1 from media.objects m where m.id=media_id and m.pet_id=e.pet_id and m.status='ready' and m.mime like 'image/%')));
create trigger episodes_touch before update on health.care_episodes for each row execute function public.touch_updated_at();
create trigger entries_touch before update on health.care_entries for each row execute function public.touch_updated_at();
create trigger reflections_touch before update on health.care_reflections for each row execute function public.touch_updated_at();
create trigger episodes_immutable before update on health.care_episodes for each row execute function public.prevent_actor_reassignment('id','pet_id','created_by','client_episode_id','create_hash');
create trigger entries_immutable before update on health.care_entries for each row execute function public.prevent_actor_reassignment('id','pet_id','created_by','client_entry_id','create_hash','provenance');
create trigger reflections_immutable before update on health.care_reflections for each row execute function public.prevent_actor_reassignment('entry_id','author_id');

create function health.sync_care_followup() returns trigger
language plpgsql security definer set search_path='' as $$
declare due timestamptz;
begin
  if tg_op='DELETE' then
    delete from notify.reminders where dedupe_key='care:'||old.id::text;
    return old;
  end if;
  due=(new.visit->>'nextFollowupAt')::timestamptz;
  if due is null then
    delete from notify.reminders where dedupe_key='care:'||new.id::text;
  elsif tg_op='UPDATE' and new.visit->>'nextFollowupAt' is not distinct from old.visit->>'nextFollowupAt' then
    update notify.reminders set title=new.title where dedupe_key='care:'||new.id::text;
  else
    insert into notify.reminders(pet_id,user_id,title,due_at,dedupe_key) values(new.pet_id,new.created_by,new.title,due,'care:'||new.id::text)
    on conflict(dedupe_key) do update set title=excluded.title,due_at=excluded.due_at,sent_at=null,completed_at=null;
  end if;
  return new;
end $$;
revoke all on function health.sync_care_followup() from public,chordjai_app,chordjai_worker;
create trigger care_followup after insert or update or delete on health.care_entries for each row execute function health.sync_care_followup();

-- Snapshots are intentionally static, but deletion or withdrawing entry/cost
-- sharing revokes links containing that entry instead of retaining a live copy.
create function health.revoke_care_snapshots() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='DELETE' or (old.share_with_clinic and not new.share_with_clinic) or (old.share_costs and not new.share_costs) then
    update share.links set revoked_at=coalesce(revoked_at,now())
      where revoked_at is null and snapshot->'careEntries' @> jsonb_build_array(jsonb_build_object('id',old.id::text));
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function health.revoke_care_snapshots() from public,chordjai_app,chordjai_worker;
create trigger revoke_care_snapshots before delete or update of share_with_clinic,share_costs on health.care_entries for each row execute function health.revoke_care_snapshots();

-- A clinic gets this bounded projection only. Its SQL role cannot select a
-- family's raw entries, reflections, media or expenses via the table policies.
create function health.clinic_care_summary(p_pet_id uuid,p_include_costs boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if public.current_user_id() is null or not public.has_clinic_grant(p_pet_id,'care.read') then
    raise exception 'A current explicit care.read grant is required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(projected) order by projected.observed_at desc,projected.id desc),'[]'::jsonb) into result from (
    select e.id,e.kind,e.title,e.observed_at,e.clinical_note,e.observations,e.visit,e.provenance,e.updated_at,
      case when ep.id is null then null else jsonb_build_object('id',ep.id,'title',ep.title,'status',ep.status,'startedAt',ep.started_at,'resolvedAt',ep.resolved_at) end as episode,
      case when p_include_costs and e.share_costs then coalesce((select jsonb_agg(jsonb_build_object('label',c.label,'amountMinor',c.amount_minor,'currency',c.currency,'kind',c.kind) order by c.position) from health.care_costs c where c.entry_id=e.id),'[]'::jsonb) else '[]'::jsonb end as costs
    from health.care_entries e left join health.care_episodes ep on ep.id=e.episode_id
    where e.pet_id=p_pet_id and e.share_with_clinic order by e.observed_at desc,e.id desc limit 100
  ) projected;
  return jsonb_build_object('entries',result,'truncated',(select count(*)>100 from health.care_entries where pet_id=p_pet_id and share_with_clinic),'generatedAt',now(),'provenance','owner_reported');
end $$;
revoke all on function health.clinic_care_summary(uuid,boolean) from public,chordjai_worker;
grant execute on function health.clinic_care_summary(uuid,boolean) to chordjai_app;

commit;


-- Migration: 202610120017_petid_research_capture.sql
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


-- Migration: 202610120018_personalized_followups.sql
begin;

-- Optional outbound personalization is separate from assistant memory, marketing
-- and PetID training. No account is opted in by this migration.
create table notify.followup_preferences (
  user_id uuid primary key references identity.users(id) on delete cascade,
  enabled boolean not null default false,
  cadence_days integer not null default 7 check(cadence_days in (5,7)),
  language text not null default 'th' check(language in ('th','en')),
  paused_until timestamptz,
  sources jsonb not null default '{"care":false,"booklet":false,"journal":false,"assistantMemory":false}',
  consent_version text,
  version integer not null default 1 check(version>0),
  last_accepted_at timestamptz,last_evaluated_at timestamptz,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(jsonb_typeof(sources)='object' and sources ?& array['care','booklet','journal','assistantMemory'] and
    (sources-'care'-'booklet'-'journal'-'assistantMemory')='{}'::jsonb and
    jsonb_typeof(sources->'care')='boolean' and jsonb_typeof(sources->'booklet')='boolean' and
    jsonb_typeof(sources->'journal')='boolean' and jsonb_typeof(sources->'assistantMemory')='boolean'),
  check(not enabled or (consent_version='2026-10-12.followup.v1' and
    (sources->'care'='true'::jsonb or sources->'booklet'='true'::jsonb or sources->'journal'='true'::jsonb or sources->'assistantMemory'='true'::jsonb)))
);
create table notify.followup_consent_events (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references identity.users(id) on delete cascade,
  enabled boolean not null,consent_version text,sources jsonb not null,cadence_days integer not null,
  language text not null,paused_until timestamptz,created_at timestamptz not null default now()
);
create table notify.followup_deliveries (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references identity.users(id) on delete cascade,
  local_day date not null,
  status text not null default 'generating' check(status in ('generating','ready','accepted','skipped','failed','cancelled','uncertain')),
  settings_version integer not null,
  context_hash text check(context_hash is null or length(context_hash)=64),
  source_refs jsonb not null default '[]' check(jsonb_typeof(source_refs)='array' and jsonb_array_length(source_refs)<=30),
  message text check(message is null or length(message)<=500),
  reason_code text not null default '',lease_token uuid,lease_until timestamptz,
  attempts integer not null default 0 check(attempts>=0 and attempts<=10),
  first_push_at timestamptz,accepted_at timestamptz,opened_at timestamptz,
  selected_pet_id uuid references pet.pets(id) on delete set null,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(user_id,local_day)
);
create index followup_deliveries_pending_idx on notify.followup_deliveries(status,lease_until) where status in ('generating','ready','failed');
create index followup_preferences_due_idx on notify.followup_preferences(last_evaluated_at) where enabled;
create table notify.followup_replies (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references identity.users(id) on delete cascade,
  delivery_id uuid not null references notify.followup_deliveries(id) on delete cascade,
  pet_id uuid not null references pet.pets(id) on delete cascade,
  event_id text not null unique check(length(event_id)<=100),
  content text not null check(length(content) between 1 and 1000),
  source text not null default 'line_reply' check(source='line_reply'),
  correlation text not null default 'most_recent_followup_not_verified' check(correlation='most_recent_followup_not_verified'),
  created_at timestamptz not null default now()
);

do $$ declare t text;begin
  foreach t in array array['followup_preferences','followup_consent_events','followup_deliveries','followup_replies'] loop
    execute format('alter table notify.%I enable row level security',t);
    execute format('alter table notify.%I force row level security',t);
    execute format('revoke all on notify.%I from public',t);
    execute format('grant select on notify.%I to chordjai_app',t);
    execute format('grant select,insert,update,delete on notify.%I to chordjai_worker',t);
    execute format('create policy system_worker on notify.%I for all to chordjai_worker using(true) with check(true)',t);
    execute format('create policy followup_self_read on notify.%I for select to chordjai_app using(user_id=public.current_user_id())',t);
  end loop;
end $$;
grant insert,update on notify.followup_preferences to chordjai_app;
create policy followup_settings_insert on notify.followup_preferences for insert to chordjai_app with check(user_id=public.current_user_id());
create policy followup_settings_update on notify.followup_preferences for update to chordjai_app using(user_id=public.current_user_id()) with check(user_id=public.current_user_id());
create trigger followup_settings_immutable before update on notify.followup_preferences for each row execute function public.prevent_actor_reassignment('user_id','last_accepted_at','last_evaluated_at','created_at');
create trigger set_updated_at before update on notify.followup_preferences for each row execute function public.touch_updated_at();

create function notify.record_followup_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or (new.enabled,new.sources,new.consent_version,new.cadence_days,new.language,new.paused_until) is distinct from (old.enabled,old.sources,old.consent_version,old.cadence_days,old.language,old.paused_until) then
    insert into notify.followup_consent_events(user_id,enabled,consent_version,sources,cadence_days,language,paused_until)
      values(new.user_id,new.enabled,new.consent_version,new.sources,new.cadence_days,new.language,new.paused_until);
    -- Preferences changing invalidate all unsent drafts. Never reuse an old
    -- source choice/language after opt-out or a narrower permission change.
    update notify.followup_deliveries set status='cancelled',message=null,context_hash=null,source_refs='[]'::jsonb,reason_code='settings_changed',lease_token=null,lease_until=null,updated_at=now()
      where user_id=new.user_id and status in ('generating','ready','failed');
  end if;
  return new;
end $$;
revoke all on function notify.record_followup_consent() from public;
create trigger followup_consent_history after insert or update on notify.followup_preferences for each row execute function notify.record_followup_consent();

-- Append-only for ordinary users and workers; erasing an account still cascades.
revoke insert,update,delete on notify.followup_consent_events from chordjai_app;
revoke update,delete on notify.followup_consent_events from chordjai_worker;
commit;
