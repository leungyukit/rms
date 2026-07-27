
import { getCurrentUser } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: '未登录' }, { status: 401 });
    }

    const { query } = await request.json();
    
    const db = getAsyncDb();
    // 注意：这里需要非常小心，实际生产中应该做SQL注入防护
    // 暂时只允许SELECT语句
    if (!query.trim().toUpperCase().startsWith('SELECT')) {
      return Response.json({ error: '只允许SELECT查询' }, { status: 400 });
    }

    const rows = await db.prepare(query).all();
    
    return Response.json({ data: rows });
  } catch (e) {
    console.error('Failed to execute query:', e);
    return Response.json({ error: '执行查询失败' }, { status: 500 });
  }
}
