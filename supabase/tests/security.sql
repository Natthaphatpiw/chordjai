-- Portable PostgreSQL assertions (no pgTAP extension required). All fixtures roll back.
-- Run as postgres on a TEST database after bootstrap.sql.
begin;
create function pg_temp.assert_true(condition boolean,message text) returns text
language plpgsql as $$ begin
  if condition is distinct from true then raise exception 'FAIL: %',message; end if;
  return 'PASS: ' || message;
end $$;

insert into identity.users(id,line_user_id,display_name,role) values
 ('10000000-0000-0000-0000-000000000001','test-owner-a','Owner A','owner'),
 ('10000000-0000-0000-0000-000000000002','test-owner-b','Owner B','owner'),
 ('10000000-0000-0000-0000-000000000003','test-carer','Carer','owner'),
 ('10000000-0000-0000-0000-000000000004','test-viewer','Viewer','owner'),
 ('10000000-0000-0000-0000-000000000005','test-vet','Vet','vet'),
 ('10000000-0000-0000-0000-000000000006','test-admin','Admin','admin'),
 ('10000000-0000-0000-0000-000000000007','test-staff','Clinic Staff','owner');
insert into pet.pets(id,owner_id,name,species) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Test Cat A','cat'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Test Dog B','dog');
insert into pet.members(pet_id,user_id,role) values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','carer'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','viewer');
insert into health.records(id,pet_id,created_by,kind,title) values
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','vaccine','Test record A'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','vaccine','Test record B');
insert into journal.pages(id,pet_id,owner_id,title) values('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Private journal A');
insert into assistant.preferences(user_id,memory_enabled) values('10000000-0000-0000-0000-000000000001',true);
insert into assistant.conversations(id,user_id,pet_id) values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001');
insert into assistant.messages(conversation_id,role,content) values('50000000-0000-0000-0000-000000000001','user','Private conversation A');
insert into assistant.memories(user_id,pet_id,content) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Private memory A');
insert into ai_ops.requests(user_id,feature,model) values('10000000-0000-0000-0000-000000000001','test','gpt-6.1-sol');
insert into triage.sessions(id,pet_id,user_id,symptoms,severity,rule_level,result) values('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Test symptoms',3,2,'{}');
insert into clinic.clinics(id,name,verified_at) values('70000000-0000-0000-0000-000000000001','TEST ONLY - not a real clinic',now());
insert into clinic.members(clinic_id,user_id,role) values('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007','staff');
insert into identity.grants(id,pet_id,clinic_id,granted_by,scopes,expires_at) values('80000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','{summary.read}',now()+interval '1 day');
insert into share.links(pet_id,owner_id,token_hash,snapshot) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','test-share-hash','{}');
insert into notify.reminders(pet_id,user_id,title,due_at) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Test reminder',now());
insert into notify.inbox(user_id,title,body) values('10000000-0000-0000-0000-000000000001','Test inbox','Private');
insert into media.objects(id,user_id,pet_id,pathname,mime,size,status,ai_consent) values
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','u/10000000-0000-0000-0000-000000000001/test-private.jpg','image/jpeg',100,'ready',true),
 ('a0000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','u/10000000-0000-0000-0000-000000000003/test-carer.jpg','image/jpeg',100,'ready',false);

-- Governance fixtures are synthetic and never represent a medical validation result.
insert into triage.rule_sets(id,version,rules,checksum) values('90000000-0000-0000-0000-000000000001',987654321,'[]','TEST_ONLY');
insert into triage.eval_runs(id,rule_set_id,model,cases_count,under_triage_count,passed) values('90000000-0000-0000-0000-000000000002','90000000-0000-0000-0000-000000000001','TEST_ONLY',1,1,false);
do $$ begin
  begin
    insert into triage.rule_sets(version,status,rules,checksum) values(987654322,'active','[]','TEST_ONLY');
    raise exception 'FAIL: approved rules inserted without eval';
  exception when check_violation then null; end;
  begin
    update triage.rule_sets set status='approved',approved_by='10000000-0000-0000-0000-000000000005',approved_at=now(),eval_run_id='90000000-0000-0000-0000-000000000002' where id='90000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: failing eval allowed rule approval';
  exception when check_violation then null; end;
end $$;
update triage.eval_runs set under_triage_count=0,passed=true where id='90000000-0000-0000-0000-000000000002';
do $$ begin
  begin
    update triage.rule_sets set status='approved',approved_by='10000000-0000-0000-0000-000000000001',approved_at=now(),eval_run_id='90000000-0000-0000-0000-000000000002' where id='90000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: owner role approved clinical rules';
  exception when check_violation then null; end;
