'use client';

import { useState, useEffect, useCallback, use } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Save, Plus, Trash2, Settings, ArrowLeft, BarChart3, PieChart, LineChart, GripVertical, Database } from 'lucide-react';
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

interface Report {
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
    <div
      ref={setNodeRef}
      style={style}
      className="grid-item"
      data-width={widget.width}
      data-height={widget.height}
    >
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

export default function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [report, setReport] = useState<Report | null>(null);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [selectedWidget, setSelectedWidget] = useState<Widget | null>(null);
  const [showWidgetEdit, setShowWidgetEdit] = useState(false);
  const [chartData, setChartData] = useState<Record<string, any[]>>({});

  useEffect(() => {
    loadReport();
    loadDataSources();
  }, [id]);

  async function loadReport() {
    try {
      const res = await fetch(`/api/custom-reports/${id}`);
      const data = await res.json();
      if (data.report) {
        setReport(data.report);
        setEditName(data.report.name);
        setEditDescription(data.report.description);
        setWidgets(data.report.widgets || []);
      }
    } catch (e) {
      console.error('Failed to load report:', e);
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

  async function loadChartData(widget: Widget) {
    try {
      console.log('Loading chart data for widget:', widget.name, 'data_source:', widget.data_source);
      // 找到对应的数据源
      const ds = dataSources.find(d => d.name === widget.data_source);
      if (ds) {
        console.log('Found data source:', ds.name, 'query:', ds.query);
        const res = await fetch(`/api/data-sources/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: ds.query })
        });
        const data = await res.json();
        console.log('Query result:', data.data);
        if (data.data) {
          setChartData(prev => ({ ...prev, [widget.id]: data.data }));
        }
      } else {
        console.log('Data source not found for:', widget.data_source);
      }
    } catch (e) {
      console.error('Failed to load chart data:', e);
    }
  }

  useEffect(() => {
    widgets.forEach(widget => {
      if (widget.data_source) {
        loadChartData(widget);
      }
    });
  }, [widgets, dataSources]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback((event: any) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setWidgets((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, []);

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
    const newWidgets = [...widgets, newWidget];
    setWidgets(newWidgets);
    setShowAddWidget(false);
    // 添加后立即加载图表数据
    setTimeout(() => loadChartData(newWidget), 100);
  }

  function deleteWidget(id: string) {
    setWidgets(widgets.filter(w => w.id !== id));
  }

  function updateWidget(updatedWidget: Widget) {
    setWidgets(widgets.map(w => w.id === updatedWidget.id ? updatedWidget : w));
    setShowWidgetEdit(false);
    setSelectedWidget(null);
    // 更新后重新加载图表数据
    setTimeout(() => loadChartData(updatedWidget), 100);
  }

  async function saveReport() {
    setSaving(true);
    try {
      await fetch(`/api/custom-reports/${id}`, {
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
      console.error('Failed to save report:', e);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="page-header border-b border-gray-200 pb-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/custom-reports" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="text-xl font-bold text-gray-900 border-none bg-transparent p-0 focus:ring-0"
                placeholder="报表名称"
              />
              <input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="text-sm text-gray-500 border-none bg-transparent p-0 focus:ring-0 block mt-1"
                placeholder="描述（可选）"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddWidget(true)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              添加图表
            </button>
            <button
              onClick={saveReport}
              disabled={saving}
              className="btn btn-primary flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="grid-layout">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={widgets.map(w => w.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-8 gap-4">
                {widgets.map(widget => (
                  <div key={widget.id} className={`col-span-${widget.width} row-span-${widget.height}`}>
                    <SortableWidget
                      widget={widget}
                      onDelete={deleteWidget}
                      onEdit={setSelectedWidget}
                    >
                      <div className="h-48">
                        <ChartRenderer
                          type={widget.chart_type}
                          data={chartData[widget.id] || []}
                          config={widget.config}
                        />
                      </div>
                    </SortableWidget>
                  </div>
                ))}
              </div>
            </SortableContext>

            {widgets.length === 0 && (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-state-icon">📊</div>
                  <div className="empty-state-text">点击"添加图表"开始设计您的报表</div>
                </div>
              </div>
            )}
          </DndContext>
        </div>
      </div>

      {showAddWidget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 max-w-90vw">
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
            <button
              onClick={() => setShowAddWidget(false)}
              className="btn btn-secondary w-full mt-4"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {selectedWidget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-96 max-w-90vw">
            <h3 className="text-lg font-medium mb-4">编辑图表</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图表名称</label>
                <input
                  value={selectedWidget.name}
                  onChange={e => updateWidget({ ...selectedWidget, name: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">数据源</label>
                <select
                  value={selectedWidget.data_source}
                  onChange={e => updateWidget({ ...selectedWidget, data_source: e.target.value })}
                  className="form-input"
                >
                  {dataSources.map(ds => (
                    <option key={ds.id} value={ds.name}>{ds.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">图表类型</label>
                <select
                  value={selectedWidget.chart_type}
                  onChange={e => updateWidget({ ...selectedWidget, chart_type: e.target.value })}
                  className="form-input"
                >
                  {CHART_TYPES.map(ct => (
                    <option key={ct.type} value={ct.type}>{ct.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">宽度 (列)</label>
                  <input
                    type="number"
                    value={selectedWidget.width}
                    onChange={e => updateWidget({ ...selectedWidget, width: Math.max(1, Math.min(8, parseInt(e.target.value) || 4)) })}
                    className="form-input"
                    min={1}
                    max={8}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">高度 (行)</label>
                  <input
                    type="number"
                    value={selectedWidget.height}
                    onChange={e => updateWidget({ ...selectedWidget, height: Math.max(1, Math.min(4, parseInt(e.target.value) || 3)) })}
                    className="form-input"
                    min={1}
                    max={4}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setSelectedWidget(null)}
                className="btn btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={() => updateWidget(selectedWidget)}
                className="btn btn-primary flex-1"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
