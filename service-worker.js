const CACHE = 'kudos-v20-static-only-20261106';
const STATIC_ASSETS = [
  './hero-merlin.png',
  './chf-crest.png',
  './845-crest.png',
  './846-crest.png',
  './847-crest.png',
  './manifest.webmanifest?v=hex-token-1',
  './kudos-app-192-v3.png',
  './kudos-app-512-v3.png',
  './kudos-maskable-512-v3.png',
  './apple-touch-icon-v3.png',
  './favicon-32-v3.png',
  './favicon.ico?v=hex-token-1',
  './kudos-app-192-v2.png',
  './kudos-app-512-v2.png',
  './apple-touch-icon-v2.png',
  './kudos-icon.svg?v=hex-token-1',
  './kudos-header.svg?v=brand-colours-1',
  './kudos-logo.svg?v=hex-token-1',
  './kudos-hero.svg?v=brand-colours-1'
];

// Do not cache API responses, especially authenticated notification routing.
// Cache only assets deliberately enumerated below (static logos and images).
const STATIC_PATHS = new Set(STATIC_ASSETS.map(asset => {
  return new URL(asset, self.location.href).pathname;
}));

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const path = url.pathname;

  // Authenticated and dynamic endpoints MUST always go to the network.
  // Previous versions inadvertently served cached /api/contribution-routing
  // responses, replaying obsolete "PAUSED" and recipient lists.
  if (url.origin !== self.location.origin) return;
  if (path.startsWith('/api/') || path.startsWith('/.netlify/') ||
      path.startsWith('/auth/') || event.request.headers.has('authorization')) return;

  // Let the browser handle core app code and HTML without SW interception.
  // Previously a 304 from a revalidation could be returned directly from the
  // service worker while config.js was deliberately never cached. That can
  // prevent the configuration script from executing and leave KUDOS in demo mode.
  // Native browser cache validation correctly handles 304 and is safer here.
  const isLiveAppAsset =
    event.request.mode === 'navigate' ||
    /\.(?:js|mjs|css|html|json|webmanifest)$/i.test(path) ||
    path.endsWith('/config.js');
  if (isLiveAppAsset || !STATIC_PATHS.has(path)) return;

  // Only explicitly listed static assets use the offline cache.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.ok && STATIC_PATHS.has(path)) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});


self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: 'KUDOS', body: event.data?.text?.() || 'Time to update your KUDOS progress.' }; }

  const title = data.title || 'KUDOS progress reminder';
  const options = {
    body: data.body || 'Time to update your KUDOS progress.',
    icon: data.icon || '/kudos-app-192-v3.png',
    badge: data.badge || '/kudos-app-192-v3.png',
    tag: data.tag || 'kudos-progress-reminder',
    renotify: false,
    data: data.data || { url: '/?kudos=log' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/?kudos=log', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
