'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { ArrowLeft, Settings, Database } from 'lucide-react';
import Link from 'next/link';
import { ChartRenderer } from '@/components/reports/ChartRenderer';
import { WidgetCard } from '@/components/reports/WidgetCard';

interface Widget {
  id: number | string;
  name: string;
  widget_type: string;
  chart_type: string;
  data_source: string;
  config?: any;
  width?: number;
  height?: number;
}

interface Dashboard {
  id: number;
  name: string;
  description: string;
  widgets: Widget[];
}

interface DataSource {
  id: number;
  name: string;
  query: string;
  config?: any;
}

export default function ViewDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [chartData, setChartData] = useState<Record<string, any[]>>({});
  const [chartError, setChartError] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      await Promise.all([loadDashboard(), loadDataSources()]);
      setLoading(false);
    })();
  }, [id]);

  async function loadDashboard() {
    try {
      const res = await fetch(`/api/dashboards/${id}`);
      const raw = await res.text().catch(() => '');
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* 非 JSON */ }
      if (!res.ok) {
        setError(data.error || `加载失败（HTTP ${res.status}）`);
        return;
      }
      if (data.dashboard) setDashboard(data.dashboard);
    } catch (e: any) {
      setError(`加载失败：${e?.message || '网络错误'}`);
    }
  }

  async function loadDataSources() {
    try {
      const res = await fetch('/api/data-sources');
      const raw = await res.text().catch(() => '');
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* 非 JSON */ }
      setDataSources(data.dataSources || []);
    } catch { /* 下面会以 chartError 形式提示 */ }
  }

  const loadChartData = useCallback(async (widget: Widget, pool: DataSource[]) => {
    const key = String(widget.id);
    const ds = pool.find(d => d.name === widget.data_source);
    if (!ds) {
      setChartError(prev => ({ ...prev, [key]: '未设置数据源' }));
      return;
    }
    try {
      const res = await fetch('/api/data-sources/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ds.query }),
      });
      const raw = await res.text().catch(() => '');
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* 非 JSON */ }
      if (!res.ok) {
        setChartError(prev => ({
          ...prev,
          [key]: res.status === 403 ? '无权限执行查询（仅全局管理员）' : (data.error || `查询失败 HTTP ${res.status}`),
        }));
        return;
      }
      setChartError(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setChartData(prev => ({ ...prev, [key]: data.data || [] }));
    } catch (e: any) {
      setChartError(prev => ({ ...prev, [key]: `查询失败：${e?.message || '网络错误'}` }));
    }
  }, []);

  // dashboard 和 dataSources 都就绪后再取数
  useEffect(() => {
    if (!dashboard?.widgets?.length || dataSources.length === 0) return;
    dashboard.widgets.forEach(w => loadChartData(w, dataSources));
  }, [dashboard, dataSources, loadChartData]);

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

      {error && (
        <div className="card border-red-200 bg-red-50">
          <div className="text-sm text-red-700">⚠️ {error}</div>
        </div>
      )}

      {dataSources.length === 0 && dashboard?.widgets && dashboard.widgets.length > 0 && (
        <div className="card border-amber-200 bg-amber-50">
          <div className="text-sm text-amber-800 flex items-center gap-2">
            <Database className="w-4 h-4" />
            没有可用数据源，图表无法取数。
          </div>
        </div>
      )}

      {dashboard?.widgets && dashboard.widgets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboard.widgets.map(widget => {
            const key = String(widget.id);
            return (
              <WidgetCard key={key} title={widget.name} showDragHandle={false}>
                <div className="h-48 p-2">
                  {chartError[key] ? (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-1">
                      <div className="text-xs text-gray-400">{widget.chart_type}</div>
                      <div className="text-xs text-amber-600">{chartError[key]}</div>
                    </div>
                  ) : (
                    <ChartRenderer
                      type={widget.chart_type}
                      data={chartData[key] || []}
                      config={widget.config}
                    />
                  )}
                </div>
                <div className="px-3 pb-2 text-xs text-gray-400 truncate">
                  数据源: {widget.data_source || '（未设置）'}
                </div>
              </WidgetCard>
            );
          })}
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