end $$;
update triage.rule_sets set status='approved',approved_by='10000000-0000-0000-0000-000000000005',approved_at=now(),eval_run_id='90000000-0000-0000-0000-000000000002' where id='90000000-0000-0000-0000-000000000001';
do $$ begin
  begin
    update triage.rule_sets set rules='[{"changed":true}]' where id='90000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: approved clinical rules mutated';
  exception when check_violation then null; end;
end $$;

set local role chordjai_app;
select set_config('app.user_id','10000000-0000-0000-0000-000000000001',true);
do $$ declare new_pet uuid; begin
  insert into pet.pets(owner_id,name,species) values('10000000-0000-0000-0000-000000000001','INSERT RETURNING test','cat') returning id into new_pet;
  if new_pet is null then raise exception 'FAIL: authenticated owner cannot INSERT RETURNING pet'; end if;
  if not exists(select 1 from pet.members where pet_id=new_pet and user_id='10000000-0000-0000-0000-000000000001' and role='owner') then
    raise exception 'FAIL: automatic owner membership missing';
  end if;
  delete from pet.pets where id=new_pet;
end $$;
reset role;
insert into pet.pets(id,owner_id,name,species) values('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Pet erase fixture','cat');
insert into media.objects(id,user_id,pet_id,pathname,mime,size,status) values('a0000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','u/10000000-0000-0000-0000-000000000003/test-pet-erase.jpg','image/jpeg',100,'ready');
set local role chordjai_app;
do $$ declare deleted_pet uuid; begin
  delete from pet.pets where id='20000000-0000-0000-0000-000000000003' returning id into deleted_pet;
  if deleted_pet is null then raise exception 'FAIL: owner cannot DELETE RETURNING pet'; end if;
end $$;
reset role;
select pg_temp.assert_true((select count(*)=1 from ops.jobs where dedupe_key='media-delete:a0000000-0000-0000-0000-000000000003' and created_by is null),'Deleting pet durably queues all its carer-uploaded Blob files');
delete from ops.jobs where dedupe_key='media-delete:a0000000-0000-0000-0000-000000000003'; -- test fixture cleanup
set local role chordjai_app;
select set_config('app.user_id','10000000-0000-0000-0000-000000000002',true);
select pg_temp.assert_true((select count(*) = 1 from pet.pets),'Owner B sees only own pet');
select pg_temp.assert_true((select count(*) = 1 from health.records),'Owner B sees only own health record');
select pg_temp.assert_true((select count(*) = 0 from journal.pages),'Cross-user journal hidden');
select pg_temp.assert_true((select count(*) = 0 from assistant.conversations),'Cross-user chat hidden');
select pg_temp.assert_true((select count(*) = 0 from assistant.messages),'Cross-user messages hidden');
select pg_temp.assert_true((select count(*) = 0 from assistant.memories),'Cross-user memory hidden');
select pg_temp.assert_true((select count(*) = 0 from ai_ops.requests),'Cross-user AI logs hidden');
select pg_temp.assert_true((select count(*) = 0 from notify.inbox),'Cross-user inbox hidden');
select pg_temp.assert_true((select count(*) = 0 from media.objects),'Cross-user media hidden');
select pg_temp.assert_true((select count(*) = 0 from share.links),'Cross-user capabilities hidden');
do $$ begin
  begin
    insert into pet.pets(owner_id,name,species) values('10000000-0000-0000-0000-000000000001','Forged pet','cat');
    raise exception 'FAIL: owner impersonation accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into health.records(pet_id,created_by,kind,title) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','note','IDOR');
    raise exception 'FAIL: foreign pet write accepted';
  exception when insufficient_privilege then null; end;
  begin
    update identity.users set role='admin' where id='10000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: self promotion accepted';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('app.user_id','10000000-0000-0000-0000-000000000004',true);
select pg_temp.assert_true((select count(*) = 1 from health.records),'Viewer can read shared pet records');
select pg_temp.assert_true((select count(*) = 1 from journal.pages),'Viewer can read shared journal');
select pg_temp.assert_true((select count(*) = 0 from assistant.messages),'Pet membership does not reveal owner conversations');
do $$ begin
  begin
    insert into health.records(pet_id,created_by,kind,title) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','note','Viewer write');
    raise exception 'FAIL: viewer write accepted';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('app.user_id','10000000-0000-0000-0000-000000000003',true);
