import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/templates - 获取所有需求模板
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getAsyncDb();
  const templates = (await db.prepare(`
    SELECT t.*, u.display_name as creator_name
    FROM requirement_templates t
    LEFT JOIN users u ON u.id = t.created_by
    ORDER BY t.created_at DESC
  `).all());

  return NextResponse.json(templates);
}

// POST /api/templates - 创建需求模板
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json();
  const db = getAsyncDb();

  if (!body.name || !body.title_template) {
    return NextResponse.json({ error: '模板名称和标题模板不能为空' }, { status: 400 });
  }

  const result = (await db.prepare(`
    INSERT INTO requirement_templates (name, title_template, description_template, business_unit, priority, category, benefit_template, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    body.name,
    body.title_template,
    body.description_template || '',
    body.business_unit || '',
    body.priority || 'medium',
    body.category || 'project',
    body.benefit_template || '',
    user.id
  ));

  const template = (await db.prepare('SELECT * FROM requirement_templates WHERE id = ?').get(result.lastInsertRowid));

  return NextResponse.json(template, { status: 201 });
}

// PUT /api/templates - 更新需求模板
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json();
  const db = getAsyncDb();

  if (!body.id) {
    return NextResponse.json({ error: '缺少模板ID' }, { status: 400 });
  }

  const existing = (await db.prepare('SELECT * FROM requirement_templates WHERE id = ?').get(body.id));
  if (!existing) {
    return NextResponse.json({ error: '模板不存在' }, { status: 404 });
  }

  (await db.prepare(`
    UPDATE requirement_templates SET
      name = ?, title_template = ?, description_template = ?,
      business_unit = ?, priority = ?, category = ?, benefit_template = ?
    WHERE id = ?
  `).run(
    body.name || existing.name,
    body.title_template || existing.title_template,
    body.description_template || existing.description_template,
    body.business_unit || existing.business_unit,
    body.priority || existing.priority,
    body.category || existing.category,
    body.benefit_template || existing.benefit_template,
    body.id
  ));

  const template = (await db.prepare('SELECT * FROM requirement_templates WHERE id = ?').get(body.id));

  return NextResponse.json(template);
}

// DELETE /api/templates - 删除需求模板
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: '缺少模板ID' }, { status: 400 });
  }

  const db = getAsyncDb();

  // 检查是否是模板创建者或是管理员
  const template = (await db.prepare('SELECT * FROM requirement_templates WHERE id = ?').get(id)) as any;
  if (!template) {
    return NextResponse.json({ error: '模板不存在' }, { status: 404 });
  }

  const isAdmin = (await db.prepare(
    "SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.name = 'global_admin'"
  ).get(user.id));

  if (template.created_by !== user.id && !isAdmin) {
    return NextResponse.json({ error: '无权删除此模板' }, { status: 403 });
  }

  (await db.prepare('DELETE FROM requirement_templates WHERE id = ?').run(id));

  return NextResponse.json({ success: true });
}
