const CACHE = 'remote-browser-shell-v2';
const ASSETS = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !ASSETS.includes(url.pathname) || url.search) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
