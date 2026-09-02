import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin } from '@/lib/auth';

// 敏感配置项（2026-08-03）：这些 key 的值不得通过 API 明文返回。
const SECRET_CONFIG_KEYS = new Set([
  'llm_api_key',
  'asr_api_key',
  'tts_api_key',
  'wecom_secret',
  'feishu_app_secret',
  'dingtalk_app_secret',
  'mysql_password',
  'openclaw_gateway_token',
]);

const SECRET_PLACEHOLDER = '********';

function isSecretConfigKey(key: string): boolean {
  if (SECRET_CONFIG_KEYS.has(key)) return true;
  // 兼容未来新增项：名字里带 secret/token/password/api_key 的一律当敏感处理
  return /(secret|token|password|api_key|apikey)/i.test(key);
}

const DEFAULT_CONFIGS = [
  // 基础设置
  { key: 'system_name', value: 'RMS 用户需求管理系统', label: '系统名称', desc: '显示在登录页和侧边栏的系统名称', cat: 'general', type: 'text', sort: 1 },
  { key: 'system_description', value: '需求收集、管理、跟踪与分析', label: '系统描述', desc: '显示在登录页的副标题', cat: 'general', type: 'text', sort: 2 },
  { key: 'company_name', value: '', label: '公司/组织名称', desc: '显示在系统底部', cat: 'general', type: 'text', sort: 3 },

  // 注册与认证
  { key: 'allow_self_registration', value: 'true', label: '允许自主注册', desc: '关闭后仅管理员可创建用户', cat: 'auth', type: 'boolean', sort: 10 },
  { key: 'default_role', value: 'login_only', label: '新用户默认角色', desc: '自主注册用户的默认角色', cat: 'auth', type: 'select:global_admin|全局需求管理,project_receiver|项目需求接收员,requirement_handler|需求处理人,requirement_viewer|需求查看员,login_only|仅登录', sort: 11 },
  { key: 'password_min_length', value: '6', label: '密码最小长度', desc: '注册和重置密码时的最短密码要求', cat: 'auth', type: 'number', sort: 12 },
  { key: 'session_expire_days', value: '7', label: '登录有效天数', desc: '登录Token过期时间（天）', cat: 'auth', type: 'number', sort: 13 },
  { key: 'project_roles', value: 'admin|项目管理员|管理项目内所有需求和成员,member|项目成员|可查看和处理项目需求,viewer|只读|仅可查看项目需求', label: '项目内角色列表', desc: '格式：key|显示名|描述，逗号分隔', cat: 'auth', type: 'textarea', sort: 14 },

  // 需求设置
  { key: 'requirement_statuses', value: 'received_not_evaluated|仅接收未评估,evaluated_not_scheduled|已评估未排期,scheduled|已排期,in_progress|处理中,completed|已完成,verified|已验证,closed|已关闭', label: '需求状态列表', desc: '格式：key|显示名，逗号分隔', cat: 'requirement', type: 'textarea', sort: 20 },
  { key: 'requirement_priorities', value: 'high|高,medium|中,low|低', label: '优先级列表', desc: '格式：key|显示名，逗号分隔', cat: 'requirement', type: 'textarea', sort: 21 },
  { key: 'requirement_categories', value: 'project|项目需求,adhoc|零星需求', label: '需求分类', desc: '格式：key|显示名，逗号分隔', cat: 'requirement', type: 'textarea', sort: 22 },
  { key: 'default_requirement_status', value: 'received_not_evaluated', label: '新建需求默认状态', desc: '创建需求时的初始状态', cat: 'requirement', type: 'text', sort: 23 },
  { key: 'auto_assign_receiver', value: 'true', label: '自动指派接收人', desc: '创建需求时自动将当前用户设为接收人', cat: 'requirement', type: 'boolean', sort: 24 },

  // 显示设置
  { key: 'page_size', value: '30', label: '列表每页条数', desc: '需求列表等每页显示数量', cat: 'display', type: 'number', sort: 30 },
  { key: 'gantt_default_range_months', value: '3', label: '甘特图默认范围(月)', desc: '甘特图默认显示的月数', cat: 'display', type: 'number', sort: 31 },
  { key: 'dashboard_trend_months', value: '6', label: '趋势图月数', desc: '仪表盘趋势分析显示的月数', cat: 'display', type: 'number', sort: 32 },

  // 通知设置
  { key: 'enable_notification', value: 'false', label: '启用通知', desc: '需求状态变更时发送通知', cat: 'notification', type: 'boolean', sort: 40 },
  { key: 'notification_email', value: '', label: '通知邮箱', desc: '系统通知发送邮箱地址', cat: 'notification', type: 'text', sort: 41 },
  { key: 'notification_push_enabled', value: 'false', label: '推送到 IM', desc: '把站内未读通知推送到用户的飞书/企业微信/钉钉个人消息（需先配好对应应用凭据，且用户用该 IM 登录过）', cat: 'notification', type: 'boolean', sort: 42 },

  // MCP 服务（2026-09-02）
  //
  // 把 RMS 的数据能力以 MCP 协议暴露给外部客户端（Claude Desktop / Cursor / Cline 等）。
  //
  // ⚠️ 安全约束，改这几项前务必读懂：
  //   1. 全部默认关闭。开 mcp_enabled 等于给需求库开了一个新的网络入口。
  //   2. 强制 access_token 鉴权，没有「本地免鉴权」后门。权限跟着 token 属主走，
  //      token 主人没权限动的需求，走 MCP 一样动不了。
  //   3. 写操作（create/update）由 mcp_allow_write 单独控制，关闭时这两个 tool
  //      **压根不注册**，而不是运行时才拒绝 —— 不给客户端「看得见但调不动」的错觉。
  //   4. list_users / get_schema 涉及用户 PII 与表结构，归入 mcp_expose_sensitive。
  //
  // 传输层的两个实测结论（别再重新评估）：
  //   1. **WebSocket 做不了**。SDK 1.29.0 的 server/ 下只有 stdio / sse /
  //      streamableHttp / webStandardStreamableHttp，**没有 websocket**（客户端倒有
  //      client/websocket.js）。MCP 规范本身也未定义服务端 WS。自造私有 WS 协议
  //      会让所有标准客户端都连不上，所以不做。
  //   2. **旧版独立 SSE transport 在 App Router 里用不了**。`SSEServerTransport`
  //      签名吃 node:http 的 ServerResponse/IncomingMessage，而 App Router 走 Web 标准
  //      Request/Response。所以用 WebStandardStreamableHTTPServerTransport ——
  //      它的 handleRequest(Request): Promise<Response> 正好就是路由签名。
  //      SSE 并没丢：Streamable HTTP 本身就用 SSE 做流式响应（mcp_transport=stream）。
  { key: 'mcp_enabled', value: 'false', label: '启用 MCP 服务', desc: '开启后外部 MCP 客户端可通过 HTTP/SSE 访问 RMS 数据。需携带有效的 Access Token（在「个人中心 → API Token」创建）。关闭时端点直接返回 404', cat: 'mcp', type: 'boolean', sort: 120 },
  { key: 'mcp_transport', value: 'stream', label: '响应模式', desc: 'stream = SSE 流式响应（MCP 推荐，兼容最好）；json = 单次 JSON 响应（调试友好，curl 可直读）。两者走同一个 Streamable HTTP 端点', cat: 'mcp', type: 'select:stream|SSE 流式响应 (推荐),json|单次 JSON 响应', sort: 121 },
  { key: 'mcp_allow_write', value: 'false', label: '允许写操作', desc: '⚠️ 开启后暴露 create_requirement / update_requirement 两个工具，外部客户端可创建和修改需求。建议先只读跑一段时间再放开', cat: 'mcp', type: 'boolean', sort: 122 },
  { key: 'mcp_expose_sensitive', value: 'false', label: '暴露用户与表结构', desc: '⚠️ 开启后暴露 list_users（含用户名/邮箱）与 get_schema（数据库表结构）两个工具', cat: 'mcp', type: 'boolean', sort: 123 },
  { key: 'mcp_rate_limit', value: '120', label: '限流（次/分钟）', desc: '单个 Token 每分钟最多调用多少次工具，超出返回 429。设为 0 表示不限制', cat: 'mcp', type: 'number', sort: 124 },
  { key: 'mcp_audit_log', value: 'true', label: '记录调用审计', desc: '把每次工具调用写入 audit_logs（含 token 属主、工具名、参数摘要、IP）', cat: 'mcp', type: 'boolean', sort: 125 },

  // OpenClaw 设置
  { key: 'openclaw_enabled', value: 'true', label: '启用 OpenClaw 集成', desc: '允许用户在对话工作台使用 OpenClaw AI Agent', cat: 'openclaw', type: 'boolean', sort: 50 },
  { key: 'openclaw_gateway_url', value: 'http://127.0.0.1:18789', label: 'Gateway 地址', desc: 'OpenClaw Gateway 的 HTTP 地址（默认本机 18789 端口）', cat: 'openclaw', type: 'text', sort: 51 },
  { key: 'openclaw_gateway_token', value: '', label: 'Gateway Token', desc: 'OpenClaw Gateway 认证 Token（可选）', cat: 'openclaw', type: 'text', sort: 52 },
  { key: 'openclaw_default_model', value: '', label: '默认模型', desc: 'Agent 使用的默认模型（留空使用系统默认）', cat: 'openclaw', type: 'text', sort: 53 },
  { key: 'openclaw_workspace_base', value: '', label: '工作目录根路径', desc: '用户 Agent 工作目录的根路径（留空使用默认）', cat: 'openclaw', type: 'text', sort: 54 },

  // LLM 大模型设置
  { key: 'llm_enabled', value: 'false', label: '启用 LLM 智能对话', desc: '启用后对话工作台将使用大模型进行自然语言理解', cat: 'llm', type: 'boolean', sort: 60 },
  { key: 'llm_api_url', value: '', label: 'LLM API 地址', desc: '兼容 OpenAI 格式的 Chat Completions 接口', cat: 'llm', type: 'text', sort: 61 },
  { key: 'llm_api_key', value: '', label: 'API Key', desc: 'LLM 服务的认证密钥', cat: 'llm', type: 'text', sort: 62 },
  { key: 'llm_model', value: '', label: '模型名称', desc: '使用的模型 ID（如 gpt-4o-mini, gpt-4o, step-2-16k 等）', cat: 'llm', type: 'text', sort: 63 },
  { key: 'llm_use_tool_role', value: 'true', label: '使用标准 tool 角色', desc: '是否使用标准 OpenAI 格式的 role: "tool"，部分服务商需要关闭', cat: 'llm', type: 'boolean', sort: 67 },
  { key: 'llm_max_tokens', value: '', label: '最大生成 Token', desc: '单次回复的最大 Token 数', cat: 'llm', type: 'number', sort: 64 },
  { key: 'llm_temperature', value: '', label: 'Temperature', desc: '生成温度，0-1之间，越低越确定性', cat: 'llm', type: 'text', sort: 65 },
  { key: 'llm_system_prompt', value: '', label: '自定义系统提示词', desc: '追加到默认系统提示词后面（可选）', cat: 'llm', type: 'textarea', sort: 66 },

  // ASR / TTS 语音服务
  { key: 'asr_enabled', value: 'false', label: '启用语音转文字 (ASR)', desc: '启用后可将音频附件转为文字', cat: 'asr_tts', type: 'boolean', sort: 80 },
  { key: 'asr_api_url', value: 'https://api.stepfun.com/v1/audio/transcriptions', label: 'ASR API 地址', desc: '语音识别接口地址', cat: 'asr_tts', type: 'text', sort: 81 },
  { key: 'asr_api_key', value: '', label: 'ASR API Key', desc: '语音识别服务密钥', cat: 'asr_tts', type: 'text', sort: 82 },
  { key: 'asr_model', value: 'step-asr-v1', label: 'ASR 模型', desc: '语音识别模型名称', cat: 'asr_tts', type: 'text', sort: 83 },
  { key: 'tts_enabled', value: 'false', label: '启用文字转语音 (TTS)', desc: '启用后可将需求内容通过语音播放', cat: 'asr_tts', type: 'boolean', sort: 84 },
  { key: 'tts_api_url', value: 'https://api.stepfun.com/v1/audio/speech', label: 'TTS API 地址', desc: '语音合成接口地址', cat: 'asr_tts', type: 'text', sort: 85 },
  { key: 'tts_api_key', value: '', label: 'TTS API Key', desc: '语音合成服务密钥', cat: 'asr_tts', type: 'text', sort: 86 },
  { key: 'tts_model', value: 'step-tts-v1', label: 'TTS 模型', desc: '语音合成模型名称', cat: 'asr_tts', type: 'text', sort: 87 },
  { key: 'tts_voice', value: 'zh-CN-XiaoxiaoNeural', label: 'TTS 发音人', desc: '语音合成的发音人/声色', cat: 'asr_tts', type: 'text', sort: 88 },

  // 企业微信
  { key: 'wecom_enabled', value: 'false', label: '启用企业微信登录', desc: '允许用户通过企业微信扫码登录和注册', cat: 'wecom', type: 'boolean', sort: 70 },
  { key: 'wecom_corp_id', value: '', label: '企业 ID (CorpID)', desc: '企业微信管理后台 → 我的企业 → 企业ID', cat: 'wecom', type: 'text', sort: 71 },
  { key: 'wecom_agent_id', value: '', label: '应用 AgentID', desc: '企业微信自建应用的 AgentID', cat: 'wecom', type: 'text', sort: 72 },
  { key: 'wecom_secret', value: '', label: '应用 Secret', desc: '企业微信自建应用的 Secret', cat: 'wecom', type: 'text', sort: 73 },
  { key: 'wecom_callback_url', value: 'http://localhost:3001/api/auth/wecom/callback', label: '回调地址', desc: 'OAuth 授权回调地址', cat: 'wecom', type: 'text', sort: 74 },
  { key: 'wecom_auto_register', value: 'true', label: '自动注册新用户', desc: '扫码时若用户不存在则自动创建账号', cat: 'wecom', type: 'boolean', sort: 75 },
  { key: 'wecom_default_role', value: 'login_only', label: '新用户默认角色', desc: '企业微信扫码注册用户的默认角色', cat: 'wecom', type: 'select:global_admin|全局需求管理,project_receiver|项目需求接收员,requirement_handler|需求处理人,requirement_viewer|需求查看员,login_only|仅登录', sort: 76 },

  // 飞书
  { key: 'feishu_enabled', value: 'false', label: '启用飞书登录', desc: '允许用户通过飞书扫码登录和注册', cat: 'feishu', type: 'boolean', sort: 77 },
  { key: 'feishu_app_id', value: '', label: 'App ID', desc: '飞书开放平台应用 App ID', cat: 'feishu', type: 'text', sort: 78 },
  { key: 'feishu_app_secret', value: '', label: 'App Secret', desc: '飞书开放平台应用 App Secret', cat: 'feishu', type: 'text', sort: 79 },
  { key: 'feishu_callback_url', value: 'http://localhost:3001/api/auth/feishu/callback', label: '回调地址', desc: 'OAuth 授权回调地址', cat: 'feishu', type: 'text', sort: 80 },
  { key: 'feishu_auto_register', value: 'true', label: '自动注册新用户', desc: '扫码时若用户不存在则自动创建账号', cat: 'feishu', type: 'boolean', sort: 81 },
  { key: 'feishu_default_role', value: 'login_only', label: '新用户默认角色', desc: '飞书扫码注册用户的默认角色', cat: 'feishu', type: 'select:global_admin|全局需求管理,project_receiver|项目需求接收员,requirement_handler|需求处理人,requirement_viewer|需求查看员,login_only|仅登录', sort: 82 },

  // 钉钉
  { key: 'dingtalk_enabled', value: 'false', label: '启用钉钉登录', desc: '允许用户通过钉钉扫码登录和注册', cat: 'dingtalk', type: 'boolean', sort: 83 },
  { key: 'dingtalk_app_key', value: '', label: 'App Key', desc: '钉钉开放平台应用 App Key', cat: 'dingtalk', type: 'text', sort: 84 },
  { key: 'dingtalk_app_secret', value: '', label: 'App Secret', desc: '钉钉开放平台应用 App Secret', cat: 'dingtalk', type: 'text', sort: 85 },
  { key: 'dingtalk_callback_url', value: 'http://localhost:3001/api/auth/dingtalk/callback', label: '回调地址', desc: 'OAuth 授权回调地址', cat: 'dingtalk', type: 'text', sort: 86 },
  { key: 'dingtalk_auto_register', value: 'true', label: '自动注册新用户', desc: '扫码时若用户不存在则自动创建账号', cat: 'dingtalk', type: 'boolean', sort: 87 },
  { key: 'dingtalk_default_role', value: 'login_only', label: '新用户默认角色', desc: '钉钉扫码注册用户的默认角色', cat: 'dingtalk', type: 'select:global_admin|全局需求管理,project_receiver|项目需求接收员,requirement_handler|需求处理人,requirement_viewer|需求查看员,login_only|仅登录', sort: 88 },

  // 数据库
  { key: 'db_type', value: 'mysql', label: '数据库类型', desc: '选择使用的数据库引擎', cat: 'database', type: 'select:sqlite|SQLite,mysql|MySQL（默认）', sort: 1 },
  { key: 'mysql_host', value: 'localhost', label: 'MySQL 主机', desc: 'MySQL 服务器地址', cat: 'database', type: 'text', sort: 2 },
  { key: 'mysql_port', value: '3306', label: 'MySQL 端口', desc: 'MySQL 服务器端口', cat: 'database', type: 'number', sort: 3 },
  { key: 'mysql_database', value: 'rms', label: '数据库名', desc: 'MySQL 数据库名称', cat: 'database', type: 'text', sort: 4 },
  { key: 'mysql_user', value: 'root', label: 'MySQL 用户名', desc: 'MySQL 连接用户名', cat: 'database', type: 'text', sort: 5 },
  { key: 'mysql_password', value: '', label: 'MySQL 密码', desc: 'MySQL 连接密码', cat: 'database', type: 'text', sort: 6 },
  { key: 'mysql_pool_size', value: '10', label: '连接池大小', desc: 'MySQL 连接池最大连接数', cat: 'database', type: 'number', sort: 7 },

  // Memcache 配置
  { key: 'memcache_enabled', value: 'false', label: '启用 Memcache', desc: '启用 Memcache 作为会话存储后端', cat: 'memcache', type: 'boolean', sort: 1 },
  { key: 'memcache_host', value: '127.0.0.1', label: 'Memcache 主机', desc: 'Memcache 服务器地址', cat: 'memcache', type: 'text', sort: 2 },
  { key: 'memcache_port', value: '11211', label: 'Memcache 端口', desc: 'Memcache 服务器端口', cat: 'memcache', type: 'number', sort: 3 },
  { key: 'memcache_ttl_days', value: '30', label: '会话 TTL（天）', desc: '会话在 Memcache 中的存活天数', cat: 'memcache', type: 'number', sort: 4 },
];

