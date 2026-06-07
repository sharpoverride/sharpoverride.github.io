const CACHE_NAME = 'bistro-gem-v2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './css/app.min.css',
  './manifest.json',
  './favicon.png',
  './recipes.json',
  './js/wakelock.js',
  './js/imageupload.js'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching App Shell');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (e) => {
  // Only handle HTTP/HTTPS requests (avoid chrome-extension etc.)
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Avoid caching POST, PUT, DELETE
  if (e.request.method !== 'GET') {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        // Cache new dynamically requested assets (like recipe images)
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, cacheCopy);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.log('Fetch failed, returning cached version if available:', err);
      });

      // Return cached response if exists, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
