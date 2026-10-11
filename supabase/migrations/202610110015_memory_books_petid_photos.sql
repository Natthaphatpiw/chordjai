begin;

-- Existing pages retain their original 800x1000 canvas and saved content.
alter table journal.pages
  add column canvas_height integer not null default 1000 check (canvas_height in (1000,1422)),
  add column story_date date,
  add column location text not null default '' check (length(location)<=160),
  add column page_order integer not null default 0 check (page_order>=0);
alter table journal.pages disable trigger set_updated_at;
with positions as (
  select id,row_number() over(partition by pet_id,owner_id order by created_at,id)-1 as position
  from journal.pages
)
update journal.pages p set page_order=positions.position from positions where p.id=positions.id;
alter table journal.pages enable trigger set_updated_at;
create index pages_book_order_idx on journal.pages(pet_id,owner_id,page_order,created_at);

create table journal.books (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pet.pets(id) on delete cascade,
  owner_id uuid not null references identity.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 120),
  cover_theme jsonb not null check (jsonb_typeof(cover_theme)='object'),
  cover_elements jsonb not null default '[]' check (jsonb_typeof(cover_elements)='array' and jsonb_array_length(cover_elements)<=100),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(pet_id,owner_id)
);
alter table journal.books enable row level security;
alter table journal.books force row level security;
grant select,insert,update,delete on journal.books to chordjai_app,chordjai_worker;
create policy system_worker on journal.books for all to chordjai_worker using (true) with check (true);
create policy books_read on journal.books for select to chordjai_app
  using (owner_id=(select public.current_user_id()) and public.is_pet_member(pet_id));
create policy books_insert on journal.books for insert to chordjai_app
  with check (owner_id=(select public.current_user_id()) and public.can_write_pet(pet_id));
create policy books_update on journal.books for update to chordjai_app
  using (owner_id=(select public.current_user_id()) and public.can_write_pet(pet_id))
  with check (owner_id=(select public.current_user_id()) and public.can_write_pet(pet_id));
create policy books_delete on journal.books for delete to chordjai_app
  using (owner_id=(select public.current_user_id()) and public.can_write_pet(pet_id));
create trigger set_updated_at before update on journal.books for each row execute function public.touch_updated_at();
create trigger books_immutable before update on journal.books for each row execute function public.prevent_actor_reassignment('id','pet_id','owner_id');

-- Foreign keys preserve ownership/asset deletion behavior for up to five photos.
create table biometric.enrollment_photos (
  enrollment_id uuid not null references biometric.enrollments(id) on delete cascade,
  media_id uuid not null references media.objects(id) on delete cascade,
  position integer not null check (position between 0 and 4),
  primary key(enrollment_id,media_id),
  unique(enrollment_id,position)
);
insert into biometric.enrollment_photos(enrollment_id,media_id,position)
  select id,media_id,0 from biometric.enrollments where media_id is not null;
alter table biometric.enrollment_photos enable row level security;
alter table biometric.enrollment_photos force row level security;
grant select,insert,update,delete on biometric.enrollment_photos to chordjai_app,chordjai_worker;
create policy system_worker on biometric.enrollment_photos for all to chordjai_worker using (true) with check (true);
create policy enrollment_photos_owner on biometric.enrollment_photos for all to chordjai_app
  using (exists(select 1 from biometric.enrollments e where e.id=enrollment_photos.enrollment_id and e.user_id=(select public.current_user_id()) and public.is_pet_owner(e.pet_id)))
  with check (exists(select 1 from biometric.enrollments e where e.id=enrollment_photos.enrollment_id and e.user_id=(select public.current_user_id()) and public.is_pet_owner(e.pet_id)
    and exists(select 1 from media.objects m where m.id=enrollment_photos.media_id and m.user_id=(select public.current_user_id()) and m.pet_id=e.pet_id and m.status='ready')));

-- A vector/signature derived from several photos must stop being searchable
-- when any of those photos is erased, including a non-primary reference.
-- Run before FK cascades remove the reference that identifies the enrollment.
create function biometric.invalidate_photo_signature() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and new.status='ready' then return new; end if;
  update biometric.enrollments e set signature='{}',embedding=null,
    status=case when e.status='withdrawn' then 'withdrawn' else 'draft' end
    where exists(select 1 from biometric.enrollment_photos p
      where p.enrollment_id=e.id and p.media_id=old.id);
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function biometric.invalidate_photo_signature() from public,chordjai_app,chordjai_worker;
create trigger petid_photo_delete before delete on media.objects
  for each row execute function biometric.invalidate_photo_signature();
create trigger petid_photo_unavailable before update of status on media.objects
  for each row execute function biometric.invalidate_photo_signature();

commit;
