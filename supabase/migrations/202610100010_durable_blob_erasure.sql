begin;
-- Blob deletion must survive the very account/pet cascade that removes metadata.
-- Trigger runs after RLS has admitted the write and reads only OLD row's pathname.
create function media.queue_blob_erasure() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and (new.status <> 'deleted' or old.status='deleted') then return new; end if;
  insert into ops.jobs(topic,payload,dedupe_key,created_by)
    values('media.delete',jsonb_build_object('pathname',old.pathname),'media-delete:'||old.id::text,null)
    on conflict(topic,dedupe_key) do update set created_by=null;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function media.queue_blob_erasure() from public;
create trigger media_durable_delete before delete on media.objects for each row execute function media.queue_blob_erasure();
create trigger media_durable_mark_deleted before update of status on media.objects for each row execute function media.queue_blob_erasure();
commit;
