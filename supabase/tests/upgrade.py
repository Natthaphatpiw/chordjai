"""Exercise gated existing-schema upgrades in an isolated Docker PG only."""
from pathlib import Path
import json
import subprocess
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor

root = Path(__file__).resolve().parent.parent
container = sys.argv[1]

def sql(db: str, statement: str, success: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(["docker", "exec", "-i", container, "psql", "-U", "postgres", "-d", db,
                             "-Atq", "-v", "ON_ERROR_STOP=1"], input=statement, capture_output=True, text=True)
    if success and result.returncode:
        raise AssertionError(result.stderr)
    if not success and not result.returncode:
        raise AssertionError("Expected rejection but upgrade succeeded")
    return result

sources = sorted((root / "migrations").glob("*.sql"))
upgrade = (root / "upgrade.sql").read_text()
diagnostic = (root / "diagnostic.sql").read_text()
compact = (root / "upgrade-25-to-26.sql").read_text()
manifest = json.loads((root / "migration-state-manifest.json").read_text())
databases = []

def fresh(prefix: int) -> str:
    name = "chordjai_upgrade_" + uuid.uuid4().hex
    databases.append(name)
    sql("postgres", f'create database "{name}";')
    for path in sources[:prefix]:
        sql(name, path.read_text())
    return name

try:
    for prefix in (1, 4, 9, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, len(sources)):
        db = fresh(prefix)
        sql(db, "insert into identity.users(id,line_user_id,display_name) values('e0000000-0000-0000-0000-000000000001','upgrade-preservation-fixture','SYNTHETIC SENTINEL');")
        if prefix >= 16:
            sql(db, """insert into pet.pets(id,owner_id,name,species) values('e0000000-0000-0000-0000-000000000011','e0000000-0000-0000-0000-000000000001','SYNTHETIC EXPENSE PET','cat');
              insert into health.care_entries(id,pet_id,created_by,client_entry_id,create_hash,kind,title,observed_at) values('e0000000-0000-0000-0000-000000000021','e0000000-0000-0000-0000-000000000011','e0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000031',repeat('a',64),'visit','SYNTHETIC VISIT','2026-01-02T08:00:00Z');
              insert into health.care_costs(entry_id,position,label,amount_minor,currency,kind) values('e0000000-0000-0000-0000-000000000021',0,'SYNTHETIC EXPENSE',125050,'THB','paid');""")
        before = json.loads(sql(db, diagnostic).stdout.strip())
        assert before["verified_migration_count"] == prefix, before["status"]
        sql(db, upgrade)
        after = json.loads(sql(db, diagnostic).stdout.strip())
        assert after["verified_migration_count"] == len(sources), after["status"]
        assert sql(db, "select count(*) from identity.users where line_user_id='upgrade-preservation-fixture';").stdout.strip() == "1"
        assert sql(db, "select count(*) from ops.schema_migrations;").stdout.strip() == str(len(sources))
        if prefix >= 16:
            assert sql(db, "select count(*) from health.care_costs where entry_id='e0000000-0000-0000-0000-000000000021' and expense_date is null and amount_minor=125050 and currency='THB' and kind='paid';").stdout.strip() == "1"
        sql(db, upgrade)  # a second run verifies and adopts, never recreates tables
        print(f"PASS: known state {prefix} -> {len(sources)} -> {len(sources)} preserves sentinel user and tracks {len(sources)} migrations")

    for tracked in (False, True):
        db = fresh(25)
        sql(db, "insert into identity.users(id,line_user_id,display_name) values('e1000000-0000-0000-0000-000000000001','compact-sentinel','SYNTHETIC PRESERVE');")
        sql(db, """insert into pet.pets(id,owner_id,name,species) values('e1000000-0000-0000-0000-000000000011','e1000000-0000-0000-0000-000000000001','SYNTHETIC PET','cat');
          insert into health.care_entries(id,pet_id,created_by,client_entry_id,create_hash,kind,title,observed_at) values('e1000000-0000-0000-0000-000000000021','e1000000-0000-0000-0000-000000000011','e1000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000031',repeat('b',64),'visit','SYNTHETIC VISIT','2026-10-29T08:00:00Z');
          insert into health.care_costs(entry_id,position,label,amount_minor,currency,kind,expense_date) values('e1000000-0000-0000-0000-000000000021',0,'SYNTHETIC COST',41400,'THB','paid','2026-10-29');""")
        if tracked:
            sql(db, "create table ops.schema_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now());")
            for item in manifest[:25]:
                sql(db, f"insert into ops.schema_migrations(version,checksum) values('{item['version']}','{item['checksum']}');")
        sql(db, compact)
        sql(db, compact)
        assert json.loads(sql(db, diagnostic).stdout.strip())["verified_migration_count"] == 26
        assert sql(db, "select count(*) from ops.schema_migrations;").stdout.strip() == "26"
        assert sql(db, "select count(*) from identity.users where line_user_id='compact-sentinel';").stdout.strip() == "1"
        assert sql(db, "select count(*) from health.care_costs where entry_id='e1000000-0000-0000-0000-000000000021' and amount_minor=41400 and expense_date='2026-10-29';").stdout.strip() == "1"
        sql(db, upgrade)  # Both packets keep the same tracker and fingerprint.
        print(f"PASS: compact 25 -> 26 -> 26 preserves data; existing tracker={tracked}; full packet agrees")

    for tracked in (False, True):
        db = fresh(26)
        sql(db, "insert into identity.users(id,line_user_id,display_name) values('e2000000-0000-4000-8000-000000000001','session-upgrade-sentinel','SYNTHETIC SESSION OWNER');")
        if tracked:
            sql(db, compact)
        packet27 = (root / "upgrade-26-to-27.sql").read_text()
        sql(db, packet27)
        sql(db, packet27)
        assert json.loads(sql(db, diagnostic).stdout.strip())["verified_migration_count"] == 27
        assert sql(db, "select count(*) from identity.users where line_user_id='session-upgrade-sentinel';").stdout.strip() == "1"
        sql(db, upgrade)
        print(f"PASS: compact 26 -> 27 -> 27 preserves the owner; tracker={tracked}")

    wrong_base = fresh(24)
    sql(wrong_base, compact, success=False)
    assert sql(wrong_base, "select to_regclass('ops.input_cache') is null;").stdout.strip() == "t"
    print("PASS: compact packet rejects schema 24 before creating schema 26 objects")

    broken_copy = fresh(25)
    invalid = compact.replace("end;\n$upgrade$;", "$upgrade$;", 1)
    sql(broken_copy, invalid, success=False)
    assert json.loads(sql(broken_copy, diagnostic).stdout.strip())["verified_migration_count"] == 25
    print("PASS: incomplete outer block is rejected without changing schema 25")

    compact_checksum = fresh(25)
    sql(compact_checksum, "create table ops.schema_migrations(version text primary key,checksum text not null,applied_at timestamptz not null default now()); insert into ops.schema_migrations values('202610300025','INVALID_TEST_ONLY',now());")
    assert "Checksum mismatch" in sql(compact_checksum, compact, success=False).stderr
    assert sql(compact_checksum, "select to_regclass('ops.input_cache') is null;").stdout.strip() == "t"
    print("PASS: compact packet rejects a conflicting checksum before DDL")

    compact_drift = fresh(25)
    sql(compact_drift, "alter table identity.users alter column display_name type varchar(200);")
    sql(compact_drift, compact, success=False)
    assert sql(compact_drift, "select to_regclass('ops.input_cache') is null;").stdout.strip() == "t"
    print("PASS: compact packet rejects drift rather than hiding it with IF NOT EXISTS")

    racing = fresh(26)
    with ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(lambda packet: sql(racing, packet), (compact, upgrade)):
            assert result.returncode == 0
    assert json.loads(sql(racing, diagnostic).stdout.strip())["verified_migration_count"] == len(sources)
    print("PASS: racing latest compact/full packets serialize and leave one verified latest schema")

    foreign = fresh(0)
    sql(foreign, "create schema identity; create table identity.users(id integer primary key,secret text); insert into identity.users values(1,'SYNTHETIC PRESERVE');")
    result = sql(foreign, upgrade, success=False)
    assert "Unrecognized or partial" in result.stderr
    assert sql(foreign, "select secret from identity.users where id=1;").stdout.strip() == "SYNTHETIC PRESERVE"
    assert sql(foreign, "select to_regclass('ops.schema_migrations') is null;").stdout.strip() == "t"
    print("PASS: unrelated users table is rejected before mutation; row remains untouched")

    partial = fresh(1)
    sql(partial, "insert into identity.users(id,line_user_id,display_name) values('e0000000-0000-0000-0000-000000000002','partial-preservation-fixture','SYNTHETIC PRESERVE');")
    sql(partial, "drop table assistant.memories;")
    result = sql(partial, upgrade, success=False)
    assert "Unrecognized or partial" in result.stderr
    assert sql(partial, "select to_regclass('ops.schema_migrations') is null;").stdout.strip() == "t"
    assert sql(partial, "select count(*) from identity.users where line_user_id='partial-preservation-fixture';").stdout.strip() == "1"
    print("PASS: incomplete core state is rejected before mutation")

    drift = fresh(14)
    sql(drift, "insert into identity.users(id,line_user_id,display_name) values('e0000000-0000-0000-0000-000000000003','drift-preservation-fixture','SYNTHETIC PRESERVE');")
    sql(drift, "alter table pet.pets alter column name type varchar(80);")
    result = sql(drift, upgrade, success=False)
    assert "Unrecognized or partial" in result.stderr
    assert sql(drift, "select count(*) from identity.users where line_user_id='drift-preservation-fixture';").stdout.strip() == "1"
    print("PASS: schema drift is rejected instead of silently hidden by IF NOT EXISTS")

    mismatch = fresh(14)
    sql(mismatch, upgrade)
    sql(mismatch, "update ops.schema_migrations set checksum='INVALID_TEST_ONLY' where version='202610100014';")
    result = sql(mismatch, upgrade, success=False)
    assert "Checksum mismatch" in result.stderr
    print("PASS: changed migration checksum is rejected")
finally:
    for db in databases:
        sql("postgres", f'drop database "{db}";')
