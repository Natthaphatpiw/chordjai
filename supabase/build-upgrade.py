"""Build diagnostic/upgrade SQL; --capture only uses a named isolated Docker PG.

The reference manifest describes schema metadata, never user rows or secrets.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
import uuid

root = Path(__file__).resolve().parent
files = sorted((root / "migrations").glob("*.sql"))
projection = (root / "schema-state.sql").read_text().strip().rstrip(";")

def docker_sql(container: str, db: str, statement: str) -> str:
    result = subprocess.run(["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", db,
                             "-Atq", "-v", "ON_ERROR_STOP=1"], input=statement, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(result.stderr)
    return result.stdout.strip()

if len(sys.argv) == 3 and sys.argv[1] == "--capture":
    container = sys.argv[2]
    if not container.startswith("chordjai-"):
        raise SystemExit("Capture accepts only an isolated chordjai-* Docker test container, never a connection URL")
    db = "chordjai_reference_" + uuid.uuid4().hex
    docker_sql(container, "postgres", f'CREATE DATABASE "{db}";')
    snapshots = []
    try:
        for path in files:
            docker_sql(container, db, path.read_text())
            state = json.loads(docker_sql(container, db, "SET search_path=pg_catalog;\n" + projection + ";"))
            snapshots.append({"version": path.stem.split("_", 1)[0], "file": path.name,
                              "checksum": hashlib.sha256(path.read_bytes()).hexdigest(), "fingerprint": state["fingerprint"]})
        (root / "migration-state-manifest.json").write_text(json.dumps(snapshots, indent=2) + "\n")
    finally:
        docker_sql(container, "postgres", f'DROP DATABASE "{db}";')

manifest = json.loads((root / "migration-state-manifest.json").read_text())
if len(manifest) != len(files):
    raise SystemExit("Reference manifest differs from migration list; capture an isolated fresh reference first")
for expected, path in zip(manifest, files):
    if expected["file"] != path.name or expected["checksum"] != hashlib.sha256(path.read_bytes()).hexdigest():
        raise SystemExit(f"Reference migration changed: {path.name}; capture a fresh reference first")

values = ",\n".join(f" ({i+1},'{entry['version']}','{entry['file']}','{entry['fingerprint']}')" for i, entry in enumerate(manifest))
markers = [
    "to_regclass('identity.users') is not null",
    "to_regprocedure('public.is_pet_member(uuid)') is not null",
    "to_regclass('ops.jobs') is not null and to_regprocedure('ops.claim_jobs(text,integer,integer)') is not null",
    "exists(select 1 from pg_attribute where attrelid=to_regclass('biometric.enrollments') and attname='embedding' and not attisdropped)",
    "to_regclass('ops.rate_limits') is not null",
    "exists(select 1 from pg_attribute where attrelid=to_regclass('notify.reminders') and attname='completed_at' and not attisdropped)",
    "exists(select 1 from pg_attribute where attrelid=to_regclass('ops.idempotency') and attname='response_status' and not attisdropped)",
    "exists(select 1 from pg_policy where polrelid=to_regclass('pet.pets') and polname='pets_read' and pg_get_expr(polqual,polrelid) like '%owner_id%')",
    "exists(select 1 from pg_trigger where tgrelid=to_regclass('triage.rule_sets') and tgname='immutable_approved_rules' and (tgtype & 4)=4)",
    "to_regprocedure('media.queue_blob_erasure()') is not null",
    "exists(select 1 from pg_attribute where attrelid=to_regclass('pet.pets') and attname='neutered' and not attisdropped)",
    "exists(select 1 from pg_constraint where conrelid=to_regclass('health.records') and conname='records_created_by_fkey' and confdeltype='n')",
    "to_regclass('notify.webhook_events_retention_idx') is not null",
    "to_regclass('biometric.enrollments_embedding_hnsw_lost_ready_idx') is not null",
    "to_regclass('journal.books') is not null and to_regclass('biometric.enrollment_photos') is not null",
    "to_regclass('health.care_entries') is not null and to_regprocedure('health.clinic_care_summary(uuid,boolean)') is not null",
    "to_regclass('biometric.capture_sessions') is not null and to_regclass('biometric.training_consent_events') is not null",
    "to_regclass('notify.followup_preferences') is not null and to_regclass('notify.followup_replies') is not null",
    "to_regclass('biometric.capture_checks') is not null and to_regclass('biometric.capture_reviews') is not null",
    "to_regclass('biometric.dataset_exports') is not null and to_regclass('biometric.training_eligible_samples') is not null",
    "to_regclass('health.passport_sessions') is not null and to_regclass('health.passport_snapshots') is not null and to_regprocedure('health.passport_clinic_access(uuid,uuid,text)') is not null",
    "to_regclass('assistant.agent_tasks') is not null and to_regclass('assistant.agent_deliveries') is not null",
    "to_regprocedure('health.sync_record_mutation()') is not null and to_regprocedure('health.invalidate_care_mutation()') is not null",
    "exists(select 1 from pg_attribute where attrelid=to_regclass('health.care_costs') and attname='expense_date' and not attisdropped)",
    "to_regclass('ops.dashboard_sessions') is not null and exists(select 1 from pg_attribute where attrelid=to_regclass('ai_ops.requests') and attname='cost_basis' and not attisdropped)",
    "to_regclass('ops.input_cache') is not null and to_regclass('ops.guard_metrics') is not null and to_regprocedure('ops.guard_owner_insert()') is not null",
    "to_regclass('identity.web_sessions') is not null and to_regprocedure('identity.web_session_active(uuid,uuid)') is not null",
]
marker_case = "case k.ordinal\n" + "\n".join(f" when {i+1} then ({marker})" for i, marker in enumerate(markers)) + "\n end"
diagnostic = """-- READ ONLY: one JSON result contains every diagnostic section; no user data.
begin read only;
set local search_path=pg_catalog;
with current_state as (
""" + projection + """
), known(ordinal,version,file,fingerprint) as (values
""" + values + """
), inferred as (
 select max(k.ordinal) as version from known k,current_state s where k.fingerprint=s.state->>'fingerprint'
)
select jsonb_build_object(
 'database',current_database(),
 'server_major',current_setting('server_version_num')::integer/10000,
 'current_fingerprint',s.state->>'fingerprint',
 'verified_migration_count',i.version,
 'status',case when i.version is not null then 'known_chordjai_state_safe_for_upgrade'
   when to_regclass('identity.users') is null then 'no_known_base_or_unrelated_schema'
   else 'unrecognized_or_partial_schema_do_not_apply_automatically' end,
 'tracker_exists',to_regclass('ops.schema_migrations') is not null,
 'core_tables',s.state->'details'->'tables',
 'columns',s.state->'details'->'columns',
 'constraints',s.state->'details'->'constraints',
 'policies',s.state->'details'->'policies',
 'functions',s.state->'details'->'functions',
 'indexes',s.state->'details'->'indexes',
 'migrations',(select jsonb_agg(jsonb_build_object('number',k.ordinal,'file',k.file,
   'verified_applied',case when i.version is null then null else k.ordinal<=i.version end,
   'marker_present',""" + marker_case + """,
   'is_exact_current_state',k.fingerprint=s.state->>'fingerprint') order by k.ordinal) from known k)
) as chordjai_diagnostic from current_state s cross join inferred i;
commit;
"""

# An unknown fingerprint fails BEFORE any mutation. Adopt only exact known states;
# no blanket IF NOT EXISTS, no baseline DDL replay, no dropping user tables.
upgrade = """-- Generated safe existing-ChordJai upgrade; use bootstrap.sql only for a fresh DB.
-- One transaction: any validation or DDL failure rolls back every change.
begin;
set local search_path=pg_catalog;
do $upgrade$
declare current_state jsonb; known_count integer; expected_state text; actual_state text; checksum text;
begin
  perform pg_advisory_xact_lock(hashtext('chordjai-schema-upgrade'));
  select s.state into current_state from (
""" + projection + """
  ) s;
  select k.ordinal into known_count from (values
""" + values + """
  ) k(ordinal,version,file,fingerprint) where k.fingerprint=current_state->>'fingerprint';
  if known_count is null then
    raise exception 'Unrecognized or partial ChordJai schema (%). No changes applied. Run supabase/diagnostic.sql and review the full JSON; use bootstrap only on a fresh project.',current_state->>'fingerprint';
  end if;
  if not exists(select 1 from pg_roles where rolname='chordjai_app' and not rolsuper and not rolbypassrls)
    or not exists(select 1 from pg_roles where rolname='chordjai_worker' and not rolsuper and not rolbypassrls) then
    raise exception 'Expected restricted ChordJai roles are absent or unsafe. No changes applied.';
  end if;
  if to_regclass('ops.schema_migrations') is null then
    create table ops.schema_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now());
    alter table ops.schema_migrations enable row level security;
    create policy schema_migrations_worker on ops.schema_migrations for all to chordjai_worker using(true) with check(true);
    grant select,insert on ops.schema_migrations to chordjai_worker;
    revoke all on ops.schema_migrations from public;
  elsif (select array_agg(attname::text||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text order by attnum)
    from pg_attribute where attrelid=to_regclass('ops.schema_migrations') and attnum>0 and not attisdropped)
    is distinct from array['version:text:true','checksum:text:true','applied_at:timestamp with time zone:true']::text[] then
    raise exception 'Existing migration tracker has an incompatible shape. No changes applied.';
  end if;
