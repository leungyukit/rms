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

  useEffect(() => {
    fetch(`/api/knowledge/${id}`).then(r => r.json()).then(data => {
      setEntry(data);
      setEditForm({ title: data.title, question: data.question, answer: data.answer, category: data.category, type: data.type, tags: (data.tags || []).join(', ') });
      setLoading(false);
    });
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
    </div>
  );
}
