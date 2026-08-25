#!/usr/bin/env node
/**
 * RMS MCP Server
 * 
 * 为 OpenClaw / HermesAgent 等 Agent 提供 MCP 工具接口
 * 支持：搜索需求、创建需求、更新需求、列出项目/用户等
 * 
 * 启动方式：node rms-mcp-server.js
 * 传输方式：stdio (标准输入输出)
 * 
 * 认证模式:
 *   1. 直连数据库（默认）- 需要数据库连接信息
 *   2. HTTP API 模式 - 设置 RMS_BASE_URL 和 RMS_ACCESS_TOKEN
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { execFileSync } = require('child_process');

// ====== 认证模式 ======
const USE_HTTP = !!process.env.RMS_BASE_URL;
const HTTP_BASE_URL = process.env.RMS_BASE_URL || 'http://localhost:3800';
// 支持多个 Token（逗号分隔），第一个为默认 Token
const HTTP_TOKENS = (process.env.RMS_ACCESS_TOKENS || process.env.RMS_ACCESS_TOKEN || '').split(',').map(t => t.trim()).filter(Boolean);
const HTTP_TOKEN = HTTP_TOKENS[0] || '';

// 从 MCP 调用参数中获取用户 Token，实现透传
function getTokenFromArgs(args) {
  // 用户可以通过 _token 参数传递自己的 Token
  if (args && args._token) return args._token;
  return HTTP_TOKEN;
}

// 带 Token 的 HTTP 调用
async function httpApiWithToken(apiPath, options = {}, token) {
  const useToken = token || HTTP_TOKEN;
  if (!useToken) throw new Error('未配置 Access Token');
  const url = `${HTTP_BASE_URL}${apiPath}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${useToken}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ====== MySQL 配置（直连模式） ======
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = process.env.MYSQL_PORT || '3306';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'rms';
const MYSQL_USER = process.env.MYSQL_USER || 'rms';
// 密码不设默认值：绝不把可用凭据写进代码（本仓库公开）。
// 直连模式下缺失则启动即退出，不静默连一个猜出来的密码。
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
if (!USE_HTTP && !MYSQL_PASSWORD) {
  console.error(
    '[RMS MCP] 致命错误：直连数据库模式缺少 MYSQL_PASSWORD。\n' +
    '  请设置环境变量后重启，例如：\n' +
    '    export MYSQL_PASSWORD="<db password>"\n' +
    '  或改用 HTTP API 模式（设置 RMS_BASE_URL + RMS_ACCESS_TOKEN）。'
  );
  process.exit(1);
}

// 所有工具共用的 _token 参数描述
const TOKEN_PARAM_DESC = '用户 Access Token（用于标识操作用户，实现审计追踪）';

// ====== HTTP API 调用（HTTP 模式） ======
// ====== MySQL 工具函数 ======
/**
 * 安全修复（2026-08-25）：原实现把 SQL 拼进 `sh -c "mysql ... -e \"<SQL>\""`，
 * 只转义了 `\` 和 `"`，漏掉 `$` 和反引号，导致 `$(...)` 命令替换可在服务器上
 * 执行任意命令（RCE）。escapeValue() 只防 SQL 注入，防不住 shell 层注入 ——
 * 任何流进 title/description 等字段的字符串都能打穿。已实测复现。
 *
 * 主库 src/lib/db.ts 早在 2026-08-03 修过同一个洞，本文件当时被漏掉。
 *
 * 现改为与 db.ts 一致的三层隔离：
 *   1. execFileSync 直接调二进制，不经 shell → 无命令替换/管道/重定向；
 *   2. SQL 走 stdin，不作为命令行参数 → SQL 内容与命令行彻底隔离；
 *   3. 密码走 MYSQL_PWD 环境变量 → 不出现在 `ps` 可见的命令行里。
 * 勿改回字符串拼接。
 */
