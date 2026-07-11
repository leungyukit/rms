import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { ensureAuthTables, getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import crypto from 'crypto';

function generateToken(): string {
  return 'rms_' + crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// List user's tokens
// 管理员看全部，普通用户看自己的
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  ensureAuthTables();
  const db = getAsyncDb();

  let tokens;
  if (isGlobalAdmin(user.roles)) {
    // 管理员看全部 token，附带对应用户名
    tokens = (await db.prepare(`
      SELECT at.id, at.user_id, u.username, at.name, at.prefix, at.last_used_at, at.created_at
      FROM access_tokens at
      LEFT JOIN users u ON u.id = at.user_id
      ORDER BY at.created_at DESC
    `).all()) as any[];
  } else {
    tokens = (await db.prepare(
      'SELECT id, name, prefix, last_used_at, created_at FROM access_tokens WHERE user_id = ? ORDER BY created_at DESC'
    ).all(user.id)) as any[];
  }

  return NextResponse.json(tokens);
}

// Create new token
// body: { name?, user_id?, project_ids?: number[] }
// - 管理员可指定任意 user_id + project_ids
// - 普通用户只能给自己创建，project_ids 限制为自己有权限的项目
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { name, user_id, project_ids } = body as {
    name?: string;
    user_id?: number;
    project_ids?: number[];
  };

  // 权限校验：普通用户只能给自己创建
  const targetUserId = (isGlobalAdmin(user.roles) && typeof user_id === 'number' && user_id > 0)
    ? user_id
    : user.id;

  const token = generateToken();
  const tokenHash = hashToken(token);
  const prefix = token.substring(0, 11);

  ensureAuthTables();
  const db = getAsyncDb();

  // 写入 token
  const result = (await db.prepare(
    'INSERT INTO access_tokens (user_id, token_hash, name, prefix) VALUES (?, ?, ?, ?)'
  ).run(targetUserId, tokenHash, name || '默认Token', prefix));

  // 如果传了 project_ids，覆盖该用户的 user_project_access
  if (Array.isArray(project_ids) && project_ids.length > 0) {
    await db.prepare('DELETE FROM user_project_access WHERE user_id = ?').run(targetUserId);
    const insertAccess = db.prepare(
      'INSERT INTO user_project_access (user_id, project_id, role_in_project) VALUES (?, ?, ?)'
    );
    for (const pid of project_ids) {
      if (pid && Number(pid) > 0) {
        insertAccess.run(targetUserId, Number(pid), 'member');
      }
    }
  }

  // 返回完整 token（仅一次）
  return NextResponse.json({
    success: true,
    token,
    prefix,
    name: name || '默认Token',
    user_id: targetUserId,
  });
}

// Delete token
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: '缺少Token ID' }, { status: 400 });

  ensureAuthTables();
  const db = getAsyncDb();

  // 管理员可删任意 token，普通用户只能删自己的
  const where = isGlobalAdmin(user.roles)
    ? 'WHERE id = ?'
    : 'WHERE id = ? AND user_id = ?';
  const params = isGlobalAdmin(user.roles) ? [id] : [id, user.id];

  const result = (await db.prepare(`DELETE FROM access_tokens ${where}`).run(...params));
  if (result.changes === 0) {
    return NextResponse.json({ error: 'Token不存在或无权删除' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
