// Service Worker for Gang Style Barbershop
// Strategy: Network-First with instant activation.
// Ensures maintenance updates, price changes, and new schedule slots appear INSTANTLY on client phones.

const CACHE_NAME = 'gangstyle-pwa-v1';

// Install event: skip waiting immediately to guarantee clients receive the newest version
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event: claim all client windows immediately and clear stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Network-First
// Always tries to fetch the freshest version from the server first.
// If the server returns a response, use it immediately (so maintenance is instant).
self.addEventListener('fetch', (event) => {
  // Only handle HTTP/HTTPS GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API calls from cache to always query fresh live data from MongoDB
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache only when user is completely offline without internet
        return caches.match(event.request);
      })
  );
});
