import type { Metadata, Viewport } from 'next';
import { I18nProvider } from '@/i18n/config';
import ServiceWorkerRegister from '@/components/service-worker-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'RMS - 用户需求管理系统',
  description: '需求收集、管理、跟踪与分析',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'RMS', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#24B47E',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <I18nProvider>{children}</I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
