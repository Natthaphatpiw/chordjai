-- Synthetic, rolled-back database tests only: no AI, real photos, or clinical claims.
begin;
create function pg_temp.assert_index(condition boolean,message text) returns text
language plpgsql as $$ begin
  if condition is distinct from true then raise exception 'FAIL: %',message; end if;
  return 'PASS: '||message;
end $$;
create function pg_temp.explain_plan(statement text) returns jsonb
language plpgsql as $$ declare result jsonb; begin
  execute 'EXPLAIN (FORMAT JSON, COSTS FALSE) '||statement into result;
  return result;
end $$;
insert into identity.users(id,line_user_id,display_name) values
 ('d0000000-0000-0000-0000-000000000001','test-petid-gallery','Synthetic gallery owner'),
 ('d0000000-0000-0000-0000-000000000002','test-petid-finder','Synthetic finder');

-- Distinct non-zero vectors, padded to the real column's 1536 dimensions.
insert into pet.pets(id,owner_id,name,species)
select ('d1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'd0000000-0000-0000-0000-000000000001','Synthetic pet '||n,
 case when n%3=0 then 'dog' else 'cat' end from generate_series(1,384) n;
insert into media.objects(id,user_id,pet_id,pathname,mime,size,status)
select ('d2000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'd0000000-0000-0000-0000-000000000001',
 ('d1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'u/d0000000-0000-0000-0000-000000000001/synthetic-'||n||'.jpg','image/jpeg',1,
 case when n%31=0 then 'deleted' else 'ready' end from generate_series(1,384) n;
insert into biometric.enrollments(id,pet_id,user_id,description,media_id,status,search_mode,embedding)
select ('d3000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 ('d1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'd0000000-0000-0000-0000-000000000001','SYNTHETIC ONLY',
 ('d2000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case when n%13=0 then 'draft' else 'ready' end,
 case when n%17=0 then 'off' else 'lost_only' end,
 case when n%19=0 then null else
   (array[1.0::real,(n-1)::real/384.0,((n*7)%53)::real/1000.0]||array_fill(0.0::real,array[1533]))::extensions.vector(1536)
 end from generate_series(1,384) n;
insert into lostfound.cases(pet_id,owner_id,public_slug,description,district,status)
select ('d1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'd0000000-0000-0000-0000-000000000001','synthetic-petid-'||n,
 'SYNTHETIC ONLY','test',case when n%11=0 then 'closed' else 'active' end
 from generate_series(8,384,8) n;
analyze biometric.enrollments;
analyze pet.pets;
analyze media.objects;
analyze lostfound.cases;

select pg_temp.assert_index(exists(
 select 1 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am a on a.oid=c.relam
 where c.relname='enrollments_embedding_hnsw_lost_ready_idx' and a.amname='hnsw'
  and i.indisvalid and pg_get_indexdef(i.indexrelid) like '%vector_cosine_ops%'
),'Valid partial HNSW cosine index exists on the real 1536-dimensional column');

set local role chordjai_worker;
-- Small fixtures can legitimately favor an exact scan. This explicitly tests
-- index eligibility, not a claim that production always prefers ANN or is faster.
set local enable_seqscan=off;
set local enable_sort=off;
set local hnsw.ef_search=100;
set local hnsw.iterative_scan=strict_order;
do $$ declare vector_literal text; plan jsonb; statement text; begin
 vector_literal:=(array[1.0::real,0.0,0.007]||array_fill(0.0::real,array[1533]))::extensions.vector::text;
 statement:=format('select id from biometric.enrollments where status=''ready'' and search_mode=''lost_only'' and embedding is not null order by embedding OPERATOR(extensions.<=>) %L::extensions.vector limit 5',vector_literal);
 plan:=pg_temp.explain_plan(statement);
 if plan::text not like '%enrollments_embedding_hnsw_lost_ready_idx%' then
  raise exception 'FAIL: matching ORDER BY/predicate cannot use HNSW: %',plan;
 end if;
 raise notice 'PASS: EXPLAIN uses Index Scan on enrollments_embedding_hnsw_lost_ready_idx';
end $$;

-- The application gallery still excludes non-lost, closed, other species,
-- opted-out, draft, NULL-vector and deleted-media rows after ANN retrieval.
create temporary table eligible_exact as
with gallery as materialized (
 select e.id,e.embedding from biometric.enrollments e
 join pet.pets p on p.id=e.pet_id
 join lostfound.cases l on l.pet_id=e.pet_id and l.status='active'
 join media.objects m on m.id=e.media_id and m.status='ready'
 where e.status='ready' and e.search_mode='lost_only' and e.embedding is not null
  and p.species='cat' and e.user_id<>'d0000000-0000-0000-0000-000000000002'
)
select id from gallery order by embedding OPERATOR(extensions.<=>)
 ((array[1.0::real,0.0,0.007]||array_fill(0.0::real,array[1533]))::extensions.vector) limit 5;
select pg_temp.assert_index((select count(*)=5 from eligible_exact),'Exact filtered fallback finds five eligible gallery candidates');

do $$ declare plan jsonb; vector_literal text; begin
 vector_literal:=(array[1.0::real,0.0,0.007]||array_fill(0.0::real,array[1533]))::extensions.vector::text;
 plan:=pg_temp.explain_plan(format('with gallery as materialized (select id,embedding from biometric.enrollments where status=''ready'' and search_mode=''lost_only'' and embedding is not null) select id from gallery order by embedding OPERATOR(extensions.<=>) %L::extensions.vector limit 5',vector_literal));
 if plan::text like '%enrollments_embedding_hnsw_lost_ready_idx%' then
  raise exception 'FAIL: MATERIALIZED exact fallback still orders through ANN';
 end if;
 raise notice 'PASS: EXPLAIN exact MATERIALIZED fallback excludes HNSW ordering';
end $$;

-- Simulate a deliberately small ANN candidate set before live eligibility guards.
-- The unlost nearest row is removed; fallback must search the whole eligible set.
create temporary table filtered_small_ann as
with ann as materialized (
 select e.id,e.pet_id,e.media_id from biometric.enrollments e
 where e.status='ready' and e.search_mode='lost_only' and e.embedding is not null
 order by e.embedding OPERATOR(extensions.<=>)
  ((array[1.0::real,0.0,0.007]||array_fill(0.0::real,array[1533]))::extensions.vector) limit 1
)
select ann.id from ann join pet.pets p on p.id=ann.pet_id and p.species='cat'
 join lostfound.cases l on l.pet_id=ann.pet_id and l.status='active'
 join media.objects m on m.id=ann.media_id and m.status='ready';
select pg_temp.assert_index((select count(*)<5 from filtered_small_ann),'Post-ANN eligibility filters can leave an incomplete candidate set');
select pg_temp.assert_index((select count(*)=5 from eligible_exact),'Exact fallback restores five eligible candidates after ANN underfill');
select pg_temp.assert_index(not exists(
 select 1 from eligible_exact x join biometric.enrollments e on e.id=x.id
 join pet.pets p on p.id=e.pet_id join media.objects m on m.id=e.media_id
 left join lostfound.cases l on l.pet_id=e.pet_id and l.status='active'
 where p.species<>'cat' or m.status<>'ready' or l.id is null or e.search_mode<>'lost_only' or e.status<>'ready'
),'Retrieval excludes every ineligible synthetic enrollment');

rollback;
