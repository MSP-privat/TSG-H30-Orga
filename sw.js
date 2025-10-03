// sw.js — Minimal, stabil, ohne komplexe Caching-Regeln
const CACHE_VERSION = 'v6-min';
const CACHE_NAME = `tsg-${CACHE_VERSION}`;
const CORE = ['/', '/index.html', '/styles/style.css', '/assets/club_logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(CORE))
      .catch(() => void 0)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Nur GET und http/https anfassen
  if (req.method !== 'GET') return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Wichtige Dateien nie abfangen: SW selbst, Manifest, env.js
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest' || url.pathname === '/env.js') {
    return;
  }

  // Netzwerk zuerst, Fallback: Cache
  event.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});
