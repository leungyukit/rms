import { getAsyncDb, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // 安全修复（2026-08-03）：原代码完全无鉴权，任何人可枚举全库表结构
    // （含 users / access_tokens / system_config 的字段定义），等于送一份攻击地图。
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
    if (!isGlobalAdmin(user.roles)) {
      return NextResponse.json({ error: '需要全局管理员权限' }, { status: 403 });
    }

    const db = getAsyncDb();
    const tables = [];
    
    if (isMysqlEnabled()) {
      // MySQL 模式
      const tablesResult = await db.prepare('SHOW TABLES').all();
      
      for (const row of tablesResult) {
        const tableName = Object.values(row)[0] as string;
        
        // 获取表描述（从 table_metadata）
        let tableDesc = '';
        try {
          const tableMeta = await db.prepare('SELECT description FROM table_metadata WHERE table_name = ?').get(tableName);
          tableDesc = tableMeta?.description || '';
        } catch (e) {
          // table_metadata 表可能不存在，忽略
        }
        
        // 获取字段信息
        const columnsResult = await db.prepare(`DESCRIBE \`${tableName}\``).all();
        const columns = [];
        for (const col of columnsResult) {
          // 获取字段描述
          let colDesc = '';
          try {
            const colMeta = await db.prepare('SELECT description FROM column_metadata WHERE table_name = ? AND column_name = ?').get(tableName, col.Field);
            colDesc = colMeta?.description || '';
          } catch (e) {
            // column_metadata 表可能不存在，忽略
          }
          
          columns.push({
            name: col.Field,
            type: col.Type,
            nullable: col.Null === 'YES',
            key: col.Key,
            default: col.Default,
            extra: col.Extra,
            description: colDesc
          });
        }
        
        tables.push({
          name: tableName,
          description: tableDesc,
          columns
        });
      }
    } else {
      // SQLite 模式
      const tablesResult = await db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all();
      
      for (const row of tablesResult) {
        const tableName = row.name as string;
        
        // 获取表描述（从 table_metadata）
        let tableDesc = '';
        try {
          const tableMeta = await db.prepare('SELECT description FROM table_metadata WHERE table_name = ?').get(tableName);
          tableDesc = tableMeta?.description || '';
        } catch (e) {
          // table_metadata 表可能不存在，忽略
        }
        
        // 获取字段信息
        const columnsResult = await db.prepare(`PRAGMA table_info(${tableName})`).all();
        const columns = [];
        for (const col of columnsResult) {
          // 获取字段描述
          let colDesc = '';
          try {
            const colMeta = await db.prepare('SELECT description FROM column_metadata WHERE table_name = ? AND column_name = ?').get(tableName, col.name);
            colDesc = colMeta?.description || '';
          } catch (e) {
            // column_metadata 表可能不存在，忽略
          }
          
          columns.push({
            name: col.name,
            type: col.type,
            nullable: col.notnull === 0,
            key: col.pk === 1 ? 'PRIMARY KEY' : '',
            default: col.dflt_value,
            extra: '',
            description: colDesc
          });
        }
        
        tables.push({
          name: tableName,
          description: tableDesc,
          columns
        });
      }
    }
    
    return Response.json({ tables });
  } catch (e: any) {
    console.error('Failed to load tables:', e);
    // 出错时返回空表列表而不是错误，让页面能正常显示
    return Response.json({ tables: [] });
  }
}
