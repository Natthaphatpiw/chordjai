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
