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
    
    const dataSource = await db.prepare(
      'SELECT * FROM data_sources WHERE id = ?'
    ).get(id);

    if (!dataSource) {
      return Response.json({ error: '数据源不存在' }, { status: 404 });
    }

    return Response.json({
      dataSource: {
        ...dataSource,
        config: dataSource.config ? JSON.parse(dataSource.config) : null
      }
    });
  } catch (e) {
    console.error('Failed to fetch data source:', e);
    return Response.json({ error: '获取数据源失败' }, { status: 500 });
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

    const db = getAsyncDb();
    const id = parseInt(idStr);
    
    const existing = await db.prepare(
      'SELECT * FROM data_sources WHERE id = ?'
    ).get(id);

    if (!existing) {
      return Response.json({ error: '数据源不存在' }, { status: 404 });
    }

    // 系统数据源不允许编辑
    if ((existing as any).is_system) {
      return Response.json({ error: '系统数据源不允许编辑' }, { status: 403 });
    }

    const { name, description, type, query, config } = await request.json();
    
    await db.prepare(
      'UPDATE data_sources SET name = ?, description = ?, type = ?, query = ?, config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(
      name,
      description || null,
      type || 'sql',
      query,
      config ? JSON.stringify(config) : null,
      id
    );

    const updated = await db.prepare(
      'SELECT * FROM data_sources WHERE id = ?'
    ).get(id);

    return Response.json({
      dataSource: {
        ...updated,
        config: (updated as any).config ? JSON.parse((updated as any).config) : null
      }
    });
  } catch (e) {
    console.error('Failed to update data source:', e);
    return Response.json({ error: '更新数据源失败' }, { status: 500 });
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
    
    const existing = await db.prepare(
      'SELECT * FROM data_sources WHERE id = ?'
    ).get(id);

    if (!existing) {
      return Response.json({ error: '数据源不存在' }, { status: 404 });
    }

    // 系统数据源不允许删除
    if ((existing as any).is_system) {
      return Response.json({ error: '系统数据源不允许删除' }, { status: 403 });
    }

    await db.prepare(
      'DELETE FROM data_sources WHERE id = ?'
    ).run(id);

    return Response.json({ success: true });
  } catch (e) {
    console.error('Failed to delete data source:', e);
    return Response.json({ error: '删除数据源失败' }, { status: 500 });
  }
}
