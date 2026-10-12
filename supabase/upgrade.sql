-- Generated safe existing-ChordJai upgrade; use bootstrap.sql only for a fresh DB.
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
 (1,'202610100001','202610100001_core.sql','135bd8c80162cd4a134cc027419c819e'),
 (2,'202610100002','202610100002_security.sql','04e363980d4d27f07bd350baeb343e38'),
 (3,'202610100003','202610100003_jobs.sql','57a28747b72371ac97f33e16b5850fe5'),
 (4,'202610100004','202610100004_ai_context.sql','6ae33a02d2cb2eb2f9f9c6e1967f7f9a'),
 (5,'202610100005','202610100005_rate_limits.sql','2c1ff5728f0c82f6db2c080ad5ba3808'),
 (6,'202610100006','202610100006_reminder_completion.sql','0b5e6226cb2379932432ba3835800016'),
 (7,'202610100007','202610100007_http_idempotency.sql','c464ace8c8f1736ab39278001d900a75'),
 (8,'202610100008','202610100008_pet_creation_returning.sql','308af384d513c24e9714065e80d808d8'),
 (9,'202610100009','202610100009_governance_guards.sql','9ddf782cdc82c5ef70a9b522919b6303'),
 (10,'202610100010','202610100010_durable_blob_erasure.sql','99a1b213dbfdeda7ad23c85afecc2eff'),
 (11,'202610100011','202610100011_pet_neutered.sql','e1d2bcc6484030119f476fb247f61110'),
 (12,'202610100012','202610100012_health_creator_erasure.sql','1b8a1e22b0f68f5c2f55a1c8f1b0076e'),
 (13,'202610100013','202610100013_webhook_retention_index.sql','5f46de2fb25d7fcdd0b18c134c510bcc'),
 (14,'202610100014','202610100014_petid_hnsw_cosine.sql','205b34a3a1e623e14d7dfa4951090bc8'),
 (15,'202610110015','202610110015_memory_books_petid_photos.sql','31dc55bf2f875051312b9df856981adb'),
 (16,'202610120016','202610120016_care_diary.sql','bae69448d0592fac2056a02dd11eb2ed'),
 (17,'202610120017','202610120017_petid_research_capture.sql','f308bcf7a1334482cf76f57fb4259812'),
 (18,'202610120018','202610120018_personalized_followups.sql','d97d1d3156bf85d6dda7bfd850d86d0c'),
 (19,'202610120019','202610120019_petid_capture_review.sql','64167dbd0c3abda6a38cf9ae24dd9e36'),
 (20,'202610120020','202610120020_petid_dataset_exports.sql','0c2dfee5c0d1fcd947fea70cbeca3968')
  ) k(ordinal,version,file,fingerprint) where k.fingerprint=current_state->>'fingerprint';
  if known_count is null then
    raise exception 'Unrecognized or partial ChordJai schema (%). No changes applied. Run supabase/diagnostic.sql and review the full JSON; use bootstrap only on a fresh project.',current_state->>'fingerprint';
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

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100001';
  if checksum is not null and checksum<>'fa121e446446cd1c317f12762c27158577fba566bdb77f5bad8b405d75743b5c' then
    raise exception 'Checksum mismatch for migration 202610100001. No changes applied.';
  end if;

  -- Existing core is required and fingerprint-verified; never replay CREATE users/tables.
  raise notice 'Verified existing 202610100001_core.sql';

  insert into ops.schema_migrations(version,checksum) values('202610100001','fa121e446446cd1c317f12762c27158577fba566bdb77f5bad8b405d75743b5c') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100002';
  if checksum is not null and checksum<>'eaf820fddcd14e53c706514c18fb71a02cfbd00a3790b674dfbe27069921118d' then
    raise exception 'Checksum mismatch for migration 202610100002. No changes applied.';
  end if;

  if known_count<2 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100002. No changes applied.'; end if;
    execute $migration_202610100002$
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
$migration_202610100002$;
    raise notice 'Applied 202610100002_security.sql';
  else
    raise notice 'Verified existing 202610100002_security.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100002','eaf820fddcd14e53c706514c18fb71a02cfbd00a3790b674dfbe27069921118d') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100003';
  if checksum is not null and checksum<>'1c4d306a8905546eb2061ac413fa9b8363fd8473687ca96ec5fd35a6407ad7c3' then
    raise exception 'Checksum mismatch for migration 202610100003. No changes applied.';
  end if;

  if known_count<3 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100003. No changes applied.'; end if;
    execute $migration_202610100003$
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
$migration_202610100003$;
    raise notice 'Applied 202610100003_jobs.sql';
  else
    raise notice 'Verified existing 202610100003_jobs.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100003','1c4d306a8905546eb2061ac413fa9b8363fd8473687ca96ec5fd35a6407ad7c3') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100004';
  if checksum is not null and checksum<>'83debfa9781d812656a43cc9e91f81cba22669143d03df815dc150c97a5d8daa' then
    raise exception 'Checksum mismatch for migration 202610100004. No changes applied.';
  end if;

  if known_count<4 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100004. No changes applied.'; end if;
    execute $migration_202610100004$
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
$migration_202610100004$;
    raise notice 'Applied 202610100004_ai_context.sql';
  else
    raise notice 'Verified existing 202610100004_ai_context.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100004','83debfa9781d812656a43cc9e91f81cba22669143d03df815dc150c97a5d8daa') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100005';
  if checksum is not null and checksum<>'218e2028c5c1a46d2c988eb6fdec27be67bd6ef1067748a5f3d2b16e661af6ee' then
    raise exception 'Checksum mismatch for migration 202610100005. No changes applied.';
  end if;

  if known_count<5 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100005. No changes applied.'; end if;
    execute $migration_202610100005$
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
$migration_202610100005$;
    raise notice 'Applied 202610100005_rate_limits.sql';
  else
    raise notice 'Verified existing 202610100005_rate_limits.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100005','218e2028c5c1a46d2c988eb6fdec27be67bd6ef1067748a5f3d2b16e661af6ee') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100006';
  if checksum is not null and checksum<>'52b0832987ce760baea95967ca40bdcf348a83114486a9cf65b1197589cd226a' then
    raise exception 'Checksum mismatch for migration 202610100006. No changes applied.';
  end if;

  if known_count<6 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100006. No changes applied.'; end if;
    execute $migration_202610100006$
