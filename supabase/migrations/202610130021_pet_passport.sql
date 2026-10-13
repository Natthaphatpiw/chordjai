begin;

alter table identity.grants drop constraint grants_scopes_check;
alter table identity.grants add constraint grants_scopes_check check(scopes <@ array['summary.read','vaccines.write','due_list.read','identity.verify','care.read','passport.read','passport.write']::text[]);

create table health.passport_sessions(
 id uuid primary key default gen_random_uuid(),pet_id uuid not null references pet.pets(id) on delete cascade,
 created_by uuid not null references identity.users(id) on delete cascade,owner_id uuid generated always as(created_by) stored,client_session_id uuid not null,create_hash text not null check(length(create_hash)=64),
 language text not null check(language in ('th','en')),reason text not null check(length(reason) between 1 and 2000),episode_id uuid,
 history_entry_ids uuid[] not null default '{}',media_ids uuid[] not null default '{}',answers jsonb not null default '{}' check(jsonb_typeof(answers)='object' and octet_length(answers::text)<=100000),
 next_question_id text,emergency jsonb not null default '{}' check(jsonb_typeof(emergency)='object'),ready_for_review boolean not null default false,
 status text not null default 'draft' check(status in ('draft','confirmed')),version integer not null default 1 check(version>0),
 current_snapshot_id uuid,published_to_clinic boolean not null default false,after_visit_entry_id uuid references health.care_entries(id) on delete set null,after_visit_episode_id uuid references health.care_episodes(id) on delete set null,after_visit_hash text,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(created_by,client_session_id),unique(id,pet_id),check(cardinality(media_ids)<=5 and cardinality(history_entry_ids)<=30),
 foreign key(episode_id,pet_id) references health.care_episodes(id,pet_id) on delete set null (episode_id),
 check((status='confirmed' and current_snapshot_id is not null) or (status='draft' and current_snapshot_id is null and not published_to_clinic))
);
create index passport_sessions_owner_idx on health.passport_sessions(created_by,pet_id,updated_at desc);
create table health.passport_turns(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references health.passport_sessions(id) on delete cascade,
 owner_id uuid not null references identity.users(id) on delete cascade,session_version integer not null check(session_version>0),question_id text not null,
 answer_status text not null check(answer_status in ('answered','unknown','not_applicable')),value text not null check(length(value)<=2000),question jsonb not null,
 created_at timestamptz not null default now(),unique(session_id,session_version)
);
create table health.passport_snapshots(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references health.passport_sessions(id) on delete cascade,
 pet_id uuid not null references pet.pets(id) on delete cascade,owner_id uuid not null references identity.users(id) on delete cascade,
 session_version integer not null check(session_version>0),document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=200000),
 confirmed_at timestamptz not null default now(),unique(session_id,session_version),unique(id,session_id)
);
alter table health.passport_sessions add constraint passport_current_snapshot_fk foreign key(current_snapshot_id,id) references health.passport_snapshots(id,session_id) deferrable initially deferred;
create table health.passport_snapshot_media(
 snapshot_id uuid not null references health.passport_snapshots(id) on delete cascade,media_id uuid not null references media.objects(id) on delete cascade,
 position integer not null check(position between 0 and 4),primary key(snapshot_id,media_id),unique(snapshot_id,position)
);
create table health.passport_share_links(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references health.passport_sessions(id) on delete cascade,snapshot_id uuid not null,
 owner_id uuid not null references identity.users(id) on delete cascade,request_id uuid not null,request_hash text not null check(length(request_hash)=64),
 token_hash text not null unique check(length(token_hash)=64),expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now(),
 unique(owner_id,request_id),foreign key(snapshot_id,session_id) references health.passport_snapshots(id,session_id) on delete cascade,
 check(expires_at>created_at and expires_at<=created_at+interval '30 days')
);
create index passport_share_token_idx on health.passport_share_links(token_hash) where revoked_at is null;
create table health.passport_clinic_notes(
 id uuid primary key default gen_random_uuid(),session_id uuid not null references health.passport_sessions(id) on delete cascade,snapshot_id uuid not null,
 pet_id uuid not null references pet.pets(id) on delete cascade,clinic_id uuid not null references clinic.clinics(id) on delete cascade,author_id uuid not null references identity.users(id) on delete cascade,
 client_note_id uuid not null,create_hash text not null check(length(create_hash)=64),findings text not null default '' check(length(findings)<=4000),
 treatment text not null default '' check(length(treatment)<=4000),care_instructions text not null default '' check(length(care_instructions)<=4000),next_followup_at timestamptz,
 created_at timestamptz not null default now(),unique(author_id,client_note_id),foreign key(snapshot_id,session_id) references health.passport_snapshots(id,session_id) on delete cascade,
 check(length(findings||treatment||care_instructions)>0)
);
-- Durable provenance survives clinic access revocation but is disclosed only by
-- the care entry's own sharing policies; copying is always owner-confirmed.
alter table health.care_entries add column passport_session_id uuid references health.passport_sessions(id) on delete set null;
alter table health.care_entries add column passport_clinic_note_id uuid references health.passport_clinic_notes(id) on delete set null;
alter table health.care_entries add column passport_source jsonb check(passport_source is null or (jsonb_typeof(passport_source)='object' and octet_length(passport_source::text)<=4000));

