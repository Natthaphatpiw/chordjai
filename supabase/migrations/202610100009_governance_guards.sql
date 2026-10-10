begin;
create or replace function triage.protect_approved_rules() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'Create draft rules before approval' using errcode='23514'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' and old.status <> 'draft' then
    raise exception 'Approved rules are immutable' using errcode='23514';
  end if;
  if tg_op = 'UPDATE' then
    if old.status <> 'draft' and (new.rules is distinct from old.rules or new.checksum <> old.checksum or new.version <> old.version) then
      raise exception 'Approved rules are immutable' using errcode='23514';
    end if;
    if new.status in ('approved','active') and old.status = 'draft' then
      if new.approved_by is null or new.approved_at is null or not exists(
        select 1 from triage.eval_runs e where e.id = new.eval_run_id and e.rule_set_id = new.id
          and e.passed and e.under_triage_count = 0) then
        raise exception 'Approval requires passing eval evidence' using errcode='23514';
      end if;
      if not exists(select 1 from identity.users u where u.id = new.approved_by and u.role = 'vet') then
        raise exception 'Approval requires veterinary reviewer' using errcode='23514';
      end if;
    end if;
    return new;
  end if;
  return old;
end $$;
drop trigger immutable_approved_rules on triage.rule_sets;
create trigger immutable_approved_rules before insert or update or delete on triage.rule_sets
  for each row execute function triage.protect_approved_rules();
revoke update on biometric.matches from chordjai_app;
grant update(owner_confirmed) on biometric.matches to chordjai_app;
commit;
