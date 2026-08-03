// Enhanced Service Worker for Staff Management System
// Version 2.0 with better caching and offline support

const CACHE_NAME = 'staff-management-v5';
const STATIC_CACHE = 'staff-static-v5';
const DYNAMIC_CACHE = 'staff-dynamic-v5';
const MODELS_CACHE = 'staff-models-v2'; // Upgraded: SSD MobileNetV1 + ONNX models

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
          // SSD MobileNetV1 (upgraded from TinyFaceDetector)
          '/models/ssd_mobilenetv1_model-weights_manifest.json',
          // Face landmark (68 points — for EAR blink liveness)
          '/models/face_landmark_68_model-weights_manifest.json',
          // Face recognition (ResNet-34 descriptor)
          '/models/face_recognition_model-weights_manifest.json',
          // ONNX Ultra-Light face detector
          '/models-v2/face_detector.onnx',
        ]).catch(() => { /* non-fatal if models not yet available */ })
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
  if (url.pathname.startsWith('/models/') || url.pathname.startsWith('/models-v2/')) {
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

  // For navigation requests, use Stale-While-Revalidate for 1ms instant launch
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
            return networkResponse;
          })
          .catch(() => {
            return caches.match('/'); // Fallback to index if offline
          });
          
        return cachedResponse || fetchPromise;
      }).catch(() => {
        return caches.match('/');
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

// Background sync for offline data
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    console.log('[SW] Background sync triggered for attendance data.');
    event.waitUntil(
      self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'FLUSH_OFFLINE_QUEUE' });
        });
      })
    );
  }
});

// Listen for messages from web application clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notification handler
self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    data = { body: event.data?.text() };
  }

  const title = data.title || 'Staff Management';
  const options = {
    body: data.body || 'New notification',
    icon: data.icon || '/image.png',
    badge: data.icon || '/image.png',
    vibrate: [100, 50, 100],
    data: {
      actionUrl: data.actionUrl || '/',
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Close' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action !== 'close') {
    const targetUrl = event.notification.data?.actionUrl || '/';
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        for (let i = 0; i < windowClients.length; i++) {
          const client = windowClients[i];
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }
      })
    );
  }
});

console.log('[SW] Service Worker v2 loaded');