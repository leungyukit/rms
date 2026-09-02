// Service Worker: 离线缓存 + PWA 支持
// 使用 Network-first 策略：优先网络，离线时回退到缓存

const CACHE_NAME = 'rms-v1';

// 预缓存资源：核心页面 + 静态资源
const PRECACHE_URLS = [
  '/',
  '/login',
  '/manifest.json',
  '/logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first: 请求先走网络，失败时回退到缓存
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 缓存成功响应（非 API 请求）
        if (response.ok && !event.request.url.includes('/api/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || new Response('离线', { status: 503 });
        });
      })
  );
});