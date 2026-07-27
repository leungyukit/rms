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
      const data = await res.json();
      if (data.report) {
        window.location.href = `/custom-reports/${data.report.id}/edit`;
      }
    } catch (e) {
      console.error('Failed to create report:', e);
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
          <button onClick={createReport} className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            新建报表
          </button>
        </div>
      </div>

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
