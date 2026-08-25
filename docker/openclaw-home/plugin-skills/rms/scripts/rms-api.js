#!/usr/bin/env node
/**
 * RMS 混合客户端
 * 优先通过 MCP Server 调用，MCP 不可用时 fallback 到 HTTP API
 * 
 * 用法: node rms-api.js <command> [JSON参数]
 * 
 * 环境变量:
 *   RMS_BASE_URL      - RMS HTTP 服务器地址，默认 http://localhost:3800
 *   RMS_ACCESS_TOKEN   - Access Token（HTTP 模式必填）
 *   RMS_MCP_PATH       - MCP 服务器脚本路径，默认 /root/rms-mcp-server.js
 *   RMS_MCP_HOST       - MCP SSE 服务器地址（可选，启用远程 MCP）
 *   RMS_MCP_PORT       - MCP SSE 服务器端口（可选，默认 3900）
 */

const { spawn } = require('child_process');
const path = require('path');

const BASE_URL = process.env.RMS_BASE_URL || 'http://localhost:3800';
const TOKEN = process.env.RMS_ACCESS_TOKEN || '';
const MCP_PATH = process.env.RMS_MCP_PATH || '/root/rms-mcp-server.js';
const MCP_HOST = process.env.RMS_MCP_HOST || '';
const MCP_PORT = parseInt(process.env.RMS_MCP_PORT || '3900');

// ========== MCP 客户端 ==========

class McpClient {
  constructor() {
    this.proc = null;
    this.pending = new Map();
    this.nextId = 1;
    this.buffer = '';
    this.ready = false;
    this.timeout = 15000;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.proc = spawn('node', [MCP_PATH], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        });

        this.proc.stdout.on('data', (data) => {
          this.buffer += data.toString();
          this._processBuffer();
        });

        this.proc.stderr.on('data', (data) => {
          const msg = data.toString();
          if (msg.includes('已启动') || msg.includes('waiting')) {
            this.ready = true;
            resolve();
          }
        });

        this.proc.on('error', (err) => {
          reject(err);
        });

        this.proc.on('exit', () => {
          this.ready = false;
          for (const [, p] of this.pending) {
            p.reject(new Error('MCP 进程已退出'));
          }
          this.pending.clear();
        });

        // 初始化
        this._sendRaw({
          jsonrpc: '2.0',
          id: this.nextId++,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'rms-skill', version: '1.0.0' },
          },
        });

        // 超时处理
        setTimeout(() => {
          if (!this.ready) {
            this.ready = true; // 即使没收到 stderr 消息也继续
            resolve();
          }
        }, 3000);
      } catch (e) {
        reject(e);
      }
    });
  }

  _processBuffer() {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) {
            p.reject(new Error(msg.error.message || 'MCP 错误'));
          } else {
            p.resolve(msg.result);
          }
        }
      } catch {
        // 非 JSON 输出，忽略
      }
    }
  }

  _sendRaw(msg) {
    if (this.proc && this.proc.stdin.writable) {
      this.proc.stdin.write(JSON.stringify(msg) + '\n');
    }
  }

  async callTool(name, args = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('MCP 调用超时'));
      }, this.timeout);

      this.pending.set(id, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      this._sendRaw({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args },
      });
    });
  }

  close() {
    if (this.proc) {
      this.proc.stdin.end();
      this.proc.kill();
      this.proc = null;
    }
  }
}

// ========== HTTP 客户端 ==========