insert into health.records(pet_id,created_by,kind,title) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','note','Carer note');
select pg_temp.assert_true((select count(*) = 2 from health.records),'Carer can create record');
do $$ begin
  begin
    insert into pet.members(pet_id,user_id,role) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','carer');
    raise exception 'FAIL: carer membership escalation accepted';
  exception when insufficient_privilege then null; end;
  begin
    update pet.pets set owner_id='10000000-0000-0000-0000-000000000003' where id='20000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: pet ownership reassignment accepted';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
insert into identity.users(id,line_user_id,display_name) values('10000000-0000-0000-0000-000000000008','test-erased-carer','Temporary carer');
insert into pet.members(pet_id,user_id,role) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000008','carer');
set local role chordjai_app;
select set_config('app.user_id','10000000-0000-0000-0000-000000000008',true);
insert into health.records(id,pet_id,created_by,kind,title) values('30000000-0000-0000-0000-000000000008','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000008','vaccine','Retained vaccine fixture');
delete from identity.users where id='10000000-0000-0000-0000-000000000008';
reset role;
select pg_temp.assert_true((select created_by is null from health.records where id='30000000-0000-0000-0000-000000000008'),'Carer erasure retains pet health record with anonymized attribution');
select pg_temp.assert_true((select count(*)=1 from pet.pets where id='20000000-0000-0000-0000-000000000001'),'Carer erasure preserves another owner pet');
delete from health.records where id='30000000-0000-0000-0000-000000000008'; -- isolated test fixture
set local role chordjai_app;
select set_config('app.user_id','10000000-0000-0000-0000-000000000006',true);
select pg_temp.assert_true(public.is_admin(),'Admin derives role from verified DB identity');
select pg_temp.assert_true((select count(*) = 0 from health.records),'Admin cannot read private pet records by role alone');
select set_config('app.user_id','10000000-0000-0000-0000-000000000002',true);
select set_config('app.role','admin',true);
select pg_temp.assert_true(not public.is_admin(),'Untrusted custom role setting cannot promote user');

select set_config('app.user_id','10000000-0000-0000-0000-000000000007',true);
select pg_temp.assert_true((select count(*) = 2 from health.records),'Verified clinic with current summary grant can read');
reset role;
update identity.grants set revoked_at=now() where id='80000000-0000-0000-0000-000000000001';
set local role chordjai_app;
select pg_temp.assert_true((select count(*) = 0 from health.records),'Revoking clinic grant immediately removes access');
reset role;
update identity.grants set revoked_at=null,expires_at=now()-interval '1 minute' where id='80000000-0000-0000-0000-000000000001';
set local role chordjai_app;
select pg_temp.assert_true((select count(*) = 0 from health.records),'Expired clinic grant cannot read');

select set_config('app.user_id','10000000-0000-0000-0000-000000000001',true);
insert into identity.consents(user_id,purpose,granted,version) values('10000000-0000-0000-0000-000000000001','ai_improvement',true,'test-v1');
update identity.consents set granted=false,version='test-v2' where purpose='ai_improvement';
select pg_temp.assert_true((select count(*) = 2 from identity.consent_history),'Consent updates retain append-only history');
select pg_temp.assert_true((select bool_and(not ai_consent) from media.objects),'Withdrawing AI improvement updates media immediately');
insert into identity.consents(user_id,purpose,granted,version) values('10000000-0000-0000-0000-000000000001','ai_memory',false,'test-v1');
select pg_temp.assert_true((select not memory_enabled from assistant.preferences),'Withdrawing memory consent disables memory');
do $$ begin
  begin
    delete from identity.consent_history;
    raise exception 'FAIL: consent history editable';
  exception when insufficient_privilege then null; end;
  begin
    update triage.sessions set severity=2 where id='60000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: triage level downgraded';
  exception when check_violation then null; end;
  begin
    insert into triage.sessions(pet_id,user_id,symptoms,severity,rule_level,degraded) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Unavailable AI',0,0,true);
    raise exception 'FAIL: degraded home-care accepted';
  exception when check_violation then null; end;
  begin
    perform ops.claim_jobs('untrusted-app',1,30);
    raise exception 'FAIL: application role can claim worker queue';
  exception when insufficient_privilege then null; end;
end $$;

