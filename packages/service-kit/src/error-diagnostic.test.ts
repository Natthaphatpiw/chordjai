import { afterEach, describe, expect, it, vi } from 'vitest';
import { createService } from './index';
import { withSystem } from '@chordjai/db';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const secret = 'private-fixture-password-and-provider-token';
function failure(code?: string) {
  return Object.assign(new Error(`postgresql://user:${secret}@private-db.example/db`), {
    code,
    detail: `User email and ${secret}`,
    query: `select '${secret}'`,
    providerBody: { accessToken: secret }
  });
}

async function request(error: Error) {
  const logs = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const service = createService('diagnostic-test');
  service.get('/failure', () => { throw error; });
  const response = await service.request('http://localhost/failure');
  const client = await response.text();
  expect(logs).toHaveBeenCalledTimes(1);
  const logged = String(logs.mock.calls[0][0]);
  expect(logged).not.toContain(secret);
  expect(logged).not.toContain('private-db.example');
  expect(logged).not.toContain('User email');
  expect(logged).not.toContain('select');
  expect(client).not.toContain(secret);
  expect(client).not.toContain('private-db.example');
  return { response, logged: JSON.parse(logged) as Record<string, unknown> };
}

describe('safe infrastructure error diagnostics', () => {
  it.each(['42P01', '28P01', 'SELF_SIGNED_CERT_IN_CHAIN', 'ECONNREFUSED'])('logs only the recognized code %s', async code => {
    const result = await request(failure(code));
    expect(result.response.status).toBe(500);
    expect(result.logged).toEqual({
      event: 'request_error', service: 'diagnostic-test', requestId: expect.any(String),
      status: 500, code: 'INTERNAL_ERROR', causeCode: code
    });
  });

  it.each([secret, '42KEY'])('omits arbitrary code %s instead of copying it into logs', async code => {
    const result = await request(failure(code));
    expect(result.logged).not.toHaveProperty('causeCode');
    expect(Object.keys(result.logged).sort()).toEqual(['code', 'event', 'requestId', 'service', 'status']);
  });

  it('recognizes a native cause while keeping both wrapper and underlying error data private', async () => {
    const error = new Error(secret, { cause: failure('CERT_HAS_EXPIRED') });
    const result = await request(error);
    expect(result.logged.causeCode).toBe('CERT_HAS_EXPIRED');
  });

  it('keeps an unreadable diagnostic property from breaking the error response or leaking its exception', async () => {
    const error = Object.assign(new Error(secret), { cause: Object.defineProperty({}, 'code', { get() { throw new Error(secret); } }) });
    const result = await request(error);
    expect(result.response.status).toBe(500);
    expect(result.logged).not.toHaveProperty('causeCode');
  });

  it.each([undefined, '', '   '])('reports a missing or blank database configuration without connecting: %s', async value => {
    vi.stubEnv('DATABASE_URL', value);
    const error = await withSystem(async () => null).catch(caught => caught as Error & { code: string });
    expect(error).toMatchObject({ code: 'DB_NOT_CONFIGURED' });
    const result = await request(error as Error);
    expect(result.response.status).toBe(500);
    expect(result.logged.causeCode).toBe('DB_NOT_CONFIGURED');
    expect(result.logged).not.toHaveProperty('message');
  });
});
