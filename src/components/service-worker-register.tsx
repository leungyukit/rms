'use client';

import { useEffect } from 'react';

/**
 * PWA Service Worker 注册组件
 * 只在客户端和浏览器环境注册
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 静默失败，不阻塞页面
      });
    }
  }, []);

  return null;
}