/**
 * i18n 多语言 · 表 + 配置
 * 依据：rms-docs/RMS-优化方案-阶段4-P2.md § 1
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureI18nTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    try { db.exec(`ALTER TABLE users ADD COLUMN preferred_locale VARCHAR(10) NOT NULL DEFAULT 'zh-CN'`); } catch (e) {}
  } else {
    const cols = (db.prepare(`PRAGMA table_info(users)`).all() as any[]).map((c: any) => c.name);
    if (!cols.includes('preferred_locale')) db.exec(`ALTER TABLE users ADD COLUMN preferred_locale TEXT NOT NULL DEFAULT 'zh-CN'`);
  }

  // system_config 默认值
  const defaults: [string, string][] = [
    ['i18n.default_locale', 'zh-CN'],
    ['i18n.enabled_locales', 'zh-CN,en-US'],
  ];
  for (const [k, v] of defaults) {
    try { db.prepare(`INSERT IGNORE INTO system_config(\`key\`, \`value\`) VALUES (?, ?)`).run(k, v); } catch (e) {}
    try { db.prepare(`INSERT IGNORE INTO system_config(\`key\`, \`value\`) VALUES (?, ?)`).run(k, v); } catch (e) {}
  }

  ensured = true;
}

export function getConfig(key: string, def: string = ''): string {
  const db = getDb();
  try {
    const r = db.prepare(`SELECT \`value\` FROM system_config WHERE \`key\`=?`).get(key) as any;
    return r?.value || def;
  } catch (e) {
    return def;
  }
}

export const SUPPORTED_LOCALES = ['zh-CN', 'en-US'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];

export function isValidLocale(s: string): s is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(s);
}

// 解析 locale 优先级：URL > cookie > user.preferred_locale > system_config.default > zh-CN
export function resolveLocale(opts: { urlLocale?: string; cookieLocale?: string; userLocale?: string }): Locale {
  ensureI18nTables();
  const enabled = getConfig('i18n.enabled_locales', 'zh-CN,en-US').split(',').map(s => s.trim());
  const tryLocales = [opts.urlLocale, opts.cookieLocale, opts.userLocale, getConfig('i18n.default_locale', 'zh-CN')];
  for (const l of tryLocales) {
    if (l && enabled.includes(l) && isValidLocale(l)) return l;
  }
  return 'zh-CN';
}
