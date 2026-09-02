'use client';

import { useEffect } from 'react';

/**
 * PWA 支持（2026-09-02 调整）
 *
 * 现状：**Service Worker 暂不启用**，只保留 manifest.json
 * —— 手机仍可「添加到主屏幕」，但不做离线缓存。
 *
 * 为什么撤掉：
 * 同日 58 出过一次 `Application error: a client-side exception`，根因是
 * 浏览器拿着旧 HTML 去请求已被新构建覆盖的 chunk。SW 的离线缓存属于
 * 同一类风险（缓存的 HTML/chunk 与服务端产物版本错位），生产环境不叠这个风险。
 *
 * 这个组件现在做的是**反向清理**：
 * 之前的版本确实注册过 `/sw.js`，已经装上的浏览器不会自己撤销。
 * 所以这里主动 unregister + 清掉 rms-* 缓存，否则那批用户会一直被旧缓存粘住。
 *
 * 要重新启用时：删掉 cleanup 逻辑，恢复 register('/sw.js')，
 * 并且必须先想清楚 HTML 用 network-only、只缓存带 hash 的静态资源。
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    // 注销此前注册过的 SW
    navigator.serviceWorker
      .getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister())))
      .catch(() => {});

    // 清掉 SW 留下的缓存（只删自己的 rms- 前缀，不碰别人的）
    if ('caches' in window) {
      caches
        .keys()
        .then(keys => Promise.all(keys.filter(k => k.startsWith('rms-')).map(k => caches.delete(k))))
        .catch(() => {});
    }
  }, []);

  return null;
}