alter table notify.reminders add column completed_at timestamptz;
$migration_202610100006$;
    raise notice 'Applied 202610100006_reminder_completion.sql';
  else
    raise notice 'Verified existing 202610100006_reminder_completion.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100006','52b0832987ce760baea95967ca40bdcf348a83114486a9cf65b1197589cd226a') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100007';
  if checksum is not null and checksum<>'c844f420adc9202196c3d21d0587e6959a3dd46afe7f826963b937eae27e31bb' then
    raise exception 'Checksum mismatch for migration 202610100007. No changes applied.';
  end if;

  if known_count<7 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100007. No changes applied.'; end if;
    execute $migration_202610100007$
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
$migration_202610100007$;
    raise notice 'Applied 202610100007_http_idempotency.sql';
  else
    raise notice 'Verified existing 202610100007_http_idempotency.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100007','c844f420adc9202196c3d21d0587e6959a3dd46afe7f826963b937eae27e31bb') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100008';
  if checksum is not null and checksum<>'b539ea6c5ae653e71db03fcec4f034e8497db8245b76a3cf053d48c68fd2e8ec' then
    raise exception 'Checksum mismatch for migration 202610100008. No changes applied.';
  end if;

  if known_count<8 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100008. No changes applied.'; end if;
    execute $migration_202610100008$
