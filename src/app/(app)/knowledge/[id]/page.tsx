'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const TYPE_LABELS: Record<string, string> = { faq: 'FAQ', solution: '解决方案', lesson: '经验教训', pattern: '可复用模式' };

export default function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [entry, setEntry] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  // 版本历史（P4）
  const [versions, setVersions] = useState<any[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [vLoading, setVLoading] = useState(false);
  const [diff, setDiff] = useState<{ version: number; rows: any[] } | null>(null);
  const [snapshot, setSnapshot] = useState<any>(null);

  useEffect(() => {
    // 修复（2026-08-31）：原来无 r.ok 检查也无 catch，401/500 时 setLoading(false)
    // 永远不执行 → 页面永久卡在「加载中...」，不报错也不跳登录。
    fetch(`/api/knowledge/${id}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => {
        setEntry(data);
        setEditForm({ title: data.title, question: data.question, answer: data.answer, category: data.category, type: data.type, tags: (data.tags || []).join(', ') });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleFeedback = async (isUseful: boolean) => {
    await fetch(`/api/knowledge/${id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_useful: isUseful }),
    });
    const res = await fetch(`/api/knowledge/${id}`);
    setEntry(await res.json());
  };

  const handleSave = async () => {
    const res = await fetch(`/api/knowledge/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, tags: editForm.tags.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean) }),
    });
    if ((await res.json()).success) {
      setEditing(false);
      const refreshed = await fetch(`/api/knowledge/${id}`);
      setEntry(await refreshed.json());
      // 保存会自动产生新版本（P4），开着面板就同步刷一下
      if (showVersions) loadVersions();
    }
  };

  const loadVersions = async () => {
    setVLoading(true);
    try {
      const res = await fetch(`/api/knowledge/${id}/versions`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setVersions(data.items || []);
    } catch {
      setVersions([]);
    } finally {
      setVLoading(false);
    }
  };

  const toggleVersions = () => {
    const next = !showVersions;
    setShowVersions(next);
    if (next && versions.length === 0) loadVersions();
  };

  const loadDiff = async (versionNo: number) => {
    const res = await fetch(`/api/knowledge/${id}/versions?diff=${versionNo}`);
    if (!res.ok) return alert('获取差异失败');
    const data = await res.json();
    setDiff({ version: versionNo, rows: data.diffs || [] });
  };

  const loadSnapshot = async (versionNo: number) => {
    const res = await fetch(`/api/knowledge/${id}/versions/${versionNo}`);
    if (!res.ok) return alert('获取版本失败');
    setSnapshot(await res.json());
  };

  const rollback = async (versionNo: number) => {
    // 回滚本身也会存一个新版本（P4），所以不会丢现状 —— 说清楚让人敲定心
    if (!confirm(`回滚到 v${versionNo}？\n当前内容会先存成一个新版本，不会丢。`)) return;
    const res = await fetch(`/api/knowledge/${id}/versions/${versionNo}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      setSnapshot(null);
      setDiff(null);
      const refreshed = await fetch(`/api/knowledge/${id}`);
      const fresh = await refreshed.json();
      setEntry(fresh);
      setEditForm({ title: fresh.title, question: fresh.question, answer: fresh.answer, category: fresh.category, type: fresh.type, tags: (fresh.tags || []).join(', ') });
      loadVersions();
    } else {
      alert(data.error || '回滚失败');
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定删除这条知识条目？')) return;
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE' });
    router.push('/knowledge');
  };

  if (loading) return <div className="p-20 text-center text-gray-400">加载中...</div>;
  if (!entry?.id) return <div className="p-20 text-center text-gray-500">知识条目不存在</div>;

  const typeBadge = (t: string) => {
    const m: Record<string, string> = { faq: 'badge-info', solution: 'badge-success', lesson: 'badge-warning', pattern: 'badge-primary' };
    return m[t] || 'badge-gray';
  };
  const statusBadge = (s: string) => {
    const m: Record<string, string> = { published: 'badge-success', draft: 'badge-gray', archived: 'badge-danger' };
    return m[s] || 'badge-gray';
  };

  return (
    <div className="p-6 max-w-3xl">
      <Link href="/knowledge" className="text-sm text-gray-800 hover:underline mb-4 inline-block">← 返回知识中心</Link>

      {/* Header */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-3">
            <span className={`badge ${typeBadge(entry.type)}`}>{TYPE_LABELS[entry.type] || entry.type}</span>
            <span className={`badge ${statusBadge(entry.status)}`}>{entry.status === 'published' ? '已发布' : entry.status === 'draft' ? '草稿' : '已归档'}</span>
            {entry.category && <span className="text-xs text-gray-400">{entry.category}</span>}
            <span className="text-xs text-gray-400 ml-auto">置信度: {Math.round((entry.confidence || 0) * 100)}%</span>
          </div>
          {editing ? (
            <input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="form-input text-lg font-bold" />
          ) : (
            <h1 className="text-xl font-bold text-gray-900 mb-2">{entry.title}</h1>
          )}
          <div className="flex items-center gap-4 text-sm text-gray-400">
            {entry.source_title && <Link href={`/requirements/${entry.source_requirement_id}`} className="hover:text-gray-800">📋 来源: {entry.source_title}</Link>}
            <span>👁 {entry.view_count} 次浏览</span>
            <span>👍 {entry.feedback?.useful || 0} / 👎 {entry.feedback?.not_useful || 0}</span>
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="card mb-4">
        <div className="card-body">
          <h2 className="card-title">❓ 问题</h2>
          {editing ? (
            <textarea value={editForm.question} onChange={e => setEditForm({ ...editForm, question: e.target.value })} className="form-input" rows={3} />
          ) : (
            <p className="text-gray-800">{entry.question}</p>
          )}
        </div>
      </div>

      {/* Answer */}
      <div className="card mb-4">
        <div className="card-body">
          <h2 className="card-title">💡 解答</h2>
          {editing ? (
            <textarea value={editForm.answer} onChange={e => setEditForm({ ...editForm, answer: e.target.value })} className="form-input min-h-[200px]" rows={8} />
          ) : (
            <div className="text-gray-800 whitespace-pre-wrap leading-relaxed">{entry.answer}</div>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="card mb-4">
        <div className="card-body">
          <h2 className="card-title">🏷️ 标签</h2>
          {editing ? (
            <input value={editForm.tags} onChange={e => setEditForm({ ...editForm, tags: e.target.value })} className="form-input" placeholder="逗号分隔" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {(entry.tags || []).map((tag: string, i: number) => (
                <span key={i} className="badge badge-gray">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Related */}
      {entry.related?.length > 0 && (
        <div className="card mb-4">
          <div className="card-body">
            <h2 className="card-title">🔗 相关知识</h2>
            <div className="space-y-2">
              {entry.related.map((r: any) => (
                <Link key={r.id} href={`/knowledge/${r.id}`} className="flex items-center gap-2 text-sm text-gray-800 hover:underline">
                  <span className="badge badge-gray">{TYPE_LABELS[r.type] || r.type}</span>
                  {r.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 版本历史（P4） */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="flex items-center justify-between">
            <h2 className="card-title mb-0">🕘 版本历史</h2>
            <button onClick={toggleVersions} className="btn btn-sm btn-secondary">
              {showVersions ? '收起' : '展开'}
            </button>
          </div>

          {showVersions && (
            vLoading ? (
              <div className="text-center py-6 text-gray-400">加载中...</div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-gray-400 mt-3">还没有历史版本。每次保存修改都会自动生成一个快照。</p>
            ) : (
              <div className="mt-3 space-y-2">
                {versions.map(v => (
                  <div key={v.id} className="flex items-center gap-3 text-sm border-b border-[var(--border-c)] pb-2 last:border-0">
                    <span className="badge badge-gray">v{v.version_no}</span>
                    <span className="flex-1 min-w-0 truncate text-gray-800">{v.title || '(无标题)'}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{v.change_summary}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{v.changed_by_name || '—'}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{v.changed_at}</span>
                    <div className="flex gap-1">
                      <button onClick={() => loadDiff(v.version_no)} className="btn btn-sm btn-secondary">对比</button>
                      <button onClick={() => loadSnapshot(v.version_no)} className="btn btn-sm btn-secondary">查看</button>
                      <button onClick={() => rollback(v.version_no)} className="btn btn-sm btn-primary">回滚</button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button onClick={() => handleFeedback(true)} className="btn btn-sm btn-secondary">👍 有用</button>
          <button onClick={() => handleFeedback(false)} className="btn btn-sm btn-secondary">👎 没用</button>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="btn btn-sm btn-secondary">取消</button>
              <button onClick={handleSave} className="btn btn-sm btn-primary">保存</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="btn btn-sm btn-secondary">✏️ 编辑</button>
              <button onClick={handleDelete} className="btn btn-sm btn-danger">🗑️ 删除</button>
            </>
          )}
        </div>
      </div>

      {/* 版本对比 */}
      {diff && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setDiff(null)}>
          <div className="card" style={{ width: 640, maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="card-body">
              <h3 className="card-title">v{diff.version} 与当前内容的差异</h3>
              {diff.rows.length === 0 ? (
                <p className="text-sm text-gray-500">没有差异 —— 该版本与当前内容一致。</p>
              ) : (
                <div className="space-y-3">
                  {diff.rows.map((d: any, i: number) => (
                    <div key={i}>
                      <div className="text-xs font-medium text-gray-500 mb-1">{d.field}</div>
                      <div className="text-sm bg-[var(--bg-c)] p-2 rounded border border-[var(--border-c)] mb-1">
                        <span className="text-xs text-gray-400 mr-2">v{diff.version}</span>
                        <span className="whitespace-pre-wrap text-gray-700">{Array.isArray(d.from) ? d.from.join(', ') : String(d.from ?? '(空)')}</span>
                      </div>
                      <div className="text-sm bg-[var(--bg-c)] p-2 rounded border border-[var(--border-c)]">
                        <span className="text-xs text-gray-400 mr-2">当前</span>
                        <span className="whitespace-pre-wrap text-gray-900">{Array.isArray(d.to) ? d.to.join(', ') : String(d.to ?? '(空)')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <button onClick={() => setDiff(null)} className="btn btn-secondary">关闭</button>
                <button onClick={() => rollback(diff.version)} className="btn btn-primary">回滚到 v{diff.version}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 版本快照全文 */}
      {snapshot && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSnapshot(null)}>
          <div className="card" style={{ width: 640, maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="card-body">
              <h3 className="card-title">v{snapshot.version_no} 快照</h3>
              <p className="text-xs text-gray-400 mb-3">
                {snapshot.change_summary} · {snapshot.changed_by_name || '—'} · {snapshot.changed_at}
              </p>
              <div className="space-y-3 text-sm">
                <div><div className="text-xs text-gray-500 mb-1">标题</div><div className="text-gray-900 font-medium">{snapshot.title}</div></div>
                <div><div className="text-xs text-gray-500 mb-1">问题</div><div className="text-gray-800 whitespace-pre-wrap">{snapshot.question}</div></div>
                <div><div className="text-xs text-gray-500 mb-1">解答</div><div className="text-gray-800 whitespace-pre-wrap">{snapshot.answer}</div></div>
                <div className="flex gap-4">
                  <div><div className="text-xs text-gray-500 mb-1">分类</div><div className="text-gray-700">{snapshot.category || '—'}</div></div>
                  <div><div className="text-xs text-gray-500 mb-1">状态</div><div className="text-gray-700">{snapshot.status}</div></div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">标签</div>
                  <div className="flex flex-wrap gap-1">
                    {(snapshot.tags || []).length === 0
                      ? <span className="text-gray-400">—</span>
                      : snapshot.tags.map((t: string, i: number) => <span key={i} className="badge badge-gray">{t}</span>)}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                <button onClick={() => setSnapshot(null)} className="btn btn-secondary">关闭</button>
                <button onClick={() => rollback(snapshot.version_no)} className="btn btn-primary">回滚到此版本</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
