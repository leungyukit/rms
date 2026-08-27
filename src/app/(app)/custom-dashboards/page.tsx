'use client';

import { useState, useEffect } from 'react';
import { Plus, LayoutDashboard, Trash2, Settings, Star, StarOff } from 'lucide-react';
import Link from 'next/link';

interface Dashboard {
  id: number;
  name: string;
  description: string;
  is_default: number;
  is_favorite: number;
  created_at: string;
  updated_at: string;
}

export default function CustomDashboardsPage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  // 同 custom-reports：原先失败只 console.error，界面静默 → 表现为「点新建没反应」。
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboards();
  }, []);

  async function loadDashboards() {
    try {
      const res = await fetch('/api/dashboards');
      const data = await res.json();
      setDashboards(data.dashboards || []);
    } catch (e) {
      console.error('Failed to load dashboards:', e);
    } finally {
      setLoading(false);
    }
  }

  async function createDashboard() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '新Dashboard',
          description: '',
          is_default: false
        })
      });
      const raw = await res.text().catch(() => '');
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* 非 JSON 响应 */ }

      if (!res.ok) {
        setError(data.error || `创建失败（HTTP ${res.status}）`);
        return;
      }
      if (!data.dashboard?.id) {
        setError('创建失败：服务端未返回 Dashboard ID');
        return;
      }
      window.location.href = `/custom-dashboards/${data.dashboard.id}/edit`;
    } catch (e: any) {
      setError(`创建失败：${e?.message || '网络错误'}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteDashboard(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('确定要删除这个Dashboard吗？')) return;
    
    try {
      await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
      loadDashboards();
    } catch (e) {
      console.error('Failed to delete dashboard:', e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">📈 自定义Dashboard</h1>
            <p className="page-subtitle">创建和管理自定义Dashboard</p>
          </div>
          <button onClick={createDashboard} disabled={creating} className="btn btn-primary flex items-center gap-2 disabled:opacity-60">
            <Plus className="w-4 h-4" />
            {creating ? '创建中...' : '新建Dashboard'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm text-red-700 whitespace-pre-wrap">⚠️ {error}</div>
            <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">关闭</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <div className="empty-state-text">加载中...</div>
          </div>
        </div>
      ) : dashboards.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards.map(dashboard => (
            <Link key={dashboard.id} href={`/custom-dashboards/${dashboard.id}`}>
              <div className="card group hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="w-5 h-5 text-purple-500" />
                      <h3 className="font-medium text-gray-800">
                        {dashboard.name}
                        {dashboard.is_default && (
                          <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">默认</span>
                        )}
                      </h3>
                    </div>
                    {dashboard.description && (
                      <p className="text-sm text-gray-500 mt-1">{dashboard.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      更新于 {new Date(dashboard.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {dashboard.is_favorite ? (
                      <Star className="w-4 h-4 text-yellow-500" />
                    ) : (
                      <StarOff className="w-4 h-4 text-gray-300" />
                    )}
                    <button
                      onClick={(e) => deleteDashboard(dashboard.id, e)}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <div className="empty-state-text">还没有Dashboard</div>
            <div className="empty-state-description">点击"新建Dashboard"创建您的第一个自定义Dashboard</div>
            <button onClick={createDashboard} className="btn btn-primary mt-4">
              新建Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
