'use client';

import { useEffect, useState } from 'react';
import { useRequirementOptions } from '@/lib/use-requirement-options';

const STATUS_LABEL: Record<string, string> = {
  todo: '待办',
  in_progress: '进行中',
  done: '已完成',
  blocked: '已阻塞',
};
const STATUS_COLOR: Record<string, string> = {
  todo: 'bg-gray-100 text-gray-600 border-gray-300',
  in_progress: 'bg-gray-100 text-gray-900 border-gray-400',
  done: 'bg-green-50 text-green-700 border-green-300',
  blocked: 'bg-red-50 text-red-700 border-red-300',
};
const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-red-500',
  medium: 'text-yellow-500',
  low: 'text-green-500',
};

interface ChecklistItem {
  id: number;
  requirement_id: number;
  title: string;
  description: string | null;
  sequence: number;
  assignee_id: number | null;
  assignee_name?: string | null;
  due_date: string | null;
  status: string;
  priority: string;
  estimate_hours: number | null;
  actual_hours: number | null;
  blocked_reason: string | null;
  completed_at: string | null;
  completed_by: number | null;
  completed_by_name?: string | null;
  created_by: number;
  created_by_name?: string | null;
}

interface ChecklistAggregate {
  checklist_total: number;
  checklist_done: number;
  checklist_in_progress: number;
  checklist_blocked: number;
  checklist_overdue: number;
  checklist_progress_pct: number;
}

function dueBadge(due: string | null, status: string): { label: string; color: string } | null {
  if (!due || status === 'done') return null;
  const today = new Date().toISOString().slice(0, 10);
  if (due < today) return { label: `超期 ${Math.ceil((new Date(today).getTime() - new Date(due).getTime()) / 86400000)} 天`, color: 'text-red-600 bg-red-50 px-1.5 py-0.5 rounded' };
  if (due === today) return { label: '今日截止', color: 'text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded' };
  const days = Math.ceil((new Date(due).getTime() - new Date(today).getTime()) / 86400000);
  if (days <= 3) return { label: `${days} 天后`, color: 'text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded' };
  return { label: due, color: 'text-gray-500' };
}

