/**
 * OpenAPI 规范自动生成器
 *
 * 扫描 src/app/api/ 目录结构，按 Next.js App Router 约定自动生成 paths。
 * 每个路由文件导出的 HTTP 方法（GET/POST/PUT/PATCH/DELETE）自动映射到对应 operation。
 *
 * 运行方式：独立脚本，`node scripts/generate-openapi.mjs`
 * 输出：src/lib/generated-openapi.ts（静态 import，避免运行时扫描）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(__dirname, '..', 'src', 'app', 'api');
const OUTPUT = path.resolve(__dirname, '..', 'src', 'lib', 'openapi-spec.ts');

// 需要忽略的目录（系统内部路由）
const IGNORE_PREFIXES = ['admin/', 'public-files/', 'files/'];

// 已知的描述信息（手动补全关键路径）
const PATH_DESCRIPTIONS = {
  '/requirements': {
    get: '列出需求（支持分页、筛选、排序）',
    post: '创建新需求',
  },
  '/requirements/[id]': {
    get: '获取需求详情',
    put: '更新需求',
    delete: '删除需求',
  },
  '/requirements/[id]/status': { patch: '更新需求状态' },
  '/requirements/[id]/comments': { get: '获取需求评论', post: '添加评论' },
  '/requirements/[id]/work-logs': { get: '获取需求工时记录', post: '添加工时记录' },
  '/requirements/[id]/versions': { get: '获取需求版本历史' },
  '/requirements/[id]/acceptance-criteria': { get: '获取验收标准', post: '添加验收标准' },
  '/requirements/[id]/checklist': { get: '获取需求检查清单', post: '添加检查项' },
  '/requirements/[id]/recommendations': { get: '获取知识推荐' },
  '/requirements/import': { post: '导入需求（Excel）' },
  '/requirements/export': { get: '导出需求（CSV）' },
  '/requirements/batch': { post: '批量操作需求' },
  '/projects': { get: '列出项目', post: '创建项目' },
  '/projects/[id]': { get: '获取项目详情', put: '更新项目', delete: '删除项目' },
  '/projects/[id]/milestones': { get: '获取项目里程碑', post: '创建里程碑' },
  '/projects/[id]/risks': { get: '获取项目风险', post: '创建风险' },
  '/projects/[id]/budget': { get: '获取项目预算', post: '设置预算' },
  '/projects/[id]/costs': { get: '获取项目成本', post: '记录成本' },
  '/projects/[id]/health': { get: '获取项目健康检查' },
  '/knowledge': { get: '列出知识条目', post: '创建知识' },
  '/knowledge/[id]': { get: '获取知识详情', put: '更新知识', delete: '删除知识' },
  '/knowledge/[id]/versions': { get: '获取知识版本历史' },
  '/knowledge/[id]/feedback': { post: '提交知识反馈' },
  '/knowledge/[id]/review': { post: '提交知识审核' },
  '/knowledge/[id]/related-requirements': { get: '获取关联需求' },
  '/knowledge/categories': { get: '获取知识分类', post: '创建分类' },
  '/knowledge/categories/[id]': { put: '更新分类', delete: '删除分类' },
  '/knowledge/categories/[id]/acl': { get: '获取分类权限', put: '设置分类权限' },
  '/knowledge/capture-tasks': { get: '获取沉淀待办', post: '创建沉淀任务' },
  '/knowledge/generate': { post: 'AI 生成知识条目' },
  '/knowledge/graph': { get: '获取知识图谱数据' },
  '/knowledge/stats': { get: '获取知识统计' },
  '/knowledge/review-tasks': { get: '获取审核任务', post: '创建审核任务' },
  '/knowledge/scan-stale': { post: '扫描失效知识' },
  '/search': { get: '全局搜索' },
  '/search/suggest': { get: '搜索建议' },
  '/users': { get: '列出用户', post: '创建用户' },
  '/user': { get: '获取当前用户', put: '更新当前用户' },
  '/user/theme': { put: '更新主题偏好' },
  '/user/menu-permissions': { get: '获取菜单权限' },
  '/auth/login': { post: '用户登录' },
  '/auth/logout': { post: '用户登出' },
  '/auth/me': { get: '获取当前登录用户' },
  '/auth/register': { post: '用户注册' },
  '/auth/tokens': { get: '列出 API Token', post: '创建 Token', delete: '删除 Token' },
  '/roles': { get: '列出角色', post: '创建角色' },
  '/dashboard': { get: '获取仪表盘数据' },
  '/dashboard-widgets': { get: '获取仪表盘组件', post: '添加组件' },
  '/calendar': { get: '获取日历数据' },
  '/sprints': { get: '列出迭代', post: '创建迭代' },
  '/sprints/[id]': { get: '获取迭代详情', put: '更新迭代' },
  '/sprints/[id]/requirements': { get: '获取迭代需求', post: '添加需求到迭代' },
  '/sprints/[id]/burndown': { get: '获取燃尽图数据' },
  '/tags': { get: '列出标签', post: '创建标签' },
  '/workflows': { get: '列出工作流', post: '创建工作流' },
  '/workflow-instances': { get: '列出工作流实例', post: '启动工作流实例' },
  '/workflow-monitor': { get: '获取工作流监控数据' },
  '/workflows/designer': { get: '获取工作流设计器数据' },
  '/workflows/monitor': { get: '获取工作流监控视图' },
  '/notifications': { get: '获取通知列表', post: '创建通知', put: '标记已读', delete: '删除通知' },
  '/sla/dashboard': { get: '获取 SLA 看板' },
  '/sla/scan': { post: '手动触发 SLA 扫描' },
  '/sla/warnings': { get: '获取 SLA 预警列表' },
  '/sla/warnings/[id]/ack': { post: '确认 SLA 预警' },
  '/checklist': { get: '获取检查清单', post: '创建检查项' },
  '/checklist/[id]': { get: '获取检查项详情', put: '更新检查项', delete: '删除检查项' },
  '/checklist/my': { get: '获取我的检查项' },
  '/work-logs': { get: '获取工时记录', post: '创建工时记录' },
  '/work-logs/[id]': { put: '更新工时记录', delete: '删除工时记录' },
  '/workload/requirements': { get: '获取需求工作量' },
  '/workload/members': { get: '获取成员工作量' },
  '/workload/projects': { get: '获取项目工作量' },
  '/workload/capacity': { get: '获取产能数据' },
  '/custom-reports': { get: '列出自定义报表', post: '创建报表' },
  '/custom-reports/[id]': { get: '获取报表详情', put: '更新报表', delete: '删除报表' },
  '/data-sources': { get: '列出数据源', post: '创建数据源' },
  '/data-sources/[id]': { get: '获取数据源详情', put: '更新数据源', delete: '删除数据源' },
  '/data-sources/query': { post: '执行数据源查询' },
  '/data-sources/schema': { get: '获取数据源 schema' },
  '/data-sources/tables': { get: '获取数据源表列表' },
  '/db-explorer': { get: '获取数据库探索数据', post: '执行 SQL 查询' },
  '/config': { get: '获取系统配置', put: '更新系统配置' },
  '/health': { get: '健康检查' },
  '/audit-logs': { get: '获取审计日志' },
  '/dedup/check': { post: '检查重复需求' },
  '/attachments': { post: '上传附件' },
  '/templates': { get: '获取模板列表', post: '创建模板' },
  '/timeline': { get: '获取时间线数据' },
  '/integrations/feishu/callback': { post: '飞书事件回调' },
  '/v1/webhooks': { get: '列出 Webhook 订阅', post: '创建 Webhook 订阅' },
  '/v1/webhooks/[id]': { patch: '更新 Webhook 订阅', delete: '删除 Webhook 订阅' },
  '/v1/webhooks/[id]/deliveries': { get: '获取投递记录' },
  '/v1/webhooks/[id]/test': { post: '测试 Webhook' },
  '/v1/docs': { get: 'Swagger UI 文档页面' },
  '/v1/openapi.json': { get: 'OpenAPI 规范 JSON' },
  '/chat': { post: '发送聊天消息' },
  '/chat/conversations': { get: '列出对话', post: '创建对话' },
  '/chat/conversations/[id]': { get: '获取对话', delete: '删除对话' },
  '/chat/conversations/[id]/messages': { get: '获取对话消息', post: '发送消息' },
  '/chat/sessions': { get: '列出会话', post: '创建会话' },
  '/chat/sessions/[id]': { get: '获取会话', delete: '删除会话' },
  '/chat/sessions/[id]/messages': { get: '获取会话消息' },
  '/chat/llm': { post: 'LLM 对话（RMS Agent）' },
  '/openclaw': { post: 'OpenClaw Agent 对话' },
  '/openclaw/models': { get: '获取可用模型列表' },
  '/admin/users': { get: '管理员：列出用户', post: '管理员：创建用户' },
  '/admin/config': { get: '管理员：获取配置', post: '管理员：更新配置' },
  '/admin/migrations/verify': { get: '验证数据库迁移状态' },
  '/admin/integrations': { get: '管理员：列出集成配置', post: '管理员：创建集成配置' },
  '/admin/integrations/[id]': { patch: '管理员：更新集成配置', delete: '管理员：删除集成配置' },
  '/admin/integrations/[id]/test': { post: '测试集成配置' },
  '/admin/dedup/scan': { post: '扫描重复需求' },
  '/admin/dedup/merge': { post: '合并重复需求' },
  '/admin/dedup/split': { post: '拆分需求' },
  '/admin/field-policies': { get: '列出字段权限策略', post: '创建策略' },
  '/admin/field-policies/[id]': { put: '更新策略', delete: '删除策略' },
  '/admin/menu-permissions': { get: '获取菜单权限配置', post: '更新菜单权限配置' },
  '/admin/webhook-worker': { get: '获取 Webhook Worker 状态', post: '触发手动投递' },
  '/admin/integrations/messages': { get: '获取集成消息列表' },
  '/admin/integrations/skill-download': { post: '下载 MCP Skill' },
  '/database': { get: '获取数据库状态', post: '执行数据库操作' },
  '/i18n/locale': { get: '获取当前语言', post: '切换语言' },
  '/asr': { post: '语音识别' },
  '/tts': { post: '语音合成' },
  '/requirement-relations': { get: '获取需求关系', post: '创建需求关系' },
  '/requirement-relations/[id]': { delete: '删除需求关系' },
  '/reports/weekly': { get: '获取周报', post: '生成周报' },
  '/reports/weekly/history': { get: '获取周报历史' },
  '/acceptance-criteria': { get: '获取验收标准', post: '创建验收标准' },
  '/acceptance-criteria/[id]': { put: '更新验收标准', delete: '删除验收标准' },
  '/acceptance-criteria/reorder': { post: '重新排序验收标准' },
  '/tags': { get: '列出所有标签', post: '创建标签' },
};

// 已知的查询参数
const KNOWN_PARAMS = {
  '/requirements': [
    { name: 'status', in: 'query', schema: { type: 'string' }, description: '状态筛选' },
    { name: 'priority', in: 'query', schema: { type: 'string', enum: ['high', 'medium', 'low'] }, description: '优先级筛选' },
    { name: 'project_id', in: 'query', schema: { type: 'integer' }, description: '项目 ID' },
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 }, description: '每页条数' },
    { name: 'search', in: 'query', schema: { type: 'string' }, description: '搜索关键词' },
  ],
  '/search': [
    { name: 'keyword', in: 'query', schema: { type: 'string' }, required: true, description: '搜索关键词' },
    { name: 'type', in: 'query', schema: { type: 'string', enum: ['requirement', 'project', 'knowledge'] }, description: '搜索类型' },
  ],
  '/projects': [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 }, description: '每页条数' },
  ],
  '/knowledge': [
    { name: 'category_id', in: 'query', schema: { type: 'integer' }, description: '分类 ID' },
    { name: 'tag', in: 'query', schema: { type: 'string' }, description: '标签筛选' },
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 }, description: '每页条数' },
  ],
  '/notifications': [
    { name: 'unread', in: 'query', schema: { type: 'boolean' }, description: '仅未读' },
  ],
  '/sprints': [
    { name: 'project_id', in: 'query', schema: { type: 'integer' }, description: '项目 ID' },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['planning', 'active', 'completed'] }, description: '迭代状态' },
  ],
  '/work-logs': [
    { name: 'user_id', in: 'query', schema: { type: 'integer' }, description: '用户 ID' },
    { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' }, description: '开始日期' },
    { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' }, description: '结束日期' },
    { name: 'requirement_id', in: 'query', schema: { type: 'integer' }, description: '需求 ID' },
  ],
  '/users': [
    { name: 'search', in: 'query', schema: { type: 'string' }, description: '搜索关键词' },
  ],
  '/audit-logs': [
    { name: 'user_id', in: 'query', schema: { type: 'integer' }, description: '用户 ID' },
    { name: 'action', in: 'query', schema: { type: 'string' }, description: '操作类型' },
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 50 }, description: '每页条数' },
  ],
  '/checklist': [
    { name: 'project_id', in: 'query', schema: { type: 'integer' }, description: '项目 ID' },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'completed'] }, description: '状态' },
  ],
  '/workload/members': [
    { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' }, description: '开始日期' },
    { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' }, description: '结束日期' },
  ],
  '/workload/requirements': [
    { name: 'project_id', in: 'query', schema: { type: 'integer' }, description: '项目 ID' },
  ],
  '/workload/projects': [
    { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' }, description: '开始日期' },
    { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' }, description: '结束日期' },
  ],
  '/sla/warnings': [
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'acknowledged', 'resolved'] }, description: '预警状态' },
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 }, description: '每页条数' },
  ],
  '/custom-reports': [
    { name: 'type', in: 'query', schema: { type: 'string', enum: ['report', 'dashboard'] }, description: '类型' },
  ],
  '/data-sources': [
    { name: 'type', in: 'query', schema: { type: 'string', enum: ['mysql', 'sqlite', 'api'] }, description: '数据源类型' },
  ],
  '/tags': [
    { name: 'search', in: 'query', schema: { type: 'string' }, description: '搜索关键词' },
  ],
  '/sprints/[id]/requirements': [
    { name: 'status', in: 'query', schema: { type: 'string' }, description: '需求状态' },
  ],
  '/admin/webhook-worker': [
    { name: 'status', in: 'query', schema: { type: 'boolean' }, description: '是否运行中' },
  ],
  '/admin/integrations/messages': [
    { name: 'config_id', in: 'query', schema: { type: 'integer' }, description: '集成配置 ID' },
    { name: 'status', in: 'query', schema: { type: 'string' }, description: '消息状态' },
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 }, description: '每页条数' },
  ],
  '/v1/webhooks': [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 }, description: '每页条数' },
  ],
  '/v1/webhooks/[id]/deliveries': [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 }, description: '每页条数' },
    { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'in_progress', 'delivered', 'failed'] }, description: '投递状态' },
  ],
  '/chat/conversations': [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 }, description: '每页条数' },
  ],
  '/chat/sessions': [
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 }, description: '每页条数' },
  ],
  '/chat/sessions/[id]/messages': [
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: '返回条数' },
    { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' }, description: '早于该时间' },
  ],
  '/chat/conversations/[id]/messages': [
    { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: '返回条数' },
    { name: 'before', in: 'query', schema: { type: 'string', format: 'date-time' }, description: '早于该时间' },
  ],
  '/workflow-instances': [
    { name: 'workflow_id', in: 'query', schema: { type: 'integer' }, description: '工作流 ID' },
    { name: 'status', in: 'query', schema: { type: 'string' }, description: '实例状态' },
    { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: '页码' },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 30 }, description: '每页条数' },
  ],
};

// 扫描目录结构，返回 API 路径列表
function scanApiRoutes(dir, prefix = '') {
  const routes = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // 过滤忽略前缀
      const relPath = prefix + '/' + entry.name;
      if (IGNORE_PREFIXES.some(p => relPath.startsWith('/' + p))) continue;
      routes.push(...scanApiRoutes(fullPath, relPath));
    } else if (entry.name === 'route.ts' && prefix) {
      routes.push(prefix);
    }
  }

  return routes;
}

// Next.js 动态路由 [param] → {param}
function pathToOpenApi(p) {
  return p.replace(/\[([^\]]+)\]/g, '{$1}');
}

// HTTP 方法名列表
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// 生成 OpenAPI spec
async function generate() {
  // 扫描真实目录
  const rawRoutes = scanApiRoutes(API_DIR, '');
  const routeSet = new Set(rawRoutes);

  // 也加入 PATH_DESCRIPTIONS 里有的但不一定在扫描结果中的路径
  for (const p of Object.keys(PATH_DESCRIPTIONS)) {
    routeSet.add(p);
  }

  // 排序
  const sorted = Array.from(routeSet).sort();

  // 构建 paths
  const paths = {};

  for (const rawPath of sorted) {
    const openApiPath = pathToOpenApi(rawPath);
    const desc = PATH_DESCRIPTIONS[rawPath];
    const params = KNOWN_PARAMS[rawPath] || [];

    // 检查该路径下有哪些 HTTP 方法
    const operations = {};

    // 尝试从目录推断
    const dirPath = path.join(API_DIR, rawPath.replace(/^\/+/, ''));
    const routeFile = path.join(dirPath, 'route.ts');

    let methods = [];
    if (fs.existsSync(routeFile)) {
      const content = fs.readFileSync(routeFile, 'utf-8');
      for (const method of HTTP_METHODS) {
        if (content.includes(`export async function ${method.toUpperCase()}`) ||
            content.includes(`export async function ${method}(`)) {
          methods.push(method);
        }
      }
    }

    // 如果有描述信息，用描述信息里定义的方法
    if (desc) {
      const descMethods = new Set();
      for (const [method, summary] of Object.entries(desc)) {
        if (summary) {
          descMethods.add(method);
          operations[method] = {
            summary,
            tags: [rawPath.split('/')[1] || 'general'],
            parameters: [...params],
            responses: {
              '200': { description: '成功' },
              '401': { description: '未登录' },
              '403': { description: '无权限' },
            },
          };
        }
      }
      // 还包括扫描到的方法不在描述中的
      for (const method of methods) {
        if (!descMethods.has(method)) {
          operations[method] = {
            summary: `${method.toUpperCase()} ${rawPath}`,
            tags: [rawPath.split('/')[1] || 'general'],
            parameters: [...params],
            responses: {
              '200': { description: '成功' },
              '401': { description: '未登录' },
              '403': { description: '无权限' },
            },
          };
        }
      }
    } else {
      // 没有描述，用扫描到的
      for (const method of methods) {
        operations[method] = {
          summary: `${method.toUpperCase()} ${rawPath}`,
          tags: [rawPath.split('/')[1] || 'general'],
          parameters: [...params],
          responses: {
            '200': { description: '成功' },
            '401': { description: '未登录' },
            '403': { description: '无权限' },
          },
        };
      }
    }

    if (Object.keys(operations).length > 0) {
      // 动态路由参数
      const pathParams = (openApiPath.match(/\{(\w+)\}/g) || []).map((p) => ({
        name: p.slice(1, -1),
        in: 'path',
        required: true,
        schema: { type: 'integer' },
        description: `${p.slice(1, -1)} ID`,
      }));

      for (const op of Object.values(operations)) {
        if (pathParams.length > 0) {
          op.parameters = [...pathParams, ...(op.parameters || [])];
        }
      }

      // POST/PUT/PATCH 加 requestBody
      for (const [method, op] of Object.entries(operations)) {
        if (['post', 'put', 'patch'].includes(method)) {
          op.requestBody = {
            required: true,
            content: { 'application/json': { schema: { type: 'object' } } },
          };
        }
      }

      paths[openApiPath] = operations;
    }
  }

  // 构建完整 spec
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'RMS API v1',
      version: '1.0.0',
      description: '用户需求管理系统 REST API · 自动生成',
      contact: { name: 'RMS Team' },
    },
    servers: [
      { url: '/api', description: '当前服务器' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'JWT Token（登录后自动设置）',
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Bearer <token> 或 Access Token 直接作为 Bearer',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', description: '错误信息' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            pageSize: { type: 'integer' },
            total: { type: 'integer' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
    'x-tagGroups': [
      { name: '需求', tags: ['requirements'] },
      { name: '项目', tags: ['projects'] },
      { name: '知识库', tags: ['knowledge'] },
      { name: '搜索', tags: ['search'] },
      { name: '用户与认证', tags: ['user', 'users', 'auth', 'roles'] },
      { name: '通知', tags: ['notifications'] },
      { name: '工作流', tags: ['workflows', 'workflow-instances', 'workflow-monitor'] },
      { name: '迭代', tags: ['sprints'] },
      { name: '工时', tags: ['work-logs', 'workload'] },
      { name: 'SLA', tags: ['sla'] },
      { name: '检查清单', tags: ['checklist'] },
      { name: '标签', tags: ['tags'] },
      { name: '自定义报表', tags: ['custom-reports', 'data-sources'] },
      { name: '日历', tags: ['calendar', 'timeline'] },
      { name: '仪表盘', tags: ['dashboard', 'dashboard-widgets'] },
      { name: '对话 & AI', tags: ['chat', 'openclaw'] },
      { name: '系统管理', tags: ['admin', 'config', 'health', 'audit-logs', 'database', 'dedup'] },
      { name: 'Webhook', tags: ['v1'] },
      { name: '集成', tags: ['integrations'] },
      { name: '系统工具', tags: ['i18n', 'asr', 'tts', 'attachments', 'templates', 'files'] },
      { name: '其他', tags: ['general'] },
    ],
  };

  // 输出
  const output = `// 自动生成于 ${new Date().toISOString()}
// 运行 \`node scripts/generate-openapi.mjs\` 重新生成
export const OPENAPI_SPEC: any = ${JSON.stringify(spec, null, 2)};
`;

  fs.writeFileSync(OUTPUT, output, 'utf-8');
  console.log(`✅ OpenAPI 规范已生成: ${OUTPUT}`);
  console.log(`   共 ${Object.keys(paths).length} 个路径`);
}

generate().catch(console.error);