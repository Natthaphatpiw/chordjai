begin;
alter table notify.reminders add column completed_at timestamptz;
commit;
