import type { Metadata } from 'next';
import { I18nProvider } from '@/i18n/config';
import './globals.css';

export const metadata: Metadata = {
  title: 'RMS - 用户需求管理系统',
  description: '需求收集、管理、跟踪与分析',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
