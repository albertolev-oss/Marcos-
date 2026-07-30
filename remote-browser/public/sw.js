const CACHE='remote-browser-shell-v1'; const ASSETS=['/','/styles.css','/app.js','/manifest.webmanifest','/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===location.origin&&!e.request.url.includes('/api/')&&!e.request.url.includes('/novnc/'))e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});
