'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface OverdueItem {
  id: number;
  instance_id: number;
  node_key: string;
  label: string;
  assignee_id: number | null;
  entered_at: string;
  durationMin?: number;
  thresholdMin?: number;
  requirement_id: number;
  workflow_name: string;
  requirement_title: string;
  priority: string;
  node_status?: string;
}

export default function WorkflowMonitorPage() {
  const [runs, setRuns] = useState<OverdueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedRun, setSelectedRun] = useState<OverdueItem | null>(null);
  const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0, running: 0 });

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/workflow-monitor');
    const raw = await res.text().catch(() => '');
    const data = raw ? JSON.parse(raw) : {};
    if (!res.ok) {
      setRuns([]);
      setStats({ total: 0, completed: 0, failed: 0, running: 0 });
      setLoading(false);
      return;
    }
    const items = data.overdue || [];
    setRuns(items);
    setStats({
      total: items.length,
      completed: 0,
      failed: items.length,
      running: 0,
    });
    setLoading(false);
  };
  useEffect(() => { load().catch(console.error); }, [statusFilter]);

  const statusBadge = (s: string) => s === 'overdue' ? 'badge-danger' : s === 'active' ? 'badge-primary' : 'badge-gray';
  const statusLabel = (s: string) => s === 'overdue' ? '超时' : s === 'active' ? '运行中' : s === 'completed' ? '成功' : s === 'failed' ? '失败' : s === 'cancelled' ? '已取消' : s;

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>📊 SLA 预警</h1>
        <p>实时监控工作流执行状态和SLA预警</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">总执行次数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-green-600">{stats.completed}</div>
          <div className="stat-label">成功</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-red-600">{stats.failed}</div>
          <div className="stat-label">失败</div>
        </div>
        <div className="stat-card">
          <div className="stat-value text-gray-900">{stats.running}</div>
          <div className="stat-label">运行中</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-input">
          <option value="">全部状态</option>
          <option value="completed">成功</option><option value="failed">失败</option>
          <option value="running">运行中</option><option value="cancelled">已取消</option>
        </select>
        <button onClick={load} className="btn btn-secondary">🔄 刷新</button>
        <div className="flex-1" />
        <Link href="/workflows" className="btn btn-secondary">← 返回列表</Link>
      </div>

      {loading ? <div className="text-center py-20 text-gray-400">加载中...</div> : runs.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📊</div><div className="empty-state-text">暂无执行记录</div></div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {/* List */}
          <div className="col-span-2 card"><div className="card-body" style={{ padding: 0 }}><div className="table-wrap">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">实例 ID</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">需求</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">工作流</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">节点</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">状态</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">进入时间</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map(r => (
                  <tr key={r.id} className={`hover:bg-gray-50 cursor-pointer ${selectedRun?.id === r.id ? 'bg-gray-100' : ''}`} onClick={() => setSelectedRun(r)}>
                    <td className="px-4 py-3 text-gray-400">#{r.instance_id}</td>
                    <td className="px-4 py-3">{r.requirement_title || `#${r.requirement_id}`}</td>
                    <td className="px-4 py-3">{r.workflow_name}</td>
                    <td className="px-4 py-3">{r.label || r.node_key}</td>
                    <td className="px-4 py-3"><span className={`badge badge-danger`}>超时</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(r.entered_at).toLocaleString('zh-CN')}</td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); fetch('/api/workflow-monitor', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ node_id: r.id }) }).then(load); }} className="btn btn-sm btn-secondary">重置</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div></div>

          {/* Detail */}
          <div className="card"><div className="card-body">
            <h3 className="card-title">节点详情</h3>
            {selectedRun ? (
              <div className="space-y-3 text-sm">
                <div><span className="text-xs text-gray-500">节点 ID</span><div className="font-mono">#{selectedRun.id}</div></div>
                <div><span className="text-xs text-gray-500">实例 ID</span><div className="font-mono">#{selectedRun.instance_id}</div></div>
                <div><span className="text-xs text-gray-500">需求</span><div>{selectedRun.requirement_title || `#${selectedRun.requirement_id}`}</div></div>
                <div><span className="text-xs text-gray-500">节点</span><div>{selectedRun.label || selectedRun.node_key}</div></div>
                <div><span className="text-xs text-gray-500">状态</span><div><span className="badge badge-danger">超时</span></div></div>
                <div><span className="text-xs text-gray-500">进入时间</span><div>{new Date(selectedRun.entered_at).toLocaleString('zh-CN')}</div></div>
                <div><span className="text-xs text-gray-500">优先级</span><div>{selectedRun.priority}</div></div>
              </div>
            ) : <div className="text-center text-gray-400 py-8">选择一条记录查看详情</div>}
          </div></div>
        </div>
      )}
    </div>
  );
}