-- INSERT RETURNING checks SELECT before an AFTER trigger's membership is visible.
-- The row's verified owner is an explicit read predicate, independent of helpers.
drop policy pets_read on pet.pets;
create policy pets_read on pet.pets for select to chordjai_app using (
  owner_id = (select public.current_user_id()) or public.is_pet_member(id)
  or public.has_clinic_grant(id,'summary.read')
);
$migration_202610100008$;
    raise notice 'Applied 202610100008_pet_creation_returning.sql';
  else
    raise notice 'Verified existing 202610100008_pet_creation_returning.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100008','b539ea6c5ae653e71db03fcec4f034e8497db8245b76a3cf053d48c68fd2e8ec') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100009';
  if checksum is not null and checksum<>'601de8a1c717e9b5febde97acbda1f5f0f44dfe42cec63720d9cb6a295615ec7' then
    raise exception 'Checksum mismatch for migration 202610100009. No changes applied.';
  end if;

  if known_count<9 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100009. No changes applied.'; end if;
    execute $migration_202610100009$
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
$migration_202610100009$;
    raise notice 'Applied 202610100009_governance_guards.sql';
  else
    raise notice 'Verified existing 202610100009_governance_guards.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100009','601de8a1c717e9b5febde97acbda1f5f0f44dfe42cec63720d9cb6a295615ec7') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100010';
  if checksum is not null and checksum<>'82a8fbbc1f1ad0529430784b176565e6438d53a182a0351ae5a938294341bc2a' then
    raise exception 'Checksum mismatch for migration 202610100010. No changes applied.';
  end if;

  if known_count<10 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100010. No changes applied.'; end if;
    execute $migration_202610100010$
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
$migration_202610100010$;
    raise notice 'Applied 202610100010_durable_blob_erasure.sql';
  else
    raise notice 'Verified existing 202610100010_durable_blob_erasure.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100010','82a8fbbc1f1ad0529430784b176565e6438d53a182a0351ae5a938294341bc2a') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100011';
  if checksum is not null and checksum<>'188091f3ced66029bd04d241829d8aecce9a0366a7ec3a1d76a19393d312c666' then
    raise exception 'Checksum mismatch for migration 202610100011. No changes applied.';
  end if;

  if known_count<11 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100011. No changes applied.'; end if;
    execute $migration_202610100011$
-- NULL = unknown/not entered; existing profiles remain valid.
alter table pet.pets add column neutered boolean;
$migration_202610100011$;
    raise notice 'Applied 202610100011_pet_neutered.sql';
  else
    raise notice 'Verified existing 202610100011_pet_neutered.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100011','188091f3ced66029bd04d241829d8aecce9a0366a7ec3a1d76a19393d312c666') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100012';
  if checksum is not null and checksum<>'6d2ecf89a1a76207bb8d1d4129db37428e658c5798c39fe37214dc6d61a794c9' then
    raise exception 'Checksum mismatch for migration 202610100012. No changes applied.';
  end if;

  if known_count<12 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100012. No changes applied.'; end if;
    execute $migration_202610100012$
-- Health records belong to the pet. Erasing a carer anonymizes attribution;
-- erasing the pet still cascades the medical record through records.pet_id.
alter table health.records drop constraint records_created_by_fkey;
alter table health.records alter column created_by drop not null;
alter table health.records add constraint records_created_by_fkey
  foreign key(created_by) references identity.users(id) on delete set null;
$migration_202610100012$;
    raise notice 'Applied 202610100012_health_creator_erasure.sql';
  else
    raise notice 'Verified existing 202610100012_health_creator_erasure.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100012','6d2ecf89a1a76207bb8d1d4129db37428e658c5798c39fe37214dc6d61a794c9') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100013';
  if checksum is not null and checksum<>'c7ae311dd738113d7fa74b300aab11aae421de6819497a85f8abc3fffe8c6885' then
    raise exception 'Checksum mismatch for migration 202610100013. No changes applied.';
  end if;

  if known_count<13 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100013. No changes applied.'; end if;
    execute $migration_202610100013$
