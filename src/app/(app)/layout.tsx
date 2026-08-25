'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { toggleTheme, applyAndStore, loadThemeFromServer, resolveEffective } from '@/lib/theme';
import { LogoutButton } from './logout-button';
import SearchModal from '@/components/search-modal';
import { I18nProvider, LocaleSwitcher, useT } from '@/i18n/config';

type SectionState = Record<string, { collapsed: boolean; label: string }>;

const SECTIONS: SectionState = {
  requirement: { collapsed: false, label: '需求' },
  project: { collapsed: false, label: '项目' },
  analysis: { collapsed: false, label: '分析' },
  knowledge: { collapsed: false, label: '知识' },
  admin: { collapsed: false, label: '系统管理' },
};

function loadSectionState(): SectionState {
  if (typeof window === 'undefined') return SECTIONS;
  try {
    const saved = localStorage.getItem('sidebar_sections');
    if (!saved) return SECTIONS;
    return { ...SECTIONS, ...JSON.parse(saved) };
  } catch {
    return SECTIONS;
  }
}

const CollapsibleSection: React.FC<{
  id: string;
  collapsed: boolean;
  sectionState: SectionState;
  toggleSection: (id: string) => void;
  children: React.ReactNode;
}> = ({ id, collapsed, sectionState, toggleSection, children }) => {
  if (collapsed) return <>{children}</>;
  const sec = sectionState[id];
  if (!sec) return <>{children}</>;
  return (
    <>
      <div className="sidebar-section" onClick={() => toggleSection(id)} style={{cursor:'pointer',userSelect:'none'}}>{sec.label} ▾</div>
      {!sec.collapsed && children}
    </>
  );
};

const MENU_ITEMS = [
  { href: '/chat', icon: '💬', label: 'nav.chat' },
  { href: '/requirements', icon: '📋', label: 'nav.requirements' },
  { href: '/requirements/new', icon: '➕', label: 'requirement.newRequirement' },
  { href: '/kanban', icon: '📊', label: 'nav.kanban' },
  { href: '/gantt', icon: '📅', label: 'nav.gantt' },
  { href: '/checklist/my', icon: '☑️', label: 'nav.myTasks' },
  { href: '/workflows', icon: '⚡', label: 'nav.workflows' },
  { href: '/workflows/monitor', icon: '🔍', label: 'nav.sla' },
];

const PROJECT_ITEMS = [
  { href: '/sprints', icon: '🏃', label: 'nav.sprint' },
  { href: '/timesheet', icon: '📅', label: 'nav.timesheet' },
  { href: '/projects', icon: '📁', label: 'nav.projects' },
];

const ANALYSIS_ITEMS = [
  { href: '/dashboard', icon: '📈', label: 'nav.dashboard' },
  { href: '/sla-dashboard', icon: '🚨', label: 'nav.sla' },
  { href: '/workload', icon: '👥', label: 'nav.workload' },
  { href: '/calendar', icon: '📆', label: 'nav.calendar' },
  { href: '/custom-reports', icon: '📊', label: 'nav.customReports' },
  { href: '/custom-dashboards', icon: '🎛️', label: 'nav.customDashboards' },
  { href: '/data-sources', icon: '📊', label: 'nav.dataSources' },
  { href: '/db-explorer', icon: '🗄️', label: 'nav.dbExplorer' },
];

const KNOWLEDGE_ITEMS = [
  { href: '/knowledge', icon: '📚', label: 'nav.knowledge' },
  { href: '/knowledge/graph', icon: '🕸️', label: 'knowledge.graph' },
  { href: '/knowledge/insights', icon: '💡', label: 'knowledge.insights' },
];

const ADMIN_ITEMS = [
  { href: '/profile/tokens', icon: '🔑', label: 'Token 管理' },
  { href: '/admin/users', icon: '👥', label: 'admin.users' },
  { href: '/admin/audit-logs', icon: '📋', label: 'admin.auditLog' },
  { href: '/admin/dedup', icon: '🔍', label: 'nav.deduplication' },
  { href: '/admin/integrations', icon: '🔌', label: 'nav.integrations' },
  { href: '/admin/field-policies', icon: '📋', label: 'nav.fieldPolicy' },
  { href: '/admin/config', icon: '⚙️', label: 'nav.settings' },
  { href: '/admin/menu-permissions', icon: '🔒', label: '菜单权限' },
  { href: '/openapi', icon: '📡', label: 'nav.openapi' },
];

