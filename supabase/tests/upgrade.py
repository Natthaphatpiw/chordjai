"""Exercise gated existing-schema upgrades in an isolated Docker PG only."""
from pathlib import Path
import json
import subprocess
import sys
import uuid

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
databases = []

def fresh(prefix: int) -> str:
    name = "chordjai_upgrade_" + uuid.uuid4().hex
    databases.append(name)
    sql("postgres", f'create database "{name}";')
    for path in sources[:prefix]:
        sql(name, path.read_text())
    return name

try:
    for prefix in (1, 4, 9, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, len(sources)):
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
