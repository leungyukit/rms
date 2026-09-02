// RMS Service Worker —— 自毁版（2026-09-02）
//
// 背景：此前的版本在这里做 Network-first 离线缓存。同日 58 出过一次
// `Application error: a client-side exception`，根因是浏览器拿着旧 HTML
// 去请求已被新构建覆盖的 chunk。SW 缓存属于同一类风险，生产暂不启用。
//
// 为什么不直接删掉这个文件：
// 已经装上 SW 的浏览器会定期 fetch /sw.js 检查更新。文件 404 时浏览器
// 不保证注销旧 SW（多数实现会保留正在运行的那个）。所以留一个空壳，
// 让它接管后立刻自我注销、清掉自己的缓存、刷新所有打开的页面。
//
// 要重新启用缓存时：别再缓存 HTML（用 network-only），只缓存带内容 hash
// 的静态资源，否则今天这个坑还会再踩一次。

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 清掉旧版本留下的缓存（只动自己的 rms- 前缀）
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith('rms-')).map((k) => caches.delete(k)));
      } catch {}

      // 注销自己
      try {
        await self.registration.unregister();
      } catch {}

      // 让已打开的页面重新走网络，避免继续用旧缓存
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) client.navigate(client.url);
      } catch {}
    })()
  );
});

// 不拦截任何请求：全部直接走网络
