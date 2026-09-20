const CACHE = 'kudos-v14-push-reminders';
const STATIC_ASSETS = [
  './hero-merlin.png',
  './chf-crest.png',
  './845-crest.png',
  './846-crest.png',
  './847-crest.png',
  './manifest.webmanifest?v=3',
  './kudos-app-192-v2.png',
  './kudos-app-512-v2.png',
  './apple-touch-icon-v2.png',
  './kudos-icon.svg',
  './kudos-header.svg'
];

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

  // Always prefer the network for the application shell/code so new
  // GitHub/Netlify deployments appear immediately.
  const isAppCode =
    event.request.mode === 'navigate' ||
    path.endsWith('/index.html') ||
    path.endsWith('/app.js') ||
    path.endsWith('/styles.css') ||
    path.endsWith('/config.js') ||
    path.endsWith('/manifest.webmanifest');

  if (isAppCode) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.ok && !path.endsWith('/config.js')) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Images/manifest can be cache-first.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.ok && url.origin === self.location.origin) {
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
    icon: data.icon || '/kudos-app-192-v2.png',
    badge: data.badge || '/kudos-app-192-v2.png',
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
