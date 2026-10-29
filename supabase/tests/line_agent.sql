-- Durable LINE-agent security checks. Synthetic rows roll back at the end.
-- Execute only against an isolated test database after migration 22.
begin;
create function pg_temp.agent_assert(ok boolean,label text) returns text language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;
end $$;
insert into identity.users(id,line_user_id,display_name,role) values
 ('a2220000-0000-4000-8000-000000000001','agent-sql-owner-a','Agent SQL A','owner'),
 ('a2220000-0000-4000-8000-000000000002','agent-sql-owner-b','Agent SQL B','owner'),
 ('a2220000-0000-4000-8000-000000000003','agent-sql-admin','Agent SQL Admin','admin');
insert into identity.consents(user_id,purpose,granted,version) values
 ('a2220000-0000-4000-8000-000000000001','service',true,'agent-fixture'),
 ('a2220000-0000-4000-8000-000000000002','service',true,'agent-fixture');
insert into assistant.conversations(id,user_id) values
 ('a2220000-0000-4000-8000-000000000011','a2220000-0000-4000-8000-000000000001'),
 ('a2220000-0000-4000-8000-000000000012','a2220000-0000-4000-8000-000000000002');
insert into assistant.agent_threads(id,user_id,conversation_id) values
 ('a2220000-0000-4000-8000-000000000021','a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000011'),
 ('a2220000-0000-4000-8000-000000000022','a2220000-0000-4000-8000-000000000002','a2220000-0000-4000-8000-000000000012');
insert into assistant.agent_turns(id,user_id,thread_id,event_id,input_text,route) values
 ('a2220000-0000-4000-8000-000000000031','a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000021','agent-sql-event-a','Private owner command','agent'),
 ('a2220000-0000-4000-8000-000000000032','a2220000-0000-4000-8000-000000000002','a2220000-0000-4000-8000-000000000022','agent-sql-event-b','Private second owner command','followup_reply');
insert into assistant.agent_tasks(id,user_id,thread_id,status,title,plan,confirmed_version) values
 ('a2220000-0000-4000-8000-000000000041','a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000021','queued','Save care update','[{"tool":"care.entry.create"}]',1),
 ('a2220000-0000-4000-8000-000000000042','a2220000-0000-4000-8000-000000000002','a2220000-0000-4000-8000-000000000022','collecting','Second owner task','[]',null);
update assistant.agent_threads set current_task_id='a2220000-0000-4000-8000-000000000041' where id='a2220000-0000-4000-8000-000000000021';
insert into assistant.agent_tool_calls(id,user_id,task_id,step,tool_name,args) values
 ('a2220000-0000-4000-8000-000000000051','a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000041',0,'care.entry.create','{"title":"Private care"}');
insert into assistant.agent_deliveries(id,user_id,task_id,turn_id,kind,dedupe_key,messages) values
 ('a2220000-0000-4000-8000-000000000061','a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000041','a2220000-0000-4000-8000-000000000031','accepted','agent-sql-delivery-a','[{"type":"text","text":"Private task accepted"}]');
insert into assistant.agent_choices(id,user_id,task_id,version,action,value) values
 ('a2220000-0000-4000-8000-000000000071','a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000041',1,'confirm','yes');

set local role chordjai_app;
select set_config('app.user_id','a2220000-0000-4000-8000-000000000001',true);
select pg_temp.agent_assert((select count(*)=1 from assistant.agent_threads),'Owner reads own thread only');
select pg_temp.agent_assert((select count(*)=1 from assistant.agent_turns),'Owner reads own turn only');
select pg_temp.agent_assert((select count(*)=1 from assistant.agent_tasks),'Owner reads own task only');
select pg_temp.agent_assert((select count(*)=1 from assistant.agent_tool_calls),'Owner reads own tool audit only');
select pg_temp.agent_assert((select count(*)=1 from assistant.agent_deliveries),'Owner reads own delivery only');
do $$begin
 begin perform 1 from assistant.agent_choices;raise exception 'FAIL: App can read choice capability';exception when insufficient_privilege then null;end;
 begin update assistant.agent_tasks set status='succeeded' where id='a2220000-0000-4000-8000-000000000041';raise exception 'FAIL: App can forge successful task';exception when insufficient_privilege then null;end;
 begin insert into assistant.agent_tasks(user_id,thread_id,title) values('a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000021','Forged task');raise exception 'FAIL: App can insert arbitrary plan';exception when insufficient_privilege then null;end;
 begin update assistant.agent_tool_calls set args='{}';raise exception 'FAIL: App can edit tool arguments';exception when insufficient_privilege then null;end;
end $$;
select set_config('app.user_id','a2220000-0000-4000-8000-000000000003',true);
select pg_temp.agent_assert((select count(*)=0 from assistant.agent_tasks),'Admin role alone cannot read other user tasks');
reset role;

