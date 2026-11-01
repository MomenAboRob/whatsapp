// Hawalat App - Minimal High-Performance Service Worker for PWA
const CACHE_NAME = 'hawalat-pwa-v5';
const STATIC_ASSETS = [
  '/manifest.webmanifest',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/icon.png',
  '/favicon.ico',
];

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const title = payload.title || 'رسالة واتساب جديدة';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || 'وصلتك رسالة جديدة',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || `whatsapp-${Date.now()}`,
    data: { url: payload.url || '/' },
    dir: 'rtl',
    lang: 'ar',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.location.origin));
    if (existing) return existing.focus();
    return self.clients.openWindow(target);
  }));
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA: Some static assets failed to precache:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
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

self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Bypass API requests, Media images, Avatars, WebSocket, dynamic streams, and Baileys
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/media/') ||
    url.pathname.startsWith('/avatars/') ||
    url.pathname.startsWith('/_next/webpack-hmr') ||
    url.pathname.includes('/socket.io/')
  ) {
    return;
  }

  // ملفات Next المرقمة باسم المحتوى لا تتغير؛ احتفظ بها على الهاتف لتقليل طلبات النفق عند كل فتح.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
        }
        return response;
      }))
    );
    return;
  }

  // Network-first strategy with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache static icon and image files for instant reload
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.pathname.startsWith('/icons/') ||
           url.pathname.endsWith('.png') ||
           url.pathname.endsWith('.ico') ||
           url.pathname.endsWith('.webmanifest'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fallback to cache if network is offline/slow
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // لا تعرض نسخة قديمة من النظام عندما يكون السيرفر غير متاح.
          if (event.request.mode === 'navigate') {
            return new Response('السيرفر غير متصل حالياً. تأكد من تشغيله ثم أعد فتح التطبيق.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
            });
          }
          return new Response('Network offline', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
