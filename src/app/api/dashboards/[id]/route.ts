import { getCurrentUser } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';
import { ensureCustomReportTables } from '@/lib/custom-report-migrations';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    ensureCustomReportTables();
    const db = getAsyncDb();
    const id = parseInt(idStr);
    
    // 获取dashboard
    const dashboard = await db.prepare(
      'SELECT * FROM dashboards WHERE id = ?'
    ).get(id);

    if (!dashboard) {
      return Response.json({ error: 'Dashboard不存在' }, { status: 404 });
    }

    // 获取widgets
    const widgets = await db.prepare(
      'SELECT * FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY sort_order, id'
    ).all(id);

    return Response.json({
      dashboard: {
        ...dashboard,
        config: dashboard.config ? JSON.parse(dashboard.config) : null,
        layout: dashboard.layout ? JSON.parse(dashboard.layout) : null,
        widgets: (widgets as any[]).map(w => ({
          ...w,
          config: w.config ? JSON.parse(w.config) : null
        }))
      }
    });
  } catch (e) {
    console.error('Failed to fetch dashboard:', e);
    return Response.json({ error: '获取Dashboard失败' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    const { name, description, is_default, config, layout, widgets } = await request.json();

    ensureCustomReportTables();
    const db = getAsyncDb();
    const id = parseInt(idStr);

    // 如果设为默认，先取消其他的默认
    if (is_default) {
      await db.prepare(
        'UPDATE dashboards SET is_default = 0 WHERE created_by = ?'
      ).run(user.id);
    }

    // 更新dashboard
    await db.prepare(
      'UPDATE dashboards SET name = ?, description = ?, is_default = ?, config = ?, layout = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?'
    ).run(
      name,
      description || '',
      is_default ? 1 : 0,
      config ? JSON.stringify(config) : null,
      layout ? JSON.stringify(layout) : null,
      id,
      user.id
    );

    // 如果有widgets，更新widgets
    if (widgets && Array.isArray(widgets)) {
      // 先删除旧的widgets
      await db.prepare('DELETE FROM dashboard_widgets WHERE dashboard_id = ?').run(id);
      
      // 插入新的widgets
      for (const widget of widgets) {
        await db.prepare(
          'INSERT INTO dashboard_widgets (dashboard_id, name, widget_type, chart_type, data_source, config, position_x, position_y, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(
          id,
          widget.name,
          widget.widget_type,
          widget.chart_type,
          widget.data_source,
          widget.config ? JSON.stringify(widget.config) : null,
          widget.position_x || 0,
          widget.position_y || 0,
          widget.width || 4,
          widget.height || 3,
          widget.sort_order || 0
        );
      }
    }

    const updatedDashboard = await db.prepare(
      'SELECT * FROM dashboards WHERE id = ?'
    ).get(id);

    const updatedWidgets = await db.prepare(
      'SELECT * FROM dashboard_widgets WHERE dashboard_id = ? ORDER BY sort_order, id'
    ).all(id);

    return Response.json({
      dashboard: {
        ...updatedDashboard,
        config: updatedDashboard.config ? JSON.parse(updatedDashboard.config) : null,
        layout: updatedDashboard.layout ? JSON.parse(updatedDashboard.layout) : null,
        widgets: (updatedWidgets as any[]).map(w => ({
          ...w,
          config: w.config ? JSON.parse(w.config) : null
        }))
      }
    });
  } catch (e) {
    console.error('Failed to update dashboard:', e);
    return Response.json({ error: '更新Dashboard失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    ensureCustomReportTables();
    const db = getAsyncDb();
    const id = parseInt(idStr);

    await db.prepare(
      'DELETE FROM dashboards WHERE id = ? AND created_by = ?'
    ).run(id, user.id);

    return Response.json({ success: true });
  } catch (e) {
    console.error('Failed to delete dashboard:', e);
    return Response.json({ error: '删除Dashboard失败' }, { status: 500 });
  }
}