export function ChecklistSection({
  requirementId,
  aggregate,
  users,
  onChanged,
}: {
  requirementId: number;
  aggregate: ChecklistAggregate;
  users: Array<{ id: number; display_name: string }>;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<ChecklistItem>>({});
  const [addingNew, setAddingNew] = useState(false);
  const [filter, setFilter] = useState<'all' | 'todo' | 'in_progress' | 'done' | 'blocked'>('all');

  const { priorities, priorityLabel } = useRequirementOptions();

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/requirements/${requirementId}/checklist`);
      const j = await r.json();
      setItems(Array.isArray(j.data) ? j.data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [requirementId]);

  const startNew = () => {
    setDraft({ title: '', status: 'todo', priority: 'medium', estimate_hours: null });
    setAddingNew(true);
  };

  const saveNew = async () => {
    if (!draft.title?.trim()) { alert('标题必填'); return; }
    const res = await fetch(`/api/requirements/${requirementId}/checklist`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: draft.title,
        description: draft.description,
        assignee_id: draft.assignee_id,
        due_date: draft.due_date,
        priority: draft.priority,
        estimate_hours: draft.estimate_hours,
      }),
    });
    if (!res.ok) { const j = await res.json(); alert(j.error || '保存失败'); return; }
    setAddingNew(false);
    setDraft({});
    await load();
    onChanged();
  };

  const toggleDone = async (item: ChecklistItem) => {
    const newStatus = item.status === 'done' ? 'todo' : 'done';
    await fetch(`/api/checklist/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await load();
    onChanged();
  };

  const updateField = async (id: number, field: string, value: any) => {
    await fetch(`/api/checklist/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    await load();
    onChanged();
  };

  const removeItem = async (id: number) => {
    if (!confirm('确认删除此子任务？')) return;
    await fetch(`/api/checklist/${id}`, { method: 'DELETE' });
    await load();
    onChanged();
  };

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);
  const visibleUsers = users.length > 0 ? users : (items.some(i => i.assignee_name) ? [] : []);

  if (loading) return <div className="text-sm text-gray-400 py-4">加载中...</div>;

  return (
    <div>
      {/* 顶部统计 + 操作 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-gray-600">进度</span>
            <span className="font-mono font-medium">{aggregate.checklist_done}/{aggregate.checklist_total}</span>
            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 transition-all" style={{ width: `${aggregate.checklist_progress_pct}%` }} />
            </div>
            <span className="text-xs text-gray-500">{aggregate.checklist_progress_pct}%</span>
          </div>
          {aggregate.checklist_blocked > 0 && (
            <span className="text-xs text-red-600">⛔ {aggregate.checklist_blocked} 条阻塞</span>
          )}
          {aggregate.checklist_overdue > 0 && (
            <span className="text-xs text-orange-600">⏰ {aggregate.checklist_overdue} 条超期</span>
          )}
        </div>
        <div className="flex gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value as any)}
            className="text-xs px-2 py-1.5 border rounded">
            <option value="all">全部 ({items.length})</option>
            <option value="todo">待办 ({items.filter(i => i.status === 'todo').length})</option>
            <option value="in_progress">进行中 ({items.filter(i => i.status === 'in_progress').length})</option>
            <option value="blocked">阻塞 ({items.filter(i => i.status === 'blocked').length})</option>
            <option value="done">已完成 ({items.filter(i => i.status === 'done').length})</option>
          </select>
          <button onClick={startNew} className="text-xs px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900">+ 添加子任务</button>
        </div>
      </div>

      {/* 新增行 */}
      {addingNew && (
        <div className="border-2 border-gray-300 rounded-lg p-3 bg-gray-100/30 mb-3">
          <div className="grid grid-cols-12 gap-2">
            <input
              autoFocus
              value={draft.title || ''}
              onChange={e => setDraft({ ...draft, title: e.target.value })}
              placeholder="子任务标题（必填）"
              className="col-span-6 text-sm px-2 py-1.5 border rounded"
            />
            <select
              value={draft.assignee_id || ''}
              onChange={e => setDraft({ ...draft, assignee_id: e.target.value ? Number(e.target.value) : null })}
              className="col-span-2 text-sm px-2 py-1.5 border rounded"
            >
              <option value="">— 负责人 —</option>
              {visibleUsers.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
            </select>
            <input
              type="date"
              value={draft.due_date || ''}
              onChange={e => setDraft({ ...draft, due_date: e.target.value })}
              className="col-span-2 text-sm px-2 py-1.5 border rounded"
            />
            <select
              value={draft.priority || 'medium'}
              onChange={e => setDraft({ ...draft, priority: e.target.value })}
              className="col-span-1 text-sm px-2 py-1.5 border rounded"
            >
              {priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <input
              type="number" min={0} step={0.5}
              value={draft.estimate_hours ?? ''}
              onChange={e => setDraft({ ...draft, estimate_hours: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="h"
              className="col-span-1 text-sm px-2 py-1.5 border rounded"
            />
          </div>
          <textarea
            value={draft.description || ''}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
            placeholder="详细说明（可选）"
            rows={2}
            className="w-full text-sm px-2 py-1.5 border rounded mt-2"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setAddingNew(false); setDraft({}); }} className="text-xs px-3 py-1.5 border rounded">取消</button>
            <button onClick={saveNew} className="text-xs px-3 py-1.5 bg-gray-800 text-white rounded">保存</button>
          </div>
        </div>
      )}

      {/* 列表 */}
      {filtered.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-6 border border-dashed rounded-lg">
          {items.length === 0 ? '📋 暂无子任务，点击右上角"添加子任务"开始拆解' : `没有${STATUS_LABEL[filter]}的子任务`}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((item, idx) => {
            const due = dueBadge(item.due_date, item.status);
            return (
              <div key={item.id} className={`border rounded-lg p-2.5 ${item.status === 'done' ? 'bg-green-50/30' : 'bg-white'}`}>
                <div className="flex items-start gap-3">
                  {/* 勾选框 */}
                  <button
                    onClick={() => toggleDone(item)}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                      item.status === 'done' ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {item.status === 'done' && '✓'}
                  </button>
                  {/* 序号 */}
                  <span className="text-xs text-gray-400 font-mono mt-1 min-w-[3rem]">{item.sequence / 100}.</span>
                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${item.status === 'done' ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                      {item.title}
                    </div>
                    {item.description && (
                      <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{item.description}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 text-xs flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded border ${STATUS_COLOR[item.status]}`}>
                        {STATUS_LABEL[item.status]}
                      </span>
                      <span className={PRIORITY_COLOR[item.priority] || ''}>
                        {priorityLabel(item.priority, true)}
                      </span>
                      {item.assignee_name && (
                        <span className="text-gray-500">👤 {item.assignee_name}</span>
                      )}
                      {due && <span className={due.color}>📅 {due.label}</span>}
                      {item.estimate_hours != null && (
                        <span className="text-gray-500">⏱ {item.estimate_hours}h</span>
                      )}
                      {item.actual_hours != null && item.actual_hours > 0 && (
                        <span className="text-gray-500">⏱ 实际 {item.actual_hours}h</span>
                      )}
                      {item.blocked_reason && (
                        <span className="text-red-600">⛔ {item.blocked_reason}</span>
                      )}
                      {item.status === 'done' && item.completed_by_name && (
                        <span className="text-gray-400">· {item.completed_by_name} 完成</span>
                      )}
                    </div>
                  </div>
                  {/* 操作 */}
                  <div className="flex flex-col gap-1">
                    {item.status !== 'done' && (
                      <select
                        value={item.status}
                        onChange={e => updateField(item.id, 'status', e.target.value)}
                        className="text-xs px-1 py-0.5 border rounded"
                      >
                        <option value="todo">待办</option>
                        <option value="in_progress">进行中</option>
                        <option value="blocked">阻塞</option>
                        <option value="done">完成</option>
                      </select>
                    )}
                    <button onClick={() => removeItem(item.id)} className="text-xs text-gray-400 hover:text-red-500">🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
