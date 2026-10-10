"""Regenerate the SQL Editor bundle from ordered source migrations."""
from pathlib import Path
root = Path(__file__).resolve().parent
header = "-- Generated concatenation of supabase/migrations in filename order.\n-- Run ONCE on a fresh Supabase project using SQL Editor as postgres.\n-- Existing installations: apply only unapplied migration files; never reset production.\n\n"
source = header + "\n\n".join("-- Migration: " + path.name + "\n" + path.read_text() for path in sorted((root / "migrations").glob("*.sql")))
if __import__("sys").argv[1:] == ["--check"]:
    if (root / "bootstrap.sql").read_text() != source:
        raise SystemExit("bootstrap.sql differs from source migrations; run python3 supabase/build-bootstrap.py")
else:
    (root / "bootstrap.sql").write_text(source)
