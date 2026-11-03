-- GENERATED: only verified schema 27 -> 28, or verify an existing 28.
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
 (27,'202610310027','202610310027_owner_sessions.sql','9720c27f20983692910505835aaf6e6f'),
 (28,'202611030028','202611030028_blog.sql','0040a61b6c7dc6c50d75b7b77c34cea3')
  ) k(ordinal,version,file,fingerprint) where k.fingerprint=current_state->>'fingerprint';
  if known_count is null or known_count not in (27,28) then
    raise exception 'This packet requires verified ChordJai schema 27 or 28; unrecognized or partial schema (%). No changes applied. Run supabase/diagnostic.sql and review the full JSON; use bootstrap only on a fresh project.',current_state->>'fingerprint';
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
 ('202610310027','4b58a32f7331ac24f5ed83944a7b1e7907f73d3a736d8baa3a561bf908b21f0a'),
 ('202611030028','512a4ed78077619769db93392e943ec4a72a6e20c7bd4b7535c08d4b1962cbf7')
  ) expected(version,checksum) on expected.version=m.version
    where expected.version is null or expected.checksum<>m.checksum) then
    raise exception 'Checksum mismatch or unknown migration version. No changes applied.';
  end if;
  if known_count=27 then
    if exists(select 1 from ops.schema_migrations where version='202611030028') then
      raise exception 'Tracker claims unapplied migration 28. No changes applied.';
    end if;
    execute $migration_202611030028$
-- Editorial content is independent of owners' private diaries and media.
-- Only the verified dashboard operator can reach the worker-backed write API.
create table analytics.blog_posts (
 id uuid primary key default gen_random_uuid(),
 slug text unique check(length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 language text not null check(language in ('th','en')),
 draft jsonb not null check(jsonb_typeof(draft)='object' and octet_length(draft::text)<=131072),
 published jsonb check(published is null or (jsonb_typeof(published)='object' and octet_length(published::text)<=131072)),
 version integer not null default 1 check(version>0),
 published_version integer check(published_version>0 and published_version<=version),
 first_published_at timestamptz,
 published_at timestamptz,
 published_modified_at timestamptz,
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(published_at is null or (published is not null and slug is not null and length(slug)>=3 and first_published_at is not null and published_modified_at is not null and published_version is not null and archived_at is null)),
 check(draft->>'slug'=coalesce(slug,'') and draft->>'language'=language),
 check(published is null or (published->>'slug'=slug and published->>'language'=language))
);
create function analytics.lock_blog_permalink() returns trigger language plpgsql set search_path='' as $$
begin
 if old.first_published_at is not null and (new.slug is distinct from old.slug or new.language is distinct from old.language or new.first_published_at is distinct from old.first_published_at) then
  raise exception 'Published blog permalinks are immutable' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function analytics.lock_blog_permalink() from public;
create trigger blog_permalink_immutable before update on analytics.blog_posts for each row execute function analytics.lock_blog_permalink();

create index blog_posts_public_idx on analytics.blog_posts(language,published_at desc,id) where published_at is not null and archived_at is null;
create index blog_posts_admin_idx on analytics.blog_posts(updated_at desc,id);

create table analytics.blog_images (
 id uuid primary key,
 pathname text not null unique check(pathname ~ '^blog/[a-f0-9-]{36}\.webp$'),
 status text not null default 'pending' check(status in ('pending','ready','rejected')),
 size integer not null check(size between 1 and 4000000),
 width integer not null check(width between 1 and 2000),
 height integer not null check(height between 1 and 2000),
 uploaded_by text not null check(length(uploaded_by) between 1 and 100),
 created_at timestamptz not null default now()
);

alter table analytics.blog_posts enable row level security;
alter table analytics.blog_posts force row level security;
alter table analytics.blog_images enable row level security;
alter table analytics.blog_images force row level security;
revoke all on analytics.blog_posts,analytics.blog_images from public,chordjai_app;
grant select,insert,update on analytics.blog_posts,analytics.blog_images to chordjai_worker;
create policy blog_posts_worker on analytics.blog_posts for all to chordjai_worker using(true) with check(true);
create policy blog_images_worker on analytics.blog_images for all to chordjai_worker using(true) with check(true);
$migration_202611030028$;
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
 ('202610310027','4b58a32f7331ac24f5ed83944a7b1e7907f73d3a736d8baa3a561bf908b21f0a'),
 ('202611030028','512a4ed78077619769db93392e943ec4a72a6e20c7bd4b7535c08d4b1962cbf7')
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
  if actual_state<>'0040a61b6c7dc6c50d75b7b77c34cea3' then
    raise exception 'Final schema 28 verification failed (%). No changes applied.',actual_state;
  end if;
end;
$upgrade$;
commit;
select 'ChordJai schema 28 verified; existing user rows preserved' as result,
 count(*) as recorded_migrations from ops.schema_migrations;