do $$begin
 begin insert into assistant.agent_tasks(user_id,thread_id) values('a2220000-0000-4000-8000-000000000002','a2220000-0000-4000-8000-000000000021');raise exception 'FAIL: Cross-owner thread accepted';exception when foreign_key_violation then null;end;
 begin insert into assistant.agent_turns(user_id,thread_id,event_id,input_text) values('a2220000-0000-4000-8000-000000000002','a2220000-0000-4000-8000-000000000021','agent-sql-forged-event','x');raise exception 'FAIL: Cross-owner turn accepted';exception when foreign_key_violation then null;end;
 begin insert into assistant.agent_tool_calls(user_id,task_id,step,tool_name,args) values('a2220000-0000-4000-8000-000000000002','a2220000-0000-4000-8000-000000000041',1,'care.entry.create','{}');raise exception 'FAIL: Cross-owner tool task accepted';exception when foreign_key_violation then null;end;
 begin insert into assistant.agent_deliveries(user_id,task_id,turn_id,kind,dedupe_key,messages) values('a2220000-0000-4000-8000-000000000002','a2220000-0000-4000-8000-000000000041','a2220000-0000-4000-8000-000000000032','result','agent-sql-forged-delivery','[]');raise exception 'FAIL: Cross-owner delivery accepted';exception when foreign_key_violation or check_violation then null;end;
 begin insert into assistant.agent_choices(user_id,task_id,version,action) values('a2220000-0000-4000-8000-000000000002','a2220000-0000-4000-8000-000000000041',1,'confirm');raise exception 'FAIL: Cross-owner choice accepted';exception when foreign_key_violation then null;end;
 begin update assistant.agent_threads set conversation_id='a2220000-0000-4000-8000-000000000012' where id='a2220000-0000-4000-8000-000000000021';raise exception 'FAIL: Cross-owner chat accepted';exception when check_violation then null;end;
 begin update assistant.agent_threads set current_task_id='a2220000-0000-4000-8000-000000000042' where id='a2220000-0000-4000-8000-000000000021';set constraints assistant.agent_thread_current_task_fk immediate;raise exception 'FAIL: Current task from another thread accepted';exception when foreign_key_violation then null;end;
 begin update assistant.agent_tool_calls set args='{"changed":true}' where id='a2220000-0000-4000-8000-000000000051';raise exception 'FAIL: Tool audit arguments mutable';exception when insufficient_privilege then null;end;
 begin update assistant.agent_tasks set reference_at=reference_at-interval '1 day' where id='a2220000-0000-4000-8000-000000000041';raise exception 'FAIL: Original event reference time mutable';exception when insufficient_privilege then null;end;
 begin insert into assistant.agent_turns(user_id,thread_id,event_id,input_text) values('a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000021','agent-sql-event-a','duplicate event');raise exception 'FAIL: Event replay created duplicate turn';exception when unique_violation then null;end;
 begin insert into assistant.agent_tool_calls(user_id,task_id,step,tool_name,args) values('a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000041',0,'care.entry.create','{}');raise exception 'FAIL: Duplicate tool step accepted';exception when unique_violation then null;end;
 begin insert into assistant.agent_deliveries(user_id,kind,dedupe_key,messages) values('a2220000-0000-4000-8000-000000000001','accepted','agent-sql-delivery-a','[]');raise exception 'FAIL: Duplicate delivery accepted';exception when unique_violation then null;end;
 begin insert into assistant.agent_turns(user_id,thread_id,event_id,input_text) values('a2220000-0000-4000-8000-000000000001','a2220000-0000-4000-8000-000000000021','agent-sql-long-input',repeat('x',5001));raise exception 'FAIL: Oversized command accepted';exception when check_violation then null;end;
 begin insert into assistant.agent_deliveries(user_id,kind,dedupe_key,messages,expires_at) values('a2220000-0000-4000-8000-000000000001','result','agent-sql-long-retry','[]',now()+interval '25 hours');raise exception 'FAIL: Delivery retry exceeds LINE 24h window';exception when check_violation then null;end;
end $$;

update identity.consents set granted=false where user_id='a2220000-0000-4000-8000-000000000001' and purpose='service';
select pg_temp.agent_assert((select status='cancelled' and confirmed_version is null and error_code='AGENT_ACCESS_REVOKED' from assistant.agent_tasks where id='a2220000-0000-4000-8000-000000000041'),'Withdrawal cancels queued task and confirmation');
select pg_temp.agent_assert((select consumed_at is not null from assistant.agent_choices where id='a2220000-0000-4000-8000-000000000071'),'Withdrawal consumes old choices');
select pg_temp.agent_assert((select status='failed' and messages='[]'::jsonb from assistant.agent_deliveries where id='a2220000-0000-4000-8000-000000000061'),'Withdrawal suppresses and redacts unsent output');
select pg_temp.agent_assert((select current_task_id is null from assistant.agent_threads where id='a2220000-0000-4000-8000-000000000021'),'Withdrawal clears active thread pointer');
update identity.consents set granted=true where user_id='a2220000-0000-4000-8000-000000000001' and purpose='service';
select pg_temp.agent_assert((select status='cancelled' from assistant.agent_tasks where id='a2220000-0000-4000-8000-000000000041'),'Regrant does not resurrect cancelled task');
update identity.users set status='suspended' where id='a2220000-0000-4000-8000-000000000002';
select pg_temp.agent_assert((select status='cancelled' from assistant.agent_tasks where id='a2220000-0000-4000-8000-000000000042'),'Account suspension cancels pending task');
delete from identity.users where id='a2220000-0000-4000-8000-000000000001';
set constraints all immediate;
select pg_temp.agent_assert((select count(*)=0 from assistant.agent_threads where user_id='a2220000-0000-4000-8000-000000000001'),'Account erasure removes thread');
select pg_temp.agent_assert((select count(*)=0 from assistant.agent_tasks where user_id='a2220000-0000-4000-8000-000000000001'),'Account erasure removes tasks');
select pg_temp.agent_assert((select count(*)=0 from assistant.agent_turns where user_id='a2220000-0000-4000-8000-000000000001'),'Account erasure removes turns');
select pg_temp.agent_assert((select count(*)=0 from assistant.agent_tool_calls where user_id='a2220000-0000-4000-8000-000000000001'),'Account erasure removes tool audit');
select pg_temp.agent_assert((select count(*)=0 from assistant.agent_deliveries where user_id='a2220000-0000-4000-8000-000000000001'),'Account erasure removes private delivery');
select pg_temp.agent_assert((select count(*)=0 from assistant.agent_choices where user_id='a2220000-0000-4000-8000-000000000001'),'Account erasure removes choice capabilities');
rollback;
