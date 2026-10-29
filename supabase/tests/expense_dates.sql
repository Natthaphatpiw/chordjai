-- Synthetic optional-expense-date checks. Never run against production.
begin;
create function pg_temp.expense_assert(ok boolean,label text) returns text language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;
end $$;
insert into identity.users(id,line_user_id,display_name,role) values
 ('a2400000-0000-4000-8000-000000000001','expense-sql-owner','Expense owner','owner'),
 ('a2400000-0000-4000-8000-000000000002','expense-sql-other','Expense other','owner'),
 ('a2400000-0000-4000-8000-000000000003','expense-sql-clinic','Expense clinician','vet');
insert into identity.consents(user_id,purpose,granted,version) values('a2400000-0000-4000-8000-000000000001','service',true,'fixture');
insert into pet.pets(id,owner_id,name,species) values('a2400000-0000-4000-8000-000000000011','a2400000-0000-4000-8000-000000000001','Synthetic expense pet','cat');
insert into health.care_entries(id,pet_id,created_by,client_entry_id,create_hash,kind,title,observed_at,share_with_clinic,share_costs) values
 ('a2400000-0000-4000-8000-000000000021','a2400000-0000-4000-8000-000000000011','a2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000031',repeat('a',64),'visit','Synthetic visit','2026-10-28T18:30:00Z',true,true),
 ('a2400000-0000-4000-8000-000000000022','a2400000-0000-4000-8000-000000000011','a2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000032',repeat('b',64),'daily','Synthetic private cost','2026-10-27T08:00:00Z',true,false);
insert into health.care_costs(entry_id,position,label,amount_minor,currency,kind,expense_date) values
 ('a2400000-0000-4000-8000-000000000021',0,'Undated consultation',125050,'THB','paid',null),
 ('a2400000-0000-4000-8000-000000000021',1,'Dated estimate',50000,'THB','estimate','2026-11-01'),
 ('a2400000-0000-4000-8000-000000000022',0,'PRIVATE_EXPENSE_DATE_CANARY',9900,'THB','paid','2025-02-03');
select pg_temp.expense_assert((select expense_date is null from health.care_costs where entry_id='a2400000-0000-4000-8000-000000000021' and position=0),'An undated expense stays null instead of inheriting diary or upload date');
set local timezone='America/Los_Angeles';
select pg_temp.expense_assert((select to_jsonb(c)->>'expense_date'='2026-11-01' from health.care_costs c where entry_id='a2400000-0000-4000-8000-000000000021' and position=1),'Expense calendar date does not shift with session timezone');
set local timezone='Asia/Bangkok';
do $$begin
 begin update health.care_costs set expense_date='2026-02-30' where entry_id='a2400000-0000-4000-8000-000000000021' and position=0;raise exception 'FAIL: impossible calendar date accepted';exception when datetime_field_overflow then null;end;
 begin update health.care_costs set expense_date='infinity' where entry_id='a2400000-0000-4000-8000-000000000021' and position=0;raise exception 'FAIL: infinite date accepted';exception when check_violation then null;end;
end $$;
insert into clinic.clinics(id,name,verified_at) values('a2400000-0000-4000-8000-000000000041','SYNTHETIC EXPENSE CLINIC',now());
insert into clinic.members(clinic_id,user_id,role) values('a2400000-0000-4000-8000-000000000041','a2400000-0000-4000-8000-000000000003','vet');
insert into identity.grants(pet_id,clinic_id,granted_by,scopes,expires_at) values('a2400000-0000-4000-8000-000000000011','a2400000-0000-4000-8000-000000000041','a2400000-0000-4000-8000-000000000001','{care.read}',now()+interval '1 day');
set local role chordjai_app;
select set_config('app.user_id','a2400000-0000-4000-8000-000000000002',true);
select pg_temp.expense_assert((select count(*)=0 from health.care_costs),'Another owner cannot read expense dates');
select set_config('app.user_id','a2400000-0000-4000-8000-000000000003',true);
select pg_temp.expense_assert((select count(*)=0 from health.care_costs),'Clinic grant does not expose the raw expense table');
select pg_temp.expense_assert(not exists(select 1 from jsonb_array_elements(health.clinic_care_summary('a2400000-0000-4000-8000-000000000011',false)->'entries') e where jsonb_array_length(e->'costs')>0),'Clinic summary omits all costs and dates when request excludes costs');
select pg_temp.expense_assert(exists(select 1 from jsonb_array_elements(health.clinic_care_summary('a2400000-0000-4000-8000-000000000011',true)->'entries') e,jsonb_array_elements(e->'costs') c where c->>'label'='Dated estimate' and c->>'expenseDate'='2026-11-01'),'Authorized opted-in clinic projection includes the exact expense date');
select pg_temp.expense_assert(health.clinic_care_summary('a2400000-0000-4000-8000-000000000011',true)::text not like '%PRIVATE_EXPENSE_DATE_CANARY%','Per-entry cost opt-out hides its expense label and date');
reset role;