"""
upgrade_prelude = upgrade
for i, (expected, path) in enumerate(zip(manifest, files)):
    version = expected["version"]
    checksum = expected["checksum"]
    source = path.read_text().strip()
    wrapper = re.match(r"(?:\s|--[^\n]*\n)*begin;", source)
    if not wrapper or not source.endswith("commit;"):
        raise SystemExit(f"Unexpected migration transaction wrapper: {path.name}")
    body = source[wrapper.end(): -len("commit;")].strip()
    upgrade += f"""
  select m.checksum into checksum from ops.schema_migrations m where m.version='{version}';
  if checksum is not null and checksum<>'{checksum}' then
    raise exception 'Checksum mismatch for migration {version}. No changes applied.';
  end if;
"""
    if i == 0:
        upgrade += f"""
  -- Existing core is required and fingerprint-verified; never replay CREATE users/tables.
  raise notice 'Verified existing {path.name}';
"""
    else:
        upgrade += f"""
  if known_count<{i+1} then
    if checksum is not null then raise exception 'Tracker claims unapplied migration {version}. No changes applied.'; end if;
    execute $migration_{version}$
{body}
$migration_{version}$;
    raise notice 'Applied {path.name}';
  else
    raise notice 'Verified existing {path.name}';
  end if;
"""
    upgrade += f"""
  insert into ops.schema_migrations(version,checksum) values('{version}','{checksum}') on conflict(version) do nothing;