function mysqlExec(sql) {
  try {
    return execFileSync(
      'mysql',
      [
        '-h', MYSQL_HOST,
        '-P', String(MYSQL_PORT),
        '-u', MYSQL_USER,
        // 必须显式指定字符集：mysql CLI 默认可能是 latin1，中文经 latin1 通道
        // 写入 utf8mb4 列会双重编码（2026-08-12 线上事故根因，勿删）。
        '--default-character-set=utf8mb4',
        '-N', '-B',
        MYSQL_DATABASE,
      ],
      {
        input: sql,
        encoding: 'utf8',
        timeout: 15000,
        env: { ...process.env, MYSQL_PWD: MYSQL_PASSWORD },
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    ).trim();
  } catch {
    return '';
  }
}

function parseRows(output, columns) {
  if (!output) return [];
  return output.split('\n').map(line => {
    const vals = line.split('\t');
    const obj = {};
    for (let i = 0; i < vals.length; i++) {
      const val = vals[i] ?? '';
      const key = i < columns.length ? columns[i] : `_col${i}`;
      obj[key] = val === 'NULL' ? null : (isNaN(Number(val)) || val === '' ? val : Number(val));
    }
    return obj;
  });
}

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  const str = String(val);
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '\\') result += '\\\\';
    else if (ch === "'") result += "\\'";
    else if (ch === '\0') result += '';
    else result += ch;
  }
  return "'" + result + "'";
}

