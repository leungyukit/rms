import { getCurrentUser } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

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

    const db = getAsyncDb();
    const id = parseInt(idStr);
    
    const report = await db.prepare(
      'SELECT * FROM reports WHERE id = ? AND created_by = ?'
    ).get(id, user.id);

    if (!report) {
      return Response.json({ error: '报表不存在' }, { status: 404 });
    }

    // 获取报表的widgets
    const widgets = await db.prepare(
      'SELECT * FROM report_widgets WHERE report_id = ? ORDER BY sort_order, id'
    ).all(id);

    return Response.json({
      report: {
        ...report,
        config: report.config ? JSON.parse(report.config) : null,
        layout: report.layout ? JSON.parse(report.layout) : null,
        widgets: (widgets as any[]).map(w => ({
          ...w,
          config: w.config ? JSON.parse(w.config) : null
        }))
      }
    });
  } catch (e) {
    console.error('Failed to fetch report:', e);
    return Response.json({ error: '获取报表失败' }, { status: 500 });
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

    const { name, description, config, layout, widgets } = await request.json();
    const db = getAsyncDb();
    const id = parseInt(idStr);

    // 更新报表基本信息
    await db.prepare(
      'UPDATE reports SET name = ?, description = ?, config = ?, layout = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND created_by = ?'
    ).run(
      name,
      description || '',
      config ? JSON.stringify(config) : null,
      layout ? JSON.stringify(layout) : null,
      id,
      user.id
    );

    // 如果有widgets，更新widgets
    if (widgets && Array.isArray(widgets)) {
      // 先删除旧的widgets
      await db.prepare('DELETE FROM report_widgets WHERE report_id = ?').run(id);
      
      // 插入新的widgets
      for (const widget of widgets) {
        await db.prepare(
          'INSERT INTO report_widgets (report_id, name, widget_type, chart_type, data_source, config, position_x, position_y, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
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

    // 获取更新后的报表
    const updatedReport = await db.prepare(
      'SELECT * FROM reports WHERE id = ?'
    ).get(id);

    const updatedWidgets = await db.prepare(
      'SELECT * FROM report_widgets WHERE report_id = ? ORDER BY sort_order, id'
    ).all(id);

    return Response.json({
      report: {
        ...updatedReport,
        config: updatedReport.config ? JSON.parse(updatedReport.config) : null,
        layout: updatedReport.layout ? JSON.parse(updatedReport.layout) : null,
        widgets: (updatedWidgets as any[]).map(w => ({
          ...w,
          config: w.config ? JSON.parse(w.config) : null
        }))
      }
    });
  } catch (e) {
    console.error('Failed to update report:', e);
    return Response.json({ error: '更新报表失败' }, { status: 500 });
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

    const db = getAsyncDb();
    const id = parseInt(idStr);

    await db.prepare(
      'DELETE FROM reports WHERE id = ? AND created_by = ?'
    ).run(id, user.id);

    return Response.json({ success: true });
  } catch (e) {
    console.error('Failed to delete report:', e);
    return Response.json({ error: '删除报表失败' }, { status: 500 });
  }
}
