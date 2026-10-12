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