create function health.passport_owner_access(p_pet_id uuid,p_owner_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_owner_id=public.current_user_id() and exists(select 1 from pet.pets p join identity.users u on u.id=p.owner_id and u.status='active' join identity.consents c on c.user_id=u.id and c.purpose='service' and c.granted where p.id=p_pet_id and p.owner_id=p_owner_id)
$$;
create function health.passport_clinic_access(p_session_id uuid,p_clinic_id uuid,p_scope text) returns boolean language sql stable security definer set search_path='' as $$
 select p_scope in ('passport.read','passport.write') and exists(
 select 1 from health.passport_sessions s join pet.pets p on p.id=s.pet_id and p.owner_id=s.created_by
 join identity.users owner on owner.id=s.created_by and owner.status='active'
 join identity.consents consent on consent.user_id=owner.id and consent.purpose='service' and consent.granted
 join identity.users actor on actor.id=public.current_user_id() and actor.status='active'
 join clinic.members member on member.user_id=actor.id and member.clinic_id=p_clinic_id
 join clinic.clinics clinic on clinic.id=member.clinic_id and clinic.verified_at is not null
 join identity.grants g on g.pet_id=s.pet_id and g.clinic_id=clinic.id and g.granted_by=s.created_by and p_scope=any(g.scopes) and g.revoked_at is null and g.expires_at>now()
 where s.id=p_session_id and s.status='confirmed' and s.published_to_clinic and s.current_snapshot_id is not null and (p_scope<>'passport.write' or (member.role='vet' and actor.role='vet' and 'passport.read'=any(g.scopes)))
 and not exists(select 1 from health.passport_snapshot_media sm left join media.objects m on m.id=sm.media_id where sm.snapshot_id=s.current_snapshot_id and (m.id is null or m.status<>'ready' or m.user_id<>s.created_by or m.pet_id<>s.pet_id)))
$$;
create function health.passport_any_clinic_access(p_session_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from clinic.members m where m.user_id=public.current_user_id() and health.passport_clinic_access(p_session_id,m.clinic_id,'passport.read'))
$$;
create function health.passport_clinic_media(p_session_id uuid,p_clinic_id uuid,p_media_id uuid) returns table(id uuid,user_id uuid,snapshot_id uuid) language sql stable security definer set search_path='' as $$
 select m.id,m.user_id,s.current_snapshot_id from health.passport_sessions s join health.passport_snapshot_media sm on sm.snapshot_id=s.current_snapshot_id
 join media.objects m on m.id=sm.media_id and m.status='ready' and m.user_id=s.created_by and m.pet_id=s.pet_id
 where s.id=p_session_id and m.id=p_media_id and health.passport_clinic_access(s.id,p_clinic_id,'passport.read')
$$;
revoke all on function health.passport_owner_access(uuid,uuid),health.passport_clinic_access(uuid,uuid,text),health.passport_any_clinic_access(uuid),health.passport_clinic_media(uuid,uuid,uuid) from public;
grant execute on function health.passport_owner_access(uuid,uuid),health.passport_clinic_access(uuid,uuid,text),health.passport_any_clinic_access(uuid),health.passport_clinic_media(uuid,uuid,uuid) to chordjai_app,chordjai_worker;

do $$declare t text;begin foreach t in array array['passport_sessions','passport_turns','passport_snapshots','passport_snapshot_media','passport_share_links','passport_clinic_notes'] loop
 execute format('alter table health.%I enable row level security',t);execute format('alter table health.%I force row level security',t);
 execute format('grant select,insert,update,delete on health.%I to chordjai_worker',t);execute format('create policy %I on health.%I for all to chordjai_worker using(true) with check(true)',t||'_worker',t);
 end loop;end $$;
grant select,insert,update,delete on health.passport_sessions to chordjai_app;
grant select,insert on health.passport_turns,health.passport_snapshots,health.passport_snapshot_media,health.passport_clinic_notes to chordjai_app;
grant select,insert,update on health.passport_share_links to chordjai_app;
create policy passport_owner_session on health.passport_sessions for all to chordjai_app using(health.passport_owner_access(pet_id,created_by)) with check(health.passport_owner_access(pet_id,created_by));
create policy passport_clinic_session on health.passport_sessions for select to chordjai_app using(health.passport_any_clinic_access(id));
create policy passport_owner_turn on health.passport_turns for select to chordjai_app using(exists(select 1 from health.passport_sessions s where s.id=health.passport_turns.session_id and health.passport_owner_access(s.pet_id,health.passport_turns.owner_id)));
create policy passport_insert_turn on health.passport_turns for insert to chordjai_app with check(owner_id=public.current_user_id() and exists(select 1 from health.passport_sessions s where s.id=health.passport_turns.session_id and health.passport_owner_access(s.pet_id,s.created_by) and s.created_by=health.passport_turns.owner_id and s.version=health.passport_turns.session_version));
create policy passport_owner_snapshot on health.passport_snapshots for select to chordjai_app using(health.passport_owner_access(pet_id,owner_id));
create policy passport_clinic_snapshot on health.passport_snapshots for select to chordjai_app using(exists(select 1 from health.passport_sessions s where s.id=health.passport_snapshots.session_id and s.current_snapshot_id=health.passport_snapshots.id and health.passport_any_clinic_access(s.id)));
create policy passport_insert_snapshot on health.passport_snapshots for insert to chordjai_app with check(health.passport_owner_access(pet_id,owner_id) and exists(select 1 from health.passport_sessions s where s.id=health.passport_snapshots.session_id and s.pet_id=health.passport_snapshots.pet_id and s.created_by=health.passport_snapshots.owner_id and s.version=health.passport_snapshots.session_version));
create policy passport_read_media on health.passport_snapshot_media for select to chordjai_app using(exists(select 1 from health.passport_snapshots s where s.id=health.passport_snapshot_media.snapshot_id));
create policy passport_insert_media on health.passport_snapshot_media for insert to chordjai_app with check(exists(select 1 from health.passport_snapshots sn join health.passport_sessions s on s.id=sn.session_id join media.objects m on m.id=health.passport_snapshot_media.media_id and m.user_id=s.created_by and m.pet_id=s.pet_id and m.status='ready' and m.mime like 'image/%' where sn.id=health.passport_snapshot_media.snapshot_id and health.passport_owner_access(s.pet_id,s.created_by) and health.passport_snapshot_media.media_id=any(s.media_ids)));
create policy passport_link_read on health.passport_share_links for select to chordjai_app using(exists(select 1 from health.passport_sessions s where s.id=health.passport_share_links.session_id and health.passport_owner_access(s.pet_id,health.passport_share_links.owner_id)));
create policy passport_link_update on health.passport_share_links for update to chordjai_app using(exists(select 1 from health.passport_sessions s where s.id=health.passport_share_links.session_id and health.passport_owner_access(s.pet_id,health.passport_share_links.owner_id))) with check(exists(select 1 from health.passport_sessions s where s.id=health.passport_share_links.session_id and s.created_by=health.passport_share_links.owner_id and health.passport_owner_access(s.pet_id,health.passport_share_links.owner_id)));
create policy passport_link_insert on health.passport_share_links for insert to chordjai_app with check(owner_id=public.current_user_id() and exists(select 1 from health.passport_sessions s where s.id=health.passport_share_links.session_id and s.created_by=health.passport_share_links.owner_id and s.current_snapshot_id=health.passport_share_links.snapshot_id and s.status='confirmed' and health.passport_owner_access(s.pet_id,health.passport_share_links.owner_id)));
create policy passport_owner_notes on health.passport_clinic_notes for select to chordjai_app using(health.passport_owner_access(pet_id,(select s.created_by from health.passport_sessions s where s.id=health.passport_clinic_notes.session_id)));
create policy passport_clinic_notes on health.passport_clinic_notes for select to chordjai_app using(health.passport_clinic_access(session_id,clinic_id,'passport.read'));
create policy passport_insert_notes on health.passport_clinic_notes for insert to chordjai_app with check(author_id=public.current_user_id() and health.passport_clinic_access(session_id,clinic_id,'passport.write') and exists(select 1 from health.passport_sessions s where s.id=health.passport_clinic_notes.session_id and s.pet_id=health.passport_clinic_notes.pet_id and s.current_snapshot_id=health.passport_clinic_notes.snapshot_id));
create trigger passport_session_touch before update on health.passport_sessions for each row execute function public.touch_updated_at();
create trigger passport_session_immutable before update on health.passport_sessions for each row execute function public.prevent_actor_reassignment('id','pet_id','created_by','client_session_id','create_hash','language');

-- Ordinary edits invalidate all prior publication. Confirmation/after-visit
-- linkage alone does not change the owner's frozen content.
create function health.invalidate_passport_edit() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if tg_op='DELETE' then update health.passport_share_links set revoked_at=coalesce(revoked_at,now()) where session_id=old.id;return old;end if;
 if new.reason is distinct from old.reason or new.episode_id is distinct from old.episode_id or new.history_entry_ids is distinct from old.history_entry_ids or new.media_ids is distinct from old.media_ids or new.answers is distinct from old.answers then
 new.status='draft';new.current_snapshot_id=null;new.published_to_clinic=false;
 update health.passport_share_links set revoked_at=coalesce(revoked_at,now()) where session_id=old.id;
 end if;return new;end $$;
revoke all on function health.invalidate_passport_edit() from public,chordjai_app,chordjai_worker;
create trigger passport_edit_invalidate before update or delete on health.passport_sessions for each row execute function health.invalidate_passport_edit();
create function health.invalidate_passport_media() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if tg_op='UPDATE' and new.status='ready' then return new;end if;
 update health.passport_share_links l set revoked_at=coalesce(l.revoked_at,now()) where l.revoked_at is null and exists(select 1 from health.passport_snapshot_media sm where sm.snapshot_id=l.snapshot_id and sm.media_id=old.id);
 update health.passport_sessions s set status='draft',current_snapshot_id=null,published_to_clinic=false,version=version+1 where old.id=any(s.media_ids) and s.current_snapshot_id is not null;
 if tg_op='DELETE' then return old;end if;return new;end $$;
revoke all on function health.invalidate_passport_media() from public,chordjai_app,chordjai_worker;
create trigger passport_media_invalidate before delete or update of status on media.objects for each row execute function health.invalidate_passport_media();
create function health.invalidate_passport_owner() returns trigger language plpgsql security definer set search_path='' as $$
 declare owner uuid;
 begin
 if tg_table_schema='identity' and tg_table_name='consents' then
 if tg_op='UPDATE' and (new.purpose<>'service' or new.granted) then return new;end if;
 if old.purpose<>'service' then return old;end if;owner=old.user_id;
 elsif tg_table_schema='identity' then
 if new.status='active' then return new;end if;owner=new.id;
 else
 if new.owner_id is not distinct from old.owner_id then return new;end if;owner=old.owner_id;
 end if;
 update health.passport_share_links set revoked_at=coalesce(revoked_at,now()) where owner_id=owner;
 update health.passport_sessions set status='draft',current_snapshot_id=null,published_to_clinic=false,version=version+1 where created_by=owner and current_snapshot_id is not null;
 if tg_op='DELETE' then return old;end if;return new;end $$;
revoke all on function health.invalidate_passport_owner() from public,chordjai_app,chordjai_worker;
create trigger passport_service_invalidate after update or delete on identity.consents for each row execute function health.invalidate_passport_owner();
create trigger passport_account_invalidate after update of status on identity.users for each row execute function health.invalidate_passport_owner();
create trigger passport_owner_invalidate after update of owner_id on pet.pets for each row execute function health.invalidate_passport_owner();

create function health.invalidate_passport_history() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 update health.passport_share_links l set revoked_at=coalesce(l.revoked_at,now()) where l.revoked_at is null and exists(select 1 from health.passport_sessions s where s.id=l.session_id and old.id=any(s.history_entry_ids));
 update health.passport_sessions set status='draft',current_snapshot_id=null,published_to_clinic=false,version=version+1 where old.id=any(history_entry_ids) and current_snapshot_id is not null;
 if tg_op='DELETE' then return old;end if;return new;end $$;
revoke all on function health.invalidate_passport_history() from public,chordjai_app,chordjai_worker;
create trigger passport_history_invalidate before delete or update of narrative,clinical_note,observations,visit,share_with_clinic on health.care_entries for each row execute function health.invalidate_passport_history();


-- Each confirmation is a write-once record. An old snapshot cannot be
-- republished after edits by assigning its id back to the session.
create function health.guard_passport_confirmation() returns trigger language plpgsql security definer set search_path='' as $$
 declare sn health.passport_snapshots; frozen_answers jsonb;
 begin
 if new.status='confirmed' then
 select * into sn from health.passport_snapshots where id=new.current_snapshot_id and session_id=new.id and pet_id=new.pet_id and owner_id=new.created_by;
 if sn.id is null then raise exception 'Confirmation snapshot must belong to this session and owner' using errcode='23514';end if;
 if (select count(*) from health.passport_snapshot_media sm join media.objects m on m.id=sm.media_id and m.status='ready' and m.user_id=new.created_by and m.pet_id=new.pet_id where sm.snapshot_id=sn.id)<>cardinality(new.media_ids) then raise exception 'Confirmation photos must remain ready and selected' using errcode='23514';end if;
 if coalesce((select array_agg((h->>'id')::uuid order by (h->>'id')::uuid) from jsonb_array_elements(sn.document->'history') h),'{}'::uuid[]) is distinct from coalesce((select array_agg(id order by id) from unnest(new.history_entry_ids) id),'{}'::uuid[]) then raise exception 'Confirmation history must match selected entries' using errcode='23514';end if;
 if (select count(*) from health.care_entries e where e.id=any(new.history_entry_ids) and e.pet_id=new.pet_id)<>cardinality(new.history_entry_ids) then raise exception 'Confirmation history must remain available' using errcode='23514';end if;

 select coalesce(jsonb_object_agg(a->>'questionId',a-'questionId'-'question'),'{}'::jsonb) into frozen_answers from jsonb_array_elements(sn.document->'answers') a;
 if sn.document->>'concern' is distinct from new.reason or sn.document->'mediaIds' is distinct from to_jsonb(new.media_ids) or frozen_answers is distinct from new.answers or sn.document->>'episodeId' is distinct from new.episode_id::text then
 raise exception 'Confirmation must match the exact current owner input' using errcode='23514';end if;
 end if;return new;end $$;
revoke all on function health.guard_passport_confirmation() from public,chordjai_app,chordjai_worker;
create trigger passport_z_confirmation_guard before insert or update on health.passport_sessions for each row execute function health.guard_passport_confirmation();
create function health.passport_append_only() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Passport answers, confirmations and clinic notes are append-only' using errcode='42501';end $$;
revoke all on function health.passport_append_only() from public,chordjai_app,chordjai_worker;
create trigger passport_snapshot_append_only before update on health.passport_snapshots for each row execute function health.passport_append_only();
create trigger passport_turn_append_only before update on health.passport_turns for each row execute function health.passport_append_only();
create trigger passport_note_append_only before update on health.passport_clinic_notes for each row execute function health.passport_append_only();

create or replace function health.clinic_care_summary(p_pet_id uuid,p_include_costs boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if public.current_user_id() is null or not public.has_clinic_grant(p_pet_id,'care.read') then raise exception 'A current explicit care.read grant is required' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(projected) order by projected.observed_at desc,projected.id desc),'[]'::jsonb) into result from (
 select e.id,e.kind,e.title,e.observed_at,e.clinical_note,e.observations,e.visit,e.provenance,e.passport_source,e.updated_at,
 case when ep.id is null then null else jsonb_build_object('id',ep.id,'title',ep.title,'status',ep.status,'startedAt',ep.started_at,'resolvedAt',ep.resolved_at) end as episode,
 case when p_include_costs and e.share_costs then coalesce((select jsonb_agg(jsonb_build_object('label',c.label,'amountMinor',c.amount_minor,'currency',c.currency,'kind',c.kind) order by c.position) from health.care_costs c where c.entry_id=e.id),'[]'::jsonb) else '[]'::jsonb end as costs
 from health.care_entries e left join health.care_episodes ep on ep.id=e.episode_id where e.pet_id=p_pet_id and e.share_with_clinic order by e.observed_at desc,e.id desc limit 100
 ) projected;
 return jsonb_build_object('entries',result,'truncated',(select count(*)>100 from health.care_entries where pet_id=p_pet_id and share_with_clinic),'generatedAt',now(),'provenance','owner_reported');