"""
upgrade_footer = """
  if exists(select 1 from ops.schema_migrations m where m.version not in (""" + ",".join("'"+entry["version"]+"'" for entry in manifest) + """)) then
    raise exception 'Migration tracker contains a version unknown to this checkout. No changes applied.';
  end if;
  select s.state->>'fingerprint' into actual_state from (
""" + projection + """
  ) s;
  if actual_state<> '""" + manifest[-1]["fingerprint"] + """' then
    raise exception 'Final schema verification failed (%). No changes applied.',actual_state;
  end if;
end;
$upgrade$;
commit;
select 'ChordJai schema verified and upgraded; existing user rows preserved' as result,
 count(*) as recorded_migrations from ops.schema_migrations;
"""
upgrade += upgrade_footer

# Small, independently verifiable packets for the operator's current version.
def compact_packet(previous_version: str, target_version: str) -> str:
    previous = next(i for i, item in enumerate(manifest) if item["version"] == previous_version)
    target = next(i for i, item in enumerate(manifest) if item["version"] == target_version)
    base, final = previous + 1, target + 1
    assert target == previous + 1
    known_values = ",\n".join(
        f" ({i+1},'{manifest[i]['version']}','{manifest[i]['file']}','{manifest[i]['fingerprint']}')"
        for i in (previous, target)
    )
    packet = upgrade_prelude.replace(values, known_values, 1).replace(
        "if known_count is null then", f"if known_count is null or known_count not in ({base},{final}) then", 1
    ).replace("Unrecognized or partial ChordJai schema",
              f"This packet requires verified ChordJai schema {base} or {final}; unrecognized or partial schema", 1)
    checksums = ",\n".join(f" ('{item['version']}','{item['checksum']}')" for item in manifest[:target+1])
    source = files[target].read_text().strip()
    wrapper = re.match(r"(?:\s|--[^\n]*\n)*begin;", source)
    if not wrapper or not source.endswith("commit;"):
        raise SystemExit(f"Unexpected migration {final} transaction wrapper")
    body = source[wrapper.end():-len("commit;")].strip()
    packet += f"""
  if exists(select 1 from ops.schema_migrations m left join (values
{checksums}
  ) expected(version,checksum) on expected.version=m.version
    where expected.version is null or expected.checksum<>m.checksum) then
    raise exception 'Checksum mismatch or unknown migration version. No changes applied.';
  end if;
  if known_count={base} then
    if exists(select 1 from ops.schema_migrations where version='{target_version}') then
      raise exception 'Tracker claims unapplied migration {final}. No changes applied.';
    end if;
    execute $migration_{target_version}$
{body}
$migration_{target_version}$;
  end if;
  insert into ops.schema_migrations(version,checksum) values
{checksums}
  on conflict(version) do nothing;
  select s.state->>'fingerprint' into actual_state from (
{projection}
  ) s;
  if actual_state<>'{manifest[target]['fingerprint']}' then
    raise exception 'Final schema {final} verification failed (%). No changes applied.',actual_state;
  end if;
end;
$upgrade$;
commit;
select 'ChordJai schema {final} verified; existing user rows preserved' as result,
 count(*) as recorded_migrations from ops.schema_migrations;
"""
    return packet.replace(
        "-- Generated safe existing-ChordJai upgrade; use bootstrap.sql only for a fresh DB.",
        f"-- GENERATED: only verified schema {base} -> {final}, or verify an existing {final}.\n"
        "-- Supabase SQL Editor: open a NEW query and paste this ENTIRE file, then Run.\n"
        "-- Do not paste it inside another DO block or select only part of this file.", 1)

outputs = {"diagnostic.sql": diagnostic, "upgrade.sql": upgrade,
           "upgrade-25-to-26.sql": compact_packet("202610300025", "202610300026"),
           "upgrade-26-to-27.sql": compact_packet("202610300026", "202610310027")}
if sys.argv[1:] == ["--check"]:
    for name, content in outputs.items():
        if (root / name).read_text() != content:
            raise SystemExit(f"{name} differs from migrations/reference manifest")
else:
    for name, content in outputs.items():
        (root / name).write_text(content)
