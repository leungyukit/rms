'use client';

import { useState, useEffect } from 'react';

const ACTION_LABELS: Record<string, string> = {
  login: '登录',
  create_requirement: '创建需求',
  update_requirement: '更新需求',
  update_requirement_status: '更新需求状态',
  delete_requirement: '删除需求',
  create_user: '创建用户',
  update_user: '更新用户',
  mcp_access: 'MCP 访问',
};

const ACTION_COLORS: Record<string, string> = {
  login: 'badge-success',
  create_requirement: 'badge-info',
  update_requirement: 'badge-warning',
  update_requirement_status: 'badge-primary',
  delete_requirement: 'badge-danger',
  create_user: 'badge-info',
  update_user: 'badge-primary',
  mcp_access: 'badge-info',
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterUsername, setFilterUsername] = useState('');

  const load = (p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '50' });
    if (filterAction) params.set('action', filterAction);
    if (filterUsername) params.set('username', filterUsername);

    fetch(`/api/audit-logs?${params}`, { credentials: 'include' }).then(r => r.json()).then(data => {
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setPage(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => { load(1); }, [filterAction, filterUsername]);

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="p-6">
      <div className="page-header"><h1>📋 操作日志</h1><p>记录用户登录和系统操作，共 {total} 条</p></div>

      {/* Filters */}
      <div className="card mb-4"><div className="card-body">
      <div className="flex gap-3">
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="form-input"
        >
          <option value="">全部操作类型</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          value={filterUsername}
          onChange={e => setFilterUsername(e.target.value)}
          placeholder="搜索用户名..."
          className="form-input w-48"
        />
      </div>
      </div></div>

      {/* Logs table */}
      <div className="card"><div className="card-body"><div className="table-wrap">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-500">时间</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">用户</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">操作类型</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">详情</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500">IP 地址</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">加载中...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400">暂无日志记录</td></tr>
            ) : logs.map(log => (
              <tr key={log.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{log.created_at}</td>
                <td className="px-4 py-3 font-medium">{log.username}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${ACTION_COLORS[log.action] || 'badge-gray'}`}>
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{log.detail}</td>
                <td className="px-4 py-3 text-gray-400 text-xs font-mono">{log.ip_address || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div></div></div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">第 {page} / {totalPages} 页</span>
          <div className="flex gap-2">
            <button
              onClick={() => load(page - 1)}
              disabled={page <= 1}
              className="btn btn-sm btn-secondary"
            >
              上一页
            </button>
            <button
              onClick={() => load(page + 1)}
              disabled={page >= totalPages}
              className="btn btn-sm btn-secondary"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
