import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, STATUS_MAP, PRIORITY_MAP } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// Get LLM config
async function getLLMConfig() {
  const db = getAsyncDb();
  const get = async (key: string, def: string = ''): Promise<string> => {
    try { return ((await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any)?.value ?? def; } catch { return def; }
  };
  return {
    enabled: (await get('llm_enabled', 'false')) === 'true',
    apiUrl: await get('llm_api_url', 'https://api.stepfun.com/v1/chat/completions'),
    apiKey: await get('llm_api_key', ''),
    model: await get('llm_model', 'step-2-16k'),
  };
}

// Navigation targets for AI mode
const NAVIGATION_TARGETS = [
  { keywords: ['新建需求', '创建需求', '添加需求', '提交需求', '新需求', '创建一个需求'], path: '/requirements/new', desc: '新建需求' },
  { keywords: ['需求池', '需求列表', '所有需求', '查看需求', '需求管理'], path: '/requirements', desc: '需求池' },
  { keywords: ['看板', '看板视图', '看板管理', 'kanban'], path: '/kanban', desc: '看板视图' },
  { keywords: ['甘特', '甘特图', 'gantt', '项目进度', '时间视图', '进度'], path: '/gantt', desc: '甘特图' },
  { keywords: ['工作流', '流程', '流程管理', 'workflow'], path: '/workflows', desc: '工作流' },
  { keywords: ['流程监控', '监控', '流程监视'], path: '/workflows/monitor', desc: '流程监控' },
  { keywords: ['项目管理', '项目', '项目列表'], path: '/projects', desc: '项目管理' },
  { keywords: ['仪表盘', '统计', '数据概览', 'dashboard', '统计仪表盘'], path: '/dashboard', desc: '统计仪表盘' },
  { keywords: ['工作量', '工作负载', '人员工作量', '负载'], path: '/workload', desc: '工作量分析' },
  { keywords: ['日历', '工作日历', '日程', 'calendar'], path: '/calendar', desc: '工作日历' },
  { keywords: ['用户管理', '用户列表', '账户管理', '添加用户', '角色管理'], path: '/admin/users', desc: '用户管理' },
  { keywords: ['系统配置', '系统设置', '基础配置', '配置', '高级配置', '高级设置', 'openclaw', 'llm', '语音'], path: '/admin/config', desc: '系统配置' },
  { keywords: ['对话工作台', '聊天', 'AI对话', '对话', 'chat'], path: '/chat', desc: '对话工作台' },
];

// Match natural language to navigation
function matchNavigation(msg: string): { path: string; desc: string } | null {
  const lowerMsg = msg.toLowerCase();
  // 疑问句不触发导航，让 LLM 正常回答
  const qMarkers = ['多少', '怎么', '如何', '为什么', '是否', '有没有', '几', '哪里', '谁', '什么', '？', '?'];
  if (qMarkers.some(m => lowerMsg.includes(m))) return null;
  // 以问号/疑问词结尾的也不触发
  if (/[？?]$/.test(msg.trim())) return null;

  for (const target of NAVIGATION_TARGETS) {
    for (const keyword of target.keywords) {
      if (lowerMsg.includes(keyword.toLowerCase())) {
        return { path: target.path, desc: target.desc };
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { message, mode, messages } = await req.json();
  // 浮动静态面板只发 messages 数组（不 message），从最后一条取
  const lastUserMsg = messages && messages.length > 0
    ? messages[messages.length - 1].content
    : message;
  if (!lastUserMsg || !lastUserMsg.trim()) return NextResponse.json({ error: '请输入内容' }, { status: 400 });

  const db = getAsyncDb();
  const msg = lastUserMsg.trim().toLowerCase();

  // AI mode - use LLM or enhanced navigation
  if (mode === 'ai' || mode === 'agent') {
    const config = await getLLMConfig();

    // Get current user message - frontend sends messages array
    const userMessage = lastUserMsg;

    // First try to match navigation with natural language
    const navMatch = matchNavigation(userMessage);
    if (navMatch) {
      return NextResponse.json({
        type: 'navigate', url: navMatch.path,
        text: `好的，正在为您打开${navMatch.desc}...`,
      });
    }

    // If LLM is enabled and no navigation matched, call LLM for natural language understanding
    if (config.enabled && config.apiKey) {
      try {
        const navPrompt = `你是一个智能助手，帮助用户查询数据、分析需求、回答问题。用中文回复，简洁清晰。

导航规则：只有当用户明确说"打开""跳转到""前往"等导航意图时，才返回 JSON：
{"type": "navigate", "url": "/目标路径", "text": "你想说的话"}

用户问数据问题（如"有多少""统计""分析""查询"）时，用纯文本回答，不要返回 navigate。`;

        // Build messages for LLM - filter to only include role/content objects
        const llmMessages = (messages || [])
          .filter((m: any) => m && typeof m === 'object' && m.role && m.content)
          .slice(-6); // Last 6 messages for context

        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: 'system', content: navPrompt },
              ...llmMessages,
              { role: 'user', content: userMessage },
            ],
            max_tokens: 500,
            temperature: 0.3,
          }),
        });

        const data = await response.json();
        const reply = data.choices?.[0]?.message?.content?.trim() || '';

        // Try to extract JSON and find navigate url
        try {
          // Handle markdown code blocks
          let jsonStr = reply;
          const codeMatch = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeMatch) jsonStr = codeMatch[1].trim();
          const jsonMatch = jsonStr.match(/\{[\s\S]*?\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Always return navigate with the URL from LLM
            if (parsed.url) {
              return NextResponse.json({ type: 'navigate', url: parsed.url, text: parsed.text || '正在跳转...' });
            }
          }
        } catch {}

        // If parsing failed, still navigate to chat with error message
        return NextResponse.json({
          type: 'navigate', url: '/chat',
          text: reply || '抱歉，我没有理解您的意思。请尝试说"新建需求"或"打开看板"等指令。',
        });
      } catch (e) {
        console.error('LLM call failed:', e);
        // Fall through to basic navigation
      }
    }

    // Fall back to basic navigation matching if LLM not available
    const basicNav = matchNavigation(userMessage);
    if (basicNav) {
      return NextResponse.json({
        type: 'navigate', url: basicNav.path,
        text: `好的，正在为您打开${basicNav.desc}...`,
      });
    }
  }

  // Basic mode - also use natural language navigation first
  // Get current user message - frontend sends messages array
  const basicUserMessage = messages && messages.length > 0
    ? messages[messages.length - 1].content
    : message;

  // Try natural language navigation first in basic mode too
  const basicNavMatch = matchNavigation(basicUserMessage);
  if (basicNavMatch) {
    return NextResponse.json({
      type: 'navigate', url: basicNavMatch.path,
      text: `好的，正在为您打开${basicNavMatch.desc}...`,
    });
  }

  // Basic mode - original keyword matching

  // Navigation commands
  if (msg.includes('需求列表') || msg.includes('所有需求') || msg.includes('需求池')) {
    return NextResponse.json({
      type: 'navigate', url: '/requirements',
      text: '正在为您打开需求池...',
    });
  }
  if (msg.includes('新建需求') || msg.includes('创建需求') || msg.includes('添加需求') || msg.includes('提交需求')) {
    return NextResponse.json({
      type: 'navigate', url: '/requirements/new',
      text: '正在为您打开需求创建页面...',
    });
  }
  if (msg.includes('看板') || msg.includes('kanban')) {
    return NextResponse.json({ type: 'navigate', url: '/kanban', text: '正在为您打开看板视图...' });
  }
  if (msg.includes('甘特') || msg.includes('gantt') || msg.includes('计划')) {
    return NextResponse.json({ type: 'navigate', url: '/gantt', text: '正在为您打开甘特图...' });
  }
  if (msg.includes('仪表') || msg.includes('dashboard') || msg.includes('统计') || msg.includes('分析')) {
    return NextResponse.json({ type: 'navigate', url: '/dashboard', text: '正在为您打开统计仪表盘...' });
  }
  if (msg.includes('项目') || msg.includes('project')) {
    return NextResponse.json({ type: 'navigate', url: '/projects', text: '正在为您打开项目管理...' });
  }
  if (msg.includes('用户管理') || msg.includes('角色管理')) {
    return NextResponse.json({ type: 'navigate', url: '/admin/users', text: '正在为您打开用户管理...' });
  }

  // Search for specific requirement by ID
  const idMatch = msg.match(/(?:需求|req|#)\s*(\d+)/);
  if (idMatch) {
    const reqId = idMatch[1];
    const row = (await db.prepare('SELECT id, title, status FROM requirements WHERE id = ?').get(reqId)) as any;
    if (row) {
      return NextResponse.json({
        type: 'navigate', url: `/requirements/${row.id}`,
        text: `找到需求 #${row.id}: ${row.title} (${STATUS_MAP[row.status] || row.status})`,
      });
    }
    return NextResponse.json({ type: 'text', text: `未找到 ID 为 ${reqId} 的需求。` });
  }

  // Status query
  for (const [key, label] of Object.entries(STATUS_MAP)) {
    if (msg.includes(label) || msg.includes(key)) {
      const count = ((await db.prepare('SELECT COUNT(*) as c FROM requirements WHERE status = ?').get(key)) as any).c;
      return NextResponse.json({
        type: 'search', url: `/requirements?status=${key}`,
        text: `当前 "${label}" 状态的需求共 ${count} 条。点击查看详情。`,
      });
    }
  }

  // Priority query
  for (const [key, label] of Object.entries(PRIORITY_MAP)) {
    if (msg.includes(`${label}优先`) || msg.includes(`${label}紧急`)) {
      const count = ((await db.prepare('SELECT COUNT(*) as c FROM requirements WHERE priority = ?').get(key)) as any).c;
      return NextResponse.json({
        type: 'search', url: `/requirements?priority=${key}`,
        text: `${label}优先级的需求共 ${count} 条。`,
      });
    }
  }

  // General keyword search
  const results = (await db.prepare(`
    SELECT id, title, status, priority FROM requirements
    WHERE title LIKE ? OR description LIKE ? OR business_unit LIKE ?
    ORDER BY updated_at DESC LIMIT 10
  `).all(`%${lastUserMsg}%`, `%${lastUserMsg}%`, `%${lastUserMsg}%`)) as any[];

  if (results.length > 0) {
    return NextResponse.json({
      type: 'results',
      text: `找到 ${results.length} 条相关需求：`,
      data: results.map(r => ({
        id: r.id, title: r.title,
        status: STATUS_MAP[r.status] || r.status,
        priority: PRIORITY_MAP[r.priority] || r.priority,
      })),
    });
  }

  // Quick stats
  if (msg.includes('概况') || msg.includes('汇总') || msg.includes('总结') || msg.includes('你好') || msg.includes('帮助') || msg.includes('help')) {
    const total = ((await db.prepare('SELECT COUNT(*) as c FROM requirements').get()) as any).c;
    const open = ((await db.prepare("SELECT COUNT(*) as c FROM requirements WHERE status NOT IN ('closed','verified','completed')").get()) as any).c;
    const high = ((await db.prepare("SELECT COUNT(*) as c FROM requirements WHERE priority = 'high' AND status NOT IN ('closed','verified','completed')").get()) as any).c;

    return NextResponse.json({
      type: 'text',
      text: `📊 系统概况\n• 需求总数：${total} 条\n• 待处理：${open} 条\n• 高优先级待处理：${high} 条\n\n您可以试试：\n• 输入 "需求列表" 查看所有需求\n• 输入 "新建需求" 创建需求\n• 输入 "#123" 查看具体需求\n• 输入 "看板" 打开看板视图\n• 输入 "统计" 查看仪表盘\n• 输入关键词搜索需求`,
    });
  }

  return NextResponse.json({
    type: 'text',
    text: `未找到与 "${lastUserMsg}" 相关的内容。您可以：\n• 输入需求关键词搜索\n• 输入 "#需求ID" 查看具体需求\n• 输入 "帮助" 获取使用指引`,
  });
}
