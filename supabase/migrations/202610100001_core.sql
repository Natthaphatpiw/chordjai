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