// 完整的导航目标列表，供 LLM 理解用户意图
const NAVIGATION_TARGETS = [
  // 需求相关
  { path: '/requirements/new', keywords: ['新建需求', '创建需求', '添加需求', '新需求'], desc: '创建新的需求单' },
  { path: '/requirements', keywords: ['需求池', '需求列表', '查看需求', '需求管理'], desc: '查看和管理所有需求' },
  { path: '/kanban', keywords: ['看板', '看板视图', '看板管理'], desc: '看板视图展示需求' },
  { path: '/gantt', keywords: ['甘特图', '项目进度', '时间视图'], desc: '甘特图查看项目进度' },

  // 工作流
  { path: '/workflows', keywords: ['工作流', '流程', '流程管理'], desc: '管理工作流配置' },
  { path: '/workflows/monitor', keywords: ['流程监控', '监控', '流程监视'], desc: '监控流程运行状态' },

  // 项目
  { path: '/projects', keywords: ['项目管理', '项目', '项目列表'], desc: '管理项目信息' },

  // 分析
  { path: '/dashboard', keywords: ['仪表盘', '统计', '数据概览', '统计仪表盘'], desc: '查看数据统计仪表盘' },
  { path: '/workload', keywords: ['工作量', '工作负载', '人员工作量'], desc: '分析人员工作量' },
  { path: '/sla-dashboard', keywords: ['SLA', '预警', '超时', '看板', 'SLA看板', '预警看板'], desc: '需求超时预警看板' },
  { path: '/calendar', keywords: ['日历', '工作日历', '日程'], desc: '查看工作日历' },

  // 系统管理
  { path: '/admin/users', keywords: ['用户管理', '用户列表', '账户管理', '添加用户'], desc: '管理系统用户' },
  { path: '/admin/audit-logs', keywords: ['操作日志', '审计日志', '审计', '日志'], desc: '查看操作日志' },
  { path: '/admin/integrations', keywords: ['集成', 'MCP', 'Skill', '安装', '配置'], desc: '查看集成安装指南' },
  { path: '/profile/tokens', keywords: ['Token', 'token', 'Access Token', 'MCP'], desc: '管理 Access Token' },
  { path: '/admin/config', keywords: ['系统配置', '系统设置', '基础配置', '配置', '高级配置', '高级设置'], desc: '配置系统参数和高级功能' },

  // 高级配置子项（统一跳转到系统配置页面并选中对应 tab）
  { path: '/admin/config?tab=openclaw', keywords: ['OpenClaw', 'openclaw', 'AI配置', 'Agent配置'], desc: '配置 OpenClaw AI Agent' },
  { path: '/admin/config?tab=llm', keywords: ['LLM', '大模型', '语言模型', 'LLM配置', '模型配置'], desc: '配置 LLM 大模型' },
  { path: '/admin/config?tab=asr_tts', keywords: ['语音配置', 'ASR', 'TTS', '语音识别', '语音合成'], desc: '配置语音识别和合成' },
  { path: '/admin/config?tab=wecom', keywords: ['企业微信', '微信配置', 'wecom'], desc: '配置企业微信登录' },
  { path: '/admin/config?tab=feishu', keywords: ['飞书', '飞书配置', 'feishu'], desc: '配置飞书登录' },
  { path: '/admin/config?tab=dingtalk', keywords: ['钉钉', '钉钉配置', 'dingtalk'], desc: '配置钉钉登录' },

  // 其他
  { path: '/chat', keywords: ['对话工作台', '聊天', 'AI对话', '对话'], desc: '打开对话工作台' },
];

