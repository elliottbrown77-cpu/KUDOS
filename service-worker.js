const CACHE = 'kudos-v2';
const ASSETS = [
  './','./index.html','./styles.css','./app.js','./manifest.webmanifest',
  './assets/hero-merlin.png','./assets/chf-crest.png','./assets/845-crest.png','./assets/846-crest.png','./assets/847-crest.png'
];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))));
self.addEventListener('activate', e => e.waitUntil((async()=>{ for(const k of await caches.keys()) if(k!==CACHE) await caches.delete(k); await self.clients.claim(); })()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).pathname.endsWith('/config.js')) { e.respondWith(fetch(e.request)); return; }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => hit)));
});
