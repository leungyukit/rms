import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin, hashPassword, logAudit, hasFunctionalAccess } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  // 安全修复（2026-08-31）：原来只验「是否登录」，仅登录用户（login_only）
  // 可拖走全量用户名单（含真实姓名/邮箱/角色/所属项目）。
  if (!hasFunctionalAccess(user.roles)) {
    return NextResponse.json({ error: '无功能权限' }, { status: 403 });
  }

  const db = getAsyncDb();
  const rows = (await db.prepare(`
    SELECT u.id, u.username, u.display_name, u.email, u.created_at,
      GROUP_CONCAT(r.label, ', ') as role_labels,
      GROUP_CONCAT(r.name) as role_names
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all()) as any[];

  // Attach project access info
  const result = await Promise.all(rows.map(async u => {
    const projects = (await db.prepare(`
      SELECT upa.project_id, upa.role_in_project, p.name as project_name
      FROM user_project_access upa
      LEFT JOIN projects p ON p.id = upa.project_id
      WHERE upa.user_id = ?
    `).all(u.id));
    return { ...u, project_access: projects };
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) {
    return NextResponse.json({ error: '无权限，仅管理员可创建用户' }, { status: 403 });
  }

  const { username, password, display_name, email, roles, project_access } = await req.json();
  if (!username || !password) return NextResponse.json({ error: '用户名和密码为必填' }, { status: 400 });
  if (username.length < 3) return NextResponse.json({ error: '用户名至少3个字符' }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: '密码至少6个字符' }, { status: 400 });

  const db = getAsyncDb();
  const existing = (await db.prepare('SELECT id FROM users WHERE username = ?').get(username));
  if (existing) return NextResponse.json({ error: '用户名已存在' }, { status: 409 });

  const hash = hashPassword(password);
  const result = (await db.prepare('INSERT INTO users (username, password_hash, display_name, email) VALUES (?, ?, ?, ?)')
    .run(username, hash, display_name || username, email || ''));
  const userId = result.lastInsertRowid as number;

  // Assign roles
  if (roles && Array.isArray(roles) && roles.length > 0) {
    for (const roleName of roles) {
      const role = (await db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName)) as any;
      if (role) {
        (await db.prepare('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, role.id));
      }
    }
  } else {
    // Default role
    const defaultRole = (await db.prepare("SELECT id FROM roles WHERE name = 'login_only'").get()) as any;
    if (defaultRole) {
      (await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, defaultRole.id));
    }
  }

  // Assign project access
  if (project_access && Array.isArray(project_access) && project_access.length > 0) {
    const insertAccess = db.prepare('INSERT INTO user_project_access (user_id, project_id, role_in_project) VALUES (?, ?, ?)');
    for (const pa of project_access) {
      if (pa.project_id) {
        await insertAccess.run(userId, pa.project_id, pa.role_in_project || 'member');
      }
    }
  }

  logAudit(user.id, user.username, 'create_user', `创建用户: ${username} (ID: ${userId})`);

  return NextResponse.json({ success: true, id: userId });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) {
    return NextResponse.json({ error: '无权限' }, { status: 403 });
  }

  const { id, display_name, email, roles, password, project_access } = await req.json();
  if (!id) return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });

  const db = getAsyncDb();

  const updates: string[] = [];
  const values: any[] = [];
  if (display_name !== undefined) { updates.push('display_name = ?'); values.push(display_name); }
  if (email !== undefined) { updates.push('email = ?'); values.push(email); }
  if (password) { updates.push('password_hash = ?'); values.push(hashPassword(password)); }

  if (updates.length > 0) {
    values.push(id);
    (await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values));
  }

  // Update roles
  if (roles && Array.isArray(roles)) {
    (await db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(id));
    for (const roleName of roles) {
      const role = (await db.prepare('SELECT id FROM roles WHERE name = ?').get(roleName)) as any;
      if (role) {
        (await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(id, role.id));
      }
    }
  }

  // Update project access
  if (project_access !== undefined && Array.isArray(project_access)) {
    (await db.prepare('DELETE FROM user_project_access WHERE user_id = ?').run(id));
    const insertAccess = db.prepare('INSERT INTO user_project_access (user_id, project_id, role_in_project) VALUES (?, ?, ?)');
    for (const pa of project_access) {
      if (pa.project_id) {
        await insertAccess.run(id, pa.project_id, pa.role_in_project || 'viewer');
      }
    }
  }

  logAudit(user.id, user.username, 'update_user', `更新用户 ID: ${id}`);

  return NextResponse.json({ success: true });
}
