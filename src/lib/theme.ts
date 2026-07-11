'use client';

const KEY = 'rms-theme';
const API_THEME = '/api/user/theme';

export function initTheme() {
  const stored = getStoredTheme();
  const theme = stored || getSystemTheme();
  applyTheme(theme);
  return theme;
}

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getStoredTheme(): 'light' | 'dark' | null {
  if (typeof window === 'undefined') return null;
  const v = localStorage.getItem(KEY);
  return v === 'dark' ? 'dark' : v === 'light' ? 'light' : null;
}

export function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.setAttribute('data-theme', theme);
  root.classList.add(theme);
}

export function toggleTheme(): 'light' | 'dark' {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(KEY, next);
  // Persist to server
  if (typeof window !== 'undefined') {
    const token = document.cookie.match(/rms_token=([^;]+)/)?.[1];
    if (token) {
      fetch(API_THEME, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ theme: next }),
      }).catch(() => {});
    }
  }
  return next;
}

export function resolveEffective(themePref: string): 'light' | 'dark' {
  if (themePref === 'system' || !themePref) return getSystemTheme();
  return themePref as 'light' | 'dark';
}

export function applyAndStore(theme: 'light' | 'dark') {
  applyTheme(theme);
  localStorage.setItem(KEY, theme);
}

export async function loadThemeFromServer(): Promise<string> {
  try {
    const res = await fetch(API_THEME, { credentials: 'include' });
    const data = await res.json();
    if (data.success && data.theme) return data.theme;
  } catch { /* ignore */ }
  return 'system';
}

export async function saveThemeToServer(theme: 'light' | 'dark' | 'system') {
  try {
    await fetch(API_THEME, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ theme }),
    });
  } catch { /* ignore */ }
}
