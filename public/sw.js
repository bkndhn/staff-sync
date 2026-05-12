// Enhanced Service Worker for Staff Management System
// Version 2.0 with better caching and offline support

const CACHE_NAME = 'staff-management-v3';
const STATIC_CACHE = 'staff-static-v3';
const DYNAMIC_CACHE = 'staff-dynamic-v3';
const MODELS_CACHE = 'staff-models-v1'; // face-api model binaries — separate cache, long-lived

// Static assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/image.png',
  '/manifest.json'
];

// Install event - cache static assets + face-api models
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker v3...');
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
      // Pre-cache face-api model shards so they load from disk (~1s vs ~20s CDN)
      caches.open(MODELS_CACHE).then((cache) =>
        cache.addAll([
          '/models/tiny_face_detector_model-weights_manifest.json',
          '/models/tiny_face_detector_model-shard1',
          '/models/face_landmark_68_model-weights_manifest.json',
          '/models/face_landmark_68_model-shard1',
          '/models/face_recognition_model-weights_manifest.json',
          '/models/face_recognition_model-shard1',
          '/models/face_recognition_model-shard2',
        ]).catch(() => { /* non-fatal if models not yet copied */ })
      ),
    ]).then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker v3...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            return cacheName !== STATIC_CACHE &&
              cacheName !== DYNAMIC_CACHE &&
              cacheName !== MODELS_CACHE &&
              cacheName.startsWith('staff-');
          })
          .map((cacheName) => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: serve /models/* from dedicated cache (cache-first, long-lived)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/models/')) {
    event.respondWith(
      caches.open(MODELS_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const resp = await fetch(event.request);
        if (resp.ok) cache.put(event.request, resp.clone());
        return resp;
      })
    );
    return;
  }
});


// Fetch event - Network first with cache fallback strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests and Supabase API calls
  if (!url.origin.includes(self.location.origin) ||
    url.href.includes('supabase.co')) {
    return;
  }

  // For navigation requests, use network first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone and cache the response
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // Fallback to cache
          return caches.match(request).then((cachedResponse) => {
            return cachedResponse || caches.match('/');
          });
        })
    );
    return;
  }

  // For static assets (JS, CSS, images), use cache first
  if (request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Return cache and update in background
          fetch(request).then((response) => {
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, response);
            });
          });
          return cachedResponse;
        }

        // Not in cache, fetch and cache
        return fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        });
      })
    );
    return;
  }

  // Default: network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(request, responseClone);
        });
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Background sync for offline data (if supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    console.log('[SW] Syncing attendance data...');
    // Handle background sync for attendance
  }
});

// Push notification handler
self.addEventListener('push', (event) => {
  const options = {
    body: event.data?.text() || 'New notification from Staff Management',
    icon: '/image.png',
    badge: '/image.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      { action: 'open', title: 'Open App' },
      { action: 'close', title: 'Close' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('Staff Management', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

console.log('[SW] Service Worker v2 loaded');