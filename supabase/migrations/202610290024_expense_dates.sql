begin;

-- A cost's optional calendar date is independent of the diary event timestamp.
-- Existing expenses deliberately remain undated: there is no inferred backfill.
alter table health.care_costs add column expense_date date;
alter table health.care_costs add constraint care_costs_expense_date_check
 check(expense_date is null or (isfinite(expense_date) and expense_date between date '0001-01-01' and date '9999-12-31'));

-- Preserve the existing care.read grant and per-entry cost opt-in. Dates are
-- part of the selected expense, never an additional unconsented projection.
create or replace function health.clinic_care_summary(p_pet_id uuid,p_include_costs boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if public.current_user_id() is null or not public.has_clinic_grant(p_pet_id,'care.read') then raise exception 'A current explicit care.read grant is required' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(projected) order by projected.observed_at desc,projected.id desc),'[]'::jsonb) into result from (
 select e.id,e.kind,e.title,e.observed_at,e.clinical_note,e.observations,e.visit,e.provenance,e.passport_source,e.updated_at,
 case when ep.id is null then null else jsonb_build_object('id',ep.id,'title',ep.title,'status',ep.status,'startedAt',ep.started_at,'resolvedAt',ep.resolved_at) end as episode,
 case when p_include_costs and e.share_costs then coalesce((select jsonb_agg(jsonb_build_object('label',c.label,'amountMinor',c.amount_minor,'currency',c.currency,'kind',c.kind,'expenseDate',c.expense_date) order by c.position) from health.care_costs c where c.entry_id=e.id),'[]'::jsonb) else '[]'::jsonb end as costs
 from health.care_entries e left join health.care_episodes ep on ep.id=e.episode_id where e.pet_id=p_pet_id and e.share_with_clinic order by e.observed_at desc,e.id desc limit 100
 ) projected;
 return jsonb_build_object('entries',result,'truncated',(select count(*)>100 from health.care_entries where pet_id=p_pet_id and share_with_clinic),'generatedAt',now(),'provenance','owner_reported');
end $$;
revoke all on function health.clinic_care_summary(uuid,boolean) from public,chordjai_worker;
grant execute on function health.clinic_care_summary(uuid,boolean) to chordjai_app;

-- Migration 23's all-column cost mutation trigger already invalidates selected
-- Passport/share snapshots on date edits, without changing any sharing scope.

commit;
