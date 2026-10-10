const CACHE = 'chordjai-emergency-v1';
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.add('/emergency')).then(() => self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('message', event => { if(event.data?.type === 'CACHE_ASSETS' && Array.isArray(event.data.assets)) event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(event.data.assets.filter(url => { try { const parsed=new URL(url); return parsed.origin===self.location.origin && parsed.pathname.startsWith('/_next/static/'); } catch { return false; } }).map(url=>cache.add(url))))); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || url.origin !== self.location.origin || !(url.pathname === '/emergency' || url.pathname.startsWith('/_next/static/'))) return;
  event.respondWith(fetch(event.request).then(response => { if(response.ok) { const copy=response.clone(); void caches.open(CACHE).then(cache=>cache.put(event.request,copy)); } return response; }).catch(async () => (await caches.match(event.request)) || (url.pathname === '/emergency' ? await caches.match('/emergency') : undefined) || Response.error()));
});
