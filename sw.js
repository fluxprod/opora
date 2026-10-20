/* Офлайн-режим: сеть приоритетнее, кэш — запасной вариант. */
const CACHE = 'opora-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './fonts/manrope-cyrillic-wght-normal.woff2',
  './fonts/manrope-latin-wght-normal.woff2',
  './js/app.js',
  './js/diag.js',
  './js/tg.js',
  './js/core.js',
  './js/schema.js',
  './js/store.js',
  './js/commands.js',
  './js/ui.js',
  './js/charts.js',
  './js/components.js',
  './js/period.js',
  './js/txform.js',
  './js/views/home.js',
  './js/views/accounts.js',
  './js/views/envelopes.js',
  './js/views/tax.js',
  './js/views/history.js',
  './js/views/stats.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') return caches.match('./index.html');
          return new Response('Офлайн', { status: 503, statusText: 'Offline' });
        }),
      ),
  );
});
