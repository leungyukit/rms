'use client';

import { useState, useEffect } from 'react';
import { useT } from '@/i18n/config';
import { useSystemRoles, useProjectRoles } from '@/lib/use-role-options';

export default function AdminUsersPage() {
  const { t } = useT();
  const { roles: systemRoles, labelOf: systemRoleLabel } = useSystemRoles();
  const { roles: projectRoles, labelOf: projectRoleLabel } = useProjectRoles();
  const [users, setUsers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editProjectAccess, setEditProjectAccess] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', display_name: '', email: '', roles: ['login_only'] as string[], project_access: [] as any[] });
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetPwdId, setResetPwdId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const load = () => {
    Promise.all([
      fetch('/api/users', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/projects', { credentials: 'include' }).then(r => r.json()),
    ]).then(([u, p]) => {
      setUsers(Array.isArray(u) ? u : []);
      setProjects(Array.isArray(p) ? p : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const startEdit = (user: any) => {
    setEditingId(user.id);
    setEditRoles(user.role_names ? user.role_names.split(',') : []);
    setEditProjectAccess(user.project_access || []);
  };

  const toggleRole = (role: string, list: string[], setter: (v: string[]) => void) => {
    setter(list.includes(role) ? list.filter(r => r !== role) : [...list, role]);
  };

  const toggleProjectAccess = (projectId: number) => {
    const exists = editProjectAccess.find((p: any) => p.project_id === projectId);
    if (exists) {
      setEditProjectAccess(editProjectAccess.filter((p: any) => p.project_id !== projectId));
    } else {
      setEditProjectAccess([...editProjectAccess, { project_id: projectId, role_in_project: 'member' }]);
    }
  };

  const setProjectRole = (projectId: number, role: string) => {
    setEditProjectAccess(editProjectAccess.map((p: any) =>
      p.project_id === projectId ? { ...p, role_in_project: role } : p
    ));
  };

  const saveRoles = async (userId: number) => {
    setSaving(true);
    await fetch('/api/users', { credentials: 'include',
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: userId,
        roles: editRoles,
        project_access: editProjectAccess.map(p => ({ project_id: p.project_id, role_in_project: p.role_in_project })),
      }),
    });
    setEditingId(null); setSaving(false);
    load();
  };

  const createUser = async () => {
    setCreateError('');
    if (!newUser.username.trim() || !newUser.password.trim()) { setCreateError('用户名和密码为必填'); return; }
    if (newUser.username.length < 3) { setCreateError('用户名至少3个字符'); return; }
    if (newUser.password.length < 6) { setCreateError('密码至少6个字符'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/users', { credentials: 'include',
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newUser, project_access: newUser.project_access }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || '创建失败'); return; }
      setShowCreate(false);
      setNewUser({ username: '', password: '', display_name: '', email: '', roles: ['login_only'], project_access: [] });
      load();
    } catch { setCreateError('网络错误'); }
    finally { setCreating(false); }
  };

  const resetPassword = async (userId: number) => {
    if (!newPassword || newPassword.length < 6) return;
    await fetch('/api/users', { credentials: 'include',
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, password: newPassword }),
    });
    setResetPwdId(null);
    setNewPassword('');
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">👥 用户管理</h1>
          <p className="text-sm text-gray-500 mt-0.5">共 {users.length} 名用户</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          ➕ 新建用户
        </button>
      </div>

      {/* Create user panel */}
      {showCreate && (
        <div className="card mb-6"><div className="card-body">
          <h3 className="font-semibold mb-4">新建用户</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="form-label">用户名 *</label>
              <input value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})} placeholder="登录用户名（至少3字符）" className="form-input" />
            </div>
            <div>
              <label className="form-label">密码 *</label>
              <input type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} placeholder="登录密码（至少6字符）" className="form-input" />
            </div>
            <div>
              <label className="form-label">显示名称</label>
              <input value={newUser.display_name} onChange={e => setNewUser({...newUser, display_name: e.target.value})} placeholder="用户昵称（留空则使用用户名）" className="form-input" />
            </div>
            <div>
              <label className="form-label">邮箱</label>
              <input type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} placeholder="可选" className="form-input" />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">分配角色</label>
            <div className="flex flex-wrap gap-3">
              {systemRoles.map(r => (
                <label key={r.name} className={`flex items-start gap-2 border rounded-lg p-3 cursor-pointer transition-all ${newUser.roles.includes(r.name) ? 'border-gray-800 bg-gray-100' : 'hover:bg-gray-50'}`}>
                  <input type="checkbox" checked={newUser.roles.includes(r.name)} onChange={() => toggleRole(r.name, newUser.roles, (v) => setNewUser({...newUser, roles: v}))} className="rounded mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{r.label}</div>
                    {r.desc && <div className="text-xs text-gray-500">{r.desc}</div>}
                  </div>
                </label>
              ))}
              {systemRoles.length === 0 && <div className="text-xs text-gray-400">角色加载中…</div>}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">分配项目权限</label>
            {projects.length === 0 ? (
              <div className="text-xs text-gray-400">暂无项目</div>
            ) : (
              <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                {projects.map(p => {
                  const checked = newUser.project_access.some((pa: any) => pa.project_id === p.id);
                  const role = checked ? newUser.project_access.find((pa: any) => pa.project_id === p.id)?.role_in_project || 'member' : 'member';
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                      <input type="checkbox" checked={checked} onChange={() => {
                        if (checked) {
                          setNewUser({ ...newUser, project_access: newUser.project_access.filter((pa: any) => pa.project_id !== p.id) });
                        } else {
                          setNewUser({ ...newUser, project_access: [...newUser.project_access, { project_id: p.id, role_in_project: 'member' }] });
                        }
                      }} className="rounded" />
                      <span className="text-sm flex-1">{p.name}</span>
                      {checked && (
                        <select value={role} onChange={e => {
                          setNewUser({
                            ...newUser,
                            project_access: newUser.project_access.map((pa: any) =>
                              pa.project_id === p.id ? { ...pa, role_in_project: e.target.value } : pa
                            ),
                          });
                        }} className="border rounded px-1.5 py-0.5 text-xs">
                          <option value="admin">管理员</option>
                          <option value="manager">经理</option>
                          <option value="member">成员</option>
                          <option value="viewer">观察者</option>
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {createError && <div className="text-red-500 text-sm bg-red-50 rounded-lg p-3 mb-4">{createError}</div>}

          <div className="flex gap-2">
            <button onClick={createUser} disabled={creating} className="btn btn-primary">
              {creating ? '创建中...' : '创建用户'}
            </button>
            <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="btn btn-secondary">取消</button>
          </div>
        </div></div>
      )}

      {/* Users table */}
      <div className="card"><div className="table-wrap"><table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">ID</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('auth.username')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('user.displayName')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('role.title')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('project.members')}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">{t('common.loading')}</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">{t('user.noUser')}</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 align-top">
                <td className="px-4 py-3 text-gray-400">{u.id}</td>
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3">{u.display_name}</td>
                <td className="px-4 py-3">
                  {editingId === u.id ? (
                    <div className="flex flex-wrap gap-2">
                      {systemRoles.map(r => (
                        <label key={r.name} className={`flex items-center gap-1.5 cursor-pointer px-2 py-1 rounded-lg border text-xs transition-all ${editRoles.includes(r.name) ? 'border-gray-800 bg-gray-100 text-gray-900' : 'hover:bg-gray-50'}`}>
                          <input type="checkbox" checked={editRoles.includes(r.name)} onChange={() => toggleRole(r.name, editRoles, setEditRoles)} className="rounded w-3.5 h-3.5" />
                          {r.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {u.role_labels ? u.role_labels.split(', ').map((label: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-900">{label}</span>
                      )) : <span className="text-xs text-gray-400">无角色</span>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingId === u.id ? (
                    <div className="space-y-2 min-w-[280px]">
                      {projects.map(p => {
                        const access = editProjectAccess.find((a: any) => a.project_id === p.id);
                        return (
                          <div key={p.id} className="flex items-center gap-2">
                            <label className={`flex items-center gap-1.5 cursor-pointer text-xs ${access ? 'text-gray-900' : 'text-gray-400'}`}>
                              <input type="checkbox" checked={!!access} onChange={() => toggleProjectAccess(p.id)} className="rounded w-3.5 h-3.5" />
                              {p.name}
                            </label>
                            {access && (
                              <select value={access.role_in_project} onChange={e => setProjectRole(p.id, e.target.value)} className="border rounded px-1.5 py-0.5 text-xs">
                                {projectRoles.map(pr => <option key={pr.name} value={pr.name}>{pr.label}</option>)}
                              </select>
                            )}
                          </div>
                        );
                      })}
                      {projects.length === 0 && <span className="text-xs text-gray-400">暂无项目</span>}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(u.project_access || []).length > 0 ? (
                        u.project_access.map((pa: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-800">
                            {pa.project_name} ({projectRoleLabel(pa.role_in_project)})
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">无项目权限</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    {editingId === u.id ? (
                      <div className="flex gap-2">
                        <button onClick={() => saveRoles(u.id)} disabled={saving} className="btn btn-primary btn-sm">保存</button>
                        <button onClick={() => setEditingId(null)} className="btn btn-secondary btn-sm">取消</button>
                      </div>
                    ) : resetPwdId === u.id ? (
                      <div className="flex gap-1 items-center">
                        <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('auth.password')} className="border rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-gray-800" />
                        <button onClick={() => resetPassword(u.id)} disabled={newPassword.length < 6} className="btn btn-primary btn-sm">{t('common.confirm')}</button>
                        <button onClick={() => { setResetPwdId(null); setNewPassword(''); }} className="btn btn-secondary btn-sm">{t('common.cancel')}</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => startEdit(u)} className="text-xs text-gray-800 hover:underline">{t('common.edit')}</button>
                        <button onClick={() => { setResetPwdId(u.id); setNewPassword(''); }} className="text-xs text-gray-500 hover:underline">{t('user.password') || t('common.reset')}</button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>
    </div>
  );
}