function query(sql, params = []) {
  let builtSql = sql;
  if (params.length > 0) {
    let i = 0;
    builtSql = sql.replace(/\?/g, () => {
      if (i >= params.length) return '?';
      return escapeValue(params[i++]);
    });
  }
  const output = mysqlExec(builtSql);
  if (!output) return [];

  // 解析列名 - 从 SELECT 子句中提取
  let columns = [];
  const upperSql = sql.toUpperCase();
  const selectStart = upperSql.indexOf('SELECT ');
  if (selectStart >= 0) {
    let depth = 0;
    let selectEnd = -1;
    for (let i = selectStart + 7; i < sql.length; i++) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
      else if (depth === 0 && upperSql.substring(i, i + 5) === 'FROM ') {
        selectEnd = i;
        break;
      }
    }
    if (selectEnd > 0) {
      const colsStr = sql.substring(selectStart + 7, selectEnd).trim();
      if (colsStr !== '*') {
        // 按逗号分割，但跳过括号内的逗号
        let pDepth = 0;
        let current = '';
        for (let i = 0; i < colsStr.length; i++) {
          const ch = colsStr[i];
          if (ch === '(') pDepth++;
          else if (ch === ')') pDepth--;
          else if (ch === ',' && pDepth === 0) {
            columns.push(current);
            current = '';
            continue;
          }
          current += ch;
        }
        if (current) columns.push(current);

        columns = columns.map(c => {
          // 别名可能带引号（`key` / 'key' / "key"）—— MySQL 保留字必须加引号。
          // 旧正则只认裸标识符，导致 `COLUMN_KEY as 'key'` 落到下面的剥非法字符分支，
          // 被揉成 `COLUMN_KEYaskey`（get_schema 实测返回过这个鬼字段名）。
          const aliased = c.trim().match(/\bAS\s+(?:`([^`]+)`|'([^']+)'|"([^"]+)"|([a-zA-Z_][a-zA-Z0-9_]*))\s*$/i);
          if (aliased) return aliased[1] || aliased[2] || aliased[3] || aliased[4];
          const parts = c.trim().split('.');
          return parts[parts.length - 1].trim().replace(/[^a-zA-Z0-9_]/g, '');
        });
      }
    }
  }

  return parseRows(output, columns);
}

// ====== 状态/优先级映射 ======
const STATUS_MAP = {
  received_not_evaluated: '仅接收，未评估',
  evaluated_not_scheduled: '已评估，未排期',
  scheduled: '已排期',
  in_progress: '处理中',
  completed: '已完成',
  verified: '已验证',
  closed: '已关闭',
};

const PRIORITY_MAP = {
  high: '高',
  medium: '中',
  low: '低',
};

// ====== 创建 MCP Server ======
const server = new McpServer({
  name: 'rms-mcp-server',
  version: '1.0.0',
});

// 启动时输出模式信息
if (USE_HTTP) {
  console.error(`[RMS MCP] HTTP API 模式: ${HTTP_BASE_URL}`);
  if (HTTP_TOKEN) console.error(`[RMS MCP] 默认 Token: ${HTTP_TOKEN.substring(0, 11)}...`);
} else {
  console.error(`[RMS MCP] 直连数据库模式: ${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}`);
}

// ====== 工具：search_requirements ======
server.tool(
  'search_requirements',
  '搜索需求。支持按关键词、状态、优先级、项目等条件搜索',
  {
    _token: z.string().optional().describe(TOKEN_PARAM_DESC),
    keyword: z.string().optional().describe('搜索关键词（标题/描述/业务方）'),
    status: z.string().optional().describe('需求状态: received_not_evaluated/evaluated_not_scheduled/scheduled/in_progress/completed/verified/closed'),
    priority: z.string().optional().describe('优先级: high/medium/low'),
    project_name: z.string().optional().describe('项目名称'),
    handler_name: z.string().optional().describe('处理人姓名'),
    limit: z.number().optional().describe('返回数量限制，默认10'),
  },
  async (args) => {
    // HTTP API 模式
    if (USE_HTTP) {
      const params = new URLSearchParams();
      if (args.keyword) params.set('keyword', args.keyword);
      if (args.status) params.set('status', args.status);
      if (args.priority) params.set('priority', args.priority);
      if (args.limit) params.set('pageSize', String(args.limit));
      const data = await httpApiWithToken(`/api/requirements?${params}`, {}, getTokenFromArgs(args));
      const formatted = (data.data || []).map(r => ({
        ...r,
        status_label: STATUS_MAP[r.status] || r.status,
        priority_label: PRIORITY_MAP[r.priority] || r.priority,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
    }

    // 直连数据库模式
    let sql = `SELECT r.id, r.title, r.status, r.priority, r.business_unit, r.category,
      p.name as project_name, r.created_at, r.updated_at,
      hdl.display_name as handler_name, recv.display_name as receiver_name
      FROM requirements r
      LEFT JOIN projects p ON p.id = r.project_id
      LEFT JOIN users hdl ON hdl.id = r.handler_id
      LEFT JOIN users recv ON recv.id = r.receiver_id
      WHERE 1=1`;
    const params = [];

    if (args.keyword) {
      sql += ' AND (r.title LIKE ? OR r.description LIKE ? OR r.business_unit LIKE ?)';
      const kw = `%${args.keyword}%`;
      params.push(kw, kw, kw);
    }
    if (args.status) { sql += ' AND r.status = ?'; params.push(args.status); }
    if (args.priority) { sql += ' AND r.priority = ?'; params.push(args.priority); }
    if (args.project_name) {
      const proj = query('SELECT id FROM projects WHERE name LIKE ?', [`%${args.project_name}%`]);
      if (proj.length > 0) { sql += ' AND r.project_id = ?'; params.push(proj[0].id); }
    }
    if (args.handler_name) {
      const user = query('SELECT id FROM users WHERE display_name LIKE ?', [`%${args.handler_name}%`]);
      if (user.length > 0) { sql += ' AND r.handler_id = ?'; params.push(user[0].id); }
    }
    sql += ` ORDER BY r.updated_at DESC LIMIT ${args.limit || 10}`;

    const results = query(sql, params);
    const formatted = results.map(r => ({
      ...r,
      status_label: STATUS_MAP[r.status] || r.status,
      priority_label: PRIORITY_MAP[r.priority] || r.priority,
    }));

    return { content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }] };
  }
);

// ====== 工具：get_requirement ======
server.tool(
  'get_requirement',
  '获取指定ID的需求详情，包含关联信息',
  {
    _token: z.string().optional().describe(TOKEN_PARAM_DESC),
    id: z.number().describe('需求ID'),
  },
  async (args) => {
    // HTTP API 模式
    if (USE_HTTP) {
      const data = await httpApiWithToken(`/api/requirements/${args.id}`, {}, getTokenFromArgs(args));
      data.status_label = STATUS_MAP[data.status] || data.status;
      data.priority_label = PRIORITY_MAP[data.priority] || data.priority;
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }

    // 直连数据库模式
    const r = query(`
      SELECT r.*, p.name as project_name,
        recv.display_name as receiver_name, hdl.display_name as handler_name, ver.display_name as verifier_name
      FROM requirements r
      LEFT JOIN projects p ON p.id = r.project_id
      LEFT JOIN users recv ON recv.id = r.receiver_id
      LEFT JOIN users hdl ON hdl.id = r.handler_id
      LEFT JOIN users ver ON ver.id = r.verifier_id
      WHERE r.id = ?
    `, [args.id]);

    if (r.length === 0) {
      return { content: [{ type: 'text', text: '需求不存在' }] };
    }

    const req = r[0];
    req.status_label = STATUS_MAP[req.status] || req.status;
    req.priority_label = PRIORITY_MAP[req.priority] || req.priority;

    // 获取状态日志
    const logs = query(`
      SELECT sl.*, u.display_name as operator_name
      FROM status_log sl
      LEFT JOIN users u ON u.id = sl.changed_by
      WHERE sl.requirement_id = ?
      ORDER BY sl.changed_at DESC LIMIT 10
    `, [args.id]);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ ...req, statusLog: logs }, null, 2)
      }]
    };
  }
);

// ====== 工具：create_requirement ======
server.tool(
  'create_requirement',
  '创建一条新需求。必须提供标题，其他字段可选',
  {
    _token: z.string().optional().describe(TOKEN_PARAM_DESC),
    title: z.string().describe('需求标题（必填）'),
    description: z.string().optional().describe('详细描述'),
    business_unit: z.string().optional().describe('业务方/提出部门'),
    priority: z.string().optional().describe('优先级: high/medium/low，默认 medium'),
    category: z.string().optional().describe('分类: project(项目需求)/adhoc(零星需求)，默认 project'),
    project_name: z.string().optional().describe('归属项目名称，如"ERP系统升级"'),
    handler_name: z.string().optional().describe('处理人姓名，如"张三"'),
    receiver_name: z.string().optional().describe('接收人姓名'),
    benefit: z.string().optional().describe('需求价值/预期收益'),
    planned_start: z.string().optional().describe('计划开始日期，格式 YYYY-MM-DD'),
    planned_end: z.string().optional().describe('计划结束日期，格式 YYYY-MM-DD'),
    created_by_name: z.string().optional().describe('创建人姓名，默认为系统管理员'),
  },
  async (args) => {
    // HTTP API 模式
    if (USE_HTTP) {
      const data = await httpApiWithToken('/api/requirements', {
        method: 'POST',
        body: JSON.stringify(args),
      }, getTokenFromArgs(args));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            id: data.id,
            message: `需求 #${data.id} 创建成功：${args.title}`,
            details: {
              title: args.title,
              project: args.project_name || '未指定',
              priority: PRIORITY_MAP[args.priority || 'medium'],
              handler: args.handler_name || '未指定',
              status: '仅接收，未评估',
            }
          }, null, 2)
        }]
      };
    }

    // 直连数据库模式
    // 查找项目ID
    let projectId = null;
    if (args.project_name) {
      const proj = query('SELECT id FROM projects WHERE name LIKE ?', [`%${args.project_name}%`]);
      if (proj.length > 0) projectId = proj[0].id;
    }

    // 查找处理人ID
    let handlerId = null;
    if (args.handler_name) {
      const user = query('SELECT id FROM users WHERE display_name LIKE ?', [`%${args.handler_name}%`]);
      if (user.length > 0) handlerId = user[0].id;
    }

    // 查找接收人ID
    let receiverId = null;
    if (args.receiver_name) {
      const user = query('SELECT id FROM users WHERE display_name LIKE ?', [`%${args.receiver_name}%`]);
      if (user.length > 0) receiverId = user[0].id;
    }

    // 查找创建人ID
    let createdById = 1; // 默认管理员
    if (args.created_by_name) {
      const user = query('SELECT id FROM users WHERE display_name LIKE ?', [`%${args.created_by_name}%`]);
      if (user.length > 0) createdById = user[0].id;
    }

    const sql = `INSERT INTO requirements (title, description, business_unit, priority, status, category, project_id, handler_id, receiver_id, requester_name, benefit, planned_start, planned_end, created_by)
      VALUES (?, ?, ?, ?, 'received_not_evaluated', ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const result = mysqlExec(sql.replace(/\?/g, () => {
      const val = [
        args.title,
        args.description || '',
        args.business_unit || '',
        args.priority || 'medium',
        args.category || 'project',
        projectId,
        handlerId,
        receiverId,
        args.business_unit || '',
        args.benefit || '',
        args.planned_start || null,
        args.planned_end || null,
        createdById,
      ][arguments[1] || 0];
      return escapeValue(val);
    }));

    // 获取新需求ID
    const newId = mysqlExec('SELECT LAST_INSERT_ID()');

    // 添加状态日志
    if (newId) {
      mysqlExec(`INSERT INTO status_log (requirement_id, new_status, changed_by) VALUES (${newId}, 'received_not_evaluated', ${createdById})`);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          id: parseInt(newId) || 0,
          message: `需求 #${newId} 创建成功：${args.title}`,
          details: {
            title: args.title,
            project: args.project_name || '未指定',
            priority: PRIORITY_MAP[args.priority || 'medium'],
            handler: args.handler_name || '未指定',
            status: '仅接收，未评估',
          }
        }, null, 2)
      }]
    };
  }
);

