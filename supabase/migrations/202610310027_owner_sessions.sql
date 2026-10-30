begin;

-- Opaque browser sessions; the browser receives the secret, only its hash is
-- retained here. Revoked login-attempt tombstones prevent a late login response
-- from restoring access after the owner has already signed out.
create table identity.web_sessions (
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null unique,
 user_id uuid references identity.users(id) on delete cascade,
 token_hash text unique check(token_hash is null or token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 days',
 last_used_at timestamptz not null default now(),
 revoked_at timestamptz,
 check((user_id is not null and token_hash is not null) or revoked_at is not null),
 check(expires_at>created_at and expires_at<=created_at+interval '30 days')
);
create index web_sessions_owner_idx on identity.web_sessions(user_id,created_at desc);
create index web_sessions_expiry_idx on identity.web_sessions(expires_at);
alter table identity.web_sessions enable row level security;
alter table identity.web_sessions force row level security;
revoke all on identity.web_sessions from public,chordjai_app;
grant select,insert,update,delete on identity.web_sessions to chordjai_worker;
create policy web_sessions_worker on identity.web_sessions for all to chordjai_worker using(true) with check(true);

-- Access JWTs carry the session ID, so logout also revokes an already-issued
-- short bearer. The caller cannot use this function to inspect another owner.
create function identity.web_session_active(p_session uuid,p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_user=public.current_user_id() and exists(
  select 1 from identity.web_sessions s join identity.users u on u.id=s.user_id
  where s.id=p_session and s.user_id=p_user and s.revoked_at is null
   and s.expires_at>now() and u.status='active' and u.role='owner'
 );
$$;
revoke all on function identity.web_session_active(uuid,uuid) from public;
grant execute on function identity.web_session_active(uuid,uuid) to chordjai_app;

commit;
