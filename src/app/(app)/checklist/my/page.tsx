'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { todayLocal } from '@/lib/date-local';

const STATUS_LABEL: Record<string, string> = {
  todo: '待办', in_progress: '进行中', done: '已完成', blocked: '阻塞',
};
const STATUS_COLOR: Record<string, string> = {
  todo: 'badge-gray',
  in_progress: 'badge-info',
  done: 'badge-success',
  blocked: 'badge-danger',
};

function dueClass(due: string | null, status: string): string {
  if (!due || status === 'done') return 'text-gray-400';
  const today = todayLocal();
  if (due < today) return 'text-red-600 font-medium';
  if (due === today) return 'text-orange-600 font-medium';
  return 'text-green-600';
}

export default function MyChecklistPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeDone, setIncludeDone] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/checklist/my${includeDone ? '?include_done=1' : ''}`);
      const j = await r.json();
      setItems(Array.isArray(j.data) ? j.data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [includeDone]);

  const toggleDone = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'done' ? 'todo' : 'done';
    await fetch(`/api/checklist/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    await load();
  };

  const today = todayLocal();
  const overdue = items.filter(i => i.due_date && i.due_date < today && i.status !== 'done');
  const todayItems = items.filter(i => i.due_date === today && i.status !== 'done');
  const future = items.filter(i => i.due_date && i.due_date > today && i.status !== 'done');
  const noDue = items.filter(i => !i.due_date && i.status !== 'done');
  const doneItems = items.filter(i => i.status === 'done');

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>☑️ 我的待办（子任务）</h1>
        <p>跟踪你负责的子任务完成情况</p>
      </div>

      <div className="flex justify-end mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={includeDone} onChange={e => setIncludeDone(e.target.checked)} />
          包含已完成
        </label>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">加载中...</div>
      ) : items.length === 0 ? (
        <div className="card"><div className="card-body text-center text-gray-400">
          🎉 当前没有待办
          <div className="text-xs mt-1 text-gray-400">去需求详情页把自己设为子任务负责人就会出现在这里</div>
        </div></div>
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-red-600 mb-2">⚠️ 已逾期 ({overdue.length})</h2>
              <div className="card"><div className="card-body"><div className="divide-y">
                {overdue.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-2">
                    <button onClick={() => toggleDone(item.id, item.status)} className="text-gray-300 hover:text-green-500 text-xl">○</button>
                    <span className="text-sm flex-1 text-gray-800">{item.title}</span>
                    <span className={`text-xs ${dueClass(item.due_date, item.status)}`}>截止: {item.due_date}</span>
                    <span className={`badge ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    <Link href={`/requirements/${item.requirement_id}`} className="text-xs text-gray-800 hover:underline">#{item.requirement_id}</Link>
                  </div>
                ))}
              </div></div></div>
            </div>
          )}

          {todayItems.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-orange-600 mb-2">📅 今日截止 ({todayItems.length})</h2>
              <div className="card"><div className="card-body"><div className="divide-y">
                {todayItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-2">
                    <button onClick={() => toggleDone(item.id, item.status)} className="text-gray-300 hover:text-green-500 text-xl">○</button>
                    <span className="text-sm flex-1 text-gray-800">{item.title}</span>
                    <span className="text-xs text-orange-600">今日截止</span>
                    <span className={`badge ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    <Link href={`/requirements/${item.requirement_id}`} className="text-xs text-gray-800 hover:underline">#{item.requirement_id}</Link>
                  </div>
                ))}
              </div></div></div>
            </div>
          )}

          {future.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-2">📋 未来 ({future.length})</h2>
              <div className="card"><div className="card-body"><div className="divide-y">
                {future.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-2">
                    <button onClick={() => toggleDone(item.id, item.status)} className="text-gray-300 hover:text-green-500 text-xl">○</button>
                    <span className="text-sm flex-1 text-gray-800">{item.title}</span>
                    <span className="text-xs text-gray-500">{item.due_date}</span>
                    <span className={`badge ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    <Link href={`/requirements/${item.requirement_id}`} className="text-xs text-gray-800 hover:underline">#{item.requirement_id}</Link>
                  </div>
                ))}
              </div></div></div>
            </div>
          )}

          {noDue.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-2">🗳️ 无截止日期 ({noDue.length})</h2>
              <div className="card"><div className="card-body"><div className="divide-y">
                {noDue.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-2">
                    <button onClick={() => toggleDone(item.id, item.status)} className="text-gray-300 hover:text-green-500 text-xl">○</button>
                    <span className="text-sm flex-1 text-gray-800">{item.title}</span>
                    <span className={`badge ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    <Link href={`/requirements/${item.requirement_id}`} className="text-xs text-gray-800 hover:underline">#{item.requirement_id}</Link>
                  </div>
                ))}
              </div></div></div>
            </div>
          )}

          {doneItems.length > 0 && includeDone && (
            <div>
              <h2 className="text-sm font-medium text-gray-400 mb-2">✅ 已完成 ({doneItems.length})</h2>
              <div className="card"><div className="card-body"><div className="divide-y">
                {doneItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-2 opacity-60">
                    <button onClick={() => toggleDone(item.id, item.status)} className="text-green-500 text-xl">✓</button>
                    <span className="text-sm flex-1 text-gray-500 line-through">{item.title}</span>
                    <span className={`badge ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                    <Link href={`/requirements/${item.requirement_id}`} className="text-xs text-gray-500 hover:underline">#{item.requirement_id}</Link>
                  </div>
                ))}
              </div></div></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
