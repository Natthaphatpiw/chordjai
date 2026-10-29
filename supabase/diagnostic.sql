-- READ ONLY: one JSON result contains every diagnostic section; no user data.
begin read only;
set local search_path=pg_catalog;
with current_state as (
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
), known(ordinal,version,file,fingerprint) as (values
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
 (20,'202610120020','202610120020_petid_dataset_exports.sql','0c2dfee5c0d1fcd947fea70cbeca3968'),
 (21,'202610130021','202610130021_pet_passport.sql','5ff3a6478e28e83e84c4ffb6d5f74478'),
 (22,'202610290022','202610290022_line_agent.sql','1fa6dec40eefeeea2f053758c500131c')
), inferred as (
 select max(k.ordinal) as version from known k,current_state s where k.fingerprint=s.state->>'fingerprint'
)
select jsonb_build_object(
 'database',current_database(),
 'server_major',current_setting('server_version_num')::integer/10000,
 'current_fingerprint',s.state->>'fingerprint',
 'verified_migration_count',i.version,
 'status',case when i.version is not null then 'known_chordjai_state_safe_for_upgrade'
   when to_regclass('identity.users') is null then 'no_known_base_or_unrelated_schema'
   else 'unrecognized_or_partial_schema_do_not_apply_automatically' end,
 'tracker_exists',to_regclass('ops.schema_migrations') is not null,
 'core_tables',s.state->'details'->'tables',
 'columns',s.state->'details'->'columns',
 'constraints',s.state->'details'->'constraints',
 'policies',s.state->'details'->'policies',
 'functions',s.state->'details'->'functions',
 'indexes',s.state->'details'->'indexes',
 'migrations',(select jsonb_agg(jsonb_build_object('number',k.ordinal,'file',k.file,
   'verified_applied',case when i.version is null then null else k.ordinal<=i.version end,
   'marker_present',case k.ordinal
 when 1 then (to_regclass('identity.users') is not null)
 when 2 then (to_regprocedure('public.is_pet_member(uuid)') is not null)
 when 3 then (to_regclass('ops.jobs') is not null and to_regprocedure('ops.claim_jobs(text,integer,integer)') is not null)
 when 4 then (exists(select 1 from pg_attribute where attrelid=to_regclass('biometric.enrollments') and attname='embedding' and not attisdropped))
 when 5 then (to_regclass('ops.rate_limits') is not null)
 when 6 then (exists(select 1 from pg_attribute where attrelid=to_regclass('notify.reminders') and attname='completed_at' and not attisdropped))
 when 7 then (exists(select 1 from pg_attribute where attrelid=to_regclass('ops.idempotency') and attname='response_status' and not attisdropped))
 when 8 then (exists(select 1 from pg_policy where polrelid=to_regclass('pet.pets') and polname='pets_read' and pg_get_expr(polqual,polrelid) like '%owner_id%'))
 when 9 then (exists(select 1 from pg_trigger where tgrelid=to_regclass('triage.rule_sets') and tgname='immutable_approved_rules' and (tgtype & 4)=4))
 when 10 then (to_regprocedure('media.queue_blob_erasure()') is not null)
 when 11 then (exists(select 1 from pg_attribute where attrelid=to_regclass('pet.pets') and attname='neutered' and not attisdropped))
 when 12 then (exists(select 1 from pg_constraint where conrelid=to_regclass('health.records') and conname='records_created_by_fkey' and confdeltype='n'))
 when 13 then (to_regclass('notify.webhook_events_retention_idx') is not null)
 when 14 then (to_regclass('biometric.enrollments_embedding_hnsw_lost_ready_idx') is not null)
 when 15 then (to_regclass('journal.books') is not null and to_regclass('biometric.enrollment_photos') is not null)
 when 16 then (to_regclass('health.care_entries') is not null and to_regprocedure('health.clinic_care_summary(uuid,boolean)') is not null)
 when 17 then (to_regclass('biometric.capture_sessions') is not null and to_regclass('biometric.training_consent_events') is not null)
 when 18 then (to_regclass('notify.followup_preferences') is not null and to_regclass('notify.followup_replies') is not null)
 when 19 then (to_regclass('biometric.capture_checks') is not null and to_regclass('biometric.capture_reviews') is not null)
 when 20 then (to_regclass('biometric.dataset_exports') is not null and to_regclass('biometric.training_eligible_samples') is not null)
 when 21 then (to_regclass('health.passport_sessions') is not null and to_regclass('health.passport_snapshots') is not null and to_regprocedure('health.passport_clinic_access(uuid,uuid,text)') is not null)
 when 22 then (to_regclass('assistant.agent_tasks') is not null and to_regclass('assistant.agent_deliveries') is not null)
 end,
   'is_exact_current_state',k.fingerprint=s.state->>'fingerprint') order by k.ordinal) from known k)
) as chordjai_diagnostic from current_state s cross join inferred i;
commit;
