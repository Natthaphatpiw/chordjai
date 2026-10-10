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
