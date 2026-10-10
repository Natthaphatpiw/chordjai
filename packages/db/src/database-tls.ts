import type { PoolConfig } from 'pg';
import { supabaseRootCa } from './supabase-ca';

const sslOverrides = new Set([
  'ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert',
  'sslnegotiation', 'uselibpqcompat'
]);

/** Trust the pinned Supabase CA only for shared Supavisor pooler hosts. */
export function databaseConnectionOptions(connectionString: string): Pick<PoolConfig, 'connectionString' | 'ssl'> {
  let url: URL;
  try { url = new URL(connectionString); }
  catch { return { connectionString }; }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return { connectionString };

  // pg gives the last ?host= override precedence over the URL hostname.
  const host = (url.searchParams.getAll('host').at(-1) || url.hostname).toLowerCase();
  const suffix = '.pooler.supabase.com';
  if (!host.endsWith(suffix) || host.length <= suffix.length) return { connectionString };

  // node-postgres replaces an explicit ssl object when these URL options are
  // present. Remove only its TLS overrides; credentials and other options stay.
  for (const key of [...new Set(url.searchParams.keys())]) {
    if (sslOverrides.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  return {
    connectionString: url.toString(),
    ssl: { ca: supabaseRootCa, rejectUnauthorized: true }
    // No checkServerIdentity override: Node's hostname verification remains on.
  };
}
