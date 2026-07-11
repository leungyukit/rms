'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Workflow {
  id: number;
  name: string;
  description: string;
  trigger_type: string;
  status: 'draft' | 'active' | 'disabled';
  created_at: string;
  updated_at: string;
  step_count?: number;
  run_count?: number;
  success_count?: number;
  last_run_at?: string;
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', trigger_type: 'manual' });
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const load = async () => {
    setLoading(true);
    const params = statusFilter ? `?status=${statusFilter}` : '';
    const res = await fetch(`/api/workflows${params}`);
    if (!res.ok) { setWorkflows([]); setLoading(false); return; }
    const data = await res.json();
    const arr = Array.isArray(data) ? data : (data.workflows || data.data || []);
    setWorkflows(Array.isArray(arr) ? arr : []);
    setLoading(false);
  };
  useEffect(() => { load().catch(console.error); }, [statusFilter]);

  const create = async () => {
    if (!form.name.trim()) { setCreateError('请输入工作流名称'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const r = await fetch('/api/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setCreateError(data.error || '创建失败'); return; }
      setShowCreate(false);
      setForm({ name: '', description: '', trigger_type: 'manual' });
      load();
    } catch (e) { setCreateError('网络错误，请重试'); }
    finally { setCreating(false); }
  };

  const toggleStatus = async (w: Workflow) => {
    const next = w.status === 'active' ? 'disabled' : 'active';
    await fetch(`/api/workflows?id=${w.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ status: next }) });
    load();
  };

  const deleteWf = async (id: number) => {
    if (!confirm('确认删除？')) return;
    await fetch(`/api/workflows?id=${id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const statusBadge = (s: string) => s === 'active' ? 'badge-success' : s === 'draft' ? 'badge-gray' : 'badge-warning';
  const statusLabel = (s: string) => s === 'active' ? '启用' : s === 'draft' ? '草稿' : '禁用';

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>⚡ 工作流管理</h1>
        <p>自动化工作流，提升流程效率</p>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-input">
          <option value="">全部状态</option>
          <option value="active">启用</option><option value="draft">草稿</option>
          <option value="disabled">禁用</option>
        </select>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(!showCreate)} className="btn btn-primary">
          {showCreate ? '取消' : '➕ 新建工作流'}
        </button>
      </div>

      {showCreate && (
        <div className="card mb-4"><div className="card-body">
          <h3 className="card-title">新建工作流</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="form-label">名称 *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="form-input" placeholder="工作流名称" />
            </div>
            <div>
              <label className="form-label">触发方式</label>
              <select value={form.trigger_type} onChange={e => setForm({ ...form, trigger_type: e.target.value })} className="form-input">
                <option value="manual">手动触发</option>
                <option value="event">事件触发</option>
                <option value="schedule">定时触发</option>
              </select>
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label">描述</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="form-input" rows={2} placeholder="工作流描述" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={create} disabled={creating} className="btn btn-primary">{creating ? '创建中...' : '创建'}</button>
          {createError && <p className="text-red-500 text-sm mt-2">{createError}</p>}
          </div>
        </div></div>
      )}

      {loading ? <div className="text-center py-20 text-gray-400">加载中...</div> : workflows.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">⚡</div><div className="empty-state-text">暂无工作流</div></div>
      ) : (
        <div className="card"><div className="card-body" style={{ padding: 0 }}><div className="table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">名称</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">描述</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">状态</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">执行</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">成功</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">最近运行</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {workflows.map(w => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">#{w.id}</td>
                  <td className="px-4 py-3">
                    <Link href={`/workflows/designer?id=${w.id}`} className="font-medium hover:text-gray-800">{w.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{w.description || '—'}</td>
                  <td className="px-4 py-3"><span className={`badge ${statusBadge(w.status)}`}>{statusLabel(w.status)}</span></td>
                  <td className="px-4 py-3 text-gray-600">{w.run_count ?? 0}</td>
                  <td className="px-4 py-3 text-green-600">{w.success_count ?? 0}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{w.last_run_at ? new Date(w.last_run_at).toLocaleString('zh-CN') : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => toggleStatus(w)} className="btn btn-sm btn-secondary">
                        {w.status === 'active' ? '禁用' : '启用'}
                      </button>
                      <Link href={`/workflows/designer?id=${w.id}`} className="btn btn-sm btn-secondary">设计</Link>
                      <button onClick={() => deleteWf(w.id)} className="btn btn-sm btn-danger">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div></div>
      )}
    </div>
  );
}