// Ensure config table exists —— 每个进程只走一次 seed（避免 50+ INSERT 启动风暴）
let _seeded = false;
async function ensureConfigTable() {
  const db = getAsyncDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    // MySQL: create table with correct schema if not exists, then alter if columns missing
    // NOTE: MySQL 5.7+ 不支持 TEXT DEFAULT，改用 VARCHAR
    await db.exec(`
      CREATE TABLE IF NOT EXISTS system_config (
        \`key\` VARCHAR(200) PRIMARY KEY,
        value TEXT NOT NULL,
        label VARCHAR(200) DEFAULT '',
        description VARCHAR(500) DEFAULT '',
        category VARCHAR(50) DEFAULT 'general',
        type VARCHAR(255) DEFAULT 'text',
        sort_order INT DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Migrate old schema: rename config_key -> key, config_value -> value if needed
    try {
      const cols = (await db.prepare('SHOW COLUMNS FROM system_config').all()) as any[];
      const colNames = cols.map((c: any) => c.Field);
      if (colNames.includes('config_key') && !colNames.includes('key')) {
        // Old schema detected - migrate
        await db.exec('ALTER TABLE system_config CHANGE COLUMN config_key `key` VARCHAR(200)');
      }
      if (colNames.includes('config_value') && !colNames.includes('value')) {
        await db.exec('ALTER TABLE system_config CHANGE COLUMN config_value value TEXT');
      }
      if (!colNames.includes('label')) {
        await db.exec("ALTER TABLE system_config ADD COLUMN label VARCHAR(200) DEFAULT ''");
      }
      if (!colNames.includes('description')) {
        await db.exec("ALTER TABLE system_config ADD COLUMN description VARCHAR(500) DEFAULT ''");
      }
      if (!colNames.includes('category')) {
        await db.exec("ALTER TABLE system_config ADD COLUMN category VARCHAR(50) DEFAULT 'general'");
      }
      if (!colNames.includes('type')) {
        await db.exec("ALTER TABLE system_config MODIFY COLUMN type VARCHAR(255) DEFAULT 'text'");
      }
      if (!colNames.includes('sort_order')) {
        await db.exec('ALTER TABLE system_config ADD COLUMN sort_order INT DEFAULT 0');
      }
    } catch {}
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        label TEXT DEFAULT '',
        description TEXT DEFAULT '',
        category TEXT DEFAULT 'general',
        type TEXT DEFAULT 'text',
        sort_order INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Seed default configs —— 每个进程只跑一次
  // MySQL: preserve existing values (don't overwrite user-configured tokens/keys)
  if (_seeded) return;
  _seeded = true;
  if (isMysql) {
    for (const d of DEFAULT_CONFIGS) {
      try {
        const seedSql = 'INSERT INTO system_config (`key`, value, label, description, category, type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), category = VALUES(category), type = VALUES(type), sort_order = VALUES(sort_order)';
        await db.prepare(seedSql).run(d.key, d.value, d.label, d.desc, d.cat, d.type, d.sort);
      } catch {}
    }
  } else {
    const stmt = db.prepare('INSERT OR REPLACE INTO system_config (key, value, label, description, category, type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const d of DEFAULT_CONFIGS) {
      await stmt.run(d.key, d.value, d.label, d.desc, d.cat, d.type, d.sort);
    }
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  await ensureConfigTable();
  const db = getAsyncDb();
  const rows = (await db.prepare('SELECT * FROM system_config ORDER BY category, sort_order').all()) as any[];

  // 安全修复（2026-08-03）：原实现把 system_config 全表明文返回给任意登录用户，
  // 其中含 llm_api_key / asr_api_key / tts_api_key / *_app_secret / wecom_secret /
  // mysql_password / openclaw_gateway_token 等凭据。
  // 现在：非管理员只能看到非敏感项，且敏感项一律脱敏为占位符。
  const admin = isGlobalAdmin(user.roles);
  const visible = rows
    .filter((row) => admin || !isSecretConfigKey(row.key))
    .map((row) => {
      if (!isSecretConfigKey(row.key)) return row;
      const hasValue = !!(row.value && String(row.value).length > 0);
      // 管理员也不回明文，只告知是否已配置（避免前端页面/日志/缓存二次泄露）
      return { ...row, value: hasValue ? SECRET_PLACEHOLDER : '', is_secret: true, has_value: hasValue };
    });

  // Group by category
  const grouped: Record<string, any[]> = {};
  for (const row of visible) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push(row);
  }

  return NextResponse.json({ configs: visible, grouped });
}

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) {
    return NextResponse.json({ error: '无权限，仅管理员可修改系统配置' }, { status: 403 });
  }

  await ensureConfigTable();
  const { configs } = await req.json();
  if (!configs || typeof configs !== 'object') {
    return NextResponse.json({ error: '无效的配置数据' }, { status: 400 });
  }

  const db = getAsyncDb();
  // `key` 是 MySQL 保留字，必须用反引号包裹。SQLite 也能识别反引号。
  const stmt = db.prepare('UPDATE system_config SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE `key` = ?');

  // 注意：db.transaction() 在异步库（MySqlAsyncDatabase / SqliteAsyncDatabase）里是 async 方法，
  // 返的是 Promise<asyncFn>。需要 await 两层 + 在 fn 内 await stmt.run()。
  // 原代码同步调用 updateTx(configs) 会报 "updateTx is not a function"。
  const updateTx = await db.transaction(async (items: Record<string, string>) => {
    for (const [key, value] of Object.entries(items)) {
      // 配套 GET 脱敏（2026-08-03）：前端回传占位符表示“未修改”，跳过以免把凭据写成 '********'
      if (isSecretConfigKey(key) && String(value) === SECRET_PLACEHOLDER) continue;
      await stmt.run(String(value), key);
    }
  });
  await updateTx(configs);

  return NextResponse.json({ success: true });
}

// Get a single config value (helper for server-side use) - not exported from route
async function getConfigValue(key: string, defaultValue: string = ''): Promise<string> {
  try {
    const db = getAsyncDb();
    const row = (await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any;
    return row?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}
