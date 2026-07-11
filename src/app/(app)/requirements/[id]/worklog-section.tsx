'use client';

import { useEffect, useState } from 'react';

interface WorkLog {
  id: number;
  work_date: string;
  hours: number;
  description: string;
  user_name: string;
  created_at: string;
}

export default function WorklogSection({ reqId, currentUser, onUpdate }: { reqId: string; currentUser: any; onUpdate?: () => void }) {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [total, setTotal] = useState(0);
  const [ed, setEd] = useState<any>({ work_date: new Date().toISOString().substring(0, 10), hours: 1, description: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const r = await fetch(`/api/requirements/${reqId}/work-logs`);
    const j = await r.json();
    setLogs(j.logs || []);
    setTotal(j.total_hours || 0);
  };

  useEffect(() => { load(); }, [reqId]);

  const submit = async () => {
    if (ed.hours <= 0 || ed.hours > 24) { alert('工时 0<h≤24'); return; }
    setLoading(true);
    const r = await fetch(`/api/requirements/${reqId}/work-logs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ed),
    });
    setLoading(false);
    if (!r.ok) { const j = await r.json(); alert(j.error); return; }
    setEd({ ...ed, hours: 1, description: '' });
    load();
    onUpdate?.();
  };

  const saveEdit = async (wid: number) => {
    const r = await fetch(`/api/work-logs/${wid}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    if (!r.ok) { const j = await r.json(); alert(j.error); return; }
    setEditingId(null);
    load();
    onUpdate?.();
  };

  const del = async (wid: number) => {
    if (!confirm('确认删除此工时记录？')) return;
    await fetch(`/api/work-logs/${wid}`, { method: 'DELETE' });
    load();
    onUpdate?.();
  };

  return (
    <div className="bg-white rounded-xl border">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h2 className="font-medium">⏱️ 工时日志 <span className="text-gray-400 text-sm ml-2">合计 {total.toFixed(1)}h</span></h2>
      </div>

      {/* 录入 */}
      <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-gray-500">日期</label>
          <input type="date" value={ed.work_date} onChange={e => setEd({ ...ed, work_date: e.target.value })}
            className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">工时（0.5步）</label>
          <input type="number" min="0.5" max="24" step="0.5" value={ed.hours}
            onChange={e => setEd({ ...ed, hours: parseFloat(e.target.value) || 0 })}
            className="w-20 border rounded px-2 py-1 text-sm" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-gray-500">描述</label>
          <input value={ed.description} onChange={e => setEd({ ...ed, description: e.target.value })}
            placeholder="今天干了啥" className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <button onClick={submit} disabled={loading}
          className="px-4 py-1.5 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-900 disabled:opacity-50">
          {loading ? '保存中...' : '+ 记工时'}
        </button>
      </div>

      {/* 列表 */}
      {logs.length === 0 ? (
        <div className="p-8 text-center text-gray-400 text-sm">暂无工时记录</div>
      ) : (
        <div className="divide-y">
          {logs.map(l => (
            <div key={l.id} className="flex items-center gap-3 p-3 text-sm">
              {editingId === l.id ? (
                <>
                  <input type="date" value={editForm.work_date || l.work_date} onChange={e => setEditForm({ ...editForm, work_date: e.target.value })} className="border rounded px-2 py-1 text-xs" />
                  <input type="number" step="0.5" min="0.5" value={editForm.hours ?? l.hours} onChange={e => setEditForm({ ...editForm, hours: parseFloat(e.target.value) })} className="w-16 border rounded px-2 py-1 text-xs" />
                  <input value={editForm.description ?? l.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="flex-1 border rounded px-2 py-1 text-xs" />
                  <button onClick={() => saveEdit(l.id)} className="text-xs px-2 py-1 bg-gray-800 text-white rounded">保存</button>
                  <button onClick={() => setEditingId(null)} className="text-xs px-2 py-1 border rounded">取消</button>
                </>
              ) : (
                <>
                  <span className="text-xs text-gray-500 w-20">{l.work_date}</span>
                  <span className="text-sm font-mono font-medium w-12">{l.hours.toFixed(1)}h</span>
                  <span className="text-xs text-gray-400 w-16">{l.user_name}</span>
                  <span className="flex-1 text-gray-700 truncate">{l.description || '—'}</span>
                  {(l.user_name === currentUser?.display_name || (currentUser as any)?.isGlobalAdmin) && (
                    <>
                      <button onClick={() => { setEditingId(l.id); setEditForm({ work_date: l.work_date, hours: l.hours, description: l.description }); }}
                        className="text-xs text-gray-800 hover:underline">编辑</button>
                      <button onClick={() => del(l.id)} className="text-xs text-red-500 hover:underline">删除</button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
