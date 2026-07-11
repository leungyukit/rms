'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [editError, setEditError] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<{ id: number; name: string; reqCount: number } | null>(null);
  const [transferTarget, setTransferTarget] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    fetch('/api/projects', { credentials: 'include' }).then(r => r.json()).then(d => { setProjects(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true); setCreateError('');
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, description: newDesc }) });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || '创建失败'); return; }
      setNewName(''); setNewDesc(''); setShowCreate(false); load();
    } catch { setCreateError('网络错误'); }
    finally { setCreating(false); }
  };

  const saveEdit = async (id: number) => {
    setEditError('');
    const res = await fetch('/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...editForm }) });
    const data = await res.json();
    if (!res.ok) { setEditError(data.error || '保存失败'); return; }
    setEditingId(null); setEditError(''); load();
  };

  const startDelete = async (project: any) => {
    const res = await fetch('/api/projects', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: project.id, action: 'check' }) });
    const data = await res.json();
    setDeleteDialog({ id: project.id, name: project.name, reqCount: data.req_count || 0 });
    setTransferTarget('');
  };

  const confirmDelete = async (action: 'delete_all' | 'transfer') => {
    if (!deleteDialog) return;
    if (action === 'transfer' && !transferTarget) return;
    setDeleting(true);
    await fetch('/api/projects', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deleteDialog.id, action, target_project_id: action === 'transfer' ? Number(transferTarget) : undefined }),
    });
    setDeleteDialog(null); setDeleting(false); load();
  };

  const directDelete = async () => {
    if (!deleteDialog) return;
    setDeleting(true);
    await fetch('/api/projects', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: deleteDialog.id, action: 'delete_all' }),
    });
    setDeleteDialog(null); setDeleting(false); load();
  };

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>📁 项目管理</h1>
        <p>共 {projects.length} 个项目</p>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">➕ 新建项目</button>
      </div>

      {/* Create */}
      {showCreate && (
        <div className="card mb-4"><div className="card-body">
          <h3 className="card-title">新建项目</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="项目名称 *" className="form-input" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述（可选）" className="form-input" />
          </div>
          {createError && <div className="text-red-500 text-sm bg-red-50 rounded-lg p-3 mb-3">{createError}</div>}
          <div className="flex gap-2">
            <button onClick={create} disabled={creating} className="btn btn-primary">
              {creating ? '创建中...' : '创建'}
            </button>
            <button onClick={() => setShowCreate(false)} className="btn btn-secondary">取消</button>
          </div>
        </div></div>
      )}

      {/* Delete dialog */}
      {deleteDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="card" style={{ width: 480, maxWidth: '90vw' }}><div className="card-body">
            <h3 className="card-title">删除项目「{deleteDialog.name}」</h3>
            {deleteDialog.reqCount === 0 ? (
              <>
                <p className="text-sm text-gray-600 mb-4">该项目下没有关联需求，确定删除？</p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setDeleteDialog(null)} className="btn btn-secondary">取消</button>
                  <button onClick={directDelete} disabled={deleting} className="btn btn-danger">
                    {deleting ? '删除中...' : '确认删除'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  该项目下有 <strong className="text-red-600">{deleteDialog.reqCount}</strong> 条需求，请选择处理方式：
                </p>
                <div className="space-y-3 mb-4">
                  <div className="alert alert-danger">
                    <div className="font-medium text-sm">🗑️ 删除所有关联需求</div>
                    <p className="text-xs mt-1">将删除该项目及其下所有 {deleteDialog.reqCount} 条需求（不可恢复）</p>
                    <button onClick={() => confirmDelete('delete_all')} disabled={deleting}
                      className="btn btn-sm btn-danger mt-2">
                      {deleting ? '处理中...' : '删除项目和所有需求'}
                    </button>
                  </div>
                  <div className="alert alert-info">
                    <div className="font-medium text-sm">📦 转移需求到其他项目</div>
                    <p className="text-xs mt-1">将所有需求转移到选择的项目，然后删除当前项目</p>
                    <div className="flex gap-2 mt-2">
                      <select value={transferTarget} onChange={e => setTransferTarget(e.target.value)}
                        className="form-input flex-1">
                        <option value="">选择目标项目...</option>
                        {projects.filter(p => p.id !== deleteDialog.id).map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.req_count || 0}条需求)</option>
                        ))}
                      </select>
                      <button onClick={() => confirmDelete('transfer')} disabled={deleting || !transferTarget}
                        className="btn btn-sm btn-primary">
                        {deleting ? '处理中...' : '转移并删除'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setDeleteDialog(null)} className="btn btn-secondary">取消</button>
                </div>
              </>
            )}
          </div></div>
        </div>
      )}

      {/* Project list */}
      {loading ? <div className="text-gray-400">加载中...</div> : (
        <div className="card"><div className="card-body" style={{ padding: 0 }}><div className="table-wrap">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">项目名称</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">描述</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">状态</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">需求数</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">创建人</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {projects.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">暂无项目</td></tr>
              ) : projects.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400">{p.id}</td>
                  <td className="px-4 py-3">
                    {editingId === p.id ? (
                      <input value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})}
                        className="form-input py-1" />
                    ) : (
                      <div className="flex items-center gap-2">
                        {p.health_level ? (
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                            p.health_level === 'green' ? 'bg-green-500' :
                            p.health_level === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                          }`} title={`健康度: ${p.health_score ?? '-'}`} />
                        ) : (
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-gray-300" title="未计算" />
                        )}
                        <Link href={`/projects/${p.id}`} className="font-medium hover:text-gray-800">{p.name}</Link>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {editingId === p.id ? (
                      <input value={editForm.description || ''} onChange={e => setEditForm({...editForm, description: e.target.value})}
                        className="form-input py-1" />
                    ) : (p.description || '—')}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === p.id ? (
                      <select value={editForm.status || 'active'} onChange={e => setEditForm({...editForm, status: e.target.value})}
                        className="form-input py-1">
                        <option value="active">进行中</option>
                        <option value="paused">暂停</option>
                        <option value="completed">已完成</option>
                        <option value="archived">已归档</option>
                      </select>
                    ) : (
                      <span className={`badge ${p.status === 'active' ? 'badge-success' : p.status === 'paused' ? 'badge-warning' : p.status === 'completed' ? 'badge-info' : 'badge-gray'}`}>
                        {(() => {
                          const statusMap: Record<string, string> = { active: '进行中', paused: '暂停', completed: '已完成', archived: '已归档' };
                          return statusMap[p.status] || p.status;
                        })()}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${p.req_count > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{p.req_count || 0}</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.health_score != null ? (
                      <span className={`text-xs font-medium ${p.health_level === 'green' ? 'text-green-600' : p.health_level === 'yellow' ? 'text-yellow-600' : p.health_level === 'red' ? 'text-red-600' : 'text-gray-400'}`}>{p.health_score}</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.creator_name || '—'}</td>
                  <td className="px-4 py-3">
                    {editingId === p.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(p.id)} className="btn btn-sm btn-primary">保存</button>
                        <button onClick={() => setEditingId(null)} className="btn btn-sm btn-secondary">取消</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingId(p.id); setEditForm({ name: p.name, description: p.description, status: p.status }); }}
                          className="btn btn-sm btn-secondary">编辑</button>
                        <button onClick={() => startDelete(p)} className="btn btn-sm btn-danger">删除</button>
                      </div>
                    )}
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
