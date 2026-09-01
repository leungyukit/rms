'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

/**
 * 知识分类树管理（P3 + P2 ACL）
 *
 * path 物料路径形如 /1/4/9/，层级 = 斜杠数 - 2，据此缩进渲染，
 * 不用在前端再递归建树。后端已按 sort_order 排好序。
 */
function depthOf(path: string) {
  if (!path) return 0;
  return Math.max(0, path.split('/').filter(Boolean).length - 1);
}

export default function KnowledgeCategoriesPage() {
  const [items, setItems] = useState<any[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // 新建/编辑
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', parent_id: '', description: '', sort_order: 0, is_restricted: false });
  const [editing, setEditing] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});

  // ACL 面板
  const [aclTarget, setAclTarget] = useState<any>(null);
  const [aclRows, setAclRows] = useState<any[]>([]);
  const [aclLoading, setAclLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr('');
    try {
      const [cRes, rRes] = await Promise.all([
        fetch('/api/knowledge/categories'),
        fetch('/api/roles'),
      ]);
      if (!cRes.ok) throw new Error(String(cRes.status));
      const cData = await cRes.json();
      setItems(cData.items || []);
      setHiddenCount(cData.hiddenCount || 0);
      // /api/roles 返回裸数组，不是 { items: [] }
      if (rRes.ok) {
        const rData = await rRes.json();
        setRoles(Array.isArray(rData) ? rData : []);
      }
    } catch {
      setErr('加载失败，请确认已登录且有权限');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!createForm.name.trim()) return alert('分类名必填');
    const res = await fetch('/api/knowledge/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...createForm,
        parent_id: createForm.parent_id === '' ? null : Number(createForm.parent_id),
      }),
    });
    const data = await res.json();
    if (data.success) {
      setShowCreate(false);
      setCreateForm({ name: '', parent_id: '', description: '', sort_order: 0, is_restricted: false });
      load();
    } else {
      alert(data.error || '创建失败');
    }
  };

  const saveEdit = async () => {
    const res = await fetch(`/api/knowledge/categories/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editForm.name,
        description: editForm.description,
        sort_order: Number(editForm.sort_order) || 0,
        is_restricted: !!editForm.is_restricted,
        // 只在真的改了父节点时才传 —— 后端收到 parent_id 就会重算整棵子树 path
        ...(editForm.parent_id !== String(editing.parent_id ?? '')
          ? { parent_id: editForm.parent_id === '' ? null : Number(editForm.parent_id) }
          : {}),
      }),
    });
    const data = await res.json();
    if (data.success) { setEditing(null); load(); }
    else alert(data.error || '保存失败');
  };

  const remove = async (cat: any) => {
    if (!confirm(`删除分类「${cat.name}」？\n（若下面还有子分类或知识条目会被拒绝）`)) return;
    const res = await fetch(`/api/knowledge/categories/${cat.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) load();
    else alert(data.error || '删除失败');
  };

  const openAcl = async (cat: any) => {
    setAclTarget(cat);
    setAclLoading(true);
    try {
      const res = await fetch(`/api/knowledge/categories/${cat.id}/acl`);
      const data = await res.json();
      setAclRows(data.items || []);
    } catch {
      setAclRows([]);
    } finally {
      setAclLoading(false);
    }
  };

  const setAcl = async (roleName: string, patch: any) => {
    const cur = aclRows.find(r => r.role_name === roleName) || { can_read: 0, can_write: 0, can_manage: 0 };
    const next = {
      role_name: roleName,
      can_read: patch.can_read ?? !!cur.can_read,
      can_write: patch.can_write ?? !!cur.can_write,
      can_manage: patch.can_manage ?? !!cur.can_manage,
    };
    const res = await fetch(`/api/knowledge/categories/${aclTarget.id}/acl`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    const data = await res.json();
    if (data.success) openAcl(aclTarget);
    else alert(data.error || '保存失败');
  };

  const revokeAcl = async (roleName: string) => {
    const res = await fetch(`/api/knowledge/categories/${aclTarget.id}/acl?role_name=${encodeURIComponent(roleName)}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) openAcl(aclTarget);
    else alert(data.error || '撤销失败');
  };

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>🗂️ 知识分类管理</h1>
        <p>
          分类树是知识权限的载体：勾选「受限」后，只有被显式授权的角色才能看到该分类及其所有子分类
          {hiddenCount > 0 && ` · 有 ${hiddenCount} 个分类因权限对你隐藏`}
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <Link href="/knowledge" className="btn btn-secondary">← 知识中心</Link>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">➕ 新建分类</button>
      </div>

      {err ? (
        <div className="card"><div className="card-body text-center text-gray-500">{err}</div></div>
      ) : loading ? (
        <div className="text-center py-20 text-gray-400">加载中...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🗂️</div>
          <div className="empty-state-text">还没有分类</div>
          <p className="text-sm text-gray-400 mt-2">建好分类树后，知识条目就能按分类归档并按分类控制权限</p>
        </div>
      ) : (
        <div className="card"><div className="card-body p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-[var(--border-c)] text-left text-gray-500">
                <th className="px-4 py-2">分类</th>
                <th className="px-4 py-2 w-24">知识数</th>
                <th className="px-4 py-2 w-24">受限</th>
                <th className="px-4 py-2 w-20">排序</th>
                <th className="px-4 py-2 w-56">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id} className="border-b border-[var(--border-c)]">
                  <td className="px-4 py-2">
                    <span style={{ paddingLeft: depthOf(c.path) * 20 }}>
                      {depthOf(c.path) > 0 && <span className="text-gray-300 mr-1">└</span>}
                      <span className="font-medium text-gray-900">{c.name}</span>
                    </span>
                    {c.description && <div className="text-xs text-gray-400 mt-0.5" style={{ paddingLeft: depthOf(c.path) * 20 }}>{c.description}</div>}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{c.entry_count ?? 0}</td>
                  <td className="px-4 py-2">
                    {c.is_restricted
                      ? <span className="badge badge-danger">受限</span>
                      : <span className="badge badge-gray">开放</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-400">{c.sort_order}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(c); setEditForm({ name: c.name, description: c.description || '', sort_order: c.sort_order, is_restricted: !!c.is_restricted, parent_id: String(c.parent_id ?? '') }); }} className="btn btn-sm btn-secondary">编辑</button>
                      <button onClick={() => openAcl(c)} className="btn btn-sm btn-secondary">🔒 权限</button>
                      <button onClick={() => remove(c)} className="btn btn-sm btn-danger">删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}

      {/* 新建 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="card" style={{ width: 480, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div className="card-body">
              <h3 className="card-title">➕ 新建分类</h3>
              <div className="space-y-3">
                <div>
                  <label className="form-label">分类名 *</label>
                  <input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="form-label">父分类</label>
                  <select value={createForm.parent_id} onChange={e => setCreateForm({ ...createForm, parent_id: e.target.value })} className="form-input">
                    <option value="">（顶级分类）</option>
                    {items.map(c => <option key={c.id} value={c.id}>{'　'.repeat(depthOf(c.path))}{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">说明</label>
                  <input value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })} className="form-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">排序</label>
                    <input type="number" value={createForm.sort_order} onChange={e => setCreateForm({ ...createForm, sort_order: Number(e.target.value) })} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">访问控制</label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 mt-2">
                      <input type="checkbox" checked={createForm.is_restricted} onChange={e => setCreateForm({ ...createForm, is_restricted: e.target.checked })} />
                      设为受限分类
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <button onClick={() => setShowCreate(false)} className="btn btn-secondary">取消</button>
                <button onClick={create} className="btn btn-primary">创建</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑 */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditing(null)}>
          <div className="card" style={{ width: 480, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <div className="card-body">
              <h3 className="card-title">编辑分类「{editing.name}」</h3>
              <div className="space-y-3">
                <div>
                  <label className="form-label">分类名</label>
                  <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="form-label">父分类</label>
                  <select value={editForm.parent_id} onChange={e => setEditForm({ ...editForm, parent_id: e.target.value })} className="form-input">
                    <option value="">（顶级分类）</option>
                    {items.filter(c => c.id !== editing.id && !String(c.path).startsWith(editing.path)).map(c => (
                      <option key={c.id} value={c.id}>{'　'.repeat(depthOf(c.path))}{c.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">已自动排除自己和自己的子分类（否则子树会脱离根节点）</p>
                </div>
                <div>
                  <label className="form-label">说明</label>
                  <input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="form-input" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">排序</label>
                    <input type="number" value={editForm.sort_order} onChange={e => setEditForm({ ...editForm, sort_order: e.target.value })} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">访问控制</label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 mt-2">
                      <input type="checkbox" checked={!!editForm.is_restricted} onChange={e => setEditForm({ ...editForm, is_restricted: e.target.checked })} />
                      设为受限分类
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <button onClick={() => setEditing(null)} className="btn btn-secondary">取消</button>
                <button onClick={saveEdit} className="btn btn-primary">保存</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACL */}
      {aclTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setAclTarget(null)}>
          <div className="card" style={{ width: 620, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="card-body">
              <h3 className="card-title">🔒 「{aclTarget.name}」的访问权限</h3>
              {aclTarget.is_restricted ? (
                <p className="text-xs text-gray-500 mb-3">
                  该分类已受限：<strong>只有下面勾了「可读」的角色</strong>才能看到它及其所有子分类的知识。
                  全局管理员始终可见。
                </p>
              ) : (
                <p className="text-xs text-gray-500 mb-3">
                  ⚠️ 该分类当前是<strong>开放</strong>状态，下面的配置<strong>暂不生效</strong> ——
                  需要先在「编辑」里勾上「设为受限分类」。可以先配好权限再开开关。
                </p>
              )}

              {aclLoading ? (
                <div className="text-center py-8 text-gray-400">加载中...</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-[var(--border-c)] text-left text-gray-500">
                      <th className="px-2 py-2">角色</th>
                      <th className="px-2 py-2 w-20">可读</th>
                      <th className="px-2 py-2 w-20">可写</th>
                      <th className="px-2 py-2 w-20">可管理</th>
                      <th className="px-2 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map(r => {
                      const row = aclRows.find(a => a.role_name === r.name);
                      return (
                        <tr key={r.id} className="border-b border-[var(--border-c)]">
                          <td className="px-2 py-2">
                            <span className="font-medium text-gray-900">{r.label || r.name}</span>
                            <div className="text-xs text-gray-400">{r.name}</div>
                          </td>
                          <td className="px-2 py-2"><input type="checkbox" checked={!!row?.can_read} onChange={e => setAcl(r.name, { can_read: e.target.checked })} /></td>
                          <td className="px-2 py-2"><input type="checkbox" checked={!!row?.can_write} onChange={e => setAcl(r.name, { can_write: e.target.checked })} /></td>
                          <td className="px-2 py-2"><input type="checkbox" checked={!!row?.can_manage} onChange={e => setAcl(r.name, { can_manage: e.target.checked })} /></td>
                          <td className="px-2 py-2">
                            {row && <button onClick={() => revokeAcl(r.name)} className="btn btn-sm btn-secondary">清除</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <button onClick={() => setAclTarget(null)} className="btn btn-secondary">关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
