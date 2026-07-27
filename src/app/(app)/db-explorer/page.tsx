'use client';

import { useState, useEffect } from 'react';
import { Database, RefreshCw } from 'lucide-react';

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

export default function DbExplorerPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  async function loadTables() {
    setLoading(true);
    setError(null);
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
      setError((e as Error).message || '加载失败');
      console.error('Failed to load tables:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTables();
  }, []);

  function toggleTable(tableName: string) {
    const newExpanded = new Set(expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
    } else {
      newExpanded.add(tableName);
    }
    setExpandedTables(newExpanded);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.createElement('div');
      btn.textContent = '已复制！';
      btn.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50';
      document.body.appendChild(btn);
      setTimeout(() => btn.remove(), 2000);
    });
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">数据库浏览器</h1>
            <p className="page-subtitle">查看数据库表结构和字段</p>
          </div>
          <button
            onClick={loadTables}
            disabled={loading}
            className="btn btn-primary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <div className="text-red-600 font-medium">错误</div>
          <div className="text-red-500 text-sm mt-1">{error}</div>
        </div>
      )}

      {loading && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">⏳</div>
            <div className="empty-state-text">加载中...</div>
          </div>
        </div>
      )}

      {!loading && !error && tables.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-text">没有找到表</div>
          </div>
        </div>
      )}

      {!loading && !error && tables.length > 0 && (
        <div className="space-y-3">
          {tables.map(table => (
            <div key={table.name} className="card overflow-hidden">
              <button
                onClick={() => toggleTable(table.name)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-gray-600" />
                  <div className="font-medium text-gray-900">{table.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  {table.description && (
                    <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded">
                      {table.description.length > 30 ? table.description.substring(0, 30) + '...' : table.description}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">{table.columns?.length || 0} 个字段</span>
                  {expandedTables.has(table.name) ? (
                    <span className="text-gray-400">▼</span>
                  ) : (
                    <span className="text-gray-400">▶</span>
                  )}
                </div>
              </button>

              {expandedTables.has(table.name) && table.columns && (
                <div className="p-4">
                  {/* 表说明 */}
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm font-medium text-gray-700">表说明</div>
                    <div className="mt-1 text-gray-600 text-sm">{table.description || '暂无说明'}</div>
                  </div>

                  {/* 字段列表 */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-2 px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded">
                      <div className="col-span-3">字段名</div>
                      <div className="col-span-2">类型</div>
                      <div className="col-span-2">约束</div>
                      <div className="col-span-4">说明</div>
                      <div className="col-span-1 text-right">操作</div>
                    </div>
                    {table.columns.map(column => (
                      <div key={column.name} className="grid grid-cols-12 gap-2 px-2 py-2 text-sm hover:bg-gray-50 rounded items-center">
                        <div className="col-span-3 font-mono font-medium text-gray-900">{column.name}</div>
                        <div className="col-span-2">
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{column.type}</span>
                        </div>
                        <div className="col-span-2 flex flex-wrap gap-1">
                          {column.key && (
                            <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded">{column.key}</span>
                          )}
                          {!column.nullable && (
                            <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded">NOT NULL</span>
                          )}
                          {column.extra && (
                            <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">{column.extra}</span>
                          )}
                        </div>
                        <div className="col-span-4">
                          <div className="text-gray-600">{column.description || '暂无说明'}</div>
                        </div>
                        <div className="col-span-1 flex items-center justify-end">
                          <button
                            onClick={() => copyToClipboard(`\`${table.name}\`.\`${column.name}\``)}
                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                          >
                            复制
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => copyToClipboard(`SELECT * FROM \`${table.name}\``)}
                      className="btn btn-secondary text-sm"
                    >
                      复制 SELECT *
                    </button>
                    <button
                      onClick={() => {
                        const cols = table.columns.map(c => `\`${c.name}\``).join(', ');
                        copyToClipboard(`SELECT ${cols} FROM \`${table.name}\``);
                      }}
                      className="btn btn-secondary text-sm"
                    >
                      复制 SELECT 所有字段
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
