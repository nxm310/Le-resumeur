const CACHE_NAME = 'le-resumeur-v3';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/gemini.js',
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
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
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  
  // Let Gemini API and CORS Proxy calls bypass the cache
  if (
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('allorigins') ||
    url.hostname.includes('corsproxy')
  ) {
    return; // Fetch from network normally
  }

  // Network First Caching Strategy (Online-first, offline fallback)
  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // Cache valid responses from our own domain
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if network fails (offline)
        return caches.match(e.request);
      })
  );
});