create index webhook_events_retention_idx on notify.webhook_events(received_at);
$migration_202610100013$;
    raise notice 'Applied 202610100013_webhook_retention_index.sql';
  else
    raise notice 'Verified existing 202610100013_webhook_retention_index.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100013','c7ae311dd738113d7fa74b300aab11aae421de6819497a85f8abc3fffe8c6885') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610100014';
  if checksum is not null and checksum<>'095c58d7d0752e271d8facc89d5e409318413ebdee78bc052e6c672d5ee3c71e' then
    raise exception 'Checksum mismatch for migration 202610100014. No changes applied.';
  end if;

  if known_count<14 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610100014. No changes applied.'; end if;
    execute $migration_202610100014$
-- Match the current 1536-dimensional, single-vector enrollment representation.
-- HNSW is approximate; eligibility remains enforced by live joins in the API.
-- Queries must use these literal predicates plus ORDER BY embedding <=> vector ASC.
create index enrollments_embedding_hnsw_lost_ready_idx
  on biometric.enrollments using hnsw (embedding extensions.vector_cosine_ops)
  with (m=16,ef_construction=64)
  where status='ready' and search_mode='lost_only' and embedding is not null;
comment on index biometric.enrollments_embedding_hnsw_lost_ready_idx is
  'ANN cosine candidate search; filter active lost cases, species and ready media at query time. Use exact filtered fallback for incomplete candidates.';
$migration_202610100014$;
    raise notice 'Applied 202610100014_petid_hnsw_cosine.sql';
  else
    raise notice 'Verified existing 202610100014_petid_hnsw_cosine.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610100014','095c58d7d0752e271d8facc89d5e409318413ebdee78bc052e6c672d5ee3c71e') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610110015';
  if checksum is not null and checksum<>'48a6bda5ca95b4843e34190bb3a73a5e66eab0c3a62d5f85c130cdfab0c348a7' then
    raise exception 'Checksum mismatch for migration 202610110015. No changes applied.';
  end if;

  if known_count<15 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610110015. No changes applied.'; end if;
    execute $migration_202610110015$
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
$migration_202610110015$;
    raise notice 'Applied 202610110015_memory_books_petid_photos.sql';
  else
    raise notice 'Verified existing 202610110015_memory_books_petid_photos.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610110015','48a6bda5ca95b4843e34190bb3a73a5e66eab0c3a62d5f85c130cdfab0c348a7') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610120016';
  if checksum is not null and checksum<>'3ea25ff62a394ec8282837bb44a3715f7ada1f30ac8e7669c5d8395f030889d6' then
    raise exception 'Checksum mismatch for migration 202610120016. No changes applied.';
  end if;

  if known_count<16 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610120016. No changes applied.'; end if;
    execute $migration_202610120016$
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
$migration_202610120016$;
    raise notice 'Applied 202610120016_care_diary.sql';
  else
    raise notice 'Verified existing 202610120016_care_diary.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610120016','3ea25ff62a394ec8282837bb44a3715f7ada1f30ac8e7669c5d8395f030889d6') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610120017';
  if checksum is not null and checksum<>'237ab892c28750eb5dcd651fa030a8676f33c67d1f0356fbe5e56e12ce21c668' then
    raise exception 'Checksum mismatch for migration 202610120017. No changes applied.';
  end if;

  if known_count<17 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610120017. No changes applied.'; end if;
    execute $migration_202610120017$
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
$migration_202610120017$;
    raise notice 'Applied 202610120017_petid_research_capture.sql';
  else
    raise notice 'Verified existing 202610120017_petid_research_capture.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610120017','237ab892c28750eb5dcd651fa030a8676f33c67d1f0356fbe5e56e12ce21c668') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610120018';
  if checksum is not null and checksum<>'07e7814ad56d03c34e10cf2760a809cbd07d85f6ec180b4a8521406ebff33198' then
    raise exception 'Checksum mismatch for migration 202610120018. No changes applied.';
  end if;

  if known_count<18 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610120018. No changes applied.'; end if;
    execute $migration_202610120018$
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
$migration_202610120018$;
    raise notice 'Applied 202610120018_personalized_followups.sql';
  else
    raise notice 'Verified existing 202610120018_personalized_followups.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610120018','07e7814ad56d03c34e10cf2760a809cbd07d85f6ec180b4a8521406ebff33198') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610120019';
  if checksum is not null and checksum<>'43447027d72a7dfd37ca62829a4af525d4e6db8c17017362bb1adac2a5b2c947' then
    raise exception 'Checksum mismatch for migration 202610120019. No changes applied.';
  end if;

  if known_count<19 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610120019. No changes applied.'; end if;
    execute $migration_202610120019$
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
$migration_202610120019$;
    raise notice 'Applied 202610120019_petid_capture_review.sql';
  else
    raise notice 'Verified existing 202610120019_petid_capture_review.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610120019','43447027d72a7dfd37ca62829a4af525d4e6db8c17017362bb1adac2a5b2c947') on conflict(version) do nothing;

  select m.checksum into checksum from ops.schema_migrations m where m.version='202610120020';
  if checksum is not null and checksum<>'cebe074ba7dc4f25cdc95fc03ee4c7044128cc367e1c707c4213c2a9e0f4738e' then
    raise exception 'Checksum mismatch for migration 202610120020. No changes applied.';
  end if;

  if known_count<20 then
    if checksum is not null then raise exception 'Tracker claims unapplied migration 202610120020. No changes applied.'; end if;
    execute $migration_202610120020$
