#!/usr/bin/env bash
set -euo pipefail
# Creates a fresh local container; never connects to DATABASE_URL or a live Supabase.
test_root="$(cd "$(dirname "$0")/../.." && pwd)"
test_container="chordjai-sql-test-$$"
http_tests=false
case "${1:-}" in
  '') ;;
  --http) http_tests=true ;;
  *) echo 'Usage: bash supabase/tests/run-local.sh [--http]' >&2; exit 2 ;;
esac
python3 "$test_root/supabase/build-bootstrap.py" --check
python3 "$test_root/supabase/build-upgrade.py" --check
trap 'docker rm -f "$test_container" >/dev/null 2>&1 || true' EXIT
if "$http_tests"; then
  docker run --name "$test_container" -e POSTGRES_HOST_AUTH_METHOD=trust -p '127.0.0.1::5432' -d pgvector/pgvector:pg17 >/dev/null
else
  docker run --name "$test_container" -e POSTGRES_HOST_AUTH_METHOD=trust -d pgvector/pgvector:pg17 >/dev/null
fi
test_ready=false
for attempt in {1..30}; do
  # The image starts a temporary socket-only server during initialization.
  # TCP readiness waits for the final server, avoiding bootstrap startup races.
  if docker exec "$test_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then test_ready=true; break; fi
  sleep 1
done
if ! "$test_ready"; then echo 'Isolated PostgreSQL did not become ready.' >&2; exit 1; fi
docker exec -i "$test_container" psql -U postgres -q -v ON_ERROR_STOP=1 < "$test_root/supabase/bootstrap.sql"
docker exec -i "$test_container" psql -U postgres -q -v ON_ERROR_STOP=1 < "$test_root/supabase/tests/security.sql"
docker exec -i "$test_container" psql -U postgres -q -v ON_ERROR_STOP=1 < "$test_root/supabase/tests/petid_index.sql"
python3 "$test_root/supabase/tests/concurrency.py" "$test_container"
python3 "$test_root/supabase/tests/upgrade.py" "$test_container"
echo 'All PostgreSQL security, consent, erasure, queue, and rate-limit assertions passed.'
if "$http_tests"; then
  test_endpoint="$(docker port "$test_container" 5432/tcp)"
  test_url="postgresql://postgres@127.0.0.1:${test_endpoint##*:}/postgres"
  cd "$test_root"
  # These suites share a gallery and test exact global candidate counts.
  # Run files serially so one suite's synthetic lost pet cannot enter another.
  TEST_DATABASE_URL="$test_url" npx --no-install vitest run --maxWorkers=1 tests/integration.test.ts backend/biometric/src/hybrid.integration.test.ts backend/health/src/import.integration.test.ts backend/journal/src/book.integration.test.ts backend/biometric/src/photos.integration.test.ts backend/health/src/care.integration.test.ts backend/analytics/src/care-kpis.integration.test.ts backend/biometric/src/research.integration.test.ts backend/notification/src/followup.integration.test.ts backend/analytics/src/ip-followup-kpis.integration.test.ts
fi
