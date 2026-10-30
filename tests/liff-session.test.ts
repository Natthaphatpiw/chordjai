import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  init: vi.fn(), isInClient: vi.fn(), isLoggedIn: vi.fn(), login: vi.fn(),
  getIDToken: vi.fn(), getAccessToken: vi.fn(),
}));
vi.mock('@line/liff', () => ({ default: sdk }));
let storage: Storage;
let fetchMock: ReturnType<typeof vi.fn>;
const exchangeReply = () => new Response(JSON.stringify({ data: { token: 'test-refreshed-session' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const deniedReply = () => new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } }), { status: 401, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.resetModules();
  const values = new Map<string, string>();
  storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: key => { values.delete(key); },
    clear: () => values.clear(), key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  for (const mock of Object.values(sdk)) mock.mockReset();
  sdk.init.mockResolvedValue(undefined);
  sdk.isInClient.mockReturnValue(true);
  sdk.isLoggedIn.mockReturnValue(true);
  sdk.getIDToken.mockReturnValue('test-line-id-token');
  sdk.getAccessToken.mockReturnValue('test-line-access-token');
  vi.stubGlobal('window', { location: { href: 'https://www.chordjai.life/app' }, sessionStorage: storage });
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('navigator',{userAgent:'Mozilla/5.0 Line/15.0.0 LIFF'});
  vi.stubGlobal('document', { cookie: '', documentElement: { lang: 'en' } });
  fetchMock = vi.fn().mockImplementation(exchangeReply);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('NEXT_PUBLIC_LIFF_ID', 'test-liff-id');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('LINE LIFF automatic sign-in with mocked SDK and API only', () => {
  it('initializes and exchanges once for concurrent native LIFF opens without a login redirect', async () => {
    const { autoLineLogin } = await import('../frontend/shared/api');
    expect(await Promise.all([autoLineLogin('test-liff-id'), autoLineLogin('test-liff-id')])).toEqual([true, true]);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith({ liffId: 'test-liff-id' });
    expect(sdk.login).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe('/api/v1/identity/line');
    expect(JSON.parse(init.body)).toMatchObject({ idToken: 'test-line-id-token', accessToken: 'test-line-access-token',remember:true,includeBootstrap:true,loginAttemptId:expect.any(String) });
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(storage.getItem('chordjai.session')).toBe('test-refreshed-session');
  });
  it('leaves ordinary browser and demo entry alone', async () => {
    sdk.isInClient.mockReturnValue(false);
    const { autoLineLogin } = await import('../frontend/shared/api');
    expect(await autoLineLogin('test-liff-id')).toBe(false);
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.login).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('initializes LINE OAuth callbacks only once and preserves their SDK parameters', async () => {
    sdk.isInClient.mockReturnValue(false);
    window.location.href = 'https://www.chordjai.life/app?liff.state=%3Ftab%3Dhealth&code=test-code&state=test-state';
    const { autoLineLogin } = await import('../frontend/shared/api');
    await Promise.all([autoLineLogin('test-liff-id'), autoLineLogin('test-liff-id'), autoLineLogin('test-liff-id')]);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.location.href).toContain('liff.state=');
  });
  it('does not call unsupported native login when native initialization has no identity yet', async () => {
    sdk.isLoggedIn.mockReturnValue(false);
    const { autoLineLogin } = await import('../frontend/shared/api');
    await expect(autoLineLogin('test-liff-id')).rejects.toThrow('reopen the app');
    expect(sdk.login).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('bounds external callback redirects and exposes an explicit retry after a failed login', async () => {
    sdk.isInClient.mockReturnValue(false);
    sdk.isLoggedIn.mockReturnValue(false);
    window.location.href = 'https://www.chordjai.life/app?liff.state=%3Ftab%3Dpetid';
    const { autoLineLogin } = await import('../frontend/shared/api');
    expect(await autoLineLogin('test-liff-id')).toBe(false);
    expect(sdk.login).toHaveBeenCalledTimes(1);
    await expect(autoLineLogin('test-liff-id')).rejects.toThrow('sign-in button');
    expect(sdk.login).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('refreshes an expired API session once and retries with the fresh token', async () => {
    storage.setItem('chordjai.session', 'test-expired-session');
    fetchMock.mockImplementation((path: string, init: RequestInit) => {
      if (path === '/api/v1/identity/line') return exchangeReply();
      if (new Headers(init.headers).get('Authorization') === 'Bearer test-expired-session') return deniedReply();
      return new Response(JSON.stringify({ data: [{ id: 'pet-1' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const { api } = await import('../frontend/shared/api');
    expect(await api('/pets')).toEqual([{ id: 'pet-1' }]);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/identity/line')).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/pets')).toHaveLength(2);
  });
  it('stops after one API retry when LINE returns another rejected session', async () => {
    storage.setItem('chordjai.session', 'test-expired-session');
    fetchMock.mockImplementation((path: string) => path === '/api/v1/identity/line' ? exchangeReply() : deniedReply());
    const { api } = await import('../frontend/shared/api');
    await expect(api('/pets')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/identity/line')).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/pets')).toHaveLength(2);
  });
  it('never invokes sign-in recovery for public requests or permission errors', async () => {
    fetchMock.mockImplementation(() => new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Permission denied' } }), { status: 403 }));
    const { api } = await import('../frontend/shared/api');
    await expect(api('/clinic/memberships')).rejects.toMatchObject({ status: 403 });
    fetchMock.mockImplementation(deniedReply);
    await expect(api('/clinics', {}, true)).rejects.toMatchObject({ status: 401 });
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.login).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('reuses an already refreshed bearer when a concurrent expired response arrives late', async () => {
    storage.setItem('chordjai.session', 'test-expired-session');
    let releaseLate: (value: Response) => void = () => { throw new Error('Late request was not started'); };
    fetchMock.mockImplementation((path: string, init: RequestInit) => {
      if (path === '/api/v1/identity/line') return exchangeReply();
      if (new Headers(init.headers).get('Authorization') === 'Bearer test-expired-session') {
        if (path === '/api/v1/identity/consents') return new Promise<Response>(resolve => { releaseLate = resolve; });
        return deniedReply();
      }
      return new Response(JSON.stringify({ data: path === '/api/v1/pets' ? [{ id: 'pet-1' }] : [{ purpose: 'service', granted: true }] }), { status: 200 });
    });
    const { api } = await import('../frontend/shared/api');
    const pets = api('/pets'); const permissions = api('/identity/consents');
    await expect(pets).resolves.toEqual([{ id: 'pet-1' }]);
    releaseLate(deniedReply());
    await expect(permissions).resolves.toEqual([{ purpose: 'service', granted: true }]);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/v1/identity/line')).toHaveLength(1);
  });
  it('does not restore a session from an old pending exchange after logout and a newer manual login', async () => {
    let releaseOld: (value: Response) => void = () => { throw new Error('Exchange was not started'); };
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { releaseOld = resolve; }));
    const { autoLineLogin, clearLineSession, lineLogin } = await import('../frontend/shared/api');
    const pending = autoLineLogin('test-liff-id');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'SESSION_ENDED' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    clearLineSession();
    expect(await autoLineLogin('test-liff-id')).toBe(false);
    fetchMock.mockImplementation(() => new Response(JSON.stringify({ data: { token: 'test-newer-manual-session' } }), { status: 200 }));
    await expect(lineLogin('test-liff-id')).resolves.toBe('test-newer-manual-session');
    releaseOld(exchangeReply());
    await rejected;
    expect(storage.getItem('chordjai.session')).toBe('test-newer-manual-session');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('stops a pending unauthorized request from renewing after logout', async () => {
    storage.setItem('chordjai.session', 'test-expired-session');
    let release: (value: Response) => void = () => { throw new Error('Request was not started'); };
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { release = resolve; }));
    const { api, clearLineSession } = await import('../frontend/shared/api');
    const pending = api('/pets');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'SESSION_ENDED' });
    clearLineSession(); release(deniedReply());
    await rejected;
    expect(storage.getItem('chordjai.session')).toBeNull();
    expect(sdk.init).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('discards late private data after logout even when its original bearer succeeded', async () => {
    storage.setItem('chordjai.session', 'test-valid-session');
    let release: (value: Response) => void = () => { throw new Error('Request was not started'); };
    fetchMock.mockImplementation(() => new Promise<Response>(resolve => { release = resolve; }));
    const { api, clearLineSession } = await import('../frontend/shared/api');
    const pending = api('/pets');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'SESSION_ENDED' });
    clearLineSession(); release(new Response(JSON.stringify({ data: [{ id: 'private-pet' }] }), { status: 200 }));
    await rejected;
  });
  it('never redirects from a manual native login when initialization did not establish an identity', async () => {
    sdk.isLoggedIn.mockReturnValue(false);
    const { lineLogin } = await import('../frontend/shared/api');
    await expect(lineLogin('test-liff-id')).rejects.toThrow('reopen the app');
    expect(sdk.login).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it('allows a later initialization retry after a transient SDK failure', async () => {
    sdk.init.mockRejectedValueOnce(new Error('Temporary SDK issue'));
    const { autoLineLogin } = await import('../frontend/shared/api');
    await expect(autoLineLogin('test-liff-id')).rejects.toThrow('Temporary SDK issue');
    expect(await autoLineLogin('test-liff-id')).toBe(true);
    expect(sdk.init).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