async function httpApi(path, options = {}) {
  if (!TOKEN) {
    throw new Error('缺少 RMS_ACCESS_TOKEN 环境变量。请先在 RMS 系统「🔑 Token 管理」页面生成 Access Token。');
  }
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// ========== 命令到 MCP 工具的映射 ==========

function extractText(mcpResult) {
  if (!mcpResult || !mcpResult.content) return null;
  const textPart = mcpResult.content.find(c => c.type === 'text');
  if (textPart) {
    try { return JSON.parse(textPart.text); } catch { return textPart.text; }
  }
  return null;
}

const MCP_COMMANDS = {
  search: (args) => ({
    tool: 'search_requirements',
    params: {
      _token: TOKEN || undefined,
      keyword: args.keyword,
      status: args.status,
      priority: args.priority,
      project_name: args.project_name,
      handler_name: args.handler_name,
      limit: args.pageSize || args.limit || 10,
    },
  }),
  get: (args) => ({
    tool: 'get_requirement',
    params: { _token: TOKEN || undefined, id: args.id },
  }),
  create: (args) => ({
    tool: 'create_requirement',
    params: { _token: TOKEN || undefined, ...args },
  }),
  update: (args) => ({
    tool: 'update_requirement',
    params: { _token: TOKEN || undefined, ...args },
  }),
  'list-projects': () => ({
    tool: 'list_projects',
    params: { _token: TOKEN || undefined },
  }),
  'list-users': () => ({
    tool: 'list_users',
    params: { _token: TOKEN || undefined },
  }),
  dashboard: () => ({
    tool: 'get_dashboard_stats',
    params: { _token: TOKEN || undefined },
  }),
};

// ========== HTTP 命令处理 ==========

const HTTP_COMMANDS = {
  search: async (args) => {
    const params = new URLSearchParams();
    if (args.keyword) params.set('keyword', args.keyword);
    if (args.status) params.set('status', args.status);
    if (args.priority) params.set('priority', args.priority);
    if (args.project_id) params.set('project_id', String(args.project_id));
    if (args.page) params.set('page', String(args.page));
    if (args.pageSize) params.set('pageSize', String(args.pageSize));
    return httpApi(`/api/requirements?${params}`);
  },
  get: async (args) => {
    if (!args.id) throw new Error('缺少 id 参数');
    return httpApi(`/api/requirements/${args.id}`);
  },
  create: async (args) => {
    if (!args.title) throw new Error('缺少 title 参数');
    return httpApi('/api/requirements', { method: 'POST', body: JSON.stringify(args) });
  },
  update: async (args) => {
    if (!args.id) throw new Error('缺少 id 参数');
    return httpApi(`/api/requirements/${args.id}`, { method: 'PUT', body: JSON.stringify(args) });
  },
  delete: async (args) => {
    if (!args.id) throw new Error('缺少 id 参数');
    return httpApi(`/api/requirements/${args.id}`, { method: 'DELETE' });
  },
  'list-projects': async () => httpApi('/api/projects'),
  'list-users': async () => httpApi('/api/users'),
  dashboard: async () => httpApi('/api/dashboard'),
  'list-tokens': async () => httpApi('/api/auth/tokens'),
  'audit-logs': async (args) => {
    const params = new URLSearchParams();
    if (args.page) params.set('page', String(args.page));
    if (args.action) params.set('action', args.action);
    if (args.username) params.set('username', args.username);
    return httpApi(`/api/audit-logs?${params}`);
  },
  health: async () => httpApi('/api/health'),
};

// ========== 主逻辑 ==========

function usage() {
  console.log(`RMS 混合客户端 (MCP 优先 + HTTP Fallback)

用法:
  node rms-api.js <command> [JSON参数]

命令:
  search          搜索需求 (keyword, status, priority, project_id, page, pageSize)
  get             获取需求详情 (id)
  create          创建需求 (title, description, priority, ...)
  update          更新需求 (id, status, priority, ...)
  delete          删除需求 (id)
  list-projects   列出项目
  list-users      列出用户
  dashboard       获取统计数据
  list-tokens     查看我的 Token 列表 (仅 HTTP)
  audit-logs      查看操作日志 (仅 HTTP)
  health          健康检查 (仅 HTTP)

环境变量:
  RMS_BASE_URL      - RMS HTTP 地址，默认 http://localhost:3800
  RMS_ACCESS_TOKEN   - Access Token（HTTP 模式必填）
  RMS_MCP_PATH       - MCP 脚本路径，默认 /root/rms-mcp-server.js

示例:
  node rms-api.js search '{"keyword":"登录","status":"in_progress"}'
  node rms-api.js create '{"title":"新需求","priority":"high"}'
  node rms-api.js dashboard
`);
}

async function main() {
  const [,, cmd, argsJson] = process.argv;

  if (!cmd || cmd === 'help' || cmd === '--help') {
    usage();
    return;
  }

  const args = argsJson ? JSON.parse(argsJson) : {};
  const mcpMapping = MCP_COMMANDS[cmd];

  // 优先尝试 MCP
  if (mcpMapping) {
    let mcp = null;
    try {
      mcp = new McpClient();
      await mcp.connect();
      const { tool, params } = mcpMapping(args);
      const result = await mcp.callTool(tool, params);
      const parsed = extractText(result);
      console.log(JSON.stringify(parsed || result, null, 2));
      mcp.close();
      return;
    } catch (mcpErr) {
      // MCP 失败，fallback 到 HTTP
      if (mcp) mcp.close();
      console.error(JSON.stringify({ _fallback: true, _mcp_error: mcpErr.message }));
    }
  }

  // Fallback: HTTP API
  const httpHandler = HTTP_COMMANDS[cmd];
  if (!httpHandler) {
    console.error(JSON.stringify({ error: `未知命令: ${cmd}` }));
    process.exit(1);
  }

  try {
    const result = await httpHandler(args);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  }
}

main();
