const CACHE = 'chordjai-emergency-v2';
const emergencyUrl = locale => `/emergency?lang=${locale === 'en' ? 'en' : 'th'}`;

async function cacheEmergency(locale) {
  const url = emergencyUrl(locale);
  const response = await fetch(new Request(url, { headers: { Accept: 'text/html' }, cache: 'no-cache' }));
  if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
    const cache = await caches.open(CACHE);
    await cache.put(url, response);
  }
}

self.addEventListener('install', event => {
  event.waitUntil(Promise.allSettled(['th', 'en'].map(cacheEmergency)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('chordjai-emergency-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'CACHE_EMERGENCY' && ['th', 'en'].includes(event.data.locale)) {
    event.waitUntil(cacheEmergency(event.data.locale).catch(() => { /* Keep previously cached guidance. */ }));
  }
  if (event.data?.type === 'CACHE_ASSETS' && Array.isArray(event.data.assets)) {
    const assets = event.data.assets.filter(url => {
      try { const parsed = new URL(url); return parsed.origin === self.location.origin && parsed.pathname.startsWith('/_next/static/'); } catch { return false; }
    }).slice(0, 64);
    event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(assets.map(url => cache.add(url)))));
  }
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const document = url.pathname === '/emergency' && event.request.mode === 'navigate' && ['th', 'en'].includes(url.searchParams.get('lang'));
  const asset = url.pathname.startsWith('/_next/static/');
  if (!document && !asset) return;
  // Never replace saved HTML with a Next RSC or prefetch response.
  if (event.request.headers.get('rsc') === '1' || url.searchParams.has('_rsc')) return;
  const key = document ? emergencyUrl(url.searchParams.get('lang')) : event.request;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && (!document || response.headers.get('content-type')?.includes('text/html'))) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(key, copy)));
    }
    return response;
  }).catch(async () => (await caches.open(CACHE)).match(key).then(response => response || Response.error())));
});
