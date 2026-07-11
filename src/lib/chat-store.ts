/**
 * 会话存储层
 * 接口兼容 Memcache（set/get/delete/keys）
 * 根据 system_config 的 memcache_enabled 动态选择后端：
 *   - true 且服务可达 → 用 Memcache 客户端
 *   - 否则 → 降级到文件存储
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
export async function getMemcacheConfig() {
  try {
    const db = getAsyncDb();
    const row = (await db.prepare("SELECT value FROM system_config WHERE `key` = 'memcache_enabled'").get()) as any;
    const enabled = String(row?.value || 'false').toLowerCase() === 'true';
    if (!enabled) return { enabled: false };

    const hostRow = (await db.prepare("SELECT value FROM system_config WHERE `key` = 'memcache_host'").get()) as any;
    const portRow = (await db.prepare("SELECT value FROM system_config WHERE `key` = 'memcache_port'").get()) as any;
    const ttlRow = (await db.prepare("SELECT value FROM system_config WHERE `key` = 'memcache_ttl_days'").get()) as any;

    return {
      enabled: true,
      host: String(hostRow?.value || '127.0.0.1'),
      port: parseInt(String(portRow?.value || '11211'), 10),
      ttlDays: parseInt(String(ttlRow?.value || '30'), 10),
    };
  } catch {
    return { enabled: false };
  }
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
let memcacheClient: any = null;
let memcacheHealthy = false;

async function getMemcacheClient(config: { host: string; port: number }) {
  if (memcacheClient && memcacheHealthy) return memcacheClient;

  try {
    const { Memcache, createNode } = await import('memcache');
    const client = new Memcache();
    const node = createNode(config.host, config.port);
    (client as any).addNode(node);

    // 健康检查：用 set + get 做一次 ping（Promise API）
    await client.set('__health_check__', '1', 5);
    await client.get('__health_check__');

    memcacheClient = client;
    memcacheHealthy = true;
    return client;
  } catch {
    memcacheHealthy = false;
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
  if (!config.enabled || !config.host || !config.port) return getFileChatStore();

  const client = await getMemcacheClient({ host: config.host, port: config.port });
  if (!client) return getFileChatStore(); // 降级

  const ttlSec = (config.ttlDays ?? 7) * 86400;

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
