import {spawnSync} from 'node:child_process';
// All migrations and assertions run in a disposable DB, never against user's project.
const result=spawnSync('bash',['supabase/tests/run-local.sh',...process.argv.slice(2)],{stdio:'inherit'});
process.exit(result.status??1);