-- One eligibility definition for exports, owner counts and admin aggregates.
create view biometric.training_eligible_samples with (security_invoker=true,security_barrier=true) as
SELECT q.sample_id,s.id AS session_id,s.pet_id,s.owner_id,p.media_id,c.id AS check_id,r.id AS review_id,
    t.version::int AS consent_version,s.species,p.angle,p.captured_at,(p.captured_at AT TIME ZONE 'Asia/Bangkok')::date::text AS capture_day,
    q.image_sha256,q.decoded_sha256,q.dhash AS dhash64,q.width,q.height,s.created_at AS session_created_at,p.position AS sample_position
    FROM biometric.capture_sessions s JOIN biometric.training_consents t ON t.pet_id=s.pet_id AND t.owner_id=s.owner_id AND t.granted AND t.policy_version='petid-training-2026-10-12'
    JOIN identity.users u ON u.id=s.owner_id AND u.status='active' JOIN identity.consents service ON service.user_id=u.id AND service.purpose='service' AND service.granted
    JOIN pet.pets pet ON pet.id=s.pet_id AND pet.owner_id=s.owner_id
    JOIN LATERAL (SELECT * FROM biometric.capture_reviews rr WHERE rr.session_id=s.id ORDER BY rr.revision DESC LIMIT 1) r ON r.decision='approved' AND r.consent_version=t.version
    JOIN biometric.capture_checks c ON c.id=r.check_id AND c.session_id=s.id AND c.status='completed' AND c.consistency='possible_same' AND c.consent_version=t.version
      AND c.id=(SELECT cc.id FROM biometric.capture_checks cc WHERE cc.session_id=s.id ORDER BY cc.created_at DESC,cc.id DESC LIMIT 1)
    JOIN biometric.capture_check_samples q ON q.check_id=c.id AND q.quality='acceptable'
    JOIN biometric.capture_samples p ON p.id=q.sample_id AND p.session_id=s.id
    JOIN media.objects m ON m.id=p.media_id AND m.status='ready' AND m.user_id=s.owner_id AND m.pet_id=s.pet_id
    WHERE s.review_status='approved' AND s.review_consent_version=t.version
      AND (r.evidence_kind<>'verified_repeat_capture' OR EXISTS(SELECT 1 FROM biometric.capture_sessions anchor
        JOIN LATERAL (SELECT * FROM biometric.capture_reviews ar WHERE ar.session_id=anchor.id ORDER BY ar.revision DESC LIMIT 1) ar ON ar.decision='approved' AND ar.evidence_kind IN ('microchip_scan','clinic_record') AND ar.consent_version=t.version
        JOIN biometric.capture_checks ac ON ac.id=ar.check_id AND ac.status='completed' AND ac.consistency='possible_same' AND ac.consent_version=t.version
        WHERE anchor.id=r.reference_session_id AND anchor.pet_id=s.pet_id AND anchor.owner_id=s.owner_id AND anchor.review_status='approved' AND anchor.review_consent_version=t.version
          AND ac.id=(SELECT cc.id FROM biometric.capture_checks cc WHERE cc.session_id=anchor.id ORDER BY cc.created_at DESC,cc.id DESC LIMIT 1)
          AND anchor.sample_count=(SELECT count(*) FROM biometric.capture_check_samples aq JOIN biometric.capture_samples ap ON ap.id=aq.sample_id AND ap.session_id=anchor.id
            JOIN media.objects am ON am.id=ap.media_id AND am.status='ready' AND am.user_id=s.owner_id AND am.pet_id=s.pet_id WHERE aq.check_id=ac.id AND aq.quality='acceptable')))
      AND s.sample_count=(SELECT count(*) FROM biometric.capture_check_samples q2 JOIN biometric.capture_samples p2 ON p2.id=q2.sample_id AND p2.session_id=s.id
        JOIN media.objects m2 ON m2.id=p2.media_id AND m2.status='ready' AND m2.user_id=s.owner_id AND m2.pet_id=s.pet_id WHERE q2.check_id=c.id AND q2.quality='acceptable')
    ORDER BY s.created_at,s.id,p.position;