end $$;

create trigger passport_link_immutable before update on health.passport_share_links for each row execute function public.prevent_actor_reassignment('id','session_id','snapshot_id','owner_id','request_id','request_hash','token_hash','expires_at','created_at');
create function health.passport_monotonic_revoke() returns trigger language plpgsql set search_path='' as $$begin
 if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then raise exception 'A revoked Passport link cannot be restored' using errcode='42501';end if;return new;end $$;
revoke all on function health.passport_monotonic_revoke() from public,chordjai_app,chordjai_worker;
create trigger passport_link_revoke_guard before update on health.passport_share_links for each row execute function health.passport_monotonic_revoke();


-- The lineage column cannot turn a family-authored diary into a clinic record.
-- It is set once only when the owning session and optional immutable clinic
-- note belong to that exact pet and author.
create function health.guard_passport_care_source() returns trigger language plpgsql security definer set search_path='' as $$
 declare sn health.passport_sessions; n health.passport_clinic_notes;
 begin
 if tg_op='UPDATE' then
 if new.passport_source is distinct from old.passport_source then raise exception 'Passport source is immutable' using errcode='42501';end if;
 if new.passport_session_id is distinct from old.passport_session_id and not (new.passport_session_id is null and not exists(select 1 from health.passport_sessions where id=old.passport_session_id)) then raise exception 'Passport session source is immutable' using errcode='42501';end if;
 if new.passport_clinic_note_id is distinct from old.passport_clinic_note_id and not (new.passport_clinic_note_id is null and not exists(select 1 from health.passport_clinic_notes where id=old.passport_clinic_note_id)) then raise exception 'Clinic note source is immutable' using errcode='42501';end if;
 return new;
 end if;
 if new.passport_session_id is null then
 if new.passport_clinic_note_id is not null or new.passport_source is not null then raise exception 'A Passport source requires an owner session' using errcode='23514';end if;return new;
 end if;
 select * into sn from health.passport_sessions where id=new.passport_session_id and pet_id=new.pet_id and created_by=new.created_by and status='confirmed';
 if sn.id is null or new.provenance<>'owner_reported' or new.passport_source->>'sessionId' is distinct from sn.id::text or new.passport_source->>'confirmedBy' is distinct from new.created_by::text then raise exception 'Passport care source must match the confirmed owner session' using errcode='23514';end if;
 if new.passport_clinic_note_id is not null then
 select * into n from health.passport_clinic_notes where id=new.passport_clinic_note_id and session_id=sn.id and pet_id=new.pet_id;
 if n.id is null or new.passport_source->>'kind' is distinct from 'owner_confirmed_clinic_note' or new.passport_source->>'clinicNoteId' is distinct from n.id::text or new.passport_source->>'clinicId' is distinct from n.clinic_id::text then raise exception 'Clinic note lineage must match the immutable note' using errcode='23514';end if;
 elsif new.passport_source->>'kind' is distinct from 'owner_reported_visit' then raise exception 'Only an owner-reported visit can have no clinic note' using errcode='23514';end if;
 return new;end $$;
revoke all on function health.guard_passport_care_source() from public,chordjai_app,chordjai_worker;
create trigger care_passport_source_guard before insert or update of passport_session_id,passport_clinic_note_id,passport_source on health.care_entries for each row execute function health.guard_passport_care_source();

commit;
