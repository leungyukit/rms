'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Notification = {
  id: number;
  user_id: number;
  title: string;
  content: string;
  type: string;
  is_read: number;
  link: string;
  created_at: string;
};

const TYPE_META: Record<string, { icon: string; bg: string; label: string }> = {
  sla_warning: { icon: '🚨', bg: 'bg-red-50 border-red-200', label: 'SLA 预警' },
  sla_approaching: { icon: '⏰', bg: 'bg-amber-50 border-amber-200', label: '即将超期' },
  status_change: { icon: '🔄', bg: 'bg-gray-100 border-gray-300', label: '状态变更' },
  assignment: { icon: '👤', bg: 'bg-gray-100 border-gray-300', label: '指派通知' },
  mention: { icon: '@', bg: 'bg-green-50 border-green-200', label: '@提及' },
  system: { icon: '📢', bg: 'bg-gray-50 border-gray-200', label: '系统通知' },
};
const DEFAULT_META = { icon: '🔔', bg: 'bg-gray-50 border-gray-200', label: '通知' };

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 7 * 86400_000) return `${Math.floor(diff / 86400_000)} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

export default function NotificationsPage() {
  const router = useRouter();
  const [list, setList] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/notifications${filter === 'unread' ? '?unread=true' : ''}`, { credentials: 'include' });
      if (!r.ok) { setLoading(false); return; }
      const d = await r.json();
      setList(d.notifications || []);
      setUnreadCount(d.unreadCount || 0);
    } catch {}
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleClick = async (n: Notification) => {
    // 标记已读
    if (!n.is_read) {
      try {
        await fetch('/api/notifications', {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: n.id }),
        });
        setList(prev => prev.map(x => x.id === n.id ? { ...x, is_read: 1 } : x));
        setUnreadCount(c => Math.max(0, c - 1));
      } catch {}
    }
    // 跳转
    if (n.link) router.push(n.link);
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;
    setBusy(true);
    try {
      await fetch('/api/notifications', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true }),
      });
      setList(prev => prev.map(x => ({ ...x, is_read: 1 })));
      setUnreadCount(0);
    } catch {}
    setBusy(false);
  };

  const deleteOne = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/notifications?id=${id}`, { method: 'DELETE', credentials: 'include' });
      setList(prev => prev.filter(x => x.id !== id));
    } catch {}
  };

  const clearRead = async () => {
    setBusy(true);
    try {
      await fetch('/api/notifications?clearRead=true', { method: 'DELETE', credentials: 'include' });
      await load();
    } catch {}
    setBusy(false);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            🔔 通知中心
            {unreadCount > 0 && (
              <span className="text-sm font-normal px-2 py-0.5 bg-red-500 text-white rounded-full">
                {unreadCount} 未读
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500 mt-1">查看所有 SLA 预警、状态变更、指派通知等</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={markAllRead}
            disabled={busy || unreadCount === 0}
            className="btn btn-secondary btn-sm"
          >
            全部标为已读
          </button>
          <button
            onClick={clearRead}
            disabled={busy}
            className="px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-40 transition"
          >
            清除已读
          </button>
        </div>
      </div>

      {/* 过滤 Tab */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
              filter === f
                ? 'border-gray-800 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'all' ? `全部 (${list.length})` : `未读 (${unreadCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">加载中...</div>
      ) : list.length === 0 ? (
        <div className="card"><div className="card-body empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">{filter === 'unread' ? '没有未读通知' : '暂无通知'}</div>
        </div></div>
      ) : (
        <div className="space-y-2">
          {list.map(n => {
            const meta = TYPE_META[n.type] || DEFAULT_META;
            const isUnread = !n.is_read;
            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                className={`group relative cursor-pointer bg-white border rounded-lg p-4 hover:shadow-md transition ${
                  isUnread ? 'border-l-4 border-l-gray-800' : ''
                } ${meta.bg}`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl shrink-0">{meta.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <h3 className={`text-sm font-medium truncate ${isUnread ? 'text-gray-900' : 'text-gray-600'}`}>
                        {n.title}
                      </h3>
                      {isUnread && <span className="w-2 h-2 bg-gray-800 rounded-full shrink-0" />}
                      <span className="badge badge-gray text-[10px] shrink-0">
                        {meta.label}
                      </span>
                    </div>
                    {n.content && n.content !== n.title && (
                      <p className="text-xs text-gray-600 line-clamp-2 mb-1">{n.content}</p>
                    )}
                    <div className="flex items-center gap-3 text-[11px] text-gray-400">
                      <span>{timeAgo(n.created_at)}</span>
                      {n.link && <span className="truncate">{n.link}</span>}
                    </div>
                  </div>
                  <button
                    onClick={(e) => deleteOne(n.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500 p-1 shrink-0"
                    title="删除"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
