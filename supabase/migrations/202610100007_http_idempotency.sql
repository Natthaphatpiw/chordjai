begin;
-- HTTP cache is worker-only; authenticated rows retain erasure FK, public rows use NULL.
alter table ops.idempotency drop constraint idempotency_pkey;
alter table ops.idempotency alter column user_id drop not null;
alter table ops.idempotency add primary key(scope,key);
alter table ops.idempotency add column status text not null default 'pending' check (status in ('pending','completed'));
alter table ops.idempotency add column response_status integer check (response_status between 100 and 599);
alter table ops.idempotency add column locked_until timestamptz;
drop policy idempotency_self on ops.idempotency;
revoke all on ops.idempotency from chordjai_app;
create index idempotency_expiry_idx on ops.idempotency(expires_at);
commit;
