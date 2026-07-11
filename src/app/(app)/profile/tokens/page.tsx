'use client';

import { useState, useEffect } from 'react';

interface UserItem { id: number; username: string; display_name: string; roles: string[]; }
interface ProjectItem { id: number; name: string; }

export default function TokensPage() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [currentUserRoles, setCurrentUserRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newTokenName, setNewTokenName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    Promise.all([
      fetch('/api/auth/tokens', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/users', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/projects', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()),
    ]).then(([t, u, p, me]) => {
      setTokens(Array.isArray(t) ? t : []);
      setUsers(Array.isArray(u) ? u : []);
      setProjects(Array.isArray(p) ? p : []);
      setCurrentUserRoles(me?.roles || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(load, []);

  const isAdmin = currentUserRoles.some(r => r === 'global_admin');

  const toggleProject = (pid: number) => {
    setSelectedProjectIds(prev =>
      prev.includes(pid) ? prev.filter(id => id !== pid) : [...prev, pid]
    );
  };

  const createToken = async () => {
    setCreateError('');
    if (!newTokenName.trim()) { setCreateError('Token 名称为必填'); return; }
    setCreating(true);
    try {
      const body: any = { name: newTokenName.trim() };
      // 管理员可选指定用户
      if (isAdmin && selectedUserId) body.user_id = Number(selectedUserId);
      // 项目权限（可选）
      if (selectedProjectIds.length > 0) body.project_ids = selectedProjectIds;
      const res = await fetch('/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error || '创建失败'); return; }
      if (data.token) {
        setRevealedToken(data.token);
        setNewTokenName('');
        setSelectedUserId('');
        setSelectedProjectIds([]);
        setShowCreate(false);
        load();
      }
    } catch { setCreateError('网络错误'); }
    finally { setCreating(false); }
  };

  const deleteToken = async (id: number) => {
    if (!confirm('确定要删除此Token吗？使用此Token的MCP/Skill将无法访问RMS。')) return;
    await fetch('/api/auth/tokens', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const copyToken = async (token: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(token);
      } else {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = token;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="page-header">
        <h1>🔑 Access Token 管理</h1>
        <p>管理用于 MCP / Skill 访问 RMS 的 Access Token</p>
      </div>

      {/* Revealed token banner */}
      {revealedToken && (
        <div className="alert alert-warning">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-800 mb-1">Token 已创建 — 请立即保存！</h3>
              <p className="text-sm text-amber-700 mb-3">此 Token 仅显示一次，关闭后无法再次查看。</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border rounded-lg px-3 py-2 text-sm font-mono break-all">{revealedToken}</code>
                <button onClick={() => copyToken(revealedToken)} className="btn btn-sm btn-primary">
                  {copied ? '✅ 已复制' : '📋 复制'}
                </button>
              </div>
              <button onClick={() => setRevealedToken(null)} className="mt-3 text-sm text-amber-600 hover:underline">我已保存，关闭提示</button>
            </div>
          </div>
        </div>
      )}

      {/* Create panel */}
      {showCreate && (
        <div className="card mb-4"><div className="card-body">
          <h3 className="card-title">新建 Access Token</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="form-label">Token 名称 *</label>
              <input value={newTokenName} onChange={e => setNewTokenName(e.target.value)}
                placeholder="例如：MCP 服务" className="form-input" />
            </div>
            {isAdmin && (
              <div>
                <label className="form-label">所属用户（可选，不选则为自己）</label>
                <select value={selectedUserId} onChange={e => setSelectedUserId(Number(e.target.value))} className="form-input">
                  <option value="">自己（当前用户）</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.id}. {u.display_name} (@{u.username})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="mb-3">
            <label className="form-label">允许访问的项目（可选，不选则无限制）</label>
            <div className="border rounded-lg divide-y max-h-48 overflow-y-auto mt-1">
              {projects.map(p => {
                const checked = selectedProjectIds.includes(p.id);
                return (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={checked} onChange={() => toggleProject(p.id)} />
                    <span className="text-sm">{p.name}</span>
                  </label>
                );
              })}
              {projects.length === 0 && <div className="text-xs text-gray-400 px-3 py-2">暂无项目</div>}
            </div>
            <p className="text-xs text-gray-400 mt-1">留空 = 可访问所有项目；勾选后仅能操作所选项目内的需求</p>
          </div>
          {createError && <div className="text-red-500 text-sm bg-red-50 rounded-lg p-2 mb-3">{createError}</div>}
          <div className="flex gap-2">
            <button onClick={createToken} disabled={creating} className="btn btn-primary">
              {creating ? '创建中...' : '创建 Token'}
            </button>
            <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="btn btn-secondary">取消</button>
          </div>
        </div></div>
      )}

      {/* Usage hint */}
      <div className="alert alert-info mb-4">
        <h3 className="font-semibold text-gray-900 mb-2">📖 使用说明</h3>
        <ul className="text-sm text-gray-900 space-y-1 list-disc pl-4">
          <li>Access Token 用于 MCP 服务或 Skill 工具访问 RMS 系统</li>
          <li>在 MCP 配置中设置 <code className="bg-gray-200 px-1 rounded">RMS_ACCESS_TOKEN</code> 为你的 Token</li>
          <li>同时需要配置 RMS MCP 服务器的地址和端口</li>
          <li>Token 仅在创建时显示一次，请妥善保管</li>
          <li>如有泄露风险，请立即删除并重新创建</li>
        </ul>
      </div>

      <div className="flex justify-end mb-3">
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">➕ 新建 Token</button>
      </div>

      {/* Token list */}
      <div className="card"><div className="card-body" style={{ padding: 0 }}><div className="table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">名称</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">所属用户</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">Token 前缀</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">最后使用</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">创建时间</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">加载中...</td></tr>
            ) : tokens.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">暂无 Token</td></tr>
            ) : tokens.map(t => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 text-gray-500">{t.username || t.user_id || '-'}</td>
                <td className="px-4 py-3">
                  <code className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">{t.prefix}...</code>
                </td>
                <td className="px-4 py-3 text-gray-500">{t.last_used_at || '从未使用'}</td>
                <td className="px-4 py-3 text-gray-500">{t.created_at}</td>
                <td className="px-4 py-3">
                  <button onClick={() => deleteToken(t.id)} className="btn btn-sm btn-danger">🗑️ 删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div></div>
    </div>
  );
}