// 生成 LLM 导航提示词
const NAVIGATION_PROMPT = `你是 RMS 需求管理系统的智能助手。

只有当用户明确要求导航时才返回 JSON：{"intent":"navigation","target":"/路径","message":"你想说的话"}
导航目标：${NAVIGATION_TARGETS.map(t => `${t.path}(${t.desc})`).join('、')}

重要规则：
- 疑问句（含"多少""怎么""如何""为什么""是否""有没有"等）一律不触发导航，用纯文本回答
- 数据查询类问题（如"有多少超时需求""状态统计"）用纯文本回答
- 只有用户明确说"打开""跳转""前往""进入"等才返回 navigate JSON`;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sectionState, setSectionState] = useState<SectionState>(SECTIONS);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMode, setChatMode] = useState<'basic' | 'ai' | 'agent'>('basic');
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [allowedHrefs, setAllowedHrefs] = useState<Set<string> | null>(null);

  // 菜单权限过滤：null 表示功能未启用，显示全部；空 Set 表示显式无权限，全部隐藏
  const filterMenu = <T extends { href: string }>(items: T[]): T[] => {
    if (allowedHrefs === null) return items;
    return items.filter(item => allowedHrefs.has(item.href));
  };

  useEffect(() => {
    loadThemeFromServer().then(pref => {
      const effective = resolveEffective(pref);
      applyAndStore(effective);
      setTheme(effective);
    });
  }, []);

  const SIDEBAR_WIDTH = sidebarCollapsed ? 80 : 220;

  // 同步 sidebar 宽度到 CSS 变量
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', sidebarCollapsed ? '64px' : '220px');
  }, [sidebarCollapsed]);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' }).then(r => {
      if (r.status === 401) return null;
      return r.json();
    }).then(d => setUser(d?.user || d || null));
  }, []);

  useEffect(() => {
    setSectionState(loadSectionState());
  }, []);

  const toggleSection = (id: string) => {
    setSectionState(prev => {
      const next = { ...prev, [id]: { ...prev[id], collapsed: !prev[id]?.collapsed } };
      try { localStorage.setItem('sidebar_sections', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Fetch notifications
  useEffect(() => {
    if (!user) return;
    fetch('/api/notifications', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      })
      .catch(() => {});
  }, [user]);

  // Fetch menu permissions
  useEffect(() => {
    if (!user) return;
    fetch('/api/user/menu-permissions', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        // null 表示菜单权限功能未启用，按未配置处理（显示全部）
        setAllowedHrefs(data.allowedHrefs === null ? null : new Set(data.allowedHrefs || []));
      })
      .catch(() => {
        // On error, allow all (backward compatible)
        setAllowedHrefs(null);
      });
  }, [user]);

  // Global search
  useEffect(() => {
    if (!searchKeyword.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/search?keyword=${encodeURIComponent(searchKeyword)}`)
        .then(r => r.json())
        .then(data => {
          setSearchResults(data);
          setSearching(false);
        })
        .catch(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  const isChatPage = pathname === '/chat';
  const showChatFab = !isChatPage && !!user;

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // 先检查是否是直接导航命令
    const cmd = handleCommand(userMsg.content);
    if (cmd.matched) {
      setMessages(prev => [...prev, { role: 'assistant', content: cmd.response }]);
      setLoading(false);
      return;
    }

    try {
      // 在 AI 模式下，发送带导航提示的消息给 LLM
      const isAIMode = chatMode === 'ai';
      let messagesToSend = [...messages, userMsg];

      if (isAIMode) {
        // 构建带导航意图提示的系统消息
        const navPrompt = { role: 'system', content: NAVIGATION_PROMPT };
        messagesToSend = [navPrompt, ...messages, userMsg];
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messagesToSend, mode: chatMode }),
      });
      const data = await res.json();

      // 检查 API 返回是否包含导航意图（所有模式都支持）
      // 优先检查 data.url（API 直接返回的导航路径）
      if (data.type === 'navigate' && data.url) {
        // 如果导航目标是当前聊天页面本身，不跳转，直接把回复当普通消息显示
        if (data.url === '/chat') {
          setMessages(prev => [...prev, { role: 'assistant', content: data.text || '无响应' }]);
          setLoading(false);
          return;
        }
        // 显示消息
        setMessages(prev => [...prev, { role: 'assistant', content: data.text || '正在跳转...' }]);
        // 执行导航
        setChatOpen(false);
        setTimeout(() => router.push(data.url), 300);
        setLoading(false);
        return;
      }

      // 如果没有导航意图，显示普通回复
      setMessages(prev => [...prev, { role: 'assistant', content: data.text || data.reply || data.error || '无响应' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '请求失败' }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const switchMode = (mode: 'basic' | 'ai' | 'agent') => {
    setChatMode(mode);
    setMessages([]);
  };

  // LLM 导航意图解析
  const parseLLMNavigation = (content: string): { matched: boolean; target?: string; message?: string } => {
    try {
      // 1. 先尝试直接解析整个内容（去掉 markdown 代码块包装）
      let jsonStr = content.trim();
      // 去掉 ```json ... ``` 或 ``` ... ``` 包装
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      // 去掉前后可能的文字，只保留最后一个 { 到最后一个 } 之间的内容
      const lastBrace = jsonStr.lastIndexOf('}');
      const firstBrace = jsonStr.indexOf('{');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }

      try {
        const parsed = JSON.parse(jsonStr);
        // 格式1: { intent: "navigation", target: "...", message: "..." }
        if (parsed.intent === 'navigation' && parsed.target) {
          return { matched: true, target: parsed.target, message: parsed.message || '正在跳转...' };
        }
        // 格式2: { type: "navigate", url: "...", text: "..." } - 这是 chat API 的返回格式
        if (parsed.type === 'navigate' && parsed.url) {
          return { matched: true, target: parsed.url, message: parsed.text || '正在跳转...' };
        }
      } catch {
        // 如果解析失败，尝试用正则提取
      }

      // 2. 尝试正则匹配 JSON 对象
      const jsonMatch = content.match(/\{[\s\S]*?"intent"\s*:\s*"navigation"[\s\S]*?\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.intent === 'navigation' && parsed.target) {
            return { matched: true, target: parsed.target, message: parsed.message || '正在跳转...' };
          }
        } catch {}
      }

      // 3. 尝试匹配 type: "navigate" 格式
      const navMatch = content.match(/\{[\s\S]*?"type"\s*:\s*"navigate"[\s\S]*?\}/);
      if (navMatch) {
        try {
          const parsed = JSON.parse(navMatch[0]);
          if (parsed.type === 'navigate' && parsed.url) {
            return { matched: true, target: parsed.url, message: parsed.text || '正在跳转...' };
          }
        } catch {}
      }

      // 4. 尝试解析命令格式: [NAV:path]
      const navCmdMatch = content.match(/\[NAV:([^\]]+)\]/);
      if (navCmdMatch) {
        return { matched: true, target: navCmdMatch[1], message: '正在跳转...' };
      }
    } catch {}
    return { matched: false };
  };

  // 命令映射表
  const COMMAND_PATTERNS: { pattern: RegExp; action: () => string }[] = [
    { pattern: /^新建需求$/, action: () => { router.push('/requirements/new'); return '正在跳转到新建需求页面...'; } },
    { pattern: /^需求池$/, action: () => { router.push('/requirements'); return '正在跳转到需求池...'; } },
    { pattern: /^看板$/, action: () => { router.push('/kanban'); return '正在跳转到看板视图...'; } },
    { pattern: /^甘特图$/, action: () => { router.push('/gantt'); return '正在跳转到甘特图...'; } },
    { pattern: /^工作流$/, action: () => { router.push('/workflows'); return '正在跳转到工作流...'; } },
    { pattern: /^项目管理$/, action: () => { router.push('/projects'); return '正在跳转到项目管理...'; } },
    { pattern: /^仪表盘$/, action: () => { router.push('/dashboard'); return '正在跳转到统计仪表盘...'; } },
    { pattern: /^工作量$/, action: () => { router.push('/workload'); return '正在跳转到工作量分析...'; } },
    { pattern: /^日历$/, action: () => { router.push('/calendar'); return '正在跳转到工作日历...'; } },
    { pattern: /^用户管理$/, action: () => { router.push('/admin/users'); return '正在跳转到用户管理...'; } },
    { pattern: /^操作日志$/, action: () => { router.push('/admin/audit-logs'); return '正在跳转到操作日志...'; } },
    { pattern: /^集成安装$/, action: () => { router.push('/admin/integrations'); return '正在跳转到集成安装指南...'; } },
    { pattern: /^Token管理$/, action: () => { router.push('/profile/tokens'); return '正在跳转到 Token 管理...'; } },
    { pattern: /^系统配置$/, action: () => { router.push('/admin/config'); return '正在跳转到系统配置...'; } },
    { pattern: /^高级配置$/, action: () => { router.push('/admin/config'); return '正在跳转到系统配置...'; } },
    { pattern: /^OpenClaw$/, action: () => { router.push('/admin/config?tab=openclaw'); return '正在跳转到 OpenClaw 配置...'; } },
    { pattern: /^LLM配置$/, action: () => { router.push('/admin/config?tab=llm'); return '正在跳转到 LLM 大模型配置...'; } },
    { pattern: /^语音配置$/, action: () => { router.push('/admin/config?tab=asr_tts'); return '正在跳转到语音配置...'; } },
    { pattern: /^企业微信配置$/, action: () => { router.push('/admin/config?tab=wecom'); return '正在跳转到企业微信配置...'; } },
    { pattern: /^飞书配置$/, action: () => { router.push('/admin/config?tab=feishu'); return '正在跳转到飞书配置...'; } },
    { pattern: /^钉钉配置$/, action: () => { router.push('/admin/config?tab=dingtalk'); return '正在跳转到钉钉配置...'; } },
    { pattern: /^对话工作台$/, action: () => { router.push('/chat'); return '正在跳转到对话工作台...'; } },
  ];

  const handleCommand = (content: string): { matched: boolean; response: string } => {
    for (const { pattern, action } of COMMAND_PATTERNS) {
      if (pattern.test(content)) {
        const response = action();
        return { matched: true, response };
      }
    }
    return { matched: false, response: '' };
  };

  return (
    <I18nProvider>
    <div className="min-h-screen">
      {/* Top header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-[var(--card-bg)] border-b-[3px] border-[var(--border-c)] flex items-center px-5 z-50 transition-all duration-300" style={{ marginLeft: sidebarCollapsed ? 80 : 220 }}>
        <Link href="/chat" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="RMS Logo" className="w-8 h-8 object-cover border-2 border-[var(--border-c)]" />
          <span className="text-lg font-extrabold uppercase tracking-tight text-[var(--foreground)]">需求管理系统</span>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-8 h-8 border-2 border-transparent hover:border-[var(--border-c)] hover:bg-[var(--primary-c)] flex items-center justify-center text-[var(--foreground)] transition-colors"
            title={sidebarCollapsed ? '展开菜单' : '折叠菜单'}
          >
            {sidebarCollapsed ? '☰' : '◀'}
          </button>
          <button
            onClick={() => {
              const next = toggleTheme();
              setTheme(next);
            }}
            className="w-8 h-8 border-2 border-transparent hover:border-[var(--border-c)] hover:bg-[var(--primary-c)] flex items-center justify-center text-[var(--foreground)] transition-colors"
            title="切换深色/浅色主题"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="w-8 h-8 border-2 border-transparent hover:border-[var(--border-c)] hover:bg-[var(--primary-c)] flex items-center justify-center text-[var(--foreground)] transition-colors"
            title="全局搜索"
          >
            🔍
          </button>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="w-8 h-8 border-2 border-transparent hover:border-[var(--border-c)] hover:bg-[var(--primary-c)] flex items-center justify-center text-[var(--foreground)] transition-colors relative"
            title="通知"
          >
            🔔
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-0.5 bg-[#FF1744] text-white text-[10px] font-extrabold border-2 border-[var(--border-c)] flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <div className="w-[2px] h-5 bg-[var(--border-c)] mx-1.5" />
          <span className="text-sm font-bold text-[var(--foreground)]">{user?.display_name || '加载中...'}</span>
          <LocaleSwitcher />
          <LogoutButton />
        </div>
      </header>

      <SearchModal />
      {/* Sidebar */}
      <aside
        className="sidebar flex flex-col z-40 transition-all duration-300"
        style={{ width: sidebarCollapsed ? 80 : 220 }}
      >
        <div className="sidebar-brand" style={{ padding: sidebarCollapsed ? '0.5rem' : '1.25rem 1.25rem 1rem', gap: 0, justifyContent: 'center' }}>
          {!sidebarCollapsed && (
            <Link href="/chat" className="sidebar-brand-icon" title="对话工作台">
              <img src="/logo.png" alt="RMS Logo" className="w-8 h-8 object-cover border-2 border-[var(--border-c)]" />
            </Link>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="sidebar-link flex-shrink-0"
            title={sidebarCollapsed ? '展开菜单' : '折叠菜单'}
            style={{ justifyContent: 'center', padding: '0.5rem' }}
          >
            {sidebarCollapsed ? '☰' : '✕'}
          </button>
        </div>

        <nav className="sidebar-nav">
          <CollapsibleSection id="requirement" collapsed={sidebarCollapsed} sectionState={sectionState} toggleSection={toggleSection}>
            {filterMenu(MENU_ITEMS).map(item => (
              <NavItem key={item.href} {...item} active={pathname === item.href} collapsed={sidebarCollapsed} />
            ))}
          </CollapsibleSection>

          <CollapsibleSection id="project" collapsed={sidebarCollapsed} sectionState={sectionState} toggleSection={toggleSection}>
            {filterMenu(PROJECT_ITEMS).map(item => (
              <NavItem key={item.href} {...item} active={pathname === item.href} collapsed={sidebarCollapsed} />
            ))}
          </CollapsibleSection>

          <CollapsibleSection id="analysis" collapsed={sidebarCollapsed} sectionState={sectionState} toggleSection={toggleSection}>
            {filterMenu(ANALYSIS_ITEMS).map(item => (
              <NavItem key={item.href} {...item} active={pathname === item.href} collapsed={sidebarCollapsed} />
            ))}
          </CollapsibleSection>

          <CollapsibleSection id="knowledge" collapsed={sidebarCollapsed} sectionState={sectionState} toggleSection={toggleSection}>
            {filterMenu(KNOWLEDGE_ITEMS).map(item => (
              <NavItem key={item.href} {...item} active={item.href === '/knowledge' ? pathname === '/knowledge' : pathname.startsWith(item.href)} collapsed={sidebarCollapsed} />
            ))}
          </CollapsibleSection>

          <CollapsibleSection id="admin" collapsed={sidebarCollapsed} sectionState={sectionState} toggleSection={toggleSection}>
            {filterMenu(ADMIN_ITEMS.filter(item =>
              item.href !== '/admin/menu-permissions' || user?.roles?.includes('global_admin')
            )).map(item => (
              <NavItem key={item.href} {...item} active={pathname === item.href} collapsed={sidebarCollapsed} />
            ))}
          </CollapsibleSection>
        </nav>

        <div className="p-4 border-t border-white/5">
          {!sidebarCollapsed ? (
            <div className="text-xs font-bold uppercase text-[var(--muted-fg)] text-center">{user?.roleLabels?.join(' · ') || ''}</div>
          ) : (
            <div className="text-center">
              <div className="sidebar-link-badge">{user?.display_name?.[0] || '?'}</div>
            </div>
          )}
        </div>
      </aside>

      {/* Notification Dropdown */}
      {notifOpen && (
        <div className="card w-80 fixed z-50" style={{ boxShadow: 'var(--shadow-lg)', left: sidebarCollapsed ? 80 : 220, top: 64 }}>
          <div className="card-header">
            <span className="card-title">通知</span>
            <button onClick={() => setNotifOpen(false)} className="sidebar-link">×</button>
          </div>
          <div className="card-body" style={{ maxHeight: '24rem', overflowY: 'auto', padding: 0 }}>
            {notifications.length === 0 ? (
              <div className="py-8 text-center font-bold text-[var(--muted-fg)]">暂无通知</div>
            ) : (
              notifications.slice(0, 10).map(n => (
                <div key={n.id} className={`px-4 py-3 border-b-2 border-[var(--border-c)] cursor-pointer hover:bg-[var(--primary-c)] ${n.is_read ? '' : 'bg-[#FFF0E0]'}`} onClick={() => { if (n.link) router.push(n.link); }}>
                  <div className="text-sm font-bold text-[var(--foreground)]">{n.title}</div>
                  <div className="text-xs font-semibold text-[var(--muted-fg)] mt-1">{n.content}</div>
                  <div className="text-xs font-medium text-[var(--muted-fg)] opacity-70 mt-1">{n.created_at}</div>
                </div>
              ))
            )}
          </div>
          <div className="px-4 py-2 border-t text-center">
            <button onClick={() => { router.push('/notifications'); setNotifOpen(false); }} className="text-sm font-bold underline decoration-2 underline-offset-4 hover:bg-[#00E5FF] px-1">查看全部</button>
          </div>
        </div>
      )}

      {/* Global Search Popup */}
      {searchOpen && (
        <div className="card w-96 fixed z-50" style={{ boxShadow: 'var(--shadow-lg)', left: sidebarCollapsed ? 80 : 220, top: 64 }}>
          <div className="card-header">
            <span className="card-title">搜索</span>
            <button onClick={() => setSearchOpen(false)} className="sidebar-link">×</button>
          </div>
          <div className="px-4 py-3 border-b">
            <input
              autoFocus
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="搜索需求、项目、用户..."
              className="form-input"
            />
          </div>
          <div className="card-body" style={{ maxHeight: '24rem', overflowY: 'auto', padding: 0 }}>
            {searching && <div className="py-4 text-center font-bold text-[var(--muted-fg)]">搜索中...</div>}
            {!searching && searchResults && (
              <>
                {searchResults.requirements?.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-xs uppercase bg-[#FF6B6B] text-white font-extrabold tracking-wider border-b-2 border-black">需求</div>
                    {searchResults.requirements.slice(0, 5).map((r: any) => (
                      <div key={r.id} className="px-4 py-2 cursor-pointer border-b-2 border-[var(--border-c)] hover:bg-[var(--primary-c)]" onClick={() => { router.push(`/requirements/${r.id}`); setSearchOpen(false); }}>
                        <div className="text-sm font-bold text-[var(--foreground)]">{r.title}</div>
                        <div className="text-xs font-semibold text-[var(--muted-fg)]">{r.status_label} · {r.priority_label}</div>
                      </div>
                    ))}
                  </div>
                )}
                {searchResults.projects?.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-xs uppercase bg-[#FF6B6B] text-white font-extrabold tracking-wider border-b-2 border-black">项目</div>
                    {searchResults.projects.slice(0, 3).map((p: any) => (
                      <div key={p.id} className="px-4 py-2 cursor-pointer border-b-2 border-[var(--border-c)] hover:bg-[var(--primary-c)]" onClick={() => { router.push(`/projects/${p.id}`); setSearchOpen(false); }}>
                        <div className="text-sm font-bold text-[var(--foreground)]">{p.name}</div>
                        <div className="text-xs font-semibold text-[var(--muted-fg)]">{p.status}</div>
                      </div>
                    ))}
                  </div>
                )}
                {searchResults.users?.length > 0 && (
                  <div>
                    <div className="px-4 py-2 text-xs uppercase bg-[#FF6B6B] text-white font-extrabold tracking-wider border-b-2 border-black">用户</div>
                    {searchResults.users.slice(0, 3).map((u: any) => (
                      <div key={u.id} className="px-4 py-2 cursor-pointer border-b-2 border-[var(--border-c)] hover:bg-[var(--primary-c)]" onClick={() => { router.push(`/admin/users`); setSearchOpen(false); }}>
                        <div className="text-sm font-bold text-[var(--foreground)]">{u.display_name}</div>
                        <div className="text-xs font-semibold text-[var(--muted-fg)]">@{u.username}</div>
                      </div>
                    ))}
                  </div>
                )}
                {!searchResults.requirements?.length && !searchResults.projects?.length && !searchResults.users?.length && (
                  <div className="py-4 text-center font-bold text-[var(--muted-fg)]">未找到结果</div>
                )}
              </>
            )}
            {!searchResults && searchKeyword && !searching && (
              <div className="py-4 text-center font-bold text-[var(--muted-fg)]">输入关键词搜索</div>
            )}
            {!searchKeyword && <div className="py-4 text-center font-bold text-[var(--muted-fg)]">输入关键词搜索需求、项目、用户</div>}
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="main-content" style={{ marginLeft: sidebarCollapsed ? 80 : 220, transition: 'margin-left 0.25s ease' }}>
        {children}
      </div>

      {/* Floating chat FAB - right side */}
      {showChatFab && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed right-6 bottom-6 w-14 h-14 bg-[#FFD600] text-black border-[3px] border-black font-extrabold text-xl hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0 transition-transform flex items-center justify-center z-40"
          style={{ boxShadow: '6px 6px 0 #1A1A1A' }}
          title="对话工作台"
        >
          <span className="text-2xl">💬</span>
        </button>
      )}

      {/* Floating chat dialog - WeChat style, right side */}
      {chatOpen && (
        <div className="fixed right-0 top-0 bottom-0 z-50 flex" style={{ width: '420px' }}>
          <div className="flex-1 bg-[var(--card-bg)] flex flex-col overflow-hidden border-l-[3px] border-[var(--border-c)]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b-[3px] border-black bg-[#FFD600] text-black">
              <div className="flex items-center gap-3">
                <span className="text-xl">💬</span>
                <span className="font-semibold text-base">对话工作台</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={clearChat} className="text-xs font-bold text-black hover:bg-black hover:text-[#FFD600] border-2 border-black px-2 py-1">
                  清空
                </button>
                <button onClick={() => setChatOpen(false)} className="text-white/80 hover:text-white text-2xl leading-none px-2">
                  ×
                </button>
              </div>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 px-4 py-2 bg-[var(--muted)] border-b-[3px] border-[var(--border-c)]">
              {(['basic', 'ai', 'agent'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => switchMode(mode)}
                  className={`px-3 py-1.5 text-xs font-extrabold uppercase border-2 border-[var(--border-c)] transition-transform ${
                    chatMode === mode
                      ? 'bg-[#FFD600] text-black -translate-x-0.5 -translate-y-0.5 shadow-[3px_3px_0_var(--border-c)]'
                      : 'bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[#00E5FF] hover:text-black'
                  }`}
                >
                  {mode === 'basic' ? '基础' : mode === 'ai' ? 'AI 助手' : 'Agent'}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--background)]">
              {messages.length === 0 && (
                <div className="text-center font-bold text-[var(--muted-fg)] py-8">
                  <div className="text-3xl mb-2">💬</div>
                  <p className="text-sm mb-3">输入命令快速跳转，或开始对话</p>
                  <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                    <button onClick={() => setInput('新建需求')} className="px-2 py-1 bg-[var(--card-bg)] border-2 border-[var(--border-c)] text-xs font-bold hover:bg-[var(--primary-c)]">新建需求</button>
                    <button onClick={() => setInput('需求池')} className="px-2 py-1 bg-[var(--card-bg)] border-2 border-[var(--border-c)] text-xs font-bold hover:bg-[var(--primary-c)]">需求池</button>
                    <button onClick={() => setInput('看板')} className="px-2 py-1 bg-[var(--card-bg)] border-2 border-[var(--border-c)] text-xs font-bold hover:bg-[var(--primary-c)]">看板</button>
                    <button onClick={() => setInput('系统配置')} className="px-2 py-1 bg-[var(--card-bg)] border-2 border-[var(--border-c)] text-xs font-bold hover:bg-[var(--primary-c)]">系统配置</button>
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 border-2 border-[var(--border-c)] shadow-[4px_4px_0_var(--border-c)] ${
                    m.role === 'user'
                      ? 'bg-[#FFD600] text-black font-medium'
                      : 'bg-[var(--card-bg)] text-[var(--foreground)]'
                  }`}>
                    {m.role === 'assistant' ? (
                      <div className="text-sm md-content">{m.content}</div>
                    ) : (
                      <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-[var(--card-bg)] border-2 border-[var(--border-c)] px-4 py-2 shadow-[4px_4px_0_var(--border-c)]">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-[#FF1744] animate-bounce" />
                      <span className="w-2 h-2 bg-[#FFD600] animate-bounce delay-100" />
                      <span className="w-2 h-2 bg-[#00E5FF] animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t-[3px] border-[var(--border-c)] bg-[var(--card-bg)]">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="输入消息，Shift+Enter 换行..."
                className="w-full p-3 text-sm font-medium border-none focus:ring-0 resize-none bg-transparent text-[var(--foreground)]"
                style={{ minHeight: '100px' }}
              />
              <div className="px-3 pb-3 flex justify-end">
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="btn btn-primary"
                >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </I18nProvider>
  );
}

function NavItem({ href, icon, label, active, collapsed }: { href: string; icon: string; label: string; active?: boolean; collapsed?: boolean }) {
  const { t } = useT();
  const displayLabel = t(label);
  if (collapsed) {
    return (
      <Link
        href={href}
        className={`sidebar-link justify-center p-2 ${active ? 'active' : ''}`}
        title={displayLabel}
      >
        <span className="sidebar-link-icon">{icon}</span>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={`sidebar-link ${active ? 'active' : ''}`}
    >
      <span className="sidebar-link-icon">{icon}</span>
      <span>{displayLabel}</span>
    </Link>
  );
}
