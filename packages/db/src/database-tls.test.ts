import { X509Certificate } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { databaseConnectionOptions } from './database-tls';
import { supabaseRootCa } from './supabase-ca';

const pooler = 'aws-0-ap-northeast-2.pooler.supabase.com';
const fakePassword = "p@ss:word/?# %&+'";

describe('scoped Supabase PostgreSQL TLS trust', () => {
  it('pins the official Supabase Root 2021 CA fingerprint and validity', () => {
    const certificate = new X509Certificate(supabaseRootCa);
    expect(certificate.fingerprint256).toBe('80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
    expect(certificate.verify(certificate.publicKey)).toBe(true);
    expect(new Date(certificate.validTo).toISOString()).toMatch(/^2031-04-26/);
  });

  it('keeps credentials and non-TLS options while pg retains the explicit verified CA', () => {
    const original = new URL(`postgresql://postgres.exampleproject:${encodeURIComponent(fakePassword)}@${pooler}:6543/postgres`);
    for (const [name, value] of Object.entries({
      ssl: 'false', sslmode: 'require', sslcert: '/missing-client.crt', sslkey: '/missing-key.pem',
      sslrootcert: '/missing-ca.crt', sslnegotiation: 'direct', uselibpqcompat: 'true',
      application_name: 'chordjai owner', connect_timeout: '8', options: '-c statement_timeout=9000'
    })) original.searchParams.set(name, value);
    original.searchParams.append('custom', 'one'); original.searchParams.append('custom', 'two');
    const options = databaseConnectionOptions(original.toString());
    const rewritten = new URL(options.connectionString!);
    expect(rewritten.username).toBe(original.username);
    expect(rewritten.password).toBe(original.password);
    expect(rewritten.host).toBe(original.host);
    expect(rewritten.pathname).toBe(original.pathname);
    expect([...rewritten.searchParams]).toEqual([
      ['application_name', 'chordjai owner'], ['connect_timeout', '8'],
      ['options', '-c statement_timeout=9000'], ['custom', 'one'], ['custom', 'two']
    ]);
    // Construct the actual pg client without connecting. This exercises pg's
    // parser precedence, which previously could overwrite ssl.ca from the URL.
    const client = new pg.Client(options);
    const parameters = (client as unknown as { connectionParameters: { user: string; password: string; ssl: Record<string, unknown> } }).connectionParameters;
    expect(parameters.user).toBe('postgres.exampleproject');
    expect(parameters.password).toBe(fakePassword);
    expect(parameters.ssl).toEqual({ ca: supabaseRootCa, rejectUnauthorized: true });
    expect(parameters.ssl).not.toHaveProperty('checkServerIdentity');
  });

  it('does not accept weaker TLS URL options on a shared pooler', () => {
    const options = databaseConnectionOptions(`postgres://user:password@${pooler}:5432/postgres?sslmode=no-verify&sslmode=disable&ssl=0`);
    expect(new URL(options.connectionString!).search).toBe('');
    expect(options.ssl).toEqual({ ca: supabaseRootCa, rejectUnauthorized: true });
  });

  it.each([
    '127.0.0.1', 'localhost', 'pooler.supabase.com',
    'evilpooler.supabase.com', 'aws.pooler.supabase.com.evil.example',
    'db.exampleproject.supabase.co', 'database.example.com'
  ])('keeps the existing connection and TLS options untouched for %s', host => {
    const connectionString = `postgresql://user:password@${host}:5432/postgres?sslmode=disable&application_name=local`;
    expect(databaseConnectionOptions(connectionString)).toEqual({ connectionString });
  });

  it('honors the actual pg query host override when deciding whether the CA is scoped', () => {
    const connectionString = `postgresql://user:password@${pooler}:6543/postgres?host=${pooler}&host=localhost&sslmode=disable`;
    expect(databaseConnectionOptions(connectionString)).toEqual({ connectionString });
    const configuredPooler = `postgresql://user:password@database.example.com:6543/postgres?host=localhost&host=${pooler}&sslmode=require`;
    const options = databaseConnectionOptions(configuredPooler);
    expect(new URL(options.connectionString!).searchParams.getAll('host')).toEqual(['localhost', pooler]);
    expect(options.ssl).toEqual({ ca: supabaseRootCa, rejectUnauthorized: true });
  });
});
