import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { ensureFieldPolicyTables, invalidatePolicyCache, getActivePolicies } from '@/lib/field-policy-migrations';
import { getAsyncDb } from '@/lib/db';

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '仅 admin 可访问' }, { status: 403 });
  ensureFieldPolicyTables();
  const policies = getActivePolicies();
  return NextResponse.json({ policies });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '仅 admin' }, { status: 403 });
  ensureFieldPolicyTables();
  const body = await req.json();
  const { entity, field_name, visible_to_roles, visible_to_users, redact_strategy = 'mask', description = '' } = body;
  if (!entity || !field_name) return NextResponse.json({ error: 'entity + field_name 必填' }, { status: 400 });
  if (!['mask', 'hash', 'hide'].includes(redact_strategy)) return NextResponse.json({ error: 'strategy 非法' }, { status: 400 });
  const db = getAsyncDb();
  try {
    const r = (await db.prepare(`
      INSERT INTO field_visibility_policies(entity, field_name, visible_to_roles, visible_to_users, redact_strategy, description, enabled, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `).run(entity, field_name, JSON.stringify(visible_to_roles || []), visible_to_users ? JSON.stringify(visible_to_users) : null, redact_strategy, description, user.id));
    invalidatePolicyCache();
    return NextResponse.json({ id: r.lastInsertRowid, success: true });
  } catch (e: any) {
    return NextResponse.json({ error: '策略已存在或写入失败: ' + e.message }, { status: 400 });
  }
}
