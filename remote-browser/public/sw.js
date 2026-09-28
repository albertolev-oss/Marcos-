const CACHE = 'remote-browser-shell-v3';
const ASSETS = ['/', '/styles.css', '/app.js', '/manifest.webmanifest', '/icon.svg'];
async function isDemo() {
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) return false;
    const config = await response.json();
    return (config.mode || 'demo') === 'demo';
  } catch { return false; }
}
async function clearShellCaches(keepCurrent = false) {
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith('remote-browser-shell-') && (!keepCurrent || key !== CACHE)).map(key => caches.delete(key)));
}
self.addEventListener('install', event => event.waitUntil((async () => {
  if (await isDemo()) await (await caches.open(CACHE)).addAll(ASSETS);
  else { await clearShellCaches(); await self.registration.unregister(); }
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const demo = await isDemo();
  await clearShellCaches(demo);
  if (demo) await self.clients.claim();
  else await self.registration.unregister();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !ASSETS.includes(url.pathname) || url.search) return;
  event.respondWith(fetch(event.request).catch(async error => {
    // A changed or unavailable profile must not receive a cached demo shell.
    if (!(await isDemo())) throw error;
    return (await caches.match(event.request)) || Promise.reject(error);
  }));
});
