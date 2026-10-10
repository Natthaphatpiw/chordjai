"""Race actual PostgreSQL sessions in the isolated container created by run-local.sh."""
from concurrent.futures import ThreadPoolExecutor
import re
import subprocess
import sys
import threading

container = sys.argv[1]

def sql(statement: str) -> str:
    command = ["docker", "exec", container, "psql", "-U", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", statement]
    return subprocess.run(command, check=True, capture_output=True, text=True).stdout.strip()

def parallel(count: int, statement: str) -> list[str]:
    barrier = threading.Barrier(count)
    def invoke(index: int) -> str:
        barrier.wait()
        return sql(statement.replace("WORKER_INDEX", str(index)))
    with ThreadPoolExecutor(max_workers=count) as executor:
        return list(executor.map(invoke, range(count)))

prefix = "race-test-" + subprocess.run(["docker", "exec", container, "cat", "/proc/sys/kernel/random/uuid"], check=True, capture_output=True, text=True).stdout.strip()
try:
    dedupe = parallel(8, f"begin; set local role chordjai_worker; select ops.enqueue('test.concurrent','{{}}','{prefix}-dedupe'); commit;")
    assert len(set(dedupe)) == 1, "Concurrent duplicate enqueue created more than one job"
    sql(f"delete from ops.jobs where dedupe_key='{prefix}-dedupe';")
    admissions = parallel(8, f"begin; set local role chordjai_worker; select ops.take_rate_limit('test.concurrent','{prefix}',86400,3); commit;")
    assert admissions.count("t") == 3, f"Atomic rate admission exceeded limit: {admissions}"
    sql(f"begin; set local role chordjai_worker; select ops.enqueue('test.concurrent','{{}}','{prefix}-one'); select ops.enqueue('test.concurrent','{{}}','{prefix}-two'); commit;")
    claims = parallel(2, "begin; set local role chordjai_worker; select id from ops.claim_jobs('race-WORKER_INDEX',1,30); select pg_sleep(0.5); commit;")
    ids = [re.findall(r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}", result) for result in claims]
    assert all(len(result) == 1 for result in ids), f"A racing worker failed to claim a job: {claims}"
    assert ids[0][0] != ids[1][0], "SKIP LOCKED leased the same job to concurrent workers"
    print("PASS: 8 racing enqueues deduplicate; rate limit admits exactly 3; 2 concurrent workers claim distinct jobs.")
finally:
    sql(f"delete from ops.jobs where dedupe_key like '{prefix}%'; delete from ops.rate_limits where key='{prefix}';")