// ====== 工具：update_requirement ======
server.tool(
  'update_requirement',
  '修改一条需求的状态、优先级、处理人等信息',
  {
    _token: z.string().optional().describe(TOKEN_PARAM_DESC),
    id: z.number().describe('需求ID（必填）'),
    status: z.string().optional().describe('新状态'),
    priority: z.string().optional().describe('新优先级: high/medium/low'),
    title: z.string().optional().describe('新标题'),
    description: z.string().optional().describe('新描述'),
    handler_name: z.string().optional().describe('新处理人姓名'),
    planned_end: z.string().optional().describe('新计划结束日期，格式 YYYY-MM-DD'),
  },
  async (args) => {
    // HTTP API 模式
    if (USE_HTTP) {
      const body = {};
      if (args.status) body.status = args.status;
      if (args.priority) body.priority = args.priority;
      if (args.title) body.title = args.title;
      if (args.description) body.description = args.description;
      if (args.handler_name) body.handler_name = args.handler_name;
      if (args.planned_end) body.planned_end = args.planned_end;
      const data = await httpApiWithToken(`/api/requirements/${args.id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }, getTokenFromArgs(args));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ success: true, message: `需求 #${args.id} 已更新`, ...data }, null, 2)
        }]
      };
    }

    // 直连数据库模式
    const existing = query('SELECT * FROM requirements WHERE id = ?', [args.id]);
    if (existing.length === 0) {
      return { content: [{ type: 'text', text: `需求 #${args.id} 不存在` }] };
    }

    const updates = [];
    const logEntries = [];

    if (args.status) {
      updates.push(`status = '${args.status}'`);
      logEntries.push(`状态: ${STATUS_MAP[existing[0].status]} → ${STATUS_MAP[args.status]}`);
    }
    if (args.priority) {
      updates.push(`priority = '${args.priority}'`);
      logEntries.push(`优先级: ${PRIORITY_MAP[existing[0].priority]} → ${PRIORITY_MAP[args.priority]}`);
    }
    if (args.title) {
      updates.push(`title = ${escapeValue(args.title)}`);
    }
    if (args.description) {
      updates.push(`description = ${escapeValue(args.description)}`);
    }
    if (args.handler_name) {
      const user = query('SELECT id FROM users WHERE display_name LIKE ?', [`%${args.handler_name}%`]);
      if (user.length > 0) {
        updates.push(`handler_id = ${user[0].id}`);
        logEntries.push(`处理人: → ${args.handler_name}`);
      }
    }
    if (args.planned_end) {
      updates.push(`planned_end = '${args.planned_end}'`);
    }

    if (updates.length === 0) {
      return { content: [{ type: 'text', text: '没有提供需要更新的字段' }] };
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    mysqlExec(`UPDATE requirements SET ${updates.join(', ')} WHERE id = ${args.id}`);

    // 记录状态变更日志
    if (args.status) {
      mysqlExec(`INSERT INTO status_log (requirement_id, old_status, new_status, changed_by) VALUES (${args.id}, '${existing[0].status}', '${args.status}', 1)`);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          message: `需求 #${args.id} 已更新`,
          changes: logEntries,
        }, null, 2)
      }]
    };
  }
);

