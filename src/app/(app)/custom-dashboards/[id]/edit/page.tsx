
'use client';

import { useState, useEffect, use } from 'react';
import { Save, Plus, Trash2, ArrowLeft, BarChart3, PieChart, LineChart } from 'lucide-react';
import Link from 'next/link';

interface Widget {
  id: string;
  name: string;
  widget_type: string;
  chart_type: string;
  data_source: string;
  config?: any;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  sort_order: number;
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
  type: string;
  query: string;
}

const CHART_TYPES = [
  { type: 'bar', label: '柱状图', icon: <BarChart3 className="w-4 h-4" /> },
  { type: 'line', label: '折线图', icon: <LineChart className="w-4 h-4" /> },
  { type: 'pie', label: '饼图', icon: <PieChart className="w-4 h-4" /> },
];

export default function EditDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    loadDashboard();
    loadDataSources();
  }, [id]);

  async function loadDashboard() {
    try {
      const res = await fetch(`/api/dashboards/${id}`);
      const data = await res.json();
      if (data.dashboard) {
        setDashboard(data.dashboard);
        setEditName(data.dashboard.name);
        setEditDescription(data.dashboard.description);
        setWidgets(data.dashboard.widgets || []);
      }
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadDataSources() {
    try {
      const res = await fetch('/api/data-sources');
      const data = await res.json();
      setDataSources(data.dataSources || []);
    } catch (e) {
      console.error('Failed to load data sources:', e);
    }
  }

  async function saveDashboard() {
    setSaving(true);
    try {
      await fetch(`/api/dashboards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
          widgets
        })
      });
      alert('保存成功！');
    } catch (e) {
      console.error('Failed to save dashboard:', e);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }

  function addWidget(chartType: string) {
    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      name: `新图表 ${widgets.length + 1}`,
      widget_type: 'chart',
      chart_type: chartType,
      data_source: dataSources[0]?.name || '',
      position_x: 0,
      position_y: 0,
      width: 4,
      height: 3,
      sort_order: widgets.length,
    };
    setWidgets([...widgets, newWidget]);
  }

  function deleteWidget(widgetId: string) {
    setWidgets(widgets.filter(w => w.id !== widgetId));
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
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="page-title text-2xl font-bold border-none outline-none bg-transparent"
                placeholder="输入Dashboard名称"
              />
              <p className="page-subtitle">编辑您的自定义Dashboard</p>
            </div>
          </div>
          <button onClick={saveDashboard} disabled={saving} className="btn btn-primary flex items-center gap-2">
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <h3 className="font-medium">添加图表</h3>
          {CHART_TYPES.map(type => (
            <button
              key={type.type}
              onClick={() => addWidget(type.type)}
              className="btn btn-secondary flex items-center gap-2"
            >
              {type.icon}
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map(widget => (
          <div key={widget.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium">{widget.name}</h4>
                <p className="text-sm text-gray-500 mt-1">
                  类型: {widget.chart_type} | 数据源: {widget.data_source}
                </p>
              </div>
              <button
                onClick={() => deleteWidget(widget.id)}
                className="p-1 text-gray-400 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {widgets.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <div className="empty-state-text">还没有图表</div>
            <div className="empty-state-description">点击上方按钮添加图表到您的Dashboard</div>
          </div>
        </div>
      )}
    </div>
  );
}
