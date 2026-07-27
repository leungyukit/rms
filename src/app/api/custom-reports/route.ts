import { getCurrentUser } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    const db = getAsyncDb();
    const rows = await db.prepare(
      'SELECT * FROM reports WHERE created_by = ? ORDER BY updated_at DESC'
    ).all(user.id);

    const reports = (rows as any[]).map(r => ({
      ...r,
      config: r.config ? JSON.parse(r.config) : null,
      layout: r.layout ? JSON.parse(r.layout) : null
    }));

    return Response.json({ reports });
  } catch (e) {
    console.error('Failed to fetch reports:', e);
    return Response.json({ error: '获取报表失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    const { name, description, type, config, layout } = await request.json();

    const db = getAsyncDb();
    const result = await db.prepare(
      'INSERT INTO reports (name, description, type, config, layout, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      name,
      description || '',
      type || 'custom',
      config ? JSON.stringify(config) : null,
      layout ? JSON.stringify(layout) : null,
      user.id
    );

    const newReport = await db.prepare(
      'SELECT * FROM reports WHERE id = ?'
    ).get((result as any).lastInsertRowid);

    return Response.json({
      report: {
        ...newReport,
        config: newReport.config ? JSON.parse(newReport.config) : null,
        layout: newReport.layout ? JSON.parse(newReport.layout) : null
      }
    });
  } catch (e) {
    console.error('Failed to create report:', e);
    return Response.json({ error: '创建报表失败' }, { status: 500 });
  }
}
