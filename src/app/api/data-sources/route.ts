import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
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
    const rows = await db.prepare(
      'SELECT * FROM data_sources WHERE is_system = 1 OR created_by = ? ORDER BY is_system DESC, name'
    ).all(user.id);

    const dataSources = (rows as any[]).map(ds => ({
      ...ds,
      config: ds.config ? JSON.parse(ds.config) : null
    }));

    return Response.json({ dataSources });
  } catch (e) {
    console.error('Failed to fetch data sources:', e);
    return Response.json({ error: '获取数据源失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    const { name, description, type, query, config } = await request.json();

    ensureCustomReportTables();
    const db = getAsyncDb();
    
    const result = await db.prepare(
      'INSERT INTO data_sources (name, description, type, query, config, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      name,
      description || null,
      type || 'sql',
      query,
      config ? JSON.stringify(config) : null,
      user.id
    );

    const newDataSource = await db.prepare(
      'SELECT * FROM data_sources WHERE id = ?'
    ).get((result as any).lastInsertRowid);

    return Response.json({
      dataSource: {
        ...newDataSource,
        config: (newDataSource as any).config ? JSON.parse((newDataSource as any).config) : null
      }
    });
  } catch (e) {
    console.error('Failed to create data source:', e);
    return Response.json({ error: '创建数据源失败' }, { status: 500 });
  }
}
