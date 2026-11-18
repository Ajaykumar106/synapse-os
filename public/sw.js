// Synapse OS — Auto-Updating Service Worker v3.2.0
// Ensures PWA auto-updates seamlessly when online & works 100% offline in Airplane Mode

const CACHE_NAME = 'synapse-os-v3.2.1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/icon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.json',
  '/privacy.html'
];

// Allow page to tell service worker to activate immediately
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Install: pre-cache core shell assets and skip waiting immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-cache partial notice:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: delete ALL legacy caches (including synapse-os-v1) and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => {
          console.log('[SW] Deleting legacy cache:', k);
          return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch handler: Network-First for HTML/JS/CSS to ensure auto-updates, Cache-Fallback for 100% offline
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. API Calls: Network only, with clean offline JSON error fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => {
        return new Response(JSON.stringify({ error: 'Offline — local mode active' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 2. Navigation / HTML requests: Network-First with Cache Fallback
  // This guarantees that whenever user is online, they get the latest app version instantly!
  if (req.mode === 'navigate' || req.destination === 'document' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => {
          return caches.match(req).then((cached) => {
            return cached || caches.match('/index.html') || caches.match('/');
          });
        })
    );
    return;
  }

  // 3. Scripts and Stylesheets: Network-First with Cache Fallback
  // If online, fetches updated code; if offline (Airplane mode), loads from cache immediately
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 4. Static Images, Icons, and Fonts: Network-First to guarantee fresh branding/icons, with offline cache fallback
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkRes;
      })
      .catch(() => {
        return caches.match(req).then((cached) => cached || caches.match('/icon.svg'));
      })
  );
});
