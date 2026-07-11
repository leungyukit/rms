import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { invalidatePolicyCache } from '@/lib/field-policy-migrations';
import { getAsyncDb } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '仅 admin' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();
  const fields: string[] = [];
  const vals: any[] = [];
  for (const k of ['visible_to_roles', 'visible_to_users', 'redact_strategy', 'description', 'enabled']) {
    if (body[k] !== undefined) {
      const v = k === 'visible_to_roles' || k === 'visible_to_users' ? JSON.stringify(body[k]) : body[k];
      fields.push(`${k} = ?`); vals.push(v);
    }
  }
  if (!fields.length) return NextResponse.json({ error: '无可更新字段' }, { status: 400 });
  vals.push(id);
  (await db.prepare(`UPDATE field_visibility_policies SET ${fields.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...vals));
  invalidatePolicyCache();
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '仅 admin' }, { status: 403 });
  const { id } = await params;
  const db = getAsyncDb();
  (await db.prepare(`UPDATE field_visibility_policies SET enabled=0 WHERE id=?`).run(id));
  invalidatePolicyCache();
  return NextResponse.json({ success: true });
}
