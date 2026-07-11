/**
 * 字段级权限 · 表结构与预置策略
 * 依据：rms-docs/RMS-优化方案-阶段3-P1b.md § 3
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

const DEFAULT_POLICIES = [
  { entity: 'requirement', field: 'description', roles: '["global_admin","project_receiver","requirement_handler"]', strategy: 'mask', desc: '业务描述' },
  { entity: 'requirement', field: 'solution', roles: '["global_admin","requirement_handler"]', strategy: 'mask', desc: '解决方案' },
  { entity: 'requirement', field: 'root_cause', roles: '["global_admin","requirement_handler","project_receiver"]', strategy: 'mask', desc: '根因' },
  { entity: 'requirement', field: 'lessons_learned', roles: '["global_admin","requirement_handler"]', strategy: 'mask', desc: '经验教训' },
  { entity: 'requirement', field: 'benefit', roles: '["global_admin","project_receiver","requirement_handler"]', strategy: 'mask', desc: '价值/收益' },
];

export function ensureFieldPolicyTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS field_visibility_policies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity VARCHAR(50) NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        visible_to_roles TEXT NOT NULL,
        visible_to_users TEXT,
        redact_strategy VARCHAR(20) NOT NULL DEFAULT 'mask',
        description TEXT,
        enabled TINYINT NOT NULL DEFAULT 1,
        created_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY fvp_unique (entity, field_name)
      );
      CREATE TABLE IF NOT EXISTS field_access_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        entity VARCHAR(50) NOT NULL,
        entity_id INT NOT NULL,
        field_name VARCHAR(100) NOT NULL,
        action VARCHAR(30) NOT NULL,
        ip_address VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_fal_entity (entity, entity_id, field_name),
        KEY idx_fal_user (user_id, created_at)
      );
    `);
    // 预置策略
    for (const p of DEFAULT_POLICIES) {
      db.prepare(`
        INSERT IGNORE INTO field_visibility_policies(entity, field_name, visible_to_roles, redact_strategy, description, enabled)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(p.entity, p.field, p.roles, p.strategy, p.desc);
    }
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS field_visibility_policies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        field_name TEXT NOT NULL,
        visible_to_roles TEXT NOT NULL,
        visible_to_users TEXT,
        redact_strategy TEXT NOT NULL DEFAULT 'mask',
        description TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(entity, field_name)
      );
      CREATE INDEX IF NOT EXISTS idx_fvp_entity ON field_visibility_policies(entity, enabled);
      CREATE TABLE IF NOT EXISTS field_access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        entity TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        field_name TEXT NOT NULL,
        action TEXT NOT NULL,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_fal_entity ON field_access_logs(entity, entity_id, field_name);
      CREATE INDEX IF NOT EXISTS idx_fal_user ON field_access_logs(user_id, created_at);
    `);
    for (const p of DEFAULT_POLICIES) {
      db.prepare(`
        INSERT IGNORE INTO field_visibility_policies(entity, field_name, visible_to_roles, redact_strategy, description, enabled)
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(p.entity, p.field, p.roles, p.strategy, p.desc);
    }
  }
  ensured = true;
}

// 缓存：user_role_key -> policies（5 分钟过期）
let policyCache: { data: any[]; expireAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export function getActivePolicies(entity?: string): any[] {
  ensureFieldPolicyTables();
  if (policyCache && policyCache.expireAt > Date.now()) {
    return entity ? policyCache.data.filter((p: any) => p.entity === entity) : policyCache.data;
  }
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM field_visibility_policies WHERE enabled=1`).all() as any[];
  policyCache = { data: rows, expireAt: Date.now() + CACHE_TTL };
  return entity ? rows.filter(p => p.entity === entity) : rows;
}

export function invalidatePolicyCache() { policyCache = null; }

// 脱敏：核心函数
export function applyFieldPolicies<T extends Record<string, any>>(
  entity: string, row: T, user: { id: number; roles: string[] }, opts: { includeMasked?: boolean; preview?: boolean } = {}
): T {
  const policies = getActivePolicies(entity);
  if (!policies.length) return row;
  const visibility: Record<string, string> = {};
  for (const p of policies) {
    let allowedRoles: string[] = [];
    let allowedUsers: number[] = [];
    try { allowedRoles = JSON.parse(p.visible_to_roles); } catch (e) {}
    try { allowedUsers = p.visible_to_users ? JSON.parse(p.visible_to_users) : []; } catch (e) {}
    const allowed = user.roles.some(r => allowedRoles.includes(r)) || allowedUsers.includes(user.id);
    if (allowed) { (visibility as any)[p.field_name] = 'self'; continue; }
    if (p.redact_strategy === 'hide') {
      delete (row as any)[p.field_name];
    } else if (p.redact_strategy === 'mask') {
      const v = (row as any)[p.field_name];
      const len = (v || '').toString().length;
      (row as any)[p.field_name] = opts.preview && typeof v === 'string'
        ? v.substring(0, 50) + '...（前 50 字预览）'
        : `🔒 该字段对您的角色不可见（mask，长度 ${len}）`;
      (row as any)[`${p.field_name}_masked`] = true;
    } else if (p.redact_strategy === 'hash') {
      const v = String((row as any)[p.field_name] || '');
      let h = 0;
      for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) | 0;
      (row as any)[p.field_name] = 'hash:' + Math.abs(h).toString(16).padStart(8, '0').slice(0, 8);
    }
    (visibility as any)[p.field_name] = p.redact_strategy;
  }
  (row as any)._visibility = visibility;
  return row as T;
}
