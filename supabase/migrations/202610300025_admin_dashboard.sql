begin;
alter table ai_ops.requests
 add column cached_input_tokens integer not null default 0 check(cached_input_tokens>=0),
 add column cache_write_tokens integer not null default 0 check(cache_write_tokens>=0),
 add column reasoning_tokens integer not null default 0 check(reasoning_tokens>=0),
 add column total_tokens integer not null default 0 check(total_tokens>=0),
 add column usage_reported boolean not null default false,
 add column estimated_cost_usd numeric(16,8) check(estimated_cost_usd>=0),
 add column reserved_cost_usd numeric(16,8) check(reserved_cost_usd>=0),
 add column cost_basis text not null default 'legacy_estimate' check(cost_basis in('legacy_estimate','token_estimate','reserved','unknown','unpriced','not_sent')),
 add column price_snapshot jsonb,
 add column provider_response_id text,
 add column provider_request_id text,
 add column service_tier text,
 add column completed_at timestamptz;
-- Old rows did not capture cache tokens or price snapshots; keep them visibly separate.
update ai_ops.requests set total_tokens=input_tokens+output_tokens,
 cost_basis=case when status='budget_blocked' then 'not_sent' when status='reserved' then 'reserved' else 'legacy_estimate' end,
 reserved_cost_usd=case when status='reserved' then cost_usd end;
alter table ai_ops.requests add constraint requests_token_breakdown_check check(cached_input_tokens+cache_write_tokens<=input_tokens and reasoning_tokens<=output_tokens);
create index requests_time_feature_user_idx on ai_ops.requests(created_at,feature,user_id);
create index analytics_user_time_idx on analytics.events(user_id,created_at desc);
create table ops.dashboard_sessions(
 token_hash text primary key check(length(token_hash)=64),
 credential_version text not null check(length(credential_version)=64),
 username text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null
);
create index dashboard_sessions_expiry_idx on ops.dashboard_sessions(expires_at);
alter table ops.dashboard_sessions enable row level security;
create policy dashboard_sessions_worker on ops.dashboard_sessions for all to chordjai_worker using(true) with check(true);
grant select,insert,delete on ops.dashboard_sessions to chordjai_worker;
commit;
