begin;

-- Editorial content is independent of owners' private diaries and media.
-- Only the verified dashboard operator can reach the worker-backed write API.
create table analytics.blog_posts (
 id uuid primary key default gen_random_uuid(),
 slug text unique check(length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 language text not null check(language in ('th','en')),
 draft jsonb not null check(jsonb_typeof(draft)='object' and octet_length(draft::text)<=131072),
 published jsonb check(published is null or (jsonb_typeof(published)='object' and octet_length(published::text)<=131072)),
 version integer not null default 1 check(version>0),
 published_version integer check(published_version>0 and published_version<=version),
 first_published_at timestamptz,
 published_at timestamptz,
 published_modified_at timestamptz,
 archived_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(published_at is null or (published is not null and slug is not null and length(slug)>=3 and first_published_at is not null and published_modified_at is not null and published_version is not null and archived_at is null)),
 check(draft->>'slug'=coalesce(slug,'') and draft->>'language'=language),
 check(published is null or (published->>'slug'=slug and published->>'language'=language))
);
create function analytics.lock_blog_permalink() returns trigger language plpgsql set search_path='' as $$
begin
 if old.first_published_at is not null and (new.slug is distinct from old.slug or new.language is distinct from old.language or new.first_published_at is distinct from old.first_published_at) then
  raise exception 'Published blog permalinks are immutable' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function analytics.lock_blog_permalink() from public;
create trigger blog_permalink_immutable before update on analytics.blog_posts for each row execute function analytics.lock_blog_permalink();

create index blog_posts_public_idx on analytics.blog_posts(language,published_at desc,id) where published_at is not null and archived_at is null;
create index blog_posts_admin_idx on analytics.blog_posts(updated_at desc,id);

create table analytics.blog_images (
 id uuid primary key,
 pathname text not null unique check(pathname ~ '^blog/[a-f0-9-]{36}\.webp$'),
 status text not null default 'pending' check(status in ('pending','ready','rejected')),
 size integer not null check(size between 1 and 4000000),
 width integer not null check(width between 1 and 2000),
 height integer not null check(height between 1 and 2000),
 uploaded_by text not null check(length(uploaded_by) between 1 and 100),
 created_at timestamptz not null default now()
);

alter table analytics.blog_posts enable row level security;
alter table analytics.blog_posts force row level security;
alter table analytics.blog_images enable row level security;
alter table analytics.blog_images force row level security;
revoke all on analytics.blog_posts,analytics.blog_images from public,chordjai_app;
grant select,insert,update on analytics.blog_posts,analytics.blog_images to chordjai_worker;
create policy blog_posts_worker on analytics.blog_posts for all to chordjai_worker using(true) with check(true);
create policy blog_images_worker on analytics.blog_images for all to chordjai_worker using(true) with check(true);

commit;