// ====== 工具：list_projects ======
server.tool(
  'list_projects',
  '列出所有项目',
  {
    _token: z.string().optional().describe(TOKEN_PARAM_DESC),
  },
  async (args) => {
    if (USE_HTTP) {
      const data = await httpApiWithToken('/api/projects', {}, getTokenFromArgs(args));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    const projects = query('SELECT id, name, description, status FROM projects ORDER BY id');
    return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
  }
);

// ====== 工具：list_users ======
server.tool(
  'list_users',
  '列出系统用户',
  {
    _token: z.string().optional().describe(TOKEN_PARAM_DESC),
  },
  async (args) => {
    if (USE_HTTP) {
      const data = await httpApiWithToken('/api/users', {}, getTokenFromArgs(args));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    const users = query(`
      SELECT u.id, u.username, u.display_name, u.email,
        GROUP_CONCAT(r.label) as roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      GROUP BY u.id
      ORDER BY u.id
    `);
    return { content: [{ type: 'text', text: JSON.stringify(users, null, 2) }] };
  }
);

// ====== 工具：get_dashboard_stats ======
server.tool(
  'get_dashboard_stats',
  '获取需求统计数据（按状态、优先级、项目分布）',
  {
    _token: z.string().optional().describe(TOKEN_PARAM_DESC),
  },
  async (args) => {
    if (USE_HTTP) {
      const data = await httpApiWithToken('/api/dashboard', {}, getTokenFromArgs(args));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
    const total = query('SELECT COUNT(*) as count FROM requirements');
    const byStatus = query('SELECT status, COUNT(*) as count FROM requirements GROUP BY status');
    const byPriority = query('SELECT priority, COUNT(*) as count FROM requirements GROUP BY priority');
    const byProject = query(`
      SELECT p.name as project, COUNT(r.id) as count
      FROM projects p
      LEFT JOIN requirements r ON r.project_id = p.id
      GROUP BY p.id ORDER BY count DESC
    `);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: total[0]?.count || 0,
          byStatus: byStatus.map(s => ({ ...s, label: STATUS_MAP[s.status] || s.status })),
          byPriority: byPriority.map(p => ({ ...p, label: PRIORITY_MAP[p.priority] || p.priority })),
          byProject,
        }, null, 2)
      }]
    };
  }
);

