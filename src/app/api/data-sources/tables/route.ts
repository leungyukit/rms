import { getCurrentUser } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    const db = getAsyncDb();
    const tables: any[] = [];
    
    // 直接尝试读取 SQLite 表（因为我们看到数据库文件存在）
    const tablesResult = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();
    
    for (const row of tablesResult as any[]) {
      const tableName = (row as any).name;
      
      const columnsResult = await db.prepare(
        `PRAGMA table_info(${tableName})`
      ).all();
      
      const columns = (columnsResult as any[]).map((column: any) => ({
        name: column.name,
        type: column.type,
        nullable: column.notnull === 0,
        key: column.pk === 1 ? 'PRIMARY KEY' : '',
        default: column.dflt_value,
        extra: ''
      }));
      
      tables.push({ name: tableName, columns });
    }

    return Response.json({ tables });
  } catch (e) {
    console.error('Error:', e);
    return Response.json({ 
      error: '获取表信息失败', 
      message: (e as any)?.message || String(e) 
    }, { status: 500 });
  }
}
