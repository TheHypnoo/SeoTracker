const CACHE_VERSION = 'seotracker-pwa-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/favicon.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/logo192.png',
  '/logo512.png',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        const staleCaches = [];

        for (const cacheName of cacheNames) {
          if (cacheName.startsWith('seotracker-pwa-') && cacheName !== STATIC_CACHE) {
            staleCaches.push(caches.delete(cacheName));
          }
        }

        return Promise.all(staleCaches);
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(request.url);

  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        return cache.match(OFFLINE_URL);
      }),
    );
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(cacheFirst(request));
  }
});

function isStaticAssetRequest(request) {
  const { pathname } = new URL(request.url);
  return (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/images/') ||
    pathname === '/manifest.json' ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.woff2')
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }

  return response;
}
