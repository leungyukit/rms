'use client';

import { useState, useEffect } from 'react';
import { Plus, LayoutTemplate, Trash2, Settings, Eye } from 'lucide-react';
import Link from 'next/link';

interface Report {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export default function CustomReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  // 原先 createReport 失败只 console.error，界面完全静默 → 用户看到的就是「点了没反应」。
  // 2026-08-27：表不存在导致 500，整个功能看上去像按钮坏了，排查时毫无线索。
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    try {
      const res = await fetch('/api/custom-reports');
      const data = await res.json();
      setReports(data.reports || []);
    } catch (e) {
      console.error('Failed to load reports:', e);
    } finally {
      setLoading(false);
    }
  }

  async function createReport() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/custom-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '新报表',
          description: '',
          type: 'custom'
        })
      });
      const raw = await res.text().catch(() => '');
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* 非 JSON 响应 */ }

      if (!res.ok) {
        setError(data.error || `创建失败（HTTP ${res.status}）`);
        return;
      }
      if (!data.report?.id) {
        setError('创建失败：服务端未返回报表 ID');
        return;
      }
      window.location.href = `/custom-reports/${data.report.id}/edit`;
    } catch (e: any) {
      setError(`创建失败：${e?.message || '网络错误'}`);
    } finally {
      setCreating(false);
    }
  }

  async function deleteReport(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('确定要删除这个报表吗？')) return;
    
    try {
      await fetch(`/api/custom-reports/${id}`, { method: 'DELETE' });
      loadReports();
    } catch (e) {
      console.error('Failed to delete report:', e);
    }
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">📊 自定义报表</h1>
            <p className="page-subtitle">创建和管理自定义报表</p>
          </div>
          <button onClick={createReport} disabled={creating} className="btn btn-primary flex items-center gap-2 disabled:opacity-60">
            <Plus className="w-4 h-4" />
            {creating ? '创建中...' : '新建报表'}
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
      ) : reports.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map(report => (
            <Link key={report.id} href={`/custom-reports/${report.id}/edit`}>
              <div className="card group hover:shadow-md transition-all cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <LayoutTemplate className="w-5 h-5 text-blue-500" />
                      <h3 className="font-medium text-gray-800">{report.name}</h3>
                    </div>
                    {report.description && (
                      <p className="text-sm text-gray-500 mt-1">{report.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      更新于 {new Date(report.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={(e) => deleteReport(report.id, e)}
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-text">还没有报表</div>
            <div className="empty-state-description">点击"新建报表"创建您的第一个自定义报表</div>
            <button onClick={createReport} className="btn btn-primary mt-4">
              新建报表
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
