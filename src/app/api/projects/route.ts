import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin, getUserRoleProjects, hasFunctionalAccess } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json([]);
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  const db = getAsyncDb();
  let rows;

  if (isGlobalAdmin(user.roles)) {
    // Admin sees all projects
    rows = (await db.prepare(`
      SELECT p.*, u.display_name as creator_name,
        (SELECT COUNT(*) FROM requirements WHERE project_id = p.id) as req_count
      FROM projects p LEFT JOIN users u ON u.id = p.created_by
      ORDER BY p.created_at DESC
    `).all());
  } else {
    // Non-admin: only see projects they have access to
    const accessibleIds = getUserRoleProjects(user.id);
    if (accessibleIds.length === 0) return NextResponse.json([]);
    const placeholders = accessibleIds.map(() => '?').join(',');
    rows = (await db.prepare(`
      SELECT p.*, u.display_name as creator_name,
        (SELECT COUNT(*) FROM requirements WHERE project_id = p.id) as req_count
      FROM projects p LEFT JOIN users u ON u.id = p.created_by
      WHERE p.id IN (${placeholders})
      ORDER BY p.created_at DESC
    `).all(...accessibleIds));
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 });

  const db = getAsyncDb();
  const result = (await db.prepare('INSERT INTO projects (name, description, created_by) VALUES (?, ?, ?)')
    .run(name.trim(), description || '', user.id));

  return NextResponse.json({ success: true, id: result.lastInsertRowid });
}

// PUT: Update project
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  const { id, name, description, status } = await req.json();
  if (!id) return NextResponse.json({ error: '缺少项目ID' }, { status: 400 });

  const db = getAsyncDb();
  const updates: string[] = [];
  const values: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); values.push(name.trim()); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }

  if (updates.length > 0) {
    values.push(id);
    (await db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values));
  }

  return NextResponse.json({ success: true });
}

// DELETE: Delete project with options
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });

  const { id, action, target_project_id } = await req.json();
  if (!id) return NextResponse.json({ error: '缺少项目ID' }, { status: 400 });

  const db = getAsyncDb();

  // Check linked requirements
  const reqCount = ((await db.prepare('SELECT COUNT(*) as c FROM requirements WHERE project_id = ?').get(id)) as any).c;

  // If just checking, return info
  if (action === 'check') {
    return NextResponse.json({ req_count: reqCount });
  }

  if (reqCount > 0) {
    if (action === 'delete_all') {
      // Delete all linked requirements and their related data
      const reqIds = (await db.prepare('SELECT id FROM requirements WHERE project_id = ?').all(id)) as any[];
      for (const r of reqIds) {
        (await db.prepare('DELETE FROM requirement_tags WHERE requirement_id = ?').run(r.id));
        (await db.prepare('DELETE FROM requirement_relations WHERE source_id = ? OR target_id = ?').run(r.id, r.id));
        (await db.prepare('DELETE FROM status_log WHERE requirement_id = ?').run(r.id));
        (await db.prepare('DELETE FROM requirement_timeline WHERE requirement_id = ?').run(r.id));
        (await db.prepare('DELETE FROM attachments WHERE requirement_id = ?').run(r.id));
      }
      (await db.prepare('DELETE FROM requirements WHERE project_id = ?').run(id));
    } else if (action === 'transfer' && target_project_id) {
      // Transfer all requirements to target project
      (await db.prepare('UPDATE requirements SET project_id = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?')
        .run(target_project_id, id));
    } else {
      return NextResponse.json({ error: '该项目下有 ' + reqCount + ' 条需求，请选择删除或转移', req_count: reqCount }, { status: 400 });
    }
  }

  // Delete project access records
  (await db.prepare('DELETE FROM role_project_access WHERE project_id = ?').run(id));
  // Delete project
  (await db.prepare('DELETE FROM projects WHERE id = ?').run(id));

  return NextResponse.json({ success: true, deleted_reqs: action === 'delete_all' ? reqCount : 0, transferred: action === 'transfer' ? reqCount : 0 });
}
