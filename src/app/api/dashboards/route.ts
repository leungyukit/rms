import { getCurrentUser } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';
import { ensureCustomReportTables } from '@/lib/custom-report-migrations';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    ensureCustomReportTables();
    const db = getAsyncDb();
    
    // 获取用户关联的dashboard
    const rows = await db.prepare(`
      SELECT d.*, ud.is_favorite, ud.sort_order 
      FROM dashboards d 
      LEFT JOIN user_dashboards ud ON d.id = ud.dashboard_id AND ud.user_id = ?
      WHERE d.created_by = ? OR ud.user_id IS NOT NULL
      ORDER BY d.is_default DESC, ud.sort_order ASC, d.updated_at DESC
    `).all(user.id, user.id);

    const dashboards = (rows as any[]).map(d => ({
      ...d,
      config: d.config ? JSON.parse(d.config) : null,
      layout: d.layout ? JSON.parse(d.layout) : null
    }));

    return Response.json({ dashboards });
  } catch (e) {
    console.error('Failed to fetch dashboards:', e);
    return Response.json({ error: '获取Dashboard失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    const { name, description, is_default, config, layout } = await request.json();

    ensureCustomReportTables();
    const db = getAsyncDb();

    // 如果设为默认，先取消其他的默认
    if (is_default) {
      await db.prepare(
        'UPDATE dashboards SET is_default = 0 WHERE created_by = ?'
      ).run(user.id);
    }

    const result = await db.prepare(
      'INSERT INTO dashboards (name, description, is_default, config, layout, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      name,
      description || '',
      is_default ? 1 : 0,
      config ? JSON.stringify(config) : null,
      layout ? JSON.stringify(layout) : null,
      user.id
    );

    const newDashboard = await db.prepare(
      'SELECT * FROM dashboards WHERE id = ?'
    ).get((result as any).lastInsertRowid);

    // 自动关联到用户
    await db.prepare(
      'INSERT OR IGNORE INTO user_dashboards (user_id, dashboard_id, sort_order) VALUES (?, ?, 0)'
    ).run(user.id, (result as any).lastInsertRowid);

    return Response.json({
      dashboard: {
        ...newDashboard,
        config: newDashboard.config ? JSON.parse(newDashboard.config) : null,
        layout: newDashboard.layout ? JSON.parse(newDashboard.layout) : null
      }
    });
  } catch (e) {
    console.error('Failed to create dashboard:', e);
    return Response.json({ error: '创建Dashboard失败' }, { status: 500 });
  }
}
