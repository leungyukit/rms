/**
 * 会话存储层
 * 接口兼容 Memcache（set/get/delete/keys）
 *
 * 后端选择：启用且服务可达 → Memcache 客户端；否则降级到文件存储。
 *
 * 配置优先级（2026-09-03 改）：**环境变量 > system_config > 内置默认值**。
 *
 * 为什么改：容器化部署里 memcached 是独立容器，`system_config.memcache_host`
 * 存的却是单机时代的 `127.0.0.1` —— 在 rms-app 容器内指向自己，11211 上什么都没有，
 * 健康检查必然失败 → 静默降级到文件后端。compose 明明已注入正确的
 * `MEMCACHE_HOST=memcached`，旧实现却只读 DB，等于给了正确答案没人用。
 * （实测 63 生产：memcached 跑了 72 分钟 cmd_set=0，一个字节都没写过。）
 *
 * 环境变量：MEMCACHE_ENABLED / MEMCACHE_HOST / MEMCACHE_PORT / MEMCACHE_TTL_DAYS
 * 只有环境变量**未设置**时才回落到 system_config，所以部署方式变了不用记得去改页面配置。
 */

import fs from 'fs';
import path from 'path';
import { getAsyncDb } from '@/lib/db';

export interface ChatSession {
  id: string;
  userId: number;
  title: string;
  mode: 'basic' | 'llm' | 'openclaw';
  messages: Array<{
    role: 'user' | 'assistant';
    text: string;
    type?: string;
    url?: string;
    data?: any[];
    timestamp: number;
  }>;
  createdAt: number;
  updatedAt: number;
}

// ── 配置读取 ──────────────────────────────────────────────

export interface MemcacheConfig {
  enabled: boolean;
  host?: string;
  port?: number;
  ttlDays?: number;
  /** 各字段最终取自哪一层，便于排障时一眼看出是谁生效 */
  source?: Record<'enabled' | 'host' | 'port' | 'ttlDays', 'env' | 'db' | 'default'>;
}

export const MEMCACHE_DEFAULTS = { host: '127.0.0.1', port: 11211, ttlDays: 30 } as const;

/** 环境变量里「没设置」= undefined 或纯空白；空字符串不算有效值，否则会盖掉 DB 配置 */
function envValue(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const v = raw.trim();
  return v === '' ? undefined : v;
}

function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  return undefined; // 认不出来就当没配，交给下一层
}

