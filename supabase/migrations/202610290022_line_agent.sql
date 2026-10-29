begin;

-- LINE agent state belongs to the verified LINE account. Application clients
-- can inspect their own state, but cannot forge plans, choices or tool results.
create table assistant.agent_threads (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references identity.users(id) on delete cascade,
 conversation_id uuid references assistant.conversations(id) on delete set null,
 language text not null default 'th' check(language in ('th','en')),
 version integer not null default 1 check(version>0),current_task_id uuid,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create table assistant.agent_turns (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references identity.users(id) on delete cascade,
 thread_id uuid not null,event_id text not null unique check(length(event_id) between 1 and 100),
 request_id uuid not null unique default gen_random_uuid(),
 input_text text check(input_text is null or length(input_text)<=5000),
 postback_data text check(postback_data is null or length(postback_data)<=300),
 normalized jsonb check(normalized is null or (jsonb_typeof(normalized)='object' and octet_length(normalized::text)<=100000)),
 route text check(route is null or route in ('chat','agent','followup_reply','help','emergency','unsupported')),
 state text not null default 'pending' check(state in ('pending','processing','done')),
 created_at timestamptz not null default now(),processed_at timestamptz,
 unique(id,user_id),foreign key(thread_id,user_id) references assistant.agent_threads(id,user_id) on delete cascade,
 check(input_text is not null or postback_data is not null)
);
create index agent_turns_thread_idx on assistant.agent_turns(thread_id,created_at desc);
create table assistant.agent_tasks (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references identity.users(id) on delete cascade,
 thread_id uuid not null,language text not null default 'th' check(language in ('th','en')),
 version integer not null default 1 check(version>0),
 status text not null default 'collecting' check(status in ('collecting','awaiting_confirmation','queued','running','succeeded','failed','cancelled')),
 title text not null default '' check(length(title)<=300),request_text text not null default '' check(length(request_text)<=10000),reference_at timestamptz not null default now(),
 plan jsonb not null default '[]' check(jsonb_typeof(plan)='array' and jsonb_array_length(plan)<=8 and octet_length(plan::text)<=200000),
 question jsonb check(question is null or (jsonb_typeof(question)='object' and octet_length(question::text)<=30000)),
 result jsonb check(result is null or octet_length(result::text)<=500000),
 error_code text check(error_code is null or length(error_code)<=100),
 execution_id uuid not null unique default gen_random_uuid(),execution_started_at timestamptz,confirmed_version integer,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',
 unique(id,user_id),unique(id,thread_id,user_id),
 foreign key(thread_id,user_id) references assistant.agent_threads(id,user_id) on delete cascade,
 check(expires_at>created_at and expires_at<=created_at+interval '7 days'),
 check(confirmed_version is null or (confirmed_version>0 and confirmed_version<=version))
);
alter table assistant.agent_threads add constraint agent_thread_current_task_fk foreign key(current_task_id,id,user_id)
 references assistant.agent_tasks(id,thread_id,user_id) on delete set null (current_task_id) deferrable initially deferred;
create index agent_tasks_owner_idx on assistant.agent_tasks(user_id,created_at desc);
create index agent_tasks_pending_idx on assistant.agent_tasks(status,updated_at) where status in ('collecting','awaiting_confirmation','queued','running');
create table assistant.agent_tool_calls (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references identity.users(id) on delete cascade,
 task_id uuid not null,step integer not null check(step between 0 and 31),
 tool_name text not null check(length(tool_name) between 1 and 100),
 args jsonb not null check(jsonb_typeof(args)='object' and octet_length(args::text)<=200000),
 status text not null default 'pending' check(status in ('pending','running','succeeded','failed')),
 result jsonb check(result is null or octet_length(result::text)<=500000),
 error_code text check(error_code is null or length(error_code)<=100),key_uuid uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(task_id,step),foreign key(task_id,user_id) references assistant.agent_tasks(id,user_id) on delete cascade
);
create table assistant.agent_deliveries (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references identity.users(id) on delete cascade,
 task_id uuid,turn_id uuid,kind text not null check(length(kind) between 1 and 100),
 dedupe_key text not null unique check(length(dedupe_key) between 1 and 200),
 messages jsonb not null check(jsonb_typeof(messages)='array' and jsonb_array_length(messages)<=5 and octet_length(messages::text)<=100000),
 status text not null default 'pending' check(status in ('pending','sent','failed')),
 retry_key uuid not null unique default gen_random_uuid(),first_attempt_at timestamptz,sent_at timestamptz,
 error_code text check(error_code is null or length(error_code)<=100),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '23 hours',
 foreign key(task_id,user_id) references assistant.agent_tasks(id,user_id) on delete cascade,
 foreign key(turn_id,user_id) references assistant.agent_turns(id,user_id) on delete cascade,
 check(expires_at>created_at and expires_at<=created_at+interval '24 hours')
);
create index agent_deliveries_pending_idx on assistant.agent_deliveries(created_at) where status='pending';
create table assistant.agent_choices (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references identity.users(id) on delete cascade,
 task_id uuid not null,version integer not null check(version>0),
 action text not null check(length(action) between 1 and 100),value text not null default '' check(length(value)<=2000),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours',consumed_at timestamptz,
 foreign key(task_id,user_id) references assistant.agent_tasks(id,user_id) on delete cascade,
 check(expires_at>created_at and expires_at<=created_at+interval '24 hours')
);
create index agent_choices_task_idx on assistant.agent_choices(task_id,version) where consumed_at is null;

do $$declare t text;begin
 foreach t in array array['agent_threads','agent_turns','agent_tasks','agent_tool_calls','agent_deliveries','agent_choices'] loop
  execute format('alter table assistant.%I enable row level security',t);
  execute format('alter table assistant.%I force row level security',t);
  execute format('revoke all on assistant.%I from public,chordjai_app',t);
  execute format('grant select,insert,update,delete on assistant.%I to chordjai_worker',t);
  execute format('create policy agent_worker on assistant.%I for all to chordjai_worker using(true) with check(true)',t);
  if t<>'agent_choices' then
   execute format('grant select on assistant.%I to chordjai_app',t);
   execute format('create policy agent_owner_read on assistant.%I for select to chordjai_app using(user_id=public.current_user_id())',t);
  end if;
 end loop;
end $$;

create function assistant.guard_agent_links() returns trigger language plpgsql security definer set search_path='' as $$
declare conversation_owner uuid;task_thread uuid;turn_thread uuid;
begin
 if tg_table_name='agent_threads' then
  if new.conversation_id is not null then
   select user_id into conversation_owner from assistant.conversations where id=new.conversation_id;
   if conversation_owner is distinct from new.user_id then raise exception 'Agent conversation must belong to the same user' using errcode='23514';end if;
  end if;
 elsif tg_table_name='agent_deliveries' then
  if new.task_id is not null and new.turn_id is not null then
   select thread_id into task_thread from assistant.agent_tasks where id=new.task_id and user_id=new.user_id;
   select thread_id into turn_thread from assistant.agent_turns where id=new.turn_id and user_id=new.user_id;
   if task_thread is null or task_thread is distinct from turn_thread then raise exception 'Agent delivery task and turn must belong to the same thread' using errcode='23514';end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function assistant.guard_agent_links() from public,chordjai_app,chordjai_worker;
create trigger agent_thread_conversation_guard before insert or update of conversation_id,user_id on assistant.agent_threads for each row execute function assistant.guard_agent_links();
create trigger agent_delivery_link_guard before insert or update of task_id,turn_id,user_id on assistant.agent_deliveries for each row execute function assistant.guard_agent_links();

create function assistant.agent_immutable_fields() returns trigger language plpgsql set search_path='' as $$
declare field text;
begin
 foreach field in array tg_argv loop
  if to_jsonb(new)->field is distinct from to_jsonb(old)->field then
   raise exception 'Immutable agent request field: %',field using errcode='42501';
  end if;
 end loop;
 return new;
end $$;
revoke all on function assistant.agent_immutable_fields() from public,chordjai_app,chordjai_worker;
create trigger agent_threads_touch before update on assistant.agent_threads for each row execute function public.touch_updated_at();
create trigger agent_tasks_touch before update on assistant.agent_tasks for each row execute function public.touch_updated_at();
create trigger agent_tool_calls_touch before update on assistant.agent_tool_calls for each row execute function public.touch_updated_at();
create trigger agent_thread_identity_guard before update on assistant.agent_threads for each row execute function assistant.agent_immutable_fields('id','user_id','created_at');
create trigger agent_turn_identity_guard before update on assistant.agent_turns for each row execute function assistant.agent_immutable_fields('id','user_id','thread_id','event_id','request_id','input_text','postback_data','created_at');
create trigger agent_task_identity_guard before update on assistant.agent_tasks for each row execute function assistant.agent_immutable_fields('id','user_id','thread_id','execution_id','reference_at','created_at');
create trigger agent_tool_identity_guard before update on assistant.agent_tool_calls for each row execute function assistant.agent_immutable_fields('id','user_id','task_id','step','tool_name','args','key_uuid','created_at');
create trigger agent_delivery_identity_guard before update on assistant.agent_deliveries for each row execute function assistant.agent_immutable_fields('id','user_id','task_id','turn_id','kind','dedupe_key','retry_key','created_at','expires_at');
create trigger agent_choice_identity_guard before update on assistant.agent_choices for each row execute function assistant.agent_immutable_fields('id','user_id','task_id','version','action','value','created_at','expires_at');

-- Withdrawal invalidates old confirmations and queued output. Re-granting the
-- service cannot resurrect an old choice or silently resume a cancelled task.
create function assistant.invalidate_agent_service() returns trigger language plpgsql security definer set search_path='' as $$
declare affected_user uuid;
begin
 if tg_table_name='consents' then
  if old.purpose<>'service' then if tg_op='DELETE' then return old;else return new;end if;end if;
  if tg_op='UPDATE' and new.granted then return new;end if;
  affected_user=old.user_id;
 else
  if new.status='active' then return new;end if;
  affected_user=new.id;
 end if;
 update assistant.agent_tasks set status='cancelled',error_code='AGENT_ACCESS_REVOKED',version=version+1,confirmed_version=null,question=null
  where user_id=affected_user and status in ('collecting','awaiting_confirmation','queued','running');
 update assistant.agent_choices set consumed_at=coalesce(consumed_at,now()) where user_id=affected_user and consumed_at is null;
 update assistant.agent_deliveries set status='failed',messages='[]'::jsonb,error_code='AGENT_ACCESS_REVOKED'
  where user_id=affected_user and status='pending';
 update assistant.agent_threads set current_task_id=null,version=version+1 where user_id=affected_user;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function assistant.invalidate_agent_service() from public,chordjai_app,chordjai_worker;
create trigger agent_service_withdraw after update or delete on identity.consents for each row execute function assistant.invalidate_agent_service();
create trigger agent_account_inactive after update of status on identity.users for each row execute function assistant.invalidate_agent_service();

commit;
