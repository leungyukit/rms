
'use client';

import { useState, useEffect, use } from 'react';
import { ArrowLeft, Settings } from 'lucide-react';
import Link from 'next/link';

interface Widget {
  id: string;
  name: string;
  widget_type: string;
  chart_type: string;
  data_source: string;
  config?: any;
}

interface Dashboard {
  id: number;
  name: string;
  description: string;
  widgets: Widget[];
}

export default function ViewDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, [id]);

  async function loadDashboard() {
    try {
      const res = await fetch(`/api/dashboards/${id}`);
      const data = await res.json();
      if (data.dashboard) {
        setDashboard(data.dashboard);
      }
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-header">
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <div className="empty-state-text">加载中...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/custom-dashboards" className="btn btn-ghost">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="page-title">{dashboard?.name}</h1>
              <p className="page-subtitle">{dashboard?.description}</p>
            </div>
          </div>
          <Link href={`/custom-dashboards/${id}/edit`} className="btn btn-secondary flex items-center gap-2">
            <Settings className="w-4 h-4" />
            编辑
          </Link>
        </div>
      </div>

      {dashboard?.widgets && dashboard.widgets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboard.widgets.map(widget => (
            <div key={widget.id} className="card">
              <h4 className="font-medium mb-2">{widget.name}</h4>
              <p className="text-sm text-gray-500">
                类型: {widget.chart_type} | 数据源: {widget.data_source}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <div className="empty-state-text">还没有图表</div>
            <div className="empty-state-description">去编辑页面添加图表吧</div>
            <Link href={`/custom-dashboards/${id}/edit`} className="btn btn-primary mt-4">
              编辑Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
