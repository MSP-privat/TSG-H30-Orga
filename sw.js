// sw.js — network-first für App-Logik, cache-first nur für Bilder/Fonts
const CACHE_VERSION = 'v5';
const CACHE_NAME = `tsg-static-${CACHE_VERSION}`;

// Ein paar Core-Dateien für Offline-Fallback (nur leichtgewichtiges Minimum)
const CORE = [
  './',
  './index.html',
  './styles/style.css',
  './assets/club_logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CORE).catch(() => void 0))
  );
  self.skipWaiting(); // neue SW-Version sofort übernehmbar
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim();
});

function isSupabase(u) {
  return u.hostname.endsWith('.supabase.co') || u.hostname.endsWith('.supabase.in');
}
function isHTML(req, url) {
  return req.mode === 'navigate' ||
         url.pathname.endsWith('.html') ||
         (req.headers.get('accept') || '').includes('text/html') ||
         url.pathname === '/';
}
function isJSorCSS(url) {
  return url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
}
function isStaticAsset(url) {
  return /\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf|eot)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Nur GET und http/https anfassen
  if (req.method !== 'GET') return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Supabase, Manifest, env.js, SW selbst: niemals abfangen/cachen
  if (
    isSupabase(url) ||
    url.pathname === '/env.js' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/sw.js'
  ) {
    return; // direkt ans Netz durchreichen
  }

  // HTML: network-first (immer aktuelle App-UI); Fallback: gecachte index.html
  if (isHTML(req, url)) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy)).catch(() => void 0);
        return res;
      }).catch(() =>
        caches.match(re
