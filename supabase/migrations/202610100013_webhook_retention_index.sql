begin;
create index webhook_events_retention_idx on notify.webhook_events(received_at);
commit;
