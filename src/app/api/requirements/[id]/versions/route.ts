import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/requirements/[id]/versions - 获取需求的历史版本
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  const db = getAsyncDb();

  const versions = (await db.prepare(`
    SELECT rv.*, 
      u.display_name as changed_by_name,
      h.display_name as handler_name,
      v.display_name as verifier_name
    FROM requirement_versions rv
    LEFT JOIN users u ON u.id = rv.changed_by
    LEFT JOIN users h ON h.id = rv.handler_id
    LEFT JOIN users v ON v.id = rv.verifier_id
    WHERE rv.requirement_id = ?
    ORDER BY rv.version DESC
  `).all(id));

  return NextResponse.json(versions);
}

// POST /api/requirements/[id]/versions - 创建需求版本快照
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const db = getAsyncDb();

  // 获取当前需求
  const requirement = (await db.prepare('SELECT * FROM requirements WHERE id = ?').get(id)) as any;
  if (!requirement) {
    return NextResponse.json({ error: '需求不存在' }, { status: 404 });
  }

  // 获取当前最大版本号
  const maxVersion = (await db.prepare(
    'SELECT MAX(version) as max_v FROM requirement_versions WHERE requirement_id = ?'
  ).get(id)) as any;

  const newVersion = (maxVersion?.max_v || 0) + 1;

  // 创建版本快照
  const result = (await db.prepare(`
    INSERT INTO requirement_versions (
      requirement_id, version, title, description, business_unit,
      priority, status, handler_id, verifier_id, change_summary, changed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    newVersion,
    requirement.title,
    requirement.description,
    requirement.business_unit,
    requirement.priority,
    requirement.status,
    requirement.handler_id,
    requirement.verifier_id,
    body.change_summary || '手动创建快照',
    user.id
  ));

  return NextResponse.json({
    id: result.lastInsertRowid,
    version: newVersion,
    message: '版本快照创建成功'
  }, { status: 201 });
}
