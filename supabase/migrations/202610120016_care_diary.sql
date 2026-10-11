begin;

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

commit;
