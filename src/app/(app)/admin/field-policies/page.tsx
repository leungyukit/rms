'use client';

import { useEffect, useState } from 'react';

const ALL_ROLES = ['global_admin', 'project_receiver', 'requirement_handler', 'requirement_viewer', 'login_only'];
const STRATEGIES = [
  { value: 'mask', label: '脱敏 (mask)' },
  { value: 'hide', label: '隐藏 (hide)' },
  { value: 'hash', label: '哈希 (hash)' },
];

export default function FieldPoliciesPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ entity: 'requirement', field_name: '', visible_to_roles: ['global_admin'], redact_strategy: 'mask', description: '' });

  const load = async () => {
    const r = await fetch('/api/admin/field-policies', { credentials: 'include' });
    const j = await r.json();
    setPolicies(j.policies || []);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (editing) {
      await fetch(`/api/admin/field-policies/${editing.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible_to_roles: form.visible_to_roles, redact_strategy: form.redact_strategy, description: form.description, enabled: 1 }),
      });
    } else {
      await fetch('/api/admin/field-policies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    }
    setShowForm(false); setEditing(null);
    load();
  };

  const toggleEnabled = async (p: any) => {
    await fetch(`/api/admin/field-policies/${p.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: p.enabled ? 0 : 1 }),
    });
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('确认删除？')) return;
    await fetch(`/api/admin/field-policies/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>🔒 字段级权限策略</h1>
        <p>共 {policies.length} 条策略 · 缓存 5 分钟</p>
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowForm(true); setEditing(null); setForm({ entity: 'requirement', field_name: '', visible_to_roles: ['global_admin'], redact_strategy: 'mask', description: '' }); }}
          className="btn btn-primary">➕ 新建策略</button>
      </div>

      {showForm && (
        <div className="card mb-4"><div className="card-body">
          {!editing && (
            <div className="mb-3">
              <label className="form-label">字段名（如 description / solution）</label>
              <input value={form.field_name} onChange={e => setForm({ ...form, field_name: e.target.value })}
                className="form-input" placeholder="requirement.description 字段名" />
            </div>
          )}
          <div className="mb-3">
            <label className="form-label">可见角色（多选）</label>
            <div className="flex gap-2 flex-wrap mt-1">
              {ALL_ROLES.map(r => (
                <label key={r} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={form.visible_to_roles.includes(r)}
                    onChange={e => setForm({ ...form, visible_to_roles: e.target.checked ? [...form.visible_to_roles, r] : form.visible_to_roles.filter(x => x !== r) })} />
                  {r}
                </label>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label">脱敏策略</label>
            <select value={form.redact_strategy} onChange={e => setForm({ ...form, redact_strategy: e.target.value })} className="form-input">
              {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label">说明</label>
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="form-input" />
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="btn btn-primary">保存</button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="btn btn-secondary">取消</button>
          </div>
        </div></div>
      )}

      <div className="card"><div className="card-body"><div className="table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-500">实体</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">字段</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">可见角色</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">策略</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">说明</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">状态</th>
              <th className="text-left px-3 py-2 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            {policies.map(p => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 text-xs">{p.entity}</td>
                <td className="px-3 py-2 font-mono text-xs">{p.field_name}</td>
                <td className="px-3 py-2 text-xs">
                  {JSON.parse(p.visible_to_roles || '[]').map((r: string) => (
                    <span key={r} className="badge badge-info mr-1">{r}</span>
                  ))}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className={`badge ${p.redact_strategy === 'hide' ? 'badge-danger' : p.redact_strategy === 'hash' ? 'badge-info' : 'badge-warning'}`}>{p.redact_strategy}</span>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">{p.description}</td>
                <td className="px-3 py-2 text-xs">{p.enabled ? <span className="badge badge-success">启用</span> : <span className="badge badge-gray">禁用</span>}</td>
                <td className="px-3 py-2 text-xs space-x-1">
                  <button onClick={() => { setEditing(p); setShowForm(true); setForm({ entity: p.entity, field_name: p.field_name, visible_to_roles: JSON.parse(p.visible_to_roles), redact_strategy: p.redact_strategy, description: p.description || '' }); }}
                    className="btn btn-sm btn-secondary">编辑</button>
                  <button onClick={() => toggleEnabled(p)} className="btn btn-sm btn-secondary">{p.enabled ? '禁用' : '启用'}</button>
                  <button onClick={() => remove(p.id)} className="btn btn-sm btn-danger">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div></div>
    </div>
  );
}
