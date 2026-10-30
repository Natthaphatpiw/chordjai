begin;
create index jobs_completed_retention_idx on ops.jobs(updated_at) where status='completed';
-- Only typed routing decisions are cached: never prompts, replies, records or actions.
create table ops.input_cache (
 user_id uuid not null references identity.users(id) on delete cascade,
 cache_key text not null check(length(cache_key)=64),
 lease_token uuid not null,
 lease_until timestamptz not null,
 decision jsonb check(octet_length(decision::text)<=4096),
 expires_at timestamptz not null,
 primary key(user_id,cache_key)
);
create index input_cache_expiry_idx on ops.input_cache(expires_at);
alter table ops.input_cache enable row level security;
create policy input_cache_worker on ops.input_cache for all to chordjai_worker using(true) with check(true);
grant select,insert,update,delete on ops.input_cache to chordjai_worker;

create table ops.guard_metrics (
 bucket timestamptz not null,
 user_key text not null check(length(user_key)<=64),
 user_id uuid references identity.users(id) on delete cascade,
 reason text not null check(reason ~ '^[a-z_.]{1,60}$'),
 count bigint not null default 1 check(count>0),
 primary key(bucket,user_key,reason)
);
create index guard_metrics_time_idx on ops.guard_metrics(bucket,user_id);
alter table ops.guard_metrics enable row level security;
create policy guard_metrics_worker on ops.guard_metrics for all to chordjai_worker using(true) with check(true);
grant select,insert,update,delete on ops.guard_metrics to chordjai_worker;
alter table notify.webhook_events add column ingress_decision jsonb;
create table ops.line_admissions(
 user_id uuid primary key references identity.users(id) on delete cascade,
 fingerprint text not null check(length(fingerprint)=64),
 context_key text not null,
 expires_at timestamptz not null
);
alter table ops.line_admissions enable row level security;
create policy line_admissions_worker on ops.line_admissions for all to chordjai_worker using(true) with check(true);
grant select,insert,update,delete on ops.line_admissions to chordjai_worker;

-- A hard ceiling at the database boundary also covers Agent writes and batch APIs.
-- Exceeding a quota rolls back the entire business write, including partial batches.
create function ops.guard_owner_insert() returns trigger language plpgsql set search_path='' as $$
declare owner_key text := nullif(current_setting('app.user_id',true),'');
begin
 if owner_key is not null then
  if not ops.take_rate_limit('db-owner-insert-minute',owner_key,60,120)
    or not ops.take_rate_limit('db-owner-insert-day',owner_key,86400,1000) then
   raise exception 'Owner insert quota reached' using errcode='P0429';
  end if;
  if tg_table_schema='media' then
   perform pg_advisory_xact_lock(hashtextextended('media-storage:'||owner_key,0));
   if (select coalesce(sum(size),0) from media.objects where user_id=owner_key::uuid and status in('pending','ready'))+new.size>262144000 then
    raise exception 'Owner active media storage quota reached' using errcode='P0429';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function ops.guard_owner_insert() from public;
create trigger pets_insert_guard before insert on pet.pets for each row execute function ops.guard_owner_insert();
create trigger care_insert_guard before insert on health.care_entries for each row execute function ops.guard_owner_insert();
create trigger health_insert_guard before insert on health.records for each row execute function ops.guard_owner_insert();
create trigger pages_insert_guard before insert on journal.pages for each row execute function ops.guard_owner_insert();
create trigger books_insert_guard before insert on journal.books for each row execute function ops.guard_owner_insert();
create trigger media_insert_guard before insert on media.objects for each row execute function ops.guard_owner_insert();
create trigger memories_insert_guard before insert on assistant.memories for each row execute function ops.guard_owner_insert();
create trigger conversations_insert_guard before insert on assistant.conversations for each row execute function ops.guard_owner_insert();
create trigger events_insert_guard before insert on analytics.events for each row execute function ops.guard_owner_insert();
commit;
