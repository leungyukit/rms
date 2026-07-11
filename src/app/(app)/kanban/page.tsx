import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

// 服务端组件：直接查数据
export const dynamic = 'force-dynamic';

const STATUS_MAP: Record<string, string> = {
  received_not_evaluated: '未评估',
  evaluated_not_scheduled: '未排期',
  scheduled: '已排期',
  in_progress: '处理中',
  completed: '已完成',
  verified: '已验证',
  closed: '已关闭',
};

export default async function KanbanPage() {
  let items: any[] = [];
  try {
    const user = await getCurrentUser();
    const db = getAsyncDb();

    const conditions: string[] = [];
    const params: any[] = [];

    // 全局管理员看全部，其他人只看到自己参与的需求
    // 未登录用户看空结果
    if (user) {
      if (!isGlobalAdmin(user.roles)) {
        // 使用 OR 分组，确保条件正确组合
        conditions.push('(receiver_id = ? OR handler_id = ? OR verifier_id = ? OR requester_name = ?)');
        params.push(user.id, user.id, user.id, user.display_name);
      }
    } else {
      // 未登录时返回空结果
      conditions.push('1=0');
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' OR ') : '';
    const sql = `
      SELECT id, title, status, priority, planned_end
      FROM requirements
      ${where}
      ORDER BY FIELD(status, 'received_not_evaluated','evaluated_not_scheduled','scheduled','in_progress','completed','verified','closed')
      LIMIT 50
    `;

    const rows = (await db.prepare(sql).all(...params)) as any[];
    items = rows.map((r: any) => ({
      id: r.id,
      title: r.title || '',
      status: r.status || '',
      priority: r.priority || '',
      planned_end: r.planned_end || '',
    }));
  } catch (e) {
    console.error('Kanban query error:', e);
  }

  const columns = ['received_not_evaluated', 'evaluated_not_scheduled', 'scheduled', 'in_progress', 'completed', 'verified', 'closed'];

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">📊 看板视图</h1>
        <p className="page-subtitle">需求按状态可视化跟踪</p>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 gap-3 min-w-[900px]">
          {columns.map(col => {
            const colItems = items.filter(i => i.status === col);
            const colors: Record<string, string> = {
              received_not_evaluated: 'border-gray-300 bg-gray-50',
              evaluated_not_scheduled: 'border-yellow-300 bg-yellow-50',
              scheduled: 'border-gray-400 bg-gray-100',
              in_progress: 'border-gray-400 bg-gray-100',
              completed: 'border-green-300 bg-green-50',
              verified: 'border-gray-400 bg-gray-100',
              closed: 'border-gray-200 bg-gray-100',
            };
            return (
              <div key={col} className={`border rounded-lg p-2 ${colors[col] || 'border-gray-200 bg-white'}`}>
                <div className="text-xs font-semibold text-gray-600 mb-2">{STATUS_MAP[col] || col}</div>
                <div className="space-y-2">
                  {colItems.map(item => (
                    <a key={item.id} href={`/requirements/${item.id}`} className="block card p-3 text-sm hover:shadow-md transition cursor-pointer">
                      <div className="font-medium text-gray-900 hover:text-black">{item.title}</div>
                      <div className="text-xs text-gray-400 mt-1">#{item.id}</div>
                    </a>
                  ))}
                  {colItems.length === 0 && (
                    <div className="text-xs text-gray-300 p-2">-</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