grant select on biometric.training_eligible_samples to chordjai_app,chordjai_worker;

-- Private, short-lived manifests. A snapshot never substitutes for live consent.
create table biometric.dataset_exports (
  id uuid primary key,
  creator_id uuid not null references identity.users(id) on delete cascade,
  request_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  manifest jsonb not null check (jsonb_typeof(manifest)='object'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  unique(creator_id,request_id)
);
create table biometric.dataset_export_samples (
  export_id uuid not null references biometric.dataset_exports(id) on delete cascade,
  sample_id uuid not null references biometric.capture_samples(id) on delete cascade,
  media_id uuid not null references media.objects(id) on delete cascade,
  session_id uuid not null references biometric.capture_sessions(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  pet_id uuid not null references pet.pets(id) on delete cascade,
  check_id uuid not null references biometric.capture_checks(id) on delete cascade,
  review_id uuid not null references biometric.capture_reviews(id) on delete cascade,
  consent_version integer not null check (consent_version>0),
  export_created_at timestamptz not null,
  primary key(export_id,sample_id)
);
alter table biometric.dataset_exports enable row level security;
alter table biometric.dataset_exports force row level security;
alter table biometric.dataset_export_samples enable row level security;
alter table biometric.dataset_export_samples force row level security;
grant select,insert,delete on biometric.dataset_exports,biometric.dataset_export_samples to chordjai_worker;
-- PostgreSQL row locks require an UPDATE privilege. The only granted column is
-- immutable, so this enables FOR SHARE without allowing manifest/TTL mutation.
grant update(id) on biometric.dataset_exports to chordjai_worker;
create trigger dataset_export_id_immutable before update on biometric.dataset_exports for each row execute function public.prevent_actor_reassignment('id');
grant select on biometric.dataset_export_samples to chordjai_app;
create policy system_worker on biometric.dataset_exports for all to chordjai_worker using(true) with check(true);
create policy system_worker on biometric.dataset_export_samples for all to chordjai_worker using(true) with check(true);
create policy dataset_participation_owner on biometric.dataset_export_samples for select to chordjai_app using(owner_id=(select public.current_user_id()) and public.is_pet_owner(pet_id));

-- Erasure of any member invalidates the entire manifest, including its payload.
create function biometric.invalidate_export_member() returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from biometric.dataset_exports where id=old.export_id;
  return old;
end $$;
revoke all on function biometric.invalidate_export_member() from public,chordjai_app,chordjai_worker;
create trigger dataset_member_erasure after delete on biometric.dataset_export_samples for each row execute function biometric.invalidate_export_member();

create function biometric.invalidate_export_consent() returns trigger language plpgsql security definer set search_path='' as $$
begin
  delete from biometric.dataset_exports where id in (select export_id from biometric.dataset_export_samples where pet_id=new.pet_id);
  return new;
end $$;
revoke all on function biometric.invalidate_export_consent() from public,chordjai_app,chordjai_worker;
create trigger dataset_training_revision after update on biometric.training_consents for each row execute function biometric.invalidate_export_consent();

create function biometric.invalidate_export_review() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.review_status is distinct from old.review_status or new.review_consent_version is distinct from old.review_consent_version then
    delete from biometric.dataset_exports where id in (select export_id from biometric.dataset_export_samples where pet_id=new.pet_id);
  end if;
  return new;
end $$;
revoke all on function biometric.invalidate_export_review() from public,chordjai_app,chordjai_worker;
create trigger dataset_review_change after update on biometric.capture_sessions for each row execute function biometric.invalidate_export_review();

create function biometric.invalidate_export_account() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status<>'active' then
    delete from biometric.dataset_exports where id in (select export_id from biometric.dataset_export_samples where owner_id=new.id) or creator_id=new.id;
  end if;
  return new;
end $$;
revoke all on function biometric.invalidate_export_account() from public,chordjai_app,chordjai_worker;
create trigger dataset_account_status after update of status on identity.users for each row execute function biometric.invalidate_export_account();

create function biometric.invalidate_export_service_consent() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
  if tg_op='DELETE' then
    if old.purpose<>'service' then return old; end if;
    owner=old.user_id;
  else
    if new.purpose<>'service' or new.granted then return new; end if;
    owner=new.user_id;
  end if;
  delete from biometric.dataset_exports where id in (select export_id from biometric.dataset_export_samples where owner_id=owner) or creator_id=owner;
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function biometric.invalidate_export_service_consent() from public,chordjai_app,chordjai_worker;
create trigger dataset_service_consent_change after update or delete on identity.consents for each row execute function biometric.invalidate_export_service_consent();
$migration_202610120020$;
    raise notice 'Applied 202610120020_petid_dataset_exports.sql';
  else
    raise notice 'Verified existing 202610120020_petid_dataset_exports.sql';
  end if;

  insert into ops.schema_migrations(version,checksum) values('202610120020','cebe074ba7dc4f25cdc95fc03ee4c7044128cc367e1c707c4213c2a9e0f4738e') on conflict(version) do nothing;

  if exists(select 1 from ops.schema_migrations m where m.version not in ('202610100001','202610100002','202610100003','202610100004','202610100005','202610100006','202610100007','202610100008','202610100009','202610100010','202610100011','202610100012','202610100013','202610100014','202610110015','202610120016','202610120017','202610120018','202610120019','202610120020')) then
    raise exception 'Migration tracker contains a version unknown to this checkout. No changes applied.';
  end if;
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
  if actual_state<> '0c2dfee5c0d1fcd947fea70cbeca3968' then
    raise exception 'Final schema verification failed (%). No changes applied.',actual_state;
  end if;
end $upgrade$;
commit;
select 'ChordJai schema verified and upgraded; existing user rows preserved' as result,
 count(*) as recorded_migrations from ops.schema_migrations;