// ====== 工具：get_schema ======
server.tool(
  'get_schema',
  '获取数据库表结构。不传参数返回所有表列表，传 table 参数返回该表的详细字段信息',
  {
    _token: z.string().optional().describe(TOKEN_PARAM_DESC),
    table: z.string().optional().describe('表名，如 requirements、users、projects'),
  },
  async (args) => {
    if (USE_HTTP) {
      const data = await httpApiWithToken('/api/database', {}, getTokenFromArgs(args));
      if (args.table && data.tables) {
        const table = data.tables.find(t => t.name === args.table);
        return { content: [{ type: 'text', text: JSON.stringify(table || { error: `表 '${args.table}' 不存在` }, null, 2) }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }

    if (!args.table) {
      const tables = query("SELECT TABLE_NAME as name, TABLE_COMMENT as comment FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'rms'");
      return { content: [{ type: 'text', text: JSON.stringify(tables, null, 2) }] };
    }

    const cols = query(
      "SELECT COLUMN_NAME as name, COLUMN_TYPE as type, IS_NULLABLE as nullable, COLUMN_KEY as 'key', COLUMN_COMMENT as comment FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'rms' AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
      [args.table]
    );

    if (cols.length === 0) {
      return { content: [{ type: 'text', text: `表 '${args.table}' 不存在` }] };
    }

    return { content: [{ type: 'text', text: JSON.stringify({ table: args.table, columns: cols }, null, 2) }] };
  }
);

// ====== 启动服务器 ======
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[RMS MCP Server] 已启动，等待连接...');
}

main().catch(err => {
  console.error('[RMS MCP Server] 启动失败:', err);
  process.exit(1);
});
