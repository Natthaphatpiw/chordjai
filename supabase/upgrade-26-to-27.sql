-- GENERATED: only verified schema 26 -> 27, or verify an existing 27.
-- Supabase SQL Editor: open a NEW query and paste this ENTIRE file, then Run.
-- Do not paste it inside another DO block or select only part of this file.
-- One transaction: any validation or DDL failure rolls back every change.
begin;
set local search_path=pg_catalog;
do $upgrade$
declare current_state jsonb; known_count integer; expected_state text; actual_state text; checksum text;
begin
  perform pg_advisory_xact_lock(hashtext('chordjai-schema-upgrade'));
  select s.state into current_state from (
-- Reusable read-only catalog projection. Execute with search_path=pg_catalog.
with service_schemas(name) as (
 values ('identity'),('pet'),('health'),('journal'),('assistant'),('ai_ops'),('triage'),('clinic'),('lostfound'),('biometric'),('share'),('notify'),('media'),('analytics'),('ops')
), service_tables as (
 select c.oid,n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname in (select name from service_schemas) and c.relkind in ('r','p','v','m') and c.relname<>'schema_migrations'
), catalog as (
 select jsonb_build_object(
 'tables',coalesce((select jsonb_agg(jsonb_build_array(nspname,relname,relkind,relrowsecurity,relforcerowsecurity) order by nspname,relname) from service_tables),'[]'),
 'columns',coalesce((select jsonb_agg(jsonb_build_array(t.nspname,t.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_catalog.pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) order by t.nspname,t.relname,a.attnum)
   from service_tables t join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum>0 and not a.attisdropped left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum),'[]'),
 'constraints',coalesce((select jsonb_agg(jsonb_build_array(t.nspname,t.relname,c.conname,c.contype,pg_catalog.pg_get_constraintdef(c.oid,true),c.convalidated) order by t.nspname,t.relname,c.conname)
   from service_tables t join pg_catalog.pg_constraint c on c.conrelid=t.oid),'[]'),
 'indexes',coalesce((select jsonb_agg(jsonb_build_array(t.nspname,t.relname,c.relname,pg_catalog.pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) order by t.nspname,t.relname,c.relname)
   from service_tables t join pg_catalog.pg_index i on i.indrelid=t.oid join pg_catalog.pg_class c on c.oid=i.indexrelid),'[]'),
 'policies',coalesce((select jsonb_agg(jsonb_build_array(t.nspname,t.relname,p.polname,p.polcmd,p.polpermissive,
     (select jsonb_agg(r.rolname order by r.rolname) from pg_catalog.pg_roles r where r.oid=any(p.polroles)),pg_catalog.pg_get_expr(p.polqual,p.polrelid),pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) order by t.nspname,t.relname,p.polname)
   from service_tables t join pg_catalog.pg_policy p on p.polrelid=t.oid),'[]'),
 'triggers',coalesce((select jsonb_agg(jsonb_build_array(t.nspname,t.relname,g.tgname,pg_catalog.pg_get_triggerdef(g.oid,true),g.tgenabled) order by t.nspname,t.relname,g.tgname)
   from service_tables t join pg_catalog.pg_trigger g on g.tgrelid=t.oid and not g.tgisinternal),'[]'),
 'functions',coalesce((select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid),md5(pg_catalog.pg_get_functiondef(p.oid))) order by n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid))
   from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname in (select name from service_schemas) or n.nspname='public' and p.proname=any(array['current_user_id','is_pet_owner','is_pet_member','can_write_pet','is_admin','is_clinic_member','has_clinic_grant','owns_conversation','touch_updated_at','prevent_actor_reassignment'])),'[]')
 ) as details
)
select jsonb_build_object('fingerprint',md5(details::text),'details',details) as state from catalog
  ) s;
  select k.ordinal into known_count from (values
 (26,'202610300026','202610300026_input_guard.sql','0dc0475b0ea973d0c9250b37565d64aa'),
 (27,'202610310027','202610310027_owner_sessions.sql','9720c27f20983692910505835aaf6e6f')
  ) k(ordinal,version,file,fingerprint) where k.fingerprint=current_state->>'fingerprint';
  if known_count is null or known_count not in (26,27) then
    raise exception 'This packet requires verified ChordJai schema 26 or 27; unrecognized or partial schema (%). No changes applied. Run supabase/diagnostic.sql and review the full JSON; use bootstrap only on a fresh project.',current_state->>'fingerprint';
  end if;
  if not exists(select 1 from pg_roles where rolname='chordjai_app' and not rolsuper and not rolbypassrls)
    or not exists(select 1 from pg_roles where rolname='chordjai_worker' and not rolsuper and not rolbypassrls) then
    raise exception 'Expected restricted ChordJai roles are absent or unsafe. No changes applied.';
  end if;
  if to_regclass('ops.schema_migrations') is null then
    create table ops.schema_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now());
    alter table ops.schema_migrations enable row level security;
    create policy schema_migrations_worker on ops.schema_migrations for all to chordjai_worker using(true) with check(true);
    grant select,insert on ops.schema_migrations to chordjai_worker;
    revoke all on ops.schema_migrations from public;
  elsif (select array_agg(attname::text||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text order by attnum)
    from pg_attribute where attrelid=to_regclass('ops.schema_migrations') and attnum>0 and not attisdropped)
    is distinct from array['version:text:true','checksum:text:true','applied_at:timestamp with time zone:true']::text[] then
    raise exception 'Existing migration tracker has an incompatible shape. No changes applied.';
  end if;

  if exists(select 1 from ops.schema_migrations m left join (values
 ('202610100001','fa121e446446cd1c317f12762c27158577fba566bdb77f5bad8b405d75743b5c'),
 ('202610100002','eaf820fddcd14e53c706514c18fb71a02cfbd00a3790b674dfbe27069921118d'),
 ('202610100003','1c4d306a8905546eb2061ac413fa9b8363fd8473687ca96ec5fd35a6407ad7c3'),
 ('202610100004','83debfa9781d812656a43cc9e91f81cba22669143d03df815dc150c97a5d8daa'),
 ('202610100005','218e2028c5c1a46d2c988eb6fdec27be67bd6ef1067748a5f3d2b16e661af6ee'),
 ('202610100006','52b0832987ce760baea95967ca40bdcf348a83114486a9cf65b1197589cd226a'),
 ('202610100007','c844f420adc9202196c3d21d0587e6959a3dd46afe7f826963b937eae27e31bb'),
 ('202610100008','b539ea6c5ae653e71db03fcec4f034e8497db8245b76a3cf053d48c68fd2e8ec'),
 ('202610100009','601de8a1c717e9b5febde97acbda1f5f0f44dfe42cec63720d9cb6a295615ec7'),
 ('202610100010','82a8fbbc1f1ad0529430784b176565e6438d53a182a0351ae5a938294341bc2a'),
 ('202610100011','188091f3ced66029bd04d241829d8aecce9a0366a7ec3a1d76a19393d312c666'),
 ('202610100012','6d2ecf89a1a76207bb8d1d4129db37428e658c5798c39fe37214dc6d61a794c9'),
 ('202610100013','c7ae311dd738113d7fa74b300aab11aae421de6819497a85f8abc3fffe8c6885'),
 ('202610100014','095c58d7d0752e271d8facc89d5e409318413ebdee78bc052e6c672d5ee3c71e'),
 ('202610110015','48a6bda5ca95b4843e34190bb3a73a5e66eab0c3a62d5f85c130cdfab0c348a7'),
 ('202610120016','3ea25ff62a394ec8282837bb44a3715f7ada1f30ac8e7669c5d8395f030889d6'),
 ('202610120017','237ab892c28750eb5dcd651fa030a8676f33c67d1f0356fbe5e56e12ce21c668'),
 ('202610120018','07e7814ad56d03c34e10cf2760a809cbd07d85f6ec180b4a8521406ebff33198'),
 ('202610120019','43447027d72a7dfd37ca62829a4af525d4e6db8c17017362bb1adac2a5b2c947'),
 ('202610120020','cebe074ba7dc4f25cdc95fc03ee4c7044128cc367e1c707c4213c2a9e0f4738e'),
 ('202610130021','e1761c820d58375ed29380eedcf74b6d8e0588c40a877200d72c14570109b06c'),
 ('202610290022','7ee400c841a933f496d47fce111f89fa99a3803d40ec7807d1f4ae7fb96b5efb'),
 ('202610290023','0dbceb21851b06c67cff519d44df52319b6c475968eaff53128b2cece3830c32'),
 ('202610290024','f471a0d7d7c466909fc2bea881acdb509006a5f45aa2d395b45d964bcdd63dca'),
 ('202610300025','4468727d5de82cbc2aba3673576d189dfdd49d6ffc5e9449d367fd86cd9a7fd0'),
 ('202610300026','e9cb4057542b5900f332d28364849bb5cb1a6c9a805295497aad6b7fbb8da8af'),
 ('202610310027','4b58a32f7331ac24f5ed83944a7b1e7907f73d3a736d8baa3a561bf908b21f0a')
  ) expected(version,checksum) on expected.version=m.version
    where expected.version is null or expected.checksum<>m.checksum) then
    raise exception 'Checksum mismatch or unknown migration version. No changes applied.';
  end if;
  if known_count=26 then
    if exists(select 1 from ops.schema_migrations where version='202610310027') then
      raise exception 'Tracker claims unapplied migration 27. No changes applied.';
    end if;
    execute $migration_202610310027$
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
$migration_202610310027$;
  end if;
  insert into ops.schema_migrations(version,checksum) values
 ('202610100001','fa121e446446cd1c317f12762c27158577fba566bdb77f5bad8b405d75743b5c'),
 ('202610100002','eaf820fddcd14e53c706514c18fb71a02cfbd00a3790b674dfbe27069921118d'),
 ('202610100003','1c4d306a8905546eb2061ac413fa9b8363fd8473687ca96ec5fd35a6407ad7c3'),
 ('202610100004','83debfa9781d812656a43cc9e91f81cba22669143d03df815dc150c97a5d8daa'),
 ('202610100005','218e2028c5c1a46d2c988eb6fdec27be67bd6ef1067748a5f3d2b16e661af6ee'),
 ('202610100006','52b0832987ce760baea95967ca40bdcf348a83114486a9cf65b1197589cd226a'),
 ('202610100007','c844f420adc9202196c3d21d0587e6959a3dd46afe7f826963b937eae27e31bb'),
 ('202610100008','b539ea6c5ae653e71db03fcec4f034e8497db8245b76a3cf053d48c68fd2e8ec'),
 ('202610100009','601de8a1c717e9b5febde97acbda1f5f0f44dfe42cec63720d9cb6a295615ec7'),
 ('202610100010','82a8fbbc1f1ad0529430784b176565e6438d53a182a0351ae5a938294341bc2a'),
 ('202610100011','188091f3ced66029bd04d241829d8aecce9a0366a7ec3a1d76a19393d312c666'),
 ('202610100012','6d2ecf89a1a76207bb8d1d4129db37428e658c5798c39fe37214dc6d61a794c9'),
 ('202610100013','c7ae311dd738113d7fa74b300aab11aae421de6819497a85f8abc3fffe8c6885'),
 ('202610100014','095c58d7d0752e271d8facc89d5e409318413ebdee78bc052e6c672d5ee3c71e'),
 ('202610110015','48a6bda5ca95b4843e34190bb3a73a5e66eab0c3a62d5f85c130cdfab0c348a7'),
 ('202610120016','3ea25ff62a394ec8282837bb44a3715f7ada1f30ac8e7669c5d8395f030889d6'),
 ('202610120017','237ab892c28750eb5dcd651fa030a8676f33c67d1f0356fbe5e56e12ce21c668'),
 ('202610120018','07e7814ad56d03c34e10cf2760a809cbd07d85f6ec180b4a8521406ebff33198'),
 ('202610120019','43447027d72a7dfd37ca62829a4af525d4e6db8c17017362bb1adac2a5b2c947'),
 ('202610120020','cebe074ba7dc4f25cdc95fc03ee4c7044128cc367e1c707c4213c2a9e0f4738e'),
 ('202610130021','e1761c820d58375ed29380eedcf74b6d8e0588c40a877200d72c14570109b06c'),
 ('202610290022','7ee400c841a933f496d47fce111f89fa99a3803d40ec7807d1f4ae7fb96b5efb'),
 ('202610290023','0dbceb21851b06c67cff519d44df52319b6c475968eaff53128b2cece3830c32'),
 ('202610290024','f471a0d7d7c466909fc2bea881acdb509006a5f45aa2d395b45d964bcdd63dca'),
 ('202610300025','4468727d5de82cbc2aba3673576d189dfdd49d6ffc5e9449d367fd86cd9a7fd0'),
 ('202610300026','e9cb4057542b5900f332d28364849bb5cb1a6c9a805295497aad6b7fbb8da8af'),
 ('202610310027','4b58a32f7331ac24f5ed83944a7b1e7907f73d3a736d8baa3a561bf908b21f0a')
  on conflict(version) do nothing;
  select s.state->>'fingerprint' into actual_state from (
-- Reusable read-only catalog projection. Execute with search_path=pg_catalog.
with service_schemas(name) as (
 values ('identity'),('pet'),('health'),('journal'),('assistant'),('ai_ops'),('triage'),('clinic'),('lostfound'),('biometric'),('share'),('notify'),('media'),('analytics'),('ops')
), service_tables as (
 select c.oid,n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity
 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
 where n.nspname in (select name from service_schemas) and c.relkind in ('r','p','v','m') and c.relname<>'schema_migrations'
), catalog as (
 select jsonb_build_object(
 'tables',coalesce((select jsonb_agg(jsonb_build_array(nspname,relname,relkind,relrowsecurity,relforcerowsecurity) order by nspname,relname) from service_tables),'[]'),
 'columns',coalesce((select jsonb_agg(jsonb_build_array(t.nspname,t.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_catalog.pg_get_expr(d.adbin,d.adrelid),a.attidentity,a.attgenerated) order by t.nspname,t.relname,a.attnum)
   from service_tables t join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum>0 and not a.attisdropped left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum),'[]'),
 'constraints',coalesce((select jsonb_agg(jsonb_build_array(t.nspname,t.relname,c.conname,c.contype,pg_catalog.pg_get_constraintdef(c.oid,true),c.convalidated) order by t.nspname,t.relname,c.conname)
   from service_tables t join pg_catalog.pg_constraint c on c.conrelid=t.oid),'[]'),
 'indexes',coalesce((select jsonb_agg(jsonb_build_array(t.nspname,t.relname,c.relname,pg_catalog.pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) order by t.nspname,t.relname,c.relname)
   from service_tables t join pg_catalog.pg_index i on i.indrelid=t.oid join pg_catalog.pg_class c on c.oid=i.indexrelid),'[]'),
 'policies',coalesce((select jsonb_agg(jsonb_build_array(t.nspname,t.relname,p.polname,p.polcmd,p.polpermissive,
     (select jsonb_agg(r.rolname order by r.rolname) from pg_catalog.pg_roles r where r.oid=any(p.polroles)),pg_catalog.pg_get_expr(p.polqual,p.polrelid),pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)) order by t.nspname,t.relname,p.polname)
   from service_tables t join pg_catalog.pg_policy p on p.polrelid=t.oid),'[]'),
 'triggers',coalesce((select jsonb_agg(jsonb_build_array(t.nspname,t.relname,g.tgname,pg_catalog.pg_get_triggerdef(g.oid,true),g.tgenabled) order by t.nspname,t.relname,g.tgname)
   from service_tables t join pg_catalog.pg_trigger g on g.tgrelid=t.oid and not g.tgisinternal),'[]'),
 'functions',coalesce((select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid),md5(pg_catalog.pg_get_functiondef(p.oid))) order by n.nspname,p.proname,pg_catalog.pg_get_function_identity_arguments(p.oid))
   from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname in (select name from service_schemas) or n.nspname='public' and p.proname=any(array['current_user_id','is_pet_owner','is_pet_member','can_write_pet','is_admin','is_clinic_member','has_clinic_grant','owns_conversation','touch_updated_at','prevent_actor_reassignment'])),'[]')
 ) as details
)
select jsonb_build_object('fingerprint',md5(details::text),'details',details) as state from catalog
  ) s;
  if actual_state<>'9720c27f20983692910505835aaf6e6f' then
    raise exception 'Final schema 27 verification failed (%). No changes applied.',actual_state;
  end if;
end;
$upgrade$;
commit;
select 'ChordJai schema 27 verified; existing user rows preserved' as result,
 count(*) as recorded_migrations from ops.schema_migrations;
