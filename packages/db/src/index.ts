import pg, { type PoolClient } from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { databaseConnectionOptions } from './database-tls';
pg.types.setTypeParser(1700,value=>Number(value));
export type { PoolClient } from 'pg';
let pool: pg.Pool | undefined;
function getPool() {
  if (!process.env.DATABASE_URL?.trim()) throw Object.assign(new Error('Database connection not configured'), { code: 'DB_NOT_CONFIGURED' });
  if (!pool) {
    pool = new pg.Pool({...databaseConnectionOptions(process.env.DATABASE_URL),max:3,idleTimeoutMillis:5000,connectionTimeoutMillis:8000});
    attachDatabasePool(pool);
    pool.on('error',()=>console.error(JSON.stringify({event:'db_pool_error'})));
  }
  return pool;
}
async function transaction<T>(role:'chordjai_app'|'chordjai_worker', userId:string|null, fn:(db:PoolClient)=>Promise<T>):Promise<T> {
  const db = await getPool().connect();
  try {
    await db.query('BEGIN');
    await db.query(`SET LOCAL ROLE ${role}`); // closed union, never from HTTP input
    await db.query("SELECT set_config('app.user_id',$1,true)",[userId??'']);
    await db.query("SET LOCAL statement_timeout='15s'");
    const value=await fn(db);
    await db.query('COMMIT');
    return value;
  } catch(error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {db.release();}
}
export const withUser=<T>(userId:string,fn:(db:PoolClient)=>Promise<T>)=>transaction('chordjai_app',userId,fn);
/** Use only for verified LINE identity, public projections, scheduled work. Never for normal user CRUD. */
export const withSystem=<T>(fn:(db:PoolClient)=>Promise<T>)=>transaction('chordjai_worker',null,fn);
export async function closeDatabase(){if(pool){await pool.end();pool=undefined;}}
