import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { rows } = await req.json();
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '无有效数据' }, { status: 400 });
  }

  const db = getAsyncDb();
  const insertReq = db.prepare(`
    INSERT INTO requirements (title, description, business_unit, priority, status, category,
      project_id, requester_name, handler_id, receiver_id, benefit, planned_start, planned_end)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertLog = db.prepare(
    'INSERT INTO status_log (requirement_id, old_status, new_status, changed_by) VALUES (?, NULL, ?, ?)'
  );
  const insertTag = db.prepare('INSERT IGNORE INTO requirement_tags (requirement_id, tag_id) VALUES (?, ?)');
  const findTag = db.prepare('SELECT id FROM tags WHERE name = ?');
  const createTag = db.prepare('INSERT IGNORE INTO tags (name) VALUES (?)');

  // Lookup helpers
  const projects = (await db.prepare('SELECT id, name FROM projects').all()) as any[];
  const projectMap: Record<string, number> = {};
  for (const p of projects) projectMap[p.name.toLowerCase()] = p.id;

  const priorityMap: Record<string, string> = { '高': 'high', 'high': 'high', '中': 'medium', 'medium': 'medium', '低': 'low', 'low': 'low' };

  let created = 0;
  let errors: string[] = [];

  const txFn = await db.transaction(async () => {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const title = (r.title || '').trim();
      if (!title) { errors.push(`第${i + 1}行：标题为空，已跳过`); continue; }

      const priority = priorityMap[(r.priority || '').trim().toLowerCase()] || 'medium';
      const status = 'received_not_evaluated';
      const category = (r.category || '').includes('零星') ? 'adhoc' : 'project';

      let projectId = null;
      if (r.project) {
        const pName = r.project.trim().toLowerCase();
        if (projectMap[pName] !== undefined) projectId = projectMap[pName];
      }

      let handlerId = null;
      if (r.handler) {
        const hName = r.handler.trim();
        if (hName) {
          const hUser = (await db.prepare('SELECT id FROM users WHERE display_name = ? OR username = ?').get(hName, hName)) as any;
          if (hUser) handlerId = hUser.id;
        }
      }

      const result = await insertReq.run(
        title,
        (r.description || '').trim(),
        (r.business_unit || '').trim(),
        priority,
        status,
        category,
        projectId,
        (r.requester_name || '').trim(),
        handlerId,
        user.id,
        (r.benefit || '').trim(),
        (r.planned_start || '').trim() || null,
        (r.planned_end || '').trim() || null
      );

      const reqId = result.lastInsertRowid as number;
      insertLog.run(reqId, status, user.id);

      // Tags
      if (r.tags) {
        const tagNames = r.tags.split(/[,，\s]+/).filter(Boolean);
        for (const tn of tagNames) {
          createTag.run(tn.trim());
          const t = findTag.get(tn.trim()) as any;
          if (t) insertTag.run(reqId, t.id);
        }
      }

      created++;
    }
  });

  try {
    await txFn();
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '批量创建失败' }, { status: 500 });
  }

  return NextResponse.json({ success: true, created, errors });
}
