'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Database, RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';

interface DataSource {
  id: number;
  name: string;
  description: string;
  type: string;
  query: string;
  config: any;
  is_system: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  key: string;
  default: string;
  extra: string;
  description: string;
}

interface Table {
  name: string;
  description: string;
  columns: Column[];
}

export default function DataSourcesPage() {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedDataSource, setSelectedDataSource] = useState<DataSource | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'sql',
    query: '',
  });

  // 数据库浏览器状态
  const [tables, setTables] = useState<Table[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [showDbExplorer, setShowDbExplorer] = useState(true);

  useEffect(() => {
    loadDataSources();
    loadTables();
  }, []);

  async function loadTables() {
    setDbLoading(true);
    try {
      const res = await fetch('/api/db-explorer');
      let data;
      try {
        data = await res.json();
      } catch (e) {
        data = { tables: [] };
      }
      setTables(data.tables || []);
    } catch (e) {
      console.error('Failed to load tables:', e);
    } finally {
      setDbLoading(false);
    }
  }

  function toggleTable(tableName: string) {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedTables(newExpanded);
  }

  async function loadDataSources() {
    setLoading(true);
    try {
      const res = await fetch('/api/data-sources');
      const data = await res.json();
      setDataSources(data.dataSources || []);
    } catch (e) {
      console.error('Failed to load data sources:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      const res = await fetch('/api/data-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowAddModal(false);
        setFormData({ name: '', description: '', type: 'sql', query: '' });
        loadDataSources();
      }
    } catch (e) {
      console.error('Failed to create data source:', e);
    }
  }

  async function handleUpdate() {
    if (!selectedDataSource) return;
    try {
      const res = await fetch(`/api/data-sources/${selectedDataSource.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowEditModal(false);
        setSelectedDataSource(null);
        setFormData({ name: '', description: '', type: 'sql', query: '' });
        loadDataSources();
      }
    } catch (e) {
      console.error('Failed to update data source:', e);
    }
  }

  async function handleDelete(ds: DataSource) {
    if (!confirm(`确定要删除数据源 "${ds.name}" 吗？`)) return;
    try {
      const res = await fetch(`/api/data-sources/${ds.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadDataSources();
      }
    } catch (e) {
      console.error('Failed to delete data source:', e);
    }
  }

  function openEdit(ds: DataSource) {
    setSelectedDataSource(ds);
    setFormData({
      name: ds.name,
      description: ds.description || '',
      type: ds.type,
      query: ds.query,
    });
    setShowEditModal(true);
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
    <div className="h-[calc(100vh-8rem)] flex gap-6">
      {/* 左侧：数据库浏览器 */}
      <div className="w-80 flex-shrink-0">
        <div className="card h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <Database className="w-4 h-4" />
              数据库结构
            </h3>
            <button
              onClick={loadTables}
              disabled={dbLoading}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <RefreshCw className={`w-4 h-4 ${dbLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-1">
            {dbLoading ? (
              <div className="text-center py-8 text-gray-500">加载中...</div>
            ) : tables.length === 0 ? (
              <div className="text-center py-8 text-gray-500">暂无表</div>
            ) : (
              tables.map(table => (
                <div key={table.name}>
                  <button
                    onClick={() => toggleTable(table.name)}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center gap-2"
                  >
                    {expandedTables.has(table.name) ? (
                      <ChevronDown className="w-3 h-3 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                    )}
                    <Database className="w-3 h-3 text-blue-600" />
                    <span className="text-sm font-medium text-gray-700 truncate">{table.name}</span>
                  </button>
                  
                  {expandedTables.has(table.name) && table.columns && (
                    <div className="ml-6 mt-1 space-y-1">
                      {table.columns.map(column => (
                        <div key={column.name} className="group">
                          <div className="px-2 py-1 rounded hover:bg-gray-50 cursor-pointer" 
                               title={column.description || column.type}>
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                              <span className="text-sm text-gray-600 truncate font-mono">{column.name}</span>
                              <span className="text-xs text-gray-400 truncate">{column.type}</span>
                            </div>
                            {column.description && (
                              <div className="text-xs text-gray-500 mt-0.5 truncate">{column.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 右侧：数据源管理 */}
      <div className="flex-1 min-w-0">
        <div className="page-header mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title">数据源管理</h1>
              <p className="page-subtitle">管理报表和Dashboard使用的数据源</p>
            </div>
            <button
              onClick={() => {
                setFormData({ name: '', description: '', type: 'sql', query: '' });
                setShowAddModal(true);
              }}
              className="btn btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              添加数据源
            </button>
          </div>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {dataSources.map(ds => (
          <div key={ds.id} className="card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <h3 className="font-medium text-gray-900">{ds.name}</h3>
                  {ds.is_system && (
                    <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                      系统
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">{ds.description}</p>
                <div className="mt-2 p-2 bg-gray-50 rounded text-xs font-mono text-gray-600 overflow-hidden overflow-ellipsis">
                  {ds.query}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!ds.is_system && (
                  <>
                    <button
                      onClick={() => openEdit(ds)}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(ds)}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {dataSources.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-text">暂无数据源</div>
            <div className="empty-state-description">点击"添加数据源"创建您的第一个数据源</div>
          </div>
        </div>
      )}

      {/* 添加数据源模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-medium mb-4">添加数据源</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="form-input"
                  placeholder="输入数据源名称"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="form-input"
                  placeholder="输入数据源描述（可选）"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  className="form-input"
                >
                  <option value="sql">SQL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">查询</label>
                <textarea
                  value={formData.query}
                  onChange={e => setFormData({ ...formData, query: e.target.value })}
                  className="form-input font-mono text-sm"
                  placeholder="输入SQL查询语句，比如：SELECT status, COUNT(*) as count FROM requirements GROUP BY status"
                  rows={4}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="btn btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                className="btn btn-primary flex-1"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑数据源模态框 */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-medium mb-4">编辑数据源</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
                <input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="form-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="form-input"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">类型</label>
                <select
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  className="form-input"
                >
                  <option value="sql">SQL</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">查询</label>
                <textarea
                  value={formData.query}
                  onChange={e => setFormData({ ...formData, query: e.target.value })}
                  className="form-input font-mono text-sm"
                  rows={4}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setSelectedDataSource(null);
                }}
                className="btn btn-secondary flex-1"
              >
                取消
              </button>
              <button
                onClick={handleUpdate}
                className="btn btn-primary flex-1"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
