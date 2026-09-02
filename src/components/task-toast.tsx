'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';

/**
 * 右下角任务气泡提示（2026-09-02）
 *
 * 行为：
 *   1. 每 1 小时拉一次 /api/tasks/recent，只取「上次拉取之后」的新动静
 *   2. 默认 30 秒后自动隐藏；鼠标悬停时暂停计时（不然正在读就没了）
 *   3. 右上角 × 手动关闭
 *   4. 出现/隐藏都有动画
 *
 * 游标存 localStorage，用**服务端返回的 now**而不是本地时钟 —— 客户端时间可能不准，
 * 用本地时钟当游标会漏数据或重复弹。
 */

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 小时
const AUTO_HIDE_MS = 30 * 1000;          // 30 秒自动隐藏
const ANIM_MS = 280;                     // 与 CSS 动画时长保持一致
const CURSOR_KEY = 'rms.taskToast.since';
const FIRST_DELAY_MS = 8000;             // 首屏别立刻弹，让页面先加载完

interface TaskItem {
  kind: 'assigned' | 'status_changed';
  id: number;
  title: string;
  status: string;
  statusLabel: string;
  priority?: string;
  isNew?: boolean;
  at: string;
  text: string;
  from?: string;
  to?: string;
  by?: string;
}

function readCursor(): string | null {
  try {
    return localStorage.getItem(CURSOR_KEY);
  } catch {
    return null; // 隐私模式下不可用，退化成「只看最近 1 小时」（服务端默认）
  }
}

function writeCursor(v: string) {
  try {
    localStorage.setItem(CURSOR_KEY, v);
  } catch {
    // 写不进去不影响本次展示
  }
}

export default function TaskToast() {
  const [items, setItems] = useState<TaskItem[]>([]);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const hoverRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
  };

  /** 带退场动画的关闭 */
  const close = useCallback(() => {
    clearTimers();
    setLeaving(true);
    leaveTimer.current = setTimeout(() => {
      setVisible(false);
      setLeaving(false);
      setItems([]);
    }, ANIM_MS);
  }, []);

  /** 启动 30 秒自动隐藏；悬停时不启动 */
  const armAutoHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (hoverRef.current) return;
    hideTimer.current = setTimeout(() => close(), AUTO_HIDE_MS);
  }, [close]);

  const fetchTasks = useCallback(async () => {
    // 页面在后台时不弹 —— 等回到前台再说，否则用户切回来看到的是早已过期的提示
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const since = readCursor();
      const qs = since ? `?since=${encodeURIComponent(since)}` : '';
      const res = await fetch(`/api/tasks/recent${qs}`, { credentials: 'include' });
      if (!res.ok) return; // 401（未登录）等情况安静跳过，不打扰用户
      const data = await res.json();
      // 游标用服务端时间推进。**即使这次没数据也要推进**，否则窗口会越拉越大
      if (data?.now) writeCursor(data.now);
      const list: TaskItem[] = Array.isArray(data?.items) ? data.items : [];
      if (list.length === 0) return;
      setItems(list);
      setLeaving(false);
      setVisible(true);
      armAutoHide();
    } catch {
      // 网络抖动不提示，等下个周期
    }
  }, [armAutoHide]);

  useEffect(() => {
    const first = setTimeout(fetchTasks, FIRST_DELAY_MS);
    const timer = setInterval(fetchTasks, POLL_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      clearTimers();
    };
  }, [fetchTasks]);

  if (!visible) return null;

  const assignedCount = items.filter(i => i.kind === 'assigned').length;
  const changedCount = items.filter(i => i.kind === 'status_changed').length;

  return (
    <div
      className={`task-toast ${leaving ? 'task-toast-leave' : 'task-toast-enter'}`}
      role="status"
      aria-live="polite"
      onMouseEnter={() => {
        hoverRef.current = true;
        if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
      }}
      onMouseLeave={() => {
        hoverRef.current = false;
        armAutoHide();
      }}
    >
      <div className="task-toast-head">
        <span className="task-toast-title">
          🔔 任务动态
          <span className="task-toast-badge">{items.length}</span>
        </span>
        <button onClick={close} className="task-toast-close" aria-label="关闭提示" title="关闭">
          ×
        </button>
      </div>

      <div className="task-toast-sub">
        {assignedCount > 0 && <span>{assignedCount} 项指派给你</span>}
        {assignedCount > 0 && changedCount > 0 && <span> · </span>}
        {changedCount > 0 && <span>{changedCount} 项状态变更</span>}
      </div>

      <div className="task-toast-body">
        {items.slice(0, 5).map((it, i) => (
          <Link
            key={`${it.kind}-${it.id}-${i}`}
            href={`/requirements/${it.id}`}
            className="task-toast-item"
            onClick={close}
          >
            <span className="task-toast-item-icon">
              {it.kind === 'assigned' ? (it.isNew ? '🆕' : '📌') : '🔄'}
            </span>
            <span className="task-toast-item-main">
              <span className="task-toast-item-title">
                #{it.id} {it.title}
              </span>
              <span className="task-toast-item-meta">
                {it.kind === 'status_changed'
                  ? `${it.text}${it.by ? ` · ${it.by}` : ''}`
                  : `${it.text} · ${it.statusLabel}`}
              </span>
            </span>
          </Link>
        ))}
        {items.length > 5 && (
          <Link href="/requirements" className="task-toast-more" onClick={close}>
            还有 {items.length - 5} 项，查看全部 →
          </Link>
        )}
      </div>
    </div>
  );
}
