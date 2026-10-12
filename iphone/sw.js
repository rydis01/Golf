'use strict';
const CACHE = 'golf-caddie-iphone-83050ef76c147a32';
const ASSETS = ['./', './index.html', './install.js', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', ...["./guides/links-01.png", "./guides/links-02.png", "./guides/links-03.png", "./guides/links-04.png", "./guides/links-05.png", "./guides/links-06.png", "./guides/links-07.png", "./guides/links-08.png", "./guides/links-09.png", "./guides/links-10.png", "./guides/links-11.png", "./guides/links-12.png", "./guides/links-13.png", "./guides/links-14.png", "./guides/links-15.webp", "./guides/links-16.png", "./guides/links-17.png", "./guides/links-18.png", "./guides/lakes-01.png", "./guides/lakes-02.png", "./guides/lakes-03.png", "./guides/lakes-04.webp", "./guides/lakes-05.png", "./guides/lakes-06.webp", "./guides/lakes-07.png", "./guides/lakes-08.png", "./guides/lakes-09.png", "./guides/lakes-10.png", "./guides/lakes-11.png", "./guides/lakes-12.png", "./guides/lakes-13.png", "./guides/lakes-14.png", "./guides/lakes-15.png", "./guides/lakes-16.png", "./guides/lakes-17.png", "./guides/lakes-18.png"]];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('golf-caddie-iphone-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // External imagery/weather are fetched normally, never bulk-downloaded for offline use.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.open(CACHE).then(cache => cache.match('./index.html'))));
  } else {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
  }
});
