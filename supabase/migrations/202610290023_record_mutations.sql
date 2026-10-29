begin;

-- Record mutations retain actor/RLS authorization in the API. These triggers
-- perform only source-bound maintenance which must span family-owned rows.
create function health.sync_record_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_pet uuid;source_id uuid;latest_weight numeric;reminder_recipient uuid;
begin
 target_pet=old.pet_id;source_id=old.id;
 -- Serialize the shared profile aggregate for concurrent record edits/deletes.
 perform 1 from pet.pets where id=target_pet for update;
 if tg_op='DELETE' then
   delete from notify.reminders where pet_id=target_pet and dedupe_key='health:'||source_id::text;
 elsif new.next_due_at is null then
   delete from notify.reminders where pet_id=target_pet and dedupe_key='health:'||source_id::text;
 else
   select coalesce(new.created_by,p.owner_id) into reminder_recipient from pet.pets p where p.id=target_pet;
   if new.next_due_at is not distinct from old.next_due_at then
     update notify.reminders set title=new.title where pet_id=target_pet and dedupe_key='health:'||source_id::text;
   else
     insert into notify.reminders(pet_id,user_id,title,due_at,dedupe_key)
       values(target_pet,reminder_recipient,new.title,new.next_due_at,'health:'||source_id::text)
       on conflict(dedupe_key) do update set title=excluded.title,due_at=excluded.due_at,sent_at=null,completed_at=null;
   end if;
 end if;
 if old.kind='weight' or (tg_op='UPDATE' and new.kind='weight') then
   select value into latest_weight from health.records where pet_id=target_pet and kind='weight'
     order by recorded_at desc,created_at desc,id desc limit 1;
   update pet.pets set weight_kg=latest_weight where id=target_pet;
 end if;
 -- Legacy health summaries do not carry source IDs. Revoke this pet's old
 -- summaries after a clinical correction rather than serve a stale copy.
 update share.links set revoked_at=coalesce(revoked_at,now()) where pet_id=target_pet and revoked_at is null;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function health.sync_record_mutation() from public,chordjai_app,chordjai_worker;
create trigger record_mutation_sync after update or delete on health.records for each row execute function health.sync_record_mutation();

create function health.invalidate_care_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
declare entry_id uuid;
begin
 if tg_table_name='care_entries' then
   entry_id=old.id;
   if tg_op='UPDATE' and row(new.episode_id,new.kind,new.title,new.observed_at,new.narrative,new.clinical_note,new.observations,new.visit,new.share_with_clinic,new.share_costs,new.passport_source)
     is not distinct from row(old.episode_id,old.kind,old.title,old.observed_at,old.narrative,old.clinical_note,old.observations,old.visit,old.share_with_clinic,old.share_costs,old.passport_source) then return new;end if;
 elsif tg_op='DELETE' then entry_id=old.entry_id;
 else entry_id=new.entry_id;
 end if;
 update share.links set revoked_at=coalesce(revoked_at,now()) where revoked_at is null
   and snapshot->'careEntries' @> jsonb_build_array(jsonb_build_object('id',entry_id::text));
 update health.passport_share_links l set revoked_at=coalesce(l.revoked_at,now()) where l.revoked_at is null
   and exists(select 1 from health.passport_sessions s where s.id=l.session_id and entry_id=any(s.history_entry_ids));
 update health.passport_sessions set status='draft',current_snapshot_id=null,published_to_clinic=false,version=version+1
   where entry_id=any(history_entry_ids) and current_snapshot_id is not null;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function health.invalidate_care_mutation() from public,chordjai_app,chordjai_worker;
create trigger care_mutation_snapshots after update on health.care_entries for each row execute function health.invalidate_care_mutation();
create trigger care_cost_mutation_snapshots after insert or update or delete on health.care_costs for each row execute function health.invalidate_care_mutation();
create trigger care_media_mutation_snapshots after insert or update or delete on health.care_media for each row execute function health.invalidate_care_mutation();

create function health.invalidate_episode_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update share.links set revoked_at=coalesce(revoked_at,now()) where pet_id=old.pet_id and revoked_at is null
   and exists(select 1 from jsonb_array_elements(coalesce(snapshot->'careEntries','[]'::jsonb)) e where e->'episode'->>'id'=old.id::text);
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function health.invalidate_episode_mutation() from public,chordjai_app,chordjai_worker;
create trigger episode_mutation_snapshots before update or delete on health.care_episodes for each row execute function health.invalidate_episode_mutation();

-- FK SET NULL is still a visible change: invalidate a stale edit/delete review.
create function health.bump_care_reference_version() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.version=old.version and row(new.episode_id,new.passport_session_id,new.passport_clinic_note_id)
   is distinct from row(old.episode_id,old.passport_session_id,old.passport_clinic_note_id) then new.version=old.version+1;end if;
 return new;
end $$;
revoke all on function health.bump_care_reference_version() from public,chordjai_app,chordjai_worker;
create trigger care_reference_version before update of episode_id,passport_session_id,passport_clinic_note_id on health.care_entries for each row execute function health.bump_care_reference_version();

drop trigger passport_history_invalidate on health.care_entries;
create trigger passport_history_invalidate before delete or update of episode_id,kind,title,observed_at,narrative,clinical_note,observations,visit,share_with_clinic,share_costs,passport_source
 on health.care_entries for each row execute function health.invalidate_passport_history();

commit;
