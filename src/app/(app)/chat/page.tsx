'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  conversation_id?: number;
  knowledge_refs?: Array<{ id: number; title: string; type: string }>;
  showRaw?: boolean;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

/** 如果整段内容被单个代码块包裹（AI 常见行为）， stripping 外层 fence */
function unwrapSingleCodeBlock(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

type ChatMode = 'basic' | 'ai' | 'agent';
const CHAT_MODE_KEY = 'rms.chat.mode';

/**
 * 读取上次使用的对话模式。
 * 之前 chatMode 是纯内存 state，刷新/重进页面就弹回 basic，
 * 用户以为自己在 Agent 模式，实际收到的是基础模式的关键词兜底文案。
 */
function loadChatMode(): ChatMode {
  if (typeof window === 'undefined') return 'basic';
  try {
    const v = window.localStorage.getItem(CHAT_MODE_KEY);
    if (v === 'basic' || v === 'ai' || v === 'agent') return v;
  } catch { /* localStorage 被禁用时静默降级 */ }
  return 'basic';
}

export default function ChatPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // SSR 与首帧保持 'basic'，挂载后再从 localStorage 恢复，避免 hydration 不一致
  const [chatMode, setChatMode] = useState<ChatMode>('basic');
  const [openclawReady, setOpenclawReady] = useState(false);
  const [openclawEnabling, setOpenclawEnabling] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  const loadConversations = async () => {
    const res = await fetch('/api/chat/conversations', { credentials: 'include' }).catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setConversations(data.conversations || []);
    }
  };

  const loadMessages = async (convId: string) => {
    setLoading(true);
    const res = await fetch(`/api/chat/conversations/${convId}/messages`, { credentials: 'include' }).catch(() => null);
    if (res?.ok) {
      const raw = await res.text().catch(() => '');
      const data = raw ? JSON.parse(raw) : {};
      setMessages((data.messages || []).map((m: any, i: number) => ({
        ...m,
        id: m.id ?? `msg-${i}-${m.timestamp}`,
        content: m.text || m.content || '',
        timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
      })));
    } else {
      setMessages([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadConversations(); }, []);

  // 挂载后恢复上次的对话模式（避免刷新后静默弹回 basic）
  useEffect(() => {
    const saved = loadChatMode();
    if (saved !== 'basic') setChatMode(saved);
  }, []);

  useEffect(() => {
    if (activeId) loadMessages(activeId);
  }, [activeId]);

  useEffect(() => {
    messagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const newConversation = async () => {
    const res = await fetch('/api/chat/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: '新对话' }) });
    if (res.ok) {
      const data = await res.json();
      setActiveId(data.id);
      setMessages([]);
      loadConversations();
    }
  };

  const send = async () => {
    if (!input.trim()) return;
    const userMsg: Message = { id: Date.now(), role: 'user', content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      let assistantContent = '';
      let knowledgeRefs: any[] = [];
      let convId: string | null = activeId;

      // 所有模式共用：没有活跃会话时先创建
      if (!convId) {
        const r = await fetch('/api/chat/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input.slice(0, 30) || '新对话' }) });
        if (r.ok) {
          const d = await r.json();
          convId = d.id;
          setActiveId(d.id);
          loadConversations();
        }
      }

      if (chatMode === 'agent') {
        if (!openclawReady) {
          const enabled = await ensureOpenClaw();
          if (!enabled) {
            assistantContent = '⚠️ 无法启用 OpenClaw，请检查高级配置中的 Gateway 地址和 Token 是否正确，以及 OpenClaw Gateway 是否已启动。';
            // 不 return，走到底部统一持久化
          }
        }
        if (openclawReady || assistantContent === '') {
          // Agent mode: call OpenClaw API
          const res = await fetch('/api/openclaw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'chat', message: input }),
          });
          const raw = await res.text().catch(() => '');
          const data = raw ? JSON.parse(raw) : {};
          assistantContent = res.ok ? (data.text || data.reply || '(Agent 未返回内容)') : (data.error || 'OpenClaw 调用失败');
        }
      } else if (chatMode === 'ai') {
        // AI mode: call LLM with knowledge base
        const res = await fetch('/api/chat/llm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: input, history: messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })).filter(m => m.content) }),
        });
        const raw = await res.text().catch(() => '');
        const data = raw ? JSON.parse(raw) : {};
        assistantContent = res.ok ? (data.reply || data.text || '无响应') : (data.error || 'LLM 调用失败');
        knowledgeRefs = data.knowledge_refs || [];
      } else {
        // Basic mode: original knowledge base Q&A
        if (!convId) {
          assistantContent = '发送失败，无法创建对话';
        } else {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: input, conversation_id: convId }),
          });
          const raw = await res.text().catch(() => '');
          const data = raw ? JSON.parse(raw) : {};
          // Handle navigation type
          if (res.ok && data.type === 'navigate' && data.url) {
            window.location.href = data.url;
            assistantContent = data.text || '';
          } else if (res.ok && data.type === 'text') {
            assistantContent = data.text || '';
          } else if (res.ok) {
            assistantContent = data.text || data.reply || data.response || data.error || '（无响应）';
          } else {
            assistantContent = data.error || '发送失败，请重试';
          }
          knowledgeRefs = data.knowledge_refs || [];
        }
      }

      const assistantMsg: Message = { id: Date.now() + 1, role: 'assistant', content: assistantContent, timestamp: new Date().toISOString(), knowledge_refs: knowledgeRefs };
      setMessages(prev => [...prev, assistantMsg]);

      // 持久化消息到会话（所有模式统一）
      if (convId) {
        try {
          await Promise.all([
            fetch(`/api/chat/conversations/${convId}/messages`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'user', text: input }),
              credentials: 'include',
            }),
            ...(assistantContent ? [
              fetch(`/api/chat/conversations/${convId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'assistant', text: assistantContent }),
                credentials: 'include',
              }),
            ] : []),
          ]);
          loadConversations(); // 刷新侧边栏
        } catch { /* ignore */ }
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: '❌ 发送失败，请重试', timestamp: new Date().toISOString() }]);
    }
    setLoading(false);
  };


  const ensureOpenClaw = async (): Promise<boolean> => {
    if (openclawReady) return true;
    if (openclawEnabling) return false;
    setOpenclawEnabling(true);
    try {
      const res = await fetch('/api/openclaw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enable' }), credentials: 'include' });
      const raw = await res.text().catch(() => '');
      const data = raw ? JSON.parse(raw) : {};
      if (res.ok && data.success) {
        setOpenclawReady(true);
        return true;
      }
      return false;
    } catch { return false; } finally { setOpenclawEnabling(false); }
  };

  const switchMode = (mode: ChatMode) => {
    setChatMode(mode);
    try {
      window.localStorage.setItem(CHAT_MODE_KEY, mode);
    } catch { /* ignore */ }
    // 不清空当前对话和消息，切换模式后仍保留上下文
    if (mode === 'agent') {
      setOpenclawReady(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 overflow-hidden bg-gray-50/50 flex-shrink-0`}>
        <div className="p-4 flex items-center justify-between border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-gray-800">💬 对话</span>
          </div>
          <button onClick={newConversation} className="btn btn-sm btn-primary">+ 新建</button>
        </div>
        <div className="overflow-y-auto p-2" style={{ height: 'calc(100% - 60px)' }}>
          {conversations.map(c => (
            <div key={c.id} onClick={() => setActiveId(c.id)}
              className={`group relative px-3 py-3 cursor-pointer rounded-xl transition-all duration-200 mb-1 ${
                activeId === c.id
                  ? 'bg-white shadow-sm border border-gray-200'
                  : 'hover:bg-white/80 border border-transparent'
              }`}>
              <div className="flex items-start gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0 ${
                  activeId === c.id ? 'bg-gray-100 text-gray-900' : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                }`}>
                  💭
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${activeId === c.id ? 'font-medium text-gray-900' : 'text-gray-700'}`}>{c.title || '未命名对话'}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{new Date(c.updated_at).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!confirm('确定删除该对话吗？此操作不可恢复。')) return;
                    const res = await fetch(`/api/chat/conversations/${c.id}`, { method: 'DELETE', credentials: 'include' });
                    if (res.ok) {
                      if (activeId === c.id) { setActiveId(null); setMessages([]); }
                      loadConversations();
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1"
                  title="删除对话">
                  🗑️
                </button>
              </div>
            </div>
          ))}
          {conversations.length === 0 && (
            <div className="text-center py-12 px-4">
              <div className="text-4xl mb-3 opacity-30">💬</div>
              <div className="text-xs text-gray-400">暂无对话记录</div>
              <div className="text-xs text-gray-300 mt-1">点击上方「新建」开始</div>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-white">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="btn btn-icon btn-secondary">
            {sidebarOpen ? '◀' : '▶'}
          </button>
          <div>
            <h2 className="text-sm font-medium text-gray-900">🤖 对话工作台</h2>
            <p className="text-xs text-gray-400">基于知识库的智能问答</p>
          </div>
          <Link href="/knowledge" className="btn btn-sm btn-secondary ml-auto">📚 知识库</Link>
        </div>

        {/* Mode tabs */}
        <div className="flex justify-end px-4 py-3 bg-white">
          <div className="relative flex bg-gray-100 rounded-xl p-1 w-full max-w-md">
            {/* Sliding indicator */}
            <div className="absolute top-1 bottom-1 rounded-lg bg-gradient-to-r from-gray-800 to-black shadow-md transition-all duration-300 ease-out"
              style={{
                width: 'calc(33.333% - 0.33rem)',
                left: chatMode === 'basic' ? '0.25rem' : chatMode === 'ai' ? 'calc(33.333% + 0.08rem)' : 'calc(66.666% + 0.17rem)',
              }}
            />
            {(["basic", "ai", "agent"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => switchMode(mode)}
                className={`relative z-10 flex-1 py-2 rounded-lg text-sm font-semibold transition-colors duration-200 ${
                  chatMode === mode ? 'text-white' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode === 'basic' ? '💬 基础' : mode === 'ai' ? '🤖 AI' : '⚡ Agent'}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div ref={messagesRef} className="flex-1 overflow-y-auto bg-gray-50">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="empty-state">
                <div className="empty-state-icon">💬</div>
                <div className="empty-state-text">开始新对话</div>
                <p className="text-sm text-gray-400 mt-2">输入问题，AI 将基于知识库为您解答</p>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] ${m.role === 'user' ? 'order-1' : ''}`}>
                    <div className={`flex items-center gap-2 mb-1 ${m.role === 'user' ? 'justify-end' : ''}`}>
                      <span className="text-xs text-gray-400">{m.role === 'user' ? '👤 您' : '🤖 AI 助手'}</span>
                      <span className="text-xs text-gray-400">{new Date(m.timestamp).toLocaleTimeString('zh-CN')}</span>
                    </div>
                    <div className={`rounded-2xl px-4 py-3 ${
                      m.role === 'user'
                        ? 'bg-black text-white rounded-br-sm'
                        : 'bg-gray-100 rounded-bl-sm'
                    }`}>
                      {m.role === 'assistant' && (
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-400">🤖 AI 助手</span>
                          <button
                            onClick={() => {
                              const idx = messages.findIndex(x => x.id === m.id);
                              if (idx !== -1) {
                                const updated = [...messages];
                                updated[idx] = { ...updated[idx], showRaw: !updated[idx].showRaw };
                                setMessages(updated);
                              }
                            }}
                            className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-0.5 rounded transition-colors"
                            title={m.showRaw ? '渲染视图' : '查看源码'}
                          >
                            {m.showRaw ? '📝 渲染' : '💻 源码'}
                          </button>
                        </div>
                      )}
                      {m.showRaw ? (
                        <pre className="text-sm whitespace-pre-wrap break-words font-mono bg-white/60 rounded-lg p-3 max-h-[50vh] overflow-y-auto">{unwrapSingleCodeBlock(m.content)}</pre>
                      ) : (
                        <div className="text-sm chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{unwrapSingleCodeBlock(m.content)}</ReactMarkdown></div>
                      )}
                      {m.knowledge_refs && m.knowledge_refs.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <div className="text-xs text-gray-500 mb-1">📚 参考知识：</div>
                          <div className="flex flex-wrap gap-1">
                            {m.knowledge_refs.map((ref, i) => (
                              <span key={i} className="badge badge-info text-xs">{ref.title?.slice(0, 20) || `#${ref.id}`}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="bg-white">
          <div className="max-w-5xl mx-auto p-4">
            <div className="flex gap-3">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder={chatMode === "basic" ? "输入您的问题，Shift+Enter 换行..." : chatMode === "ai" ? "向 AI 助手提问..." : "与 Agent 对话..."}
                className="flex-1 p-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-800 resize-none"
                style={{ minHeight: '160px', height: '160px' }}
                disabled={loading}
              />
              <button onClick={send} disabled={loading || !input.trim()} className="btn btn-primary self-end" style={{ padding: '0.6rem 2rem', fontSize: '1rem', height: '160px' }}>发送</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