function parseIntOrUndefined(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number.parseInt(v.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * 纯函数：按「环境变量 > DB > 默认值」决定最终配置。
 * 不碰 IO，方便单测覆盖优先级规则（见 src/__tests__/memcache-config.test.ts）。
 */
export function resolveMemcacheConfig(
  env: Record<string, string | undefined>,
  dbValues: Record<string, string | undefined> = {},
): MemcacheConfig {
  const pick = <T>(
    envRaw: string | undefined,
    dbRaw: string | undefined,
    parse: (v: string | undefined) => T | undefined,
    fallback: T,
  ): { value: T; from: 'env' | 'db' | 'default' } => {
    const fromEnv = parse(envValue(envRaw));
    if (fromEnv !== undefined) return { value: fromEnv, from: 'env' };
    const fromDb = parse(envValue(dbRaw));
    if (fromDb !== undefined) return { value: fromDb, from: 'db' };
    return { value: fallback, from: 'default' };
  };

  // 默认不启用：没人明确打开就别连外部服务
  const enabled = pick(env.MEMCACHE_ENABLED, dbValues.memcache_enabled, parseBool, false);
  const host = pick(env.MEMCACHE_HOST, dbValues.memcache_host, (v) => v, MEMCACHE_DEFAULTS.host);
  const port = pick(env.MEMCACHE_PORT, dbValues.memcache_port, parseIntOrUndefined, MEMCACHE_DEFAULTS.port);
  const ttlDays = pick(env.MEMCACHE_TTL_DAYS, dbValues.memcache_ttl_days, parseIntOrUndefined, MEMCACHE_DEFAULTS.ttlDays);

  const source = {
    enabled: enabled.from,
    host: host.from,
    port: port.from,
    ttlDays: ttlDays.from,
  } as const;

  if (!enabled.value) return { enabled: false, source };

  return {
    enabled: true,
    host: host.value,
    port: port.value,
    ttlDays: ttlDays.value,
    source,
  };
}

const MEMCACHE_CONFIG_KEYS = [
  'memcache_enabled',
  'memcache_host',
  'memcache_port',
  'memcache_ttl_days',
] as const;

export async function getMemcacheConfig(): Promise<MemcacheConfig> {
  let dbValues: Record<string, string | undefined> = {};

  // DB 读失败不再直接判定「禁用」—— 环境变量已经足够决定配置，
  // 否则一次数据库抖动就会把会话后端悄悄切走。
  try {
    const db = getAsyncDb();
    const rows = (await db
      .prepare(
        "SELECT `key`, `value` FROM system_config WHERE `key` IN ('memcache_enabled','memcache_host','memcache_port','memcache_ttl_days')",
      )
      .all()) as any[];
    for (const r of rows || []) {
      if (MEMCACHE_CONFIG_KEYS.includes(r?.key)) dbValues[r.key] = r?.value == null ? undefined : String(r.value);
    }
  } catch {
    dbValues = {};
  }

  return resolveMemcacheConfig(process.env, dbValues);
}

// ── 文件后端（当前默认，兼容 Memcache 接口） ─────────────
const BASE_DIR = path.join(process.cwd(), 'data', 'chat-sessions');
const SESSION_TTL_MS = 86400 * 30 * 1000;

function ensureBaseDir(): void {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
}

function userDir(userId: number): string {
  return path.join(BASE_DIR, String(userId));
}

function sessionPath(userId: number, sessionId: string): string {
  return path.join(userDir(userId), `${sessionId}.json`);
}

function indexPath(userId: number): string {
  return path.join(userDir(userId), 'index.json');
}

function updateIndex(userId: number, sessionId: string): void {
  const p = indexPath(userId);
  let list: string[] = [];
  if (fs.existsSync(p)) {
    try { list = JSON.parse(fs.readFileSync(p, 'utf-8')); } catch {}
  }
  list = [sessionId, ...list.filter((id: string) => id !== sessionId)];
  list = list.filter((id: string) => fs.existsSync(sessionPath(userId, id)));
  fs.writeFileSync(p, JSON.stringify(list), 'utf-8');
}

function removeFromIndex(userId: number, sessionId: string): void {
  const p = indexPath(userId);
  if (!fs.existsSync(p)) return;
  try {
    const list: string[] = JSON.parse(fs.readFileSync(p, 'utf-8'));
    fs.writeFileSync(p, JSON.stringify(list.filter((id: string) => id !== sessionId)), 'utf-8');
  } catch {}
}

const fileStore = {
  set(key: string, value: string, _ttl?: number): void {
    ensureBaseDir();
    const m = key.match(/^chat:session:(\d+):(.+)$/);
    if (!m) return;
    const uid = Number(m[1]), sid = m[2];
    const ud = userDir(uid);
    if (!fs.existsSync(ud)) fs.mkdirSync(ud, { recursive: true });
    fs.writeFileSync(sessionPath(uid, sid), value, 'utf-8');
    updateIndex(uid, sid);

    const um = key.match(/^chat:user_sessions:(\d+)$/);
    if (um) {
      const ud2 = userDir(Number(um[1]));
      if (!fs.existsSync(ud2)) fs.mkdirSync(ud2, { recursive: true });
      fs.writeFileSync(indexPath(Number(um[1])), value, 'utf-8');
    }
  },

  get(key: string): string | null {
    const m = key.match(/^chat:user_sessions:(\d+)$/);
    if (m) {
      const p = indexPath(Number(m[1]));
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
    }
    const sm = key.match(/^chat:session:(\d+):(.+)$/);
    if (!sm) return null;
    const p = sessionPath(Number(sm[1]), sm[2]);
    if (!fs.existsSync(p)) return null;
    const stat = fs.statSync(p);
    if (Date.now() - stat.mtimeMs > SESSION_TTL_MS) { fs.unlinkSync(p); return null; }
    return fs.readFileSync(p, 'utf-8');
  },

  delete(key: string): void {
    const um = key.match(/^chat:user_sessions:(\d+)$/);
    if (um) {
      const p = indexPath(Number(um[1]));
      if (fs.existsSync(p)) fs.unlinkSync(p);
      return;
    }
    const m = key.match(/^chat:session:(\d+):(.+)$/);
    if (!m) return;
    const p = sessionPath(Number(m[1]), m[2]);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    removeFromIndex(Number(m[1]), m[2]);
  },

  keys(prefix?: string): string[] {
    if (!prefix) return [];
    const m = prefix.match(/^chat:session:(\d+):/);
    if (!m) return [];
    const ud = userDir(Number(m[1]));
    if (!fs.existsSync(ud)) return [];
    const now = Date.now();
    return fs.readdirSync(ud)
      .filter(f => f.endsWith('.json') && f !== 'index.json')
      .filter(f => {
        const p = path.join(ud, f);
        const s = fs.statSync(p);
        if (now - s.mtimeMs > SESSION_TTL_MS) { fs.unlinkSync(p); return false; }
        return true;
      })
      .map(f => `chat:session:${m[1]}:${f.replace('.json', '')}`);
  },

  listSessions(userId: number): any[] {
    const p = indexPath(userId);
    if (!fs.existsSync(p)) return [];
    try {
      const ids: string[] = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return ids
        .map(id => {
          try {
            const raw = fs.readFileSync(sessionPath(userId, id), 'utf-8');
            const session = JSON.parse(raw);
            // 只返回属于当前用户的会话（防止跨用户共享）
            if (session.userId !== userId) return null;
            return { ...session, id };
          } catch { return null; }
        })
        .filter(Boolean);
    } catch { return []; }
  },

  createSession(userId: number, title: string): any {
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const session: any = { id, userId, title, mode: 'basic', messages: [], createdAt: now, updatedAt: now };
    const key = sessionKey(userId, id);
    this.set(key, JSON.stringify(session));
    return session;
  },

  getSession(userId: number, sessionId: string): any | null {
    const p = sessionPath(userId, sessionId);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
  },

  appendMessage(sessionId: string, userId: number, msg: any): void {
    const session = this.getSession(userId, sessionId);
    if (!session) return;
    session.messages = session.messages || [];
    session.messages.push(msg);
    session.updatedAt = Date.now();
    this.set(sessionKey(userId, sessionId), JSON.stringify(session));
  },
};

// ── Memcache 后端（懒加载，失败降级到文件） ──────────────
// 客户端按 host:port 归档：配置改了要能真正生效，不能一直复用指向老地址的连接。
let memcacheClient: any = null;
let memcacheClientTarget = '';
let memcacheNextRetryAt = 0;

/** 连不上时的重试冷却：否则每个请求都要等一次 TCP 超时，页面被拖死 */
const MEMCACHE_RETRY_COOLDOWN_MS = 30_000;

// 只在后端真正变化时打日志，避免每请求刷屏。
// 这条日志正是本次 bug 的教训：旧实现静默降级，线上跑了几个月都没人发现
// memcached 一个字节都没写过（实测 63 生产 cmd_set=0）。
let lastLoggedBackend = '';
function logBackendOnce(desc: string): void {
  if (lastLoggedBackend === desc) return;
  lastLoggedBackend = desc;
  console.log(`[chat-store] 会话存储后端: ${desc}`);
}

async function getMemcacheClient(config: { host: string; port: number }) {
  const target = `${config.host}:${config.port}`;

  // 目标变了（改了配置/换了部署形态）→ 丢弃旧客户端重连
  if (memcacheClient && memcacheClientTarget !== target) {
    try { (memcacheClient as any).end?.(); } catch { /* 关不掉就交给 GC */ }
    memcacheClient = null;
    memcacheNextRetryAt = 0;
  }

  if (memcacheClient) return memcacheClient;
  if (Date.now() < memcacheNextRetryAt) return null; // 冷却中，直接走文件后端

  try {
    const { Memcache, createNode } = await import('memcache');
    const client = new Memcache();
    const node = createNode(config.host, config.port);
    (client as any).addNode(node);

    // 健康检查：用 set + get 做一次 ping（Promise API）
    await client.set('__health_check__', '1', 5);
    await client.get('__health_check__');

    memcacheClient = client;
    memcacheClientTarget = target;
    memcacheNextRetryAt = 0;
    logBackendOnce(`Memcache (${target})`);
    return client;
  } catch (e: any) {
    memcacheClient = null;
    memcacheNextRetryAt = Date.now() + MEMCACHE_RETRY_COOLDOWN_MS;
    logBackendOnce(`文件存储（Memcache ${target} 不可达：${e?.message || e}）`);
    return null;
  }
}

// ── 统一接口（同步，供 route 层调用） ─────────────────────
// 为兼容现有同步调用，getChatStore 返回的文件 store 始终可用；
// 当 Memcache 启用时，通过 getMemcacheStore() 获取 Memcache 版
export function getFileChatStore() {
  return fileStore;
}

export async function getMemcacheChatStore() {
  const config = await getMemcacheConfig();
  if (!config.enabled || !config.host || !config.port) {
    logBackendOnce('文件存储（Memcache 未启用）');
    return getFileChatStore();
  }

  const client = await getMemcacheClient({ host: config.host, port: config.port });
  if (!client) return getFileChatStore(); // 降级

  const ttlSec = (config.ttlDays ?? MEMCACHE_DEFAULTS.ttlDays) * 86400;

  return {
    async set(key: string, value: string, ttl?: number): Promise<void> {
      try {
        await client.set(key, value, ttl || ttlSec);
      } catch {
        fileStore.set(key, value, ttl);
      }
    },
    async get(key: string): Promise<string | null> {
      try {
        const val = await client.get(key);
        return val || null;
      } catch {
        return fileStore.get(key);
      }
    },
    async delete(key: string): Promise<void> {
      try { await client.delete(key); } catch { fileStore.delete(key); }
    },
    async keys(prefix?: string): Promise<string[]> {
      try { return (await client.keys(prefix)) || []; } catch { return fileStore.keys(prefix); }
    },
  };
}

// 兼容旧调用（默认走文件，route 层可选择用 getMemcacheChatStore）
export function getChatStore() {
  return fileStore;
}

// Key 生成
export function sessionKey(userId: number, sessionId: string): string {
  return `chat:session:${userId}:${sessionId}`;
}

export function userSessionsKey(userId: number): string {
  return `chat:user_sessions:${userId}`;
}

export const SESSION_TTL = 86400 * 30; // 秒
