begin;

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

commit;
