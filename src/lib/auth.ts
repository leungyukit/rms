import jwt from 'jsonwebtoken';
import bcrypt from "bcryptjs";
import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { getDb, isMysqlEnabled } from './db';

// JWT 密钥（2026-08-03 修复，同日二次修正为懒加载）
//
// 原代码回退到硬编码默认串 'rms-secret-key-change-in-production'，而部署链路
// （start.sh / k8s.yaml / docker-compose.yml / entrypoint.sh）从未设过 JWT_SECRET
// —— 等于全网公开的密钥，任何人可离线签发 admin token。
//
// 第一版改成模块加载期直接 throw，结果 `next build` 收集 page data 时会加载路由模块，
// 导致构建机也必须持有生产密钥，构建直接失败。现改为：
//   1) 懒加载 —— 只在真正签发/校验 token 时才要求密钥；
//   2) 构建阶段（NEXT_PHASE=phase-production-build）不校验；
//   3) 生产运行时缺失/过短 → 抛错（请求 500），而不是静默用弱密钥。
let _jwtSecret: string | null = null;

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

function getJwtSecret(): string {
  if (_jwtSecret) return _jwtSecret;
  const s = process.env.JWT_SECRET;

  if (s && s.length >= 32) {
    _jwtSecret = s;
    return _jwtSecret;
  }

  if (process.env.NODE_ENV === 'production' && !isBuildPhase()) {
    throw new Error(
      'JWT_SECRET 未设置或长度不足 32 位。生产环境必须配置强随机密钥，' +
      '例如：export JWT_SECRET="$(openssl rand -hex 32)"'
    );
  }

  // 非生产 / 构建阶段：临时随机密钥，绝不回退到固定默认串
  _jwtSecret = crypto.randomBytes(32).toString('hex');
  if (!isBuildPhase()) {
    // eslint-disable-next-line no-console
    console.warn('[auth] JWT_SECRET 未设置，已为本次进程生成临时密钥（重启后所有 token 失效）。');
  }
  return _jwtSecret;
}
const TOKEN_NAME = 'rms_token';
const EXPIRES_IN = '7d';

// 确保 access_tokens 和 audit_logs 表存在
let tablesEnsured = false;
export function ensureAuthTables() {
  if (tablesEnsured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();
  if (isMysql) {
    db.exec(`CREATE TABLE IF NOT EXISTS access_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      token_hash VARCHAR(255) NOT NULL,
      prefix VARCHAR(20) NOT NULL,
      last_used_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_hash (token_hash)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      username VARCHAR(50) DEFAULT NULL,
      action VARCHAR(50) NOT NULL,
      detail TEXT DEFAULT NULL,
      ip_address VARCHAR(100) DEFAULT NULL,
      user_agent TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user (user_id),
      INDEX idx_action (action),
      INDEX idx_created (created_at)
    )`);
  } else {
    db.exec(`CREATE TABLE IF NOT EXISTS access_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      prefix TEXT NOT NULL,
      last_used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      detail TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
  tablesEnsured = true;
}

export interface JwtPayload {
  userId: number;
  username: string;
}

export interface UserInfo {
  id: number;
  username: string;
  display_name: string;
  email: string;
  roles: string[];
  roleLabels: string[];
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(TOKEN_NAME, token, {
    httpOnly: true,
    // 修复（2026-08-03）：原为硬编码 false，HTTPS 下 cookie 仍可明文传输。
    // 生产开启 secure；内网 HTTP 部署可用 COOKIE_SECURE=false 显式关闭。
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 3600,
    path: '/',
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(TOKEN_NAME);
}

export async function getCurrentUser(): Promise<UserInfo | null> {
  try {
    // First check for Access Token in Authorization header (Bearer token)
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const accessToken = authHeader.slice(7);
      if (accessToken.startsWith('rms_')) {
        const user = await getUserByAccessToken(accessToken);
        if (user) return user;
      }
    }
    // Also check x-access-token header
    const xToken = headersList.get('x-access-token');
    if (xToken && xToken.startsWith('rms_')) {
      const user = await getUserByAccessToken(xToken);
      if (user) return user;
    }

    // Fallback to cookie-based JWT
    const cookieStore = await cookies();
    const token = cookieStore.get(TOKEN_NAME)?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) return null;

    const db = getDb();
    const user = db.prepare('SELECT id, username, display_name, email FROM users WHERE id = ?').get(payload.userId) as any;
    if (!user) return null;

    const roles = db.prepare(`
      SELECT r.name, r.label FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `).all(user.id) as any[];

    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      email: user.email || '',
      roles: roles.map(r => r.name),
      roleLabels: roles.map(r => r.label),
    };
  } catch {
    return null;
  }
}

export function getUserRoleProjects(userId: number): number[] {
  const db = getDb();
  // First check user-level access
  const userAccess = db.prepare('SELECT project_id FROM user_project_access WHERE user_id = ?').all(userId) as any[];
  if (userAccess.length > 0) return userAccess.map(r => r.project_id);
  // Fallback to role-level access
  const rows = db.prepare(`
    SELECT DISTINCT rpa.project_id FROM role_project_access rpa
    JOIN user_roles ur ON ur.role_id = rpa.role_id
    WHERE ur.user_id = ?
  `).all(userId) as any[];
  return rows.map(r => r.project_id);
}

export function isGlobalAdmin(roles: string[]): boolean {
  return roles.includes('global_admin');
}

// 仅登录角色，默认没有任何菜单和功能权限
export function isLoginOnly(roles: string[]): boolean {
  return roles.length === 1 && roles[0] === 'login_only';
}

// 是否具有功能权限（除 global_admin 外，需拥有实际业务角色）
export function hasFunctionalAccess(roles: string[]): boolean {
  return roles.includes('global_admin') || !isLoginOnly(roles);
}

// Access Token authentication
function hashTokenRaw(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function getUserByAccessToken(token: string): Promise<UserInfo | null> {
  try {
    ensureAuthTables();
    const tokenHash = hashTokenRaw(token);
    const db = getDb();
    const row = db.prepare(`
      SELECT at.id as token_id, at.user_id, u.username, u.display_name, u.email
      FROM access_tokens at
      JOIN users u ON u.id = at.user_id
      WHERE at.token_hash = ?
    `).get(tokenHash) as any;
    if (!row) return null;

    // Update last_used_at
    db.prepare('UPDATE access_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.token_id);

    const roles = db.prepare(`
      SELECT r.name, r.label FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `).all(row.user_id) as any[];

    return {
      id: row.user_id,
      username: row.username,
      display_name: row.display_name,
      email: row.email || '',
      roles: roles.map(r => r.name),
      roleLabels: roles.map(r => r.label),
    };
  } catch {
    return null;
  }
}

// Audit logging
export function logAudit(
  userId: number | null,
  username: string,
  action: string,
  detail: string = '',
  ipAddress: string = '',
  userAgent: string = ''
) {
  ensureAuthTables();
  const db = getDb();
  db.prepare(
    'INSERT INTO audit_logs (user_id, username, action, detail, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, username, action, detail, ipAddress, userAgent);
}
