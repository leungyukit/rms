'use client';

import { useState, useEffect, useCallback, use } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Save, Plus, ArrowLeft, BarChart3, PieChart, LineChart, Database } from 'lucide-react';
import Link from 'next/link';
import { ChartRenderer } from '@/components/reports/ChartRenderer';
import { WidgetCard } from '@/components/reports/WidgetCard';

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
  config?: any;
}

const CHART_TYPES = [
  { type: 'bar', label: '柱状图', icon: <BarChart3 className="w-4 h-4" /> },
  { type: 'line', label: '折线图', icon: <LineChart className="w-4 h-4" /> },
  { type: 'area', label: '面积图', icon: <LineChart className="w-4 h-4" /> },
  { type: 'pie', label: '饼图', icon: <PieChart className="w-4 h-4" /> },
];

function SortableWidget({ widget, onDelete, onEdit, children }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 'auto',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <WidgetCard
        title={widget.name}
        onDelete={() => onDelete(widget.id)}
        onSettings={() => onEdit(widget)}
        showDragHandle
        isDragging={isDragging}
      >
        {children}
      </WidgetCard>
    </div>
  );
}

export default function EditDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddWidget, setShowAddWidget] = useState(false);
  // draft：弹窗内的编辑副本。原报表页把 onChange 直接接到 updateWidget，
  // 而 updateWidget 里会 setSelectedWidget(null) —— 结果输入一个字符弹窗就关闭。
  // 这里改成先改 draft，点「确定」才提交。
  const [draft, setDraft] = useState<Widget | null>(null);
  const [chartData, setChartData] = useState<Record<string, any[]>>({});
  const [chartError, setChartError] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboard();
    loadDataSources();
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
      if (data.dashboard) {
        setDashboard(data.dashboard);
        setEditName(data.dashboard.name);
        setEditDescription(data.dashboard.description || '');
        setWidgets(data.dashboard.widgets || []);
      }
    } catch (e: any) {
      setError(`加载失败：${e?.message || '网络错误'}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadDataSources() {
    try {
      const res = await fetch('/api/data-sources');
      const raw = await res.text().catch(() => '');
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* 非 JSON */ }
      setDataSources(data.dataSources || []);
    } catch (e) {
      // 数据源拉不到不阻塞页面，但要让用户知道下拉框为什么是空的
      setError('数据源加载失败，图表将无法选择数据源');
    }
  }

  const loadChartData = useCallback(async (widget: Widget, sources?: DataSource[]) => {
    const pool = sources || dataSources;
    const ds = pool.find(d => d.name === widget.data_source);
    if (!ds) {
      setChartError(prev => ({ ...prev, [widget.id]: '未选择数据源' }));
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
        // 403 = 非全局管理员，query 接口有权限门槛，这里要说清楚而不是留白
        setChartError(prev => ({
          ...prev,
          [widget.id]: res.status === 403 ? '无权限执行查询（仅全局管理员）' : (data.error || `查询失败 HTTP ${res.status}`),
        }));
        return;
      }
      setChartError(prev => {
        const next = { ...prev };
        delete next[widget.id];
        return next;
      });
      setChartData(prev => ({ ...prev, [widget.id]: data.data || [] }));
    } catch (e: any) {
      setChartError(prev => ({ ...prev, [widget.id]: `查询失败：${e?.message || '网络错误'}` }));
    }
  }, [dataSources]);

  // 数据源就绪后把所有图表的数据拉一遍
  useEffect(() => {
    if (dataSources.length === 0) return;
    widgets.forEach(w => {
      if (w.data_source) loadChartData(w, dataSources);
    });
    // 只在数据源到位 / widget 集合变化时触发，避免每次渲染重复请求
  }, [dataSources, widgets.length]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback((event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setWidgets(items => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

  function addWidget(chartType: string) {
    const firstDs = dataSources[0];
    const newWidget: Widget = {
      id: `widget-${Date.now()}`,
      name: `新图表 ${widgets.length + 1}`,
      widget_type: 'chart',
      chart_type: chartType,
      data_source: firstDs?.name || '',
      // 带上数据源自带的 xKey/yKey，否则饼图/柱状图取轴会靠猜
      config: firstDs?.config || null,
      position_x: 0,
      position_y: 0,
      width: 4,
      height: 3,
      sort_order: widgets.length,
    };
    setWidgets(prev => [...prev, newWidget]);
    setShowAddWidget(false);
    if (newWidget.data_source) loadChartData(newWidget);
  }

  function deleteWidget(widgetId: string) {
    setWidgets(prev => prev.filter(w => w.id !== widgetId));
  }

  function commitDraft() {
    if (!draft) return;
    setWidgets(prev => prev.map(w => (w.id === draft.id ? draft : w)));
    setDraft(null);
    loadChartData(draft);
  }

  async function saveDashboard() {
    setSaving(true);
    setError(null);
    try {
      // sort_order 按当前顺序重排，否则拖拽结果存不下来
      const payload = widgets.map((w, i) => ({ ...w, sort_order: i }));
      const res = await fetch(`/api/dashboards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDescription, widgets: payload }),
      });
      const raw = await res.text().catch(() => '');
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { /* 非 JSON */ }
      if (!res.ok) {
        setError(data.error || `保存失败（HTTP ${res.status}）`);
        return;
      }
      // 保存后用服务端返回的 widgets 回填（拿到真实 id，避免下次保存重复插入）
      if (data.dashboard?.widgets) {
        setWidgets(data.dashboard.widgets.map((w: any) => ({ ...w, id: String(w.id) })));
      }
      setError(null);
    } catch (e: any) {
      setError(`保存失败：${e?.message || '网络错误'}`);
    } finally {
      setSaving(false);
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
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="text-xl font-bold text-gray-900 border-none bg-transparent p-0 focus:ring-0"
                placeholder="输入Dashboard名称"
              />
              <input
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                className="text-sm text-gray-500 border-none bg-transparent p-0 focus:ring-0 block mt-1 w-full"
                placeholder="描述（可选）"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAddWidget(true)} className="btn btn-secondary flex items-center gap-2">
              <Plus className="w-4 h-4" />
              添加图表
            </button>
            <button onClick={saveDashboard} disabled={saving} className="btn btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
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

      {dataSources.length === 0 && (
        <div className="card border-amber-200 bg-amber-50">
          <div className="text-sm text-amber-800 flex items-center gap-2">
            <Database className="w-4 h-4" />
            当前没有可用数据源，图表无法取数。请先到「数据源」页面创建。
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {widgets.map(widget => (
              <SortableWidget
                key={widget.id}
                widget={widget}
                onDelete={deleteWidget}
                onEdit={(w: Widget) => setDraft({ ...w })}
              >
                <div className="h-48 p-2">
                  {chartError[widget.id] ? (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-1">
                      <div className="text-xs text-gray-400">{widget.chart_type}</div>
                      <div className="text-xs text-amber-600">{chartError[widget.id]}</div>
                      <button onClick={() => setDraft({ ...widget })} className="text-xs text-blue-600 hover:underline mt-1">
                        设置数据源
                      </button>
                    </div>
                  ) : (
                    <ChartRenderer
                      type={widget.chart_type}
                      data={chartData[widget.id] || []}
                      config={widget.config}
                    />
                  )}
                </div>
                <div className="px-3 pb-2 text-xs text-gray-400 truncate">
                  数据源: {widget.data_source || '（未设置）'}
                </div>
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {widgets.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📈</div>
            <div className="empty-state-text">还没有图表</div>
            <div className="empty-state-description">点击右上角「添加图表」开始设计</div>
          </div>
        </div>
      )}

      {showAddWidget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 max-w-[90vw]">
            <h3 className="text-lg font-medium mb-4">选择图表类型</h3>
            <div className="grid grid-cols-2 gap-3">
              {CHART_TYPES.map(ct => (
                <button
                  key={ct.type}
                  onClick={() => addWidget(ct.type)}
                  className="p-4 border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 rounded-lg transition-all flex flex-col items-center gap-2"
                >
                  <div className="text-blue-600">{ct.icon}</div>
                  <div className="font-medium text-gray-800">{ct.label}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowAddWidget(false)} className="btn btn-secondary w-full mt-4">
              取消
            </button>
          </div>
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 max-w-[90vw]">
            <h3 className="text-lg font-medium mb-4">编辑图表</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图表名称</label>
                <input
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">数据源</label>
                <select
                  value={draft.data_source}
                  onChange={e => {
                    const ds = dataSources.find(d => d.name === e.target.value);
                    setDraft({ ...draft, data_source: e.target.value, config: ds?.config ?? draft.config });
                  }}
                  className="form-input"
                >
                  <option value="">（请选择数据源）</option>
                  {dataSources.map(ds => (
                    <option key={ds.id} value={ds.name}>{ds.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图表类型</label>
                <select
                  value={draft.chart_type}
                  onChange={e => setDraft({ ...draft, chart_type: e.target.value })}
                  className="form-input"
                >
                  {CHART_TYPES.map(ct => (
                    <option key={ct.type} value={ct.type}>{ct.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setDraft(null)} className="btn btn-secondary flex-1">取消</button>
              <button onClick={commitDraft} className="btn btn-primary flex-1">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
