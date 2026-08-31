'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface MemberLoad {
  user_id: number;
  user_name: string;
  role_name: string;
  active_reqs: number;
  total_estimated: number;
  total_actual: number;
  utilization: number;
  overdue_count: number;
  sprint_ids: number[];
}

interface LoadRow {
  id: number;
  title: string;
  status: string;
  priority: string;
  project_name: string;
  sprint_name: string | null;
  estimate_hours: number | null;
  actual_hours: number | null;
  handler_name: string;
  deadline?: string;
  days_left?: number | null;
  overdue: boolean;
}

interface ProjectRow {
  project_id: number;
  project_name: string;
  req_count: number;
  estimate_total: number;
  actual_total: number;
  members: MemberLoad[];
}

export default function WorkloadPage() {
  const [members, setMembers] = useState<MemberLoad[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<MemberLoad | null>(null);
  const [memberReqs, setMemberReqs] = useState<LoadRow[]>([]);
  const [scopeFilter, setScopeFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const [mRes, pRes] = await Promise.all([
        fetch('/api/workload/members', { credentials: 'include' }),
        fetch('/api/workload/projects', { credentials: 'include' }),
      ]);
      const mData = await mRes.json();
      const pData = await pRes.json();
      setMembers(mData.members || []);
      setProjects(pData.projects || []);
    } catch { setMembers([]); setProjects([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const selectMember = async (m: MemberLoad) => {
    setSelectedMember(m);
    const params = new URLSearchParams({ user_id: String(m.user_id) });
    const res = await fetch('/api/workload/requirements?' + params.toString());
    const data = await res.json();
    setMemberReqs(data.requirements || []);
  };

  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => {
        const u = data?.user || data;
        if (u?.id) setCurrentUserId(u.id);
      })
      .catch(() => {});
  }, []);

  const displayMembers = members.filter(m => {
    if (scopeFilter === 'my') return currentUserId ? m.user_id === currentUserId : false;
    if (scopeFilter === 'overloaded') return m.utilization >= 100;
    return true;
  });

  const utilBadge = (u: number) => u >= 120 ? 'badge-danger' : u >= 90 ? 'badge-warning' : 'badge-success';

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>📊 团队工作量</h1>
        <p>实时掌握团队成员负荷和需求分配</p>
      </div>

      <div className="flex gap-2 mb-4">
        <select value={scopeFilter} onChange={e => setScopeFilter(e.target.value)} className="form-input">
          <option value="all">全部成员</option>
          <option value="overloaded">⚠️ 超负荷 (≥100%)</option>
          <option value="my">我负责的</option>
        </select>
        <div className="flex-1" />
        <button onClick={load} className="btn btn-secondary">🔄 刷新</button>
        <Link href="/timesheet" className="btn btn-secondary">📅 工时周报</Link>
      </div>

      {loading ? <div className="text-center py-20 text-gray-400">加载中...</div> : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-4 space-y-3">
            <div className="card">
              <div className="card-header"><h3 className="card-title">👥 成员 ({displayMembers.length})</h3></div>
              <div className="card-body" style={{ padding: 0 }}>
                <div className="divide-y">
                  {displayMembers.length === 0 && <div className="text-center py-8 text-gray-400">暂无数据</div>}
                  {displayMembers.map(m => {
                    const isSelected = selectedMember && selectedMember.user_id === m.user_id;
                    return (
                      <div key={m.user_id} onClick={() => selectMember(m)}
                        className={"p-3 cursor-pointer transition hover:bg-gray-50 " + (isSelected ? "bg-gray-100 border-l-2 border-l-gray-800" : "")}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{m.user_name}</span>
                          <span className={"badge " + utilBadge(m.utilization)}>{m.utilization}%</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>📋 {m.active_reqs} 个需求</span>
                          <span>⏱ {typeof m.total_estimated === 'number' ? m.total_estimated.toFixed(1) : '0'}h 估算</span>
                          <span>✓ {typeof m.total_actual === 'number' ? m.total_actual.toFixed(1) : '0'}h 实际</span>
                        </div>
                        {m.overdue_count > 0 && <div className="text-xs text-red-500 mt-1">⚠️ {m.overdue_count} 个超期</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="col-span-8 space-y-4">
            {selectedMember ? (
              <>
                <div className="card">
                  <div className="card-body">
                    <div className="flex items-center gap-4">
                      <div>
                        <h3 className="font-bold text-lg">{selectedMember.user_name}</h3>
                        <div className="text-xs text-gray-500">{selectedMember.role_name}</div>
                      </div>
                      <div className="flex gap-4 ml-auto">
                        <div className="stat-card">
                          <div className="stat-value">{selectedMember.active_reqs}</div>
                          <div className="stat-label">活跃需求</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-value">{typeof selectedMember.total_estimated === 'number' ? selectedMember.total_estimated.toFixed(1) : '0'}h</div>
                          <div className="stat-label">估算工时</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-value">{selectedMember.utilization}%</div>
                          <div className="stat-label">饱和度</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className={"h-full rounded-full transition " + (selectedMember.utilization >= 100 ? "bg-red-500" : selectedMember.utilization >= 80 ? "bg-yellow-500" : "bg-green-500")}
                          style={{ width: Math.min(100, selectedMember.utilization) + '%' }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-body" style={{ padding: 0 }}>
                    <div className="table-wrap">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">#</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">需求</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">状态</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">项目</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">Sprint</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">估算</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">实际</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">剩余</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {memberReqs.length === 0 ? (
                            <tr><td colSpan={8} className="text-center py-8 text-gray-400">暂无需求</td></tr>
                          ) : memberReqs.map(r => {
                            const statusMap: Record<string, string> = { received_not_evaluated: '仅接收，未评估', evaluated_not_scheduled: '已评估，未排期', scheduled: '已排期', in_progress: '处理中', completed: '已完成', verified: '已验证', closed: '已关闭' };
                            const statusColorMap: Record<string, string> = { received_not_evaluated: 'badge-gray', evaluated_not_scheduled: 'badge-warning', scheduled: 'badge-info', in_progress: 'badge-primary', completed: 'badge-success', verified: 'badge-info', closed: 'badge-gray' };
                            const remaining = r.estimate_hours ? (r.estimate_hours - (r.actual_hours || 0)).toFixed(1) : '—';
                            return (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-gray-400 font-mono">#{r.id}</td>
                                <td className="px-4 py-2.5">
                                  <Link href={'/requirements/' + r.id} className="text-gray-900 hover:underline truncate block" style={{ maxWidth: '200px' }}>{r.title}</Link>
                                </td>
                                <td className="px-4 py-2.5"><span className={"badge " + (statusColorMap[r.status] || 'badge-gray')}>{statusMap[r.status] || r.status}</span></td>
                                <td className="px-4 py-2.5 text-xs text-gray-600">{r.project_name}</td>
                                <td className="px-4 py-2.5 text-xs text-gray-500">{r.sprint_name || '—'}</td>
                                <td className="px-4 py-2.5 text-xs text-gray-600">{r.estimate_hours ? r.estimate_hours + 'h' : '—'}</td>
                                <td className="px-4 py-2.5 text-xs text-gray-600">{r.actual_hours ? r.actual_hours + 'h' : '—'}</td>
                                <td className={"px-4 py-2.5 text-xs " + (remaining !== '—' && Number(remaining) < 0 ? 'text-red-500' : '')}>{remaining}h</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header"><h3 className="card-title">📁 项目负荷</h3></div>
                  <div className="card-body" style={{ padding: 0 }}>
                    <div className="table-wrap">
                      <table className="w-full text-sm">
                        <thead>
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">项目</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">需求数</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">估算</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">实际</th>
                            <th className="text-left px-4 py-3 font-medium text-gray-500">完成率</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {projects.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">暂无数据</td></tr>}
                          {projects.map(p => {
                            const pct = p.estimate_total ? Math.round((p.actual_total / p.estimate_total) * 100) : 0;
                            return (
                              <tr key={p.project_id} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5">
                                  <Link href={'/projects/' + p.project_id} className="font-medium hover:text-gray-800">{p.project_name}</Link>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-600">{p.req_count}</td>
                                <td className="px-4 py-2.5 text-xs text-gray-600">{typeof p.estimate_total === 'number' ? p.estimate_total.toFixed(1) : '0'}h</td>
                                <td className="px-4 py-2.5 text-xs text-gray-600">{typeof p.actual_total === 'number' ? p.actual_total.toFixed(1) : '0'}h</td>
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full">
                                      <div className={"h-full rounded-full " + (pct > 100 ? "bg-red-500" : "bg-gray-800")}
                                        style={{ width: Math.min(100, pct) + '%' }} />
                                    </div>
                                    <span className="text-xs font-mono text-gray-600 w-10 text-right">{pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="card">
                <div className="card-body">
                  <div className="empty-state">
                    <div className="empty-state-icon">👥</div>
                    <div className="empty-state-text">选择成员查看详情</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
