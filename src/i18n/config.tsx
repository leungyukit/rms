/**
 * i18n Provider + useT hook
 * 客户端切换：URL ?lang= > cookie rms_locale > user preferred > default
 */
'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import zhCN from './messages/zh-CN.json';
import enUS from './messages/en-US.json';

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];

const MESSAGES: Record<Locale, any> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};

const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English',
};

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name: string, value: string, days = 365) {
  if (typeof document === 'undefined') return;
  const expires = new Date(Date.now() + days * 86400_000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Expires=${expires}; SameSite=Lax`;
}

function detectInitialLocale(): Locale {
  // URL ?lang=
  if (typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    const l = url.searchParams.get('lang');
    if (l && (SUPPORTED_LOCALES as readonly string[]).includes(l)) return l as Locale;
  }
  // cookie
  const c = getCookie('rms_locale');
  if (c && (SUPPORTED_LOCALES as readonly string[]).includes(c)) return c as Locale;
  // 浏览器语言
  if (typeof navigator !== 'undefined') {
    const bl = navigator.language;
    if (bl.startsWith('en')) return 'en-US';
  }
  return 'zh-CN';
}

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale, persist?: boolean) => Promise<void>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  localeLabel: string;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale || 'zh-CN');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const detected = detectInitialLocale();
    setLocaleState(detected);
    setHydrated(true);
  }, []);

  const setLocale = useCallback(async (l: Locale, persist = true) => {
    setLocaleState(l);
    if (persist) {
      setCookie('rms_locale', l);
      // 同步到后端
      try { await fetch('/api/i18n/locale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: l }) }); } catch (e) {}
    }
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    const msgs = MESSAGES[locale] || MESSAGES['zh-CN'];
    const parts = key.split('.');
    let cur: any = msgs;
    for (const p of parts) { if (cur == null) break; cur = cur[p]; }
    let s: string;
    if (typeof cur === 'string') {
      s = cur;
    } else {
      // 找不到 key 时不返回 raw key（避免“代码模式”显示），改取最后一段首字母大写
      const last = parts[parts.length - 1] || key;
      s = last.charAt(0).toUpperCase() + last.slice(1).replace(/([A-Z])/g, ' $1');
    }
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    return s;
  }, [locale]);

  const value: I18nContextType = { locale, setLocale, t, localeLabel: LOCALE_LABELS[locale] };
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // 兜底返回 key 本身（无 Provider 场景）
    return { t: (k: string) => k, locale: 'zh-CN' as Locale, setLocale: async () => {}, localeLabel: '简体中文' };
  }
  return ctx;
}

// LocaleSwitcher 组件
export function LocaleSwitcher() {
  const { locale, setLocale, localeLabel } = useT();
  return (
    <select
      value={locale}
      onChange={e => setLocale(e.target.value as Locale)}
      className="text-xs font-medium border border-gray-500 rounded px-2.5 py-1 bg-gray-700 text-white hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
      title="Language"
      style={{ colorScheme: 'dark' }}
    >
      {SUPPORTED_LOCALES.map(l => (
        <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
      ))}
    </select>
  );
}
