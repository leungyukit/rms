// 服务端组件：直接查 MySQL，不依赖客户端 fetch
export const dynamic = 'force-dynamic';

import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';
import { getAsyncDb } from '@/lib/db';

const STATUS_META: Record<string, { label: string; icon: string; color: string }> = {
  received_not_evaluated: { label: '仅接收未评估', icon: '📥', color: 'from-gray-400 to-gray-500' },
  evaluated_not_scheduled: { label: '已评估未排期', icon: '📝', color: 'from-gray-500 to-gray-600' },
  scheduled:            { label: '已排期', icon: '📅', color: 'from-gray-700 to-gray-900' },
  in_progress:          { label: '处理中', icon: '🔄', color: 'from-amber-400 to-amber-500' },
  completed:            { label: '已完成', icon: '✅', color: 'from-gray-500 to-gray-600' },
  verified:             { label: '已验证', icon: '🔍', color: 'from-gray-500 to-gray-600' },
  closed:               { label: '已关闭', icon: '🗂️', color: 'from-gray-400 to-gray-500' },
};

export default async function DashboardPage() {
  let byStatus: Record<string, number> = {};

  try {
    const user = await getCurrentUser();
    const db = getAsyncDb();

    // 获取用户的 business_unit（用于"业务方"权限过滤）
    let userBusinessUnit: string | null = null;
    if (user) {
      try {
        const u = (await db.prepare('SELECT business_unit FROM users WHERE id = ?').get(user.id)) as any;
        userBusinessUnit = u?.business_unit || null;
      } catch {}
    }

    let sql = 'SELECT status, COUNT(*) as count FROM requirements';
    const params: any[] = [];
    const conditions: string[] = [];

    if (user) {
      if (!isGlobalAdmin(user.roles)) {
        conditions.push('(receiver_id = ? OR handler_id = ? OR verifier_id = ? OR requester_name = ?)');
        params.push(user.id, user.id, user.id, user.display_name);
        // 业务方：用户所属业务部门与需求业务方匹配
        if (userBusinessUnit) {
          conditions.push('business_unit = ?');
          params.push(userBusinessUnit);
        }
      }
    } else {
      // 未登录时返回空结果
      conditions.push('1=0');
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' OR ');
    }

    sql += ' GROUP BY status';

    const rows = (await db.prepare(sql).all(...params)) as any[];
    for (const row of rows) {
      byStatus[row.status] = parseInt(row.count);
    }
  } catch (e) {
    console.error('Dashboard query error:', e);
  }

  // 只显示有数据的指标
  const entries = Object.entries(byStatus).filter(([, count]) => count > 0);

  return (
    <div className="space-y-6">
      <div className="page-header">
        <h1 className="page-title">📈 需求分析</h1>
        <p className="page-subtitle">系统运行状况一览</p>
      </div>

      {entries.length > 0 ? (
        <div className="flex justify-center">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl w-full">
            {entries.map(([status, count]) => {
              const meta = STATUS_META[status] || { label: status, icon: '📊', color: 'from-gray-400 to-gray-500' };
              return (
                <div key={status} className="card group hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.color} flex items-center justify-center text-white text-lg shadow-sm`}>
                      {meta.icon}
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 font-medium">{meta.label}</div>
                      <div className="text-2xl font-bold text-gray-800">{count}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-text">暂无数据</div>
          </div>
        </div>
      )}
    </div>
  );
}
