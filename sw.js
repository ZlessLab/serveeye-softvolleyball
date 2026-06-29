const CACHE_NAME = 'svb4-v6-icons-20260629';
const ASSETS = [
  './soft-volleyball-score.html',
  './manifest.json?v=20260629',
  './icon-192.png?v=20260629',
  './icon-512.png?v=20260629',
  './apple-touch-icon.png?v=20260629',
  './favicon.png?v=20260629',
  './icons-generated/icon-72.png?v=20260629',
  './icons-generated/icon-96.png?v=20260629',
  './icons-generated/icon-128.png?v=20260629',
  './icons-generated/icon-144.png?v=20260629',
  './icons-generated/icon-152.png?v=20260629',
  './icons-generated/icon-256.png?v=20260629',
  './icons-generated/icon-384.png?v=20260629',
  './icons-generated/apple-touch-icon-120x120.png?v=20260629',
  './icons-generated/apple-touch-icon-152x152.png?v=20260629',
  './icons-generated/apple-touch-icon-180x180.png?v=20260629'
];

const NETWORK_FIRST_PATHS = [
  '/',
  '/soft-volleyball-score.html',
  '/manifest.json',
  '/sw.js',
  '/apple-touch-icon.png',
  '/favicon.png'
];

const isNetworkFirst = request => {
  const url = new URL(request.url);
  return request.mode === 'navigate' || NETWORK_FIRST_PATHS.includes(url.pathname);
};

const fetchAndCache = async request => {
  const response = await fetch(request, { cache: 'no-store' });
  if (request.method === 'GET' && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  if (isNetworkFirst(e.request)) {
    e.respondWith(
      fetchAndCache(e.request).catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetchAndCache(e.request))
  );
});
