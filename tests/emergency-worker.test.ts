import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// Run the actual worker with a small browser-cache harness. No network calls.
function worker() {
  const origin = 'https://local.example';
  const listeners = new Map<string, (event: any) => void>();
  const stored = new Map<string, Response>();
  const keys = ['chordjai-emergency-v1', 'private-app-cache'];
  const deleted: string[] = [];
  const fetches: string[] = [];
  const key = (request: string | Request) => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const cache = {
    put: async (request: string | Request, response: Response) => { stored.set(key(request), response); },
    match: async (request: string | Request) => stored.get(key(request))?.clone(),
    add: async (url: string) => { fetches.push(url); stored.set(key(url), new Response('asset')); },
  };
  let offline = false;
  let contentType = 'text/html';
  class BrowserRequest extends Request { constructor(input: string | Request, init?: RequestInit) { super(typeof input === 'string' ? new URL(input, origin) : input, init); } }
  vm.runInNewContext(readFileSync(new URL('../frontend/owner-app/public/emergency-sw.js', import.meta.url), 'utf8'), {
    self: { location: { origin }, addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener), skipWaiting: async () => undefined, clients: { claim: async () => undefined } },
    caches: { open: async () => cache, keys: async () => keys, delete: async (name: string) => { deleted.push(name); return true; } },
    Request: BrowserRequest, Response, URL, Promise,
    fetch: async (request: Request) => {
      fetches.push(request.url);
      if (offline) throw new Error('offline');
      return new Response(new URL(request.url).searchParams.get('lang') === 'en' ? 'English guidance' : 'คำแนะนำไทย', { headers: { 'content-type': contentType } });
    },
  });
  async function dispatch(type: string, event: Record<string, unknown> = {}) {
    const work: Promise<unknown>[] = [];
    let result: Promise<Response> | undefined;
    listeners.get(type)?.({ ...event, waitUntil: (promise: Promise<unknown>) => work.push(promise), respondWith: (promise: Promise<Response>) => { result = promise; } });
    const response = result ? await result : undefined;
    await Promise.all(work);
    return response;
  }
  function request(path: string, headers: Record<string, string> = {}, mode = 'navigate') {
    return { url: `${origin}${path}`, method: 'GET', mode, headers: new Headers(headers) };
  }
  return { dispatch, stored, deleted, fetches, request, setOffline: (value: boolean) => { offline = value; }, setContentType: (value: string) => { contentType = value; } };
}

describe('language-safe public emergency cache', () => {
  it('saves Thai and English HTML independently and serves the requested language offline', async () => {
    const instance = worker();
    await instance.dispatch('install');
    expect(instance.stored.size).toBe(2);
    instance.setOffline(true);
    for (const [locale, text] of [['en', 'English guidance'], ['th', 'คำแนะนำไทย']]) {
      const response = await instance.dispatch('fetch', { request: instance.request(`/emergency?lang=${locale}`) });
      expect(await response?.text()).toBe(text);
    }
  });
  it('never replaces HTML with RSC, bare cookie-dependent pages, private routes or APIs', async () => {
    const instance = worker();
    await instance.dispatch('install');
    for (const [path, headers, mode] of [
      ['/emergency?lang=en&_rsc=abc', {}, 'navigate'], ['/emergency?lang=en', { rsc: '1' }, 'navigate'],
      ['/emergency?lang=en', {}, 'cors'], ['/emergency', {}, 'navigate'], ['/emergency?lang=other', {}, 'navigate'],
      ['/app?lang=en', {}, 'navigate'], ['/s/private?lang=en', {}, 'navigate'], ['/api/v1/pets', {}, 'cors'],
    ] as const) expect(await instance.dispatch('fetch', { request: instance.request(path, headers, mode) })).toBeUndefined();
    expect(instance.fetches).toHaveLength(2);
    expect(instance.stored.size).toBe(2);
  });
  it('rejects non-HTML cache refreshes and limits asset caching to same-origin static files', async () => {
    const instance = worker();
    await instance.dispatch('install');
    instance.setContentType('text/x-component');
    await instance.dispatch('message', { data: { type: 'CACHE_EMERGENCY', locale: 'en' } });
    expect(await instance.stored.get('https://local.example/emergency?lang=en')?.clone().text()).toBe('English guidance');
    await instance.dispatch('message', { data: { type: 'CACHE_ASSETS', assets: ['https://local.example/_next/static/font.woff2', 'https://external.example/_next/static/a.js', 'https://local.example/api/v1/pets', 'invalid'] } });
    expect(instance.stored.size).toBe(3);
    expect(instance.stored.has('https://local.example/_next/static/font.woff2')).toBe(true);
  });
  it('cleans up only obsolete emergency caches', async () => {
    const instance = worker();
    await instance.dispatch('activate');
    expect(instance.deleted).toEqual(['chordjai-emergency-v1']);
  });
});
