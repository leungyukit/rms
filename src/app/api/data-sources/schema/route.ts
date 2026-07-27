
import { getCurrentUser } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    const db = getAsyncDb();
    
    // Get all tables from SQLite
    const tablesResult = await db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%' 
      ORDER BY name
    `).all();
    
    const tables = tablesResult.map((t: any) => t.name);
    
    // Get columns for each table
    const schema: any = {};
    for (const tableName of tables) {
      const columnsResult = await db.prepare(`PRAGMA table_info(${tableName})`).all();
      schema[tableName] = columnsResult.map((c: any) => ({
        name: c.name,
        type: c.type,
        notNull: c.notnull === 1,
        defaultValue: c.dflt_value,
        isPrimaryKey: c.pk === 1
      }));
    }
    
    return Response.json({ tables, schema });
  } catch (e) {
    console.error('Failed to fetch database schema:', e);
    return Response.json({ error: '获取数据库结构失败' }, { status: 500 });
  }
}