-- A date-only cost correction must invalidate all snapshots which selected it.
insert into share.links(id,pet_id,owner_id,token_hash,snapshot) values
 ('a2400000-0000-4000-8000-000000000051','a2400000-0000-4000-8000-000000000011','a2400000-0000-4000-8000-000000000001','expense-date-source-link',jsonb_build_object('careEntries',jsonb_build_array(jsonb_build_object('id','a2400000-0000-4000-8000-000000000021')))),
 ('a2400000-0000-4000-8000-000000000052','a2400000-0000-4000-8000-000000000011','a2400000-0000-4000-8000-000000000001','expense-date-other-link','{"careEntries":[]}');
insert into health.passport_sessions(id,pet_id,created_by,client_session_id,create_hash,language,reason,history_entry_ids) values
 ('a2400000-0000-4000-8000-000000000061','a2400000-0000-4000-8000-000000000011','a2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000071',repeat('c',64),'en','Synthetic cost review','{a2400000-0000-4000-8000-000000000021}');
insert into health.passport_snapshots(id,session_id,pet_id,owner_id,session_version,document) values
 ('a2400000-0000-4000-8000-000000000081','a2400000-0000-4000-8000-000000000061','a2400000-0000-4000-8000-000000000011','a2400000-0000-4000-8000-000000000001',1,'{"concern":"Synthetic cost review","mediaIds":[],"answers":[],"history":[{"id":"a2400000-0000-4000-8000-000000000021"}]}');
update health.passport_sessions set status='confirmed',current_snapshot_id='a2400000-0000-4000-8000-000000000081' where id='a2400000-0000-4000-8000-000000000061';
insert into health.passport_share_links(id,session_id,snapshot_id,owner_id,request_id,request_hash,token_hash,expires_at) values
 ('a2400000-0000-4000-8000-000000000091','a2400000-0000-4000-8000-000000000061','a2400000-0000-4000-8000-000000000081','a2400000-0000-4000-8000-000000000001','a2400000-0000-4000-8000-000000000092',repeat('d',64),repeat('e',64),now()+interval '1 day');
set local role chordjai_app;
select set_config('app.user_id','a2400000-0000-4000-8000-000000000001',true);
update health.care_costs set expense_date='2026-10-29' where entry_id='a2400000-0000-4000-8000-000000000021' and position=0;
select pg_temp.expense_assert((select expense_date='2026-10-29' from health.care_costs where entry_id='a2400000-0000-4000-8000-000000000021' and position=0),'Owner can assign a date without changing the diary event timestamp');
reset role;
select pg_temp.expense_assert((select revoked_at is not null from share.links where id='a2400000-0000-4000-8000-000000000051'),'A date-only correction revokes a selected shared expense snapshot');
select pg_temp.expense_assert((select revoked_at is null from share.links where id='a2400000-0000-4000-8000-000000000052'),'A date-only correction leaves unrelated shares intact');
select pg_temp.expense_assert((select status='draft' and current_snapshot_id is null and version=2 from health.passport_sessions where id='a2400000-0000-4000-8000-000000000061'),'Date-only correction invalidates the selected Passport confirmation and review version');
select pg_temp.expense_assert((select revoked_at is not null from health.passport_share_links where id='a2400000-0000-4000-8000-000000000091'),'Date-only correction revokes its old Passport share link');
set local role chordjai_app;
select set_config('app.user_id','a2400000-0000-4000-8000-000000000001',true);
update health.care_costs set expense_date=null where entry_id='a2400000-0000-4000-8000-000000000021' and position=0;
select pg_temp.expense_assert((select expense_date is null from health.care_costs where entry_id='a2400000-0000-4000-8000-000000000021' and position=0),'Expense date can be cleared back to unknown');
reset role;
rollback;
