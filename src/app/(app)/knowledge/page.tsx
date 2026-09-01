'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const TYPE_LABELS: Record<string, string> = { faq: 'FAQ', solution: '解决方案', lesson: '经验教训', pattern: '可复用模式' };
const STATUS_LABELS: Record<string, string> = { draft: '草稿', published: '已发布', archived: '已归档' };

export default function KnowledgePage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [categories, setCategories] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', question: '', answer: '', category: '', category_id: '', type: 'faq', tags: '' });

  // 分类树只需拉一次（P3）。受限分类后端已过滤，这里拿到的就是可见集。
  useEffect(() => {
    fetch('/api/knowledge/categories')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => setCategories(d.items || []))
      .catch(() => setCategories([]));
  }, []);

  const fetchItems = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (filterType) params.set('type', filterType);
    if (filterStatus) params.set('status', filterStatus);
    // 分类按子树过滤，标签走归一化键（P3）
    if (filterCategoryId) params.set('category_id', filterCategoryId);
    if (filterTag.trim()) params.set('tag', filterTag.trim());
    const res = await fetch(`/api/knowledge?${params}`);
    const data = await res.json();
    setItems(data.items || []);
    setTotal(data.total || 0);
    setLoading(false);
  };

  useEffect(() => { fetchItems(); }, [keyword, filterType, filterStatus, filterCategoryId, filterTag]);

  const handleCreate = async () => {
    if (!createForm.title || !createForm.question || !createForm.answer) return alert('请填写标题、问题和解答');
    const res = await fetch('/api/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...createForm,
        category_id: createForm.category_id === '' ? null : Number(createForm.category_id),
        tags: createForm.tags.split(/[,，]/).map(t => t.trim()).filter(Boolean),
      }),
    });
    const data = await res.json();
    if (data.success) {
      setShowCreate(false);
      setCreateForm({ title: '', question: '', answer: '', category: '', category_id: '', type: 'faq', tags: '' });
      fetchItems();
    } else {
      alert(data.error || '创建失败');
    }
  };

  // path 物料路径 /1/4/9/ → 层级，用于下拉框缩进
  const depthOf = (path: string) => (!path ? 0 : Math.max(0, path.split('/').filter(Boolean).length - 1));

  const typeBadge = (t: string) => {
    const m: Record<string, string> = { faq: 'badge-info', solution: 'badge-success', lesson: 'badge-warning', pattern: 'badge-primary' };
    return m[t] || 'badge-gray';
  };
  const statusBadge = (s: string) => {
    const m: Record<string, string> = { published: 'badge-success', draft: 'badge-gray', archived: 'badge-danger' };
    return m[s] || 'badge-gray';
  };

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>📚 知识中心</h1>
        <p>基于已完成需求沉淀 FAQ 和解决方案，共 {total} 条知识</p>
      </div>

      <div className="flex gap-2 mb-4">
        <Link href="/knowledge/graph" className="btn btn-primary">🕸️ 知识图谱</Link>
        <Link href="/knowledge/insights" className="btn btn-secondary">💡 知识洞察</Link>
        <Link href="/knowledge/categories" className="btn btn-secondary">🗂️ 分类管理</Link>
        <Link href="/knowledge/capture-tasks" className="btn btn-secondary">📥 沉淀待办</Link>
        <div className="flex-1" />
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">➕ 新建知识</button>
      </div>

      {/* Filters */}
      <div className="card mb-4"><div className="card-body">
        <div className="flex flex-wrap gap-3 items-center">
          <input type="text" placeholder="🔍 搜索知识标题、问题、解答..." value={keyword} onChange={e => setKeyword(e.target.value)} className="form-input flex-1 min-w-[200px]" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-input">
            <option value="">全部类型</option>
            <option value="faq">FAQ</option><option value="solution">解决方案</option>
            <option value="lesson">经验教训</option><option value="pattern">可复用模式</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-input">
            <option value="">全部状态</option>
            <option value="published">已发布</option><option value="draft">草稿</option>
            <option value="archived">已归档</option>
          </select>
          {categories.length > 0 && (
            <select value={filterCategoryId} onChange={e => setFilterCategoryId(e.target.value)} className="form-input" title="按分类筛选（含子分类）">
              <option value="">全部分类</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{'　'.repeat(depthOf(c.path))}{c.name}</option>
              ))}
            </select>
          )}
          <input
            type="text"
            placeholder="🏷️ 按标签筛选"
            value={filterTag}
            onChange={e => setFilterTag(e.target.value)}
            className="form-input w-40"
          />
          {(filterCategoryId || filterTag || filterType || filterStatus || keyword) && (
            <button
              onClick={() => { setKeyword(''); setFilterType(''); setFilterStatus(''); setFilterCategoryId(''); setFilterTag(''); }}
              className="btn btn-sm btn-secondary"
            >清空筛选</button>
          )}
        </div>
      </div></div>

      {/* List */}
      {loading ? (
        <div className="text-center py-20 text-gray-400">加载中...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <div className="empty-state-text">暂无知识条目</div>
          <p className="text-sm text-gray-400 mt-2">点击"新建知识"手动创建，或到对话工作台让 AI 从已完成需求生成</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <Link key={item.id} href={`/knowledge/${item.id}`}>
              <div className="card hover:border-gray-400 transition">
                <div className="card-body">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`badge ${typeBadge(item.type)}`}>{TYPE_LABELS[item.type] || item.type}</span>
                        <span className={`badge ${statusBadge(item.status)}`}>{STATUS_LABELS[item.status] || item.status}</span>
                        {item.category && <span className="text-xs text-gray-400">{item.category}</span>}
                      </div>
                      <h3 className="font-semibold text-gray-900 truncate">{item.title}</h3>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.question}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        {item.source_title && <span>📋 来源: {item.source_title}</span>}
                        <span>👁 {item.view_count}</span>
                        <span>👍 {item.useful_count}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(item.tags || []).slice(0, 3).map((tag: string, i: number) => (
                        <span key={i} className="badge badge-gray">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="card" style={{ width: 480, maxWidth: '90vw' }}><div className="card-body">
            <h3 className="card-title">➕ 新建知识条目</h3>
            <div className="space-y-3">
              <div>
                <label className="form-label">类型</label>
                <select value={createForm.type} onChange={e => setCreateForm({ ...createForm, type: e.target.value })} className="form-input">
                  <option value="faq">FAQ</option><option value="solution">解决方案</option>
                  <option value="lesson">经验教训</option><option value="pattern">可复用模式</option>
                </select>
              </div>
              <div>
                <label className="form-label">标题 *</label>
                <input value={createForm.title} onChange={e => setCreateForm({ ...createForm, title: e.target.value })} className="form-input" placeholder="简短描述" />
              </div>
              <div>
                <label className="form-label">问题 *</label>
                <textarea value={createForm.question} onChange={e => setCreateForm({ ...createForm, question: e.target.value })} className="form-input" rows={2} placeholder="用户可能会问的问题" />
              </div>
              <div>
                <label className="form-label">解答 *</label>
                <textarea value={createForm.answer} onChange={e => setCreateForm({ ...createForm, answer: e.target.value })} className="form-input" rows={4} placeholder="完整的解决方案" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">分类</label>
                  {categories.length > 0 ? (
                    <select value={createForm.category_id} onChange={e => setCreateForm({ ...createForm, category_id: e.target.value })} className="form-input">
                      <option value="">（不归类）</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{'　'.repeat(depthOf(c.path))}{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={createForm.category} onChange={e => setCreateForm({ ...createForm, category: e.target.value })} className="form-input" placeholder="如：技术问题" />
                  )}
                </div>
                <div>
                  <label className="form-label">标签</label>
                  <input value={createForm.tags} onChange={e => setCreateForm({ ...createForm, tags: e.target.value })} className="form-input" placeholder="逗号分隔" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
              <button onClick={() => setShowCreate(false)} className="btn btn-secondary">取消</button>
              <button onClick={handleCreate} className="btn btn-primary">创建</button>
            </div>
          </div></div>
        </div>
      )}
    </div>
  );
}
