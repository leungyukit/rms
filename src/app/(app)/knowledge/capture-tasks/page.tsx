'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STATUS_LABELS: Record<string, string> = {
  pending: '待沉淀',
  waived: '已豁免',
  done: '已沉淀',
};
const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-warning',
  waived: 'badge-gray',
  done: 'badge-success',
};
const GATE_LABELS: Record<string, string> = {
  off: '已关闭',
  warn: '提醒模式',
  block: '强制模式',
};

/** 沉淀线索字数：与后端 captureCharCount 一致，去掉空白再计数 */
function charCount(t: any) {
  let n = 0;
  for (const v of [t.solution, t.lessons_learned, t.root_cause]) {
    if (typeof v === 'string') n += v.replace(/\s+/g, '').length;
  }
  return n;
}

export default function CaptureTasksPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [gate, setGate] = useState('warn');
  const [minChars, setMinChars] = useState(30);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('pending');
  const [err, setErr] = useState('');

  // 沉淀弹窗
  const [target, setTarget] = useState<any>(null);
  const [form, setForm] = useState({ title: '', question: '', answer: '', category: '', tags: '', type: 'lesson' });
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`/api/knowledge/capture-tasks?status=${status}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setGate(data.gate || 'warn');
      setMinChars(data.min_chars ?? 30);
    } catch {
      setErr('加载失败，请确认已登录且有权限');
    } finally {
      // 无论成败都要收起 loading —— 否则失败时永久卡在「加载中」
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, [status]);

  const openCapture = (t: any) => {
    setTarget(t);
    // 用需求已有内容预填，减少重复劳动：解决方案通常就是答案主体
    const answer = [t.solution, t.root_cause && `根因：${t.root_cause}`, t.lessons_learned && `经验：${t.lessons_learned}`]
      .filter(Boolean).join('\n\n');
    setForm({
      title: t.requirement_title || '',
      question: t.requirement_title ? `${t.requirement_title} 是怎么解决的？` : '',
      answer,
      category: '',
      tags: '',
      type: 'lesson',
    });
  };

  const submitCapture = async () => {
    if (!form.title || !form.question || !form.answer) return alert('标题、问题、解答都要填');
    setSaving(true);
    try {
      // 带上 source_requirement_id，后端会自动把对应待办转 done（P6 闭环）
      const res = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          source_requirement_id: target.requirement_id,
          tags: form.tags.split(/[,，]/).map(s => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTarget(null);
        fetchItems();
      } else {
        alert(data.error || '创建失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>📥 知识沉淀待办</h1>
        <p>
          需求关闭时沉淀不足会进入这里，共 {total} 条 ·
          当前门禁：<span className={`badge ${gate === 'block' ? 'badge-danger' : gate === 'off' ? 'badge-gray' : 'badge-warning'}`}>{GATE_LABELS[gate] || gate}</span> ·
          有效沉淀门槛 {minChars} 字
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        <Link href="/knowledge" className="btn btn-secondary">← 知识中心</Link>
        <div className="flex-1" />
        <select value={status} onChange={e => setStatus(e.target.value)} className="form-input">
          <option value="pending">待沉淀</option>
          <option value="done">已沉淀</option>
          <option value="waived">已豁免</option>
          <option value="all">全部</option>
        </select>
      </div>

      {gate === 'off' && (
        <div className="card mb-4"><div className="card-body text-sm text-gray-500">
          ⚠️ 沉淀门禁当前为「关闭」，需求关闭时不会再产生新待办。
          可在 <Link href="/admin/config" className="hover:underline text-gray-800">系统配置</Link> 中把
          <code className="mx-1">knowledge_capture_gate</code> 改为 warn 或 block。
        </div></div>
      )}

      {err ? (
        <div className="card"><div className="card-body text-center text-gray-500">{err}</div></div>
      ) : loading ? (
        <div className="text-center py-20 text-gray-400">加载中...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-text">{status === 'pending' ? '没有待沉淀的需求' : '暂无记录'}</div>
          <p className="text-sm text-gray-400 mt-2">需求进入完成/验收/关闭时，若沉淀内容不足就会出现在这里</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(t => {
            const n = charCount(t);
            return (
              <div key={t.id} className="card">
                <div className="card-body">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`badge ${STATUS_BADGE[t.status] || 'badge-gray'}`}>{STATUS_LABELS[t.status] || t.status}</span>
                        {t.trigger_status && <span className="text-xs text-gray-400">触发于 {t.trigger_status}</span>}
                        {t.project_name && <span className="text-xs text-gray-400">· {t.project_name}</span>}
                      </div>
                      <Link href={`/requirements/${t.requirement_id}`} className="font-semibold text-gray-900 hover:underline">
                        {t.requirement_title || `需求 #${t.requirement_id}`}
                      </Link>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span className={n >= minChars ? 'text-gray-600' : 'text-gray-400'}>
                          沉淀线索 {n} / {minChars} 字
                        </span>
                        {t.knowledge_entry_id && (
                          <Link href={`/knowledge/${t.knowledge_entry_id}`} className="hover:underline text-gray-800">
                            📚 已沉淀为知识 #{t.knowledge_entry_id}
                          </Link>
                        )}
                        {t.resolved_by_name && <span>处理人 {t.resolved_by_name}</span>}
                      </div>
                      {t.waiver_reason && (
                        <p className="text-xs text-gray-500 mt-2">豁免理由：{t.waiver_reason}</p>
                      )}
                    </div>
                    {t.status !== 'done' && (
                      <button onClick={() => openCapture(t)} className="btn btn-sm btn-primary whitespace-nowrap">
                        ✍️ 沉淀为知识
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 沉淀弹窗 */}
      {target && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => !saving && setTarget(null)}>
          <div className="card" style={{ width: 560, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="card-body">
              <h3 className="card-title">✍️ 沉淀知识</h3>
              <p className="text-xs text-gray-400 mb-3">
                来源需求：#{target.requirement_id} {target.requirement_title} —— 已用需求里的方案/根因/经验预填，改完即可
              </p>
              <div className="space-y-3">
                <div>
                  <label className="form-label">类型</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="form-input">
                    <option value="lesson">经验教训</option>
                    <option value="solution">解决方案</option>
                    <option value="faq">FAQ</option>
                    <option value="pattern">可复用模式</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">标题 *</label>
                  <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="form-input" />
                </div>
                <div>
                  <label className="form-label">问题 *</label>
                  <textarea value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} className="form-input" rows={2} />
                </div>
                <div>
                  <label className="form-label">解答 *</label>
                  <textarea value={form.answer} onChange={e => setForm({ ...form, answer: e.target.value })} className="form-input" rows={7} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">分类</label>
                    <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="form-input" />
                  </div>
                  <div>
                    <label className="form-label">标签</label>
                    <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} className="form-input" placeholder="逗号分隔" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <button onClick={() => setTarget(null)} className="btn btn-secondary" disabled={saving}>取消</button>
                <button onClick={submitCapture} className="btn btn-primary" disabled={saving}>
                  {saving ? '提交中...' : '创建并关闭待办'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
