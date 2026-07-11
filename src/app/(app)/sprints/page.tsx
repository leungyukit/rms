'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Sprint {
  id: number;
  name: string;
  goal: string;
  start_date: string;
  end_date: string;
  status: string;
  capacity_hours: number;
  project_id: number;
  project_name: string;
  stats?: { completion_rate: number; total: number; overdue_count: number };
}

export default function SprintsPage() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', start_date: '', end_date: '', capacity_hours: 40, project_id: '' });
  const [projects, setProjects] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (projectFilter) params.set('project_id', projectFilter);
    fetch(`/api/sprints?${params}`).then(r => r.json()).then(d => { setSprints(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => { setSprints([]); setLoading(false); });
  };
  useEffect(load, [statusFilter, projectFilter]);
  useEffect(() => {
    fetch('/api/projects', { credentials: 'include' }).then(r => r.json()).then(d => setProjects(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const create = async () => {
    if (!form.name.trim() || !form.start_date || !form.end_date) { alert('名称、开始、结束日期必填'); return; }
    if (!form.project_id) { alert('请选择项目'); return; }
    const r = await fetch('/api/sprints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const j = await r.json();
    if (!r.ok) { alert(j.error); return; }
    setShowCreate(false);
    setForm({ name: '', goal: '', start_date: '', end_date: '', capacity_hours: 40, project_id: '' });
    load();
  };

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>🏃 Sprint 管理</h1>
        <p>管理迭代周期和冲刺目标</p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-input">
          <option value="">全部状态</option>
          <option value="planned">计划中</option><option value="active">进行中</option>
          <option value="completed">已完成</option><option value="cancelled">已取消</option>
        </select>
        <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} className="form-input">
          <option value="">全部项目</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(!showCreate)} className="btn btn-primary">
          {showCreate ? '取消' : '➕ 新建 Sprint'}
        </button>
      </div>

      {showCreate && (
        <div className="card mb-4"><div className="card-body">
          <h3 className="card-title">新建 Sprint</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="form-label">名称 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="form-input" placeholder="Sprint 名称" />
            </div>
            <div>
              <label className="form-label">目标</label>
              <input value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })} className="form-input" placeholder="Sprint 目标" />
            </div>
            <div>
              <label className="form-label">项目 *</label>
              <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} className="form-input">
                <option value="">选择项目...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">容量 (h)</label>
              <input type="number" value={form.capacity_hours} onChange={e => setForm({ ...form, capacity_hours: parseInt(e.target.value) || 0 })} className="form-input" />
            </div>
            <div>
              <label className="form-label">开始日期 *</label>
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="form-input" />
            </div>
            <div>
              <label className="form-label">结束日期 *</label>
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="form-input" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={create} className="btn btn-primary">创建</button>
          </div>
        </div></div>
      )}

      {loading ? <div className="text-center py-20 text-gray-400">加载中...</div> : sprints.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🏃</div><div className="empty-state-text">暂无 Sprint</div></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sprints.map(s => {
            const badge = s.status === 'active' ? 'badge-success' : s.status === 'planned' ? 'badge-info' : s.status === 'completed' ? 'badge-gray' : 'badge-danger';
            const label = s.status === 'active' ? '进行中' : s.status === 'planned' ? '计划中' : s.status === 'completed' ? '已完成' : '已取消';
            return (
              <Link key={s.id} href={`/sprints/${s.id}`} className="card hover:border-gray-400 transition">
                <div className="card-body">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">🏃 {s.name}</h3>
                    <span className={`badge ${badge}`}>{label}</span>
                  </div>
                  <div className="text-xs text-gray-500 mb-2">{s.project_name} · {s.start_date} ~ {s.end_date}</div>
                  {s.goal && <div className="text-sm text-gray-700 line-clamp-2 mb-3">{s.goal}</div>}
                  {s.stats && (
                    <>
                      <div className="text-xs text-gray-500 mb-1">完成度 {s.stats.completion_rate}%</div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-gray-800" style={{ width: `${s.stats.completion_rate}%` }} />
                      </div>
                      <div className="text-xs text-gray-500">容量 {s.capacity_hours}h · 超期 {s.stats.overdue_count}</div>
                    </>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
