import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {register} from 'tsx/esm/api';
register();
const {databaseConnectionOptions}=await import('../packages/db/src/database-tls.ts');
const {errorDiagnosticCode}=await import('../packages/service-kit/src/error-diagnostic.ts');
const connectionString=process.env.DATABASE_URL;
if(!connectionString?.trim()||connectionString.includes('YOUR_')){
  console.error('Set DATABASE_URL first. SQL Editor users can run supabase/diagnostic.sql then supabase/upgrade.sql.');
  process.exit(1);
}
const sql=await readFile(new URL('../supabase/upgrade.sql',import.meta.url),'utf8');
const client=new pg.Client({...databaseConnectionOptions(connectionString),connectionTimeoutMillis:10000});
try{
  await client.connect();
  await client.query("SET lock_timeout='10s'; SET statement_timeout='120s'");
  // Generated SQL validates the existing schema before changing it and uses one transaction.
  await client.query(sql);
  const result=await client.query('SELECT version FROM ops.schema_migrations ORDER BY version');
  console.log(`Upgrade complete: ${result.rowCount} schema migrations recorded. Credentials and user data were not logged.`);
}catch(error){
  await client.query('ROLLBACK').catch(()=>{});
  console.error(`Upgrade did not confirm success (${errorDiagnosticCode(error)||'CONNECTION_ERROR'}). Run supabase/diagnostic.sql and inspect the schema before retrying. Validation and DDL errors roll back the transaction; a lost connection around commit requires checking the recorded state.`);
  process.exitCode=1;
}finally{await client.end().catch(()=>{});}