select pg_temp.assert_true(
  ops.enqueue('test.owned','{"userId":"10000000-0000-0000-0000-000000000001"}','test-owned') =
  ops.enqueue('test.owned','{"userId":"10000000-0000-0000-0000-000000000001"}','test-owned'),
  'Enqueue deduplicates job in transaction');
do $$ begin
  begin
    perform ops.enqueue('test.owned','{"userId":"10000000-0000-0000-0000-000000000002"}','forged-job');
    raise exception 'FAIL: job actor impersonation accepted';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
set local role chordjai_worker;
select pg_temp.assert_true(ops.take_rate_limit('test','key-hash',86400,2),'First rate-limit admission');
select pg_temp.assert_true(ops.take_rate_limit('test','key-hash',86400,2),'Second rate-limit admission');
select pg_temp.assert_true(not ops.take_rate_limit('test','key-hash',86400,2),'Atomic rate limit rejects quota overflow');
do $$ declare claimed ops.jobs; begin
  select * into claimed from ops.claim_jobs('test-worker',1,30);
  if claimed.id is null then raise exception 'FAIL: queued job not claimed'; end if;
  if ops.complete_job(claimed.id,gen_random_uuid()) then raise exception 'FAIL: stale lease token completed job'; end if;
  if not ops.complete_job(claimed.id,claimed.lease_token) then raise exception 'FAIL: valid lease cannot complete'; end if;
  if ops.complete_job(claimed.id,claimed.lease_token) then raise exception 'FAIL: completed job acknowledged twice'; end if;
end $$;
select ops.enqueue('test.fail','{}','test-fail',now(),1);
do $$ declare claimed ops.jobs; begin
  select * into claimed from ops.claim_jobs('test-worker',1,30);
  if not ops.fail_job(claimed.id,claimed.lease_token,'TEST_ONLY') then raise exception 'FAIL: cannot fail lease'; end if;
end $$;
select pg_temp.assert_true((select status = 'dead' from ops.jobs where topic='test.fail'),'Final failed attempt remains visible as dead letter');
select ops.enqueue('test.crash','{}','test-crash',now(),1);
do $$ declare claimed ops.jobs; begin
  select * into claimed from ops.claim_jobs('test-worker',1,30);
  update ops.jobs set locked_until=clock_timestamp()-interval '1 second' where id=claimed.id;
  perform ops.claim_jobs('replacement-worker',1,30);
end $$;
select pg_temp.assert_true((select status = 'dead' from ops.jobs where topic='test.crash'),'Crash on final lease becomes dead letter');

reset role;
set local role chordjai_app;
select set_config('app.user_id','',true);
select pg_temp.assert_true((select count(*) = 0 from pet.pets),'No verified actor sees no private rows');
select set_config('app.user_id','10000000-0000-0000-0000-000000000001',true);
update media.objects set status='deleted' where id='a0000000-0000-0000-0000-000000000001';
update media.objects set status='deleted' where id='a0000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.assert_true((select count(*)=1 from ops.jobs where topic='media.delete' and dedupe_key='media-delete:a0000000-0000-0000-0000-000000000001' and created_by is null),'Marking media deleted queues one system-owned retryable erasure');
set local role chordjai_app;
delete from identity.users where id='10000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.assert_true((select count(*) = 0 from pet.pets where id='20000000-0000-0000-0000-000000000001'),'Account erasure removes owned pet');
select pg_temp.assert_true((select count(*) = 0 from assistant.messages),'Account erasure removes conversations and messages');
select pg_temp.assert_true((select count(*) = 0 from assistant.memories),'Account erasure removes memory');
select pg_temp.assert_true((select count(*) = 0 from journal.pages),'Account erasure removes journal');
select pg_temp.assert_true((select count(*) = 0 from media.objects),'Account erasure removes media metadata');
select pg_temp.assert_true((select count(*)=2 from ops.jobs where topic='media.delete' and dedupe_key in ('media-delete:a0000000-0000-0000-0000-000000000001','media-delete:a0000000-0000-0000-0000-000000000002') and created_by is null),'Blob erasure jobs survive account deletion, including carer-uploaded pet images');
select pg_temp.assert_true((select count(*) = 0 from share.links),'Account erasure removes capabilities');
select pg_temp.assert_true((select count(*) = 1 from pet.pets),'Account erasure preserves unrelated users');

-- Anonymous browser roles receive neither schema usage nor helper execution.
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
set local role anon;
do $$ begin
  begin
    perform count(*) from pet.pets;
    raise exception 'FAIL: anonymous table access accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.is_pet_member('20000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: anonymous helper execution accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
