# RMS 用户需求管理系统 · 详细设计文档

> **版本**：v1.0 · 2026-06  
> **目标读者**：架构师 / 后端开发 / 运维 / 二次开发者  
> **代码仓库**：`/home/itd3/www/rms`  
> **服务地址**：`http://localhost:3800`

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [功能模块](#3-功能模块)
4. [数据库设计](#4-数据库设计)
5. [状态流转](#5-状态流转)
6. [认证与授权](#6-认证与授权)
7. [MCP 集成（Token 透传）](#7-mcp-集成token-透传)
8. [部署架构](#8-部署架构)
9. [构建与发布](#9-构建与发布)
10. [附录：API 总览](#10-附录api-总览)

---

## 1. 项目概述

### 1.1 业务定位

**RMS（Requirement Management System）** 是一套面向中小型团队的需求收集、管理、跟踪与分析平台。它解决以下问题：

- 业务方反馈的需求散落在邮件、IM、Word 中，没有统一入口
- 需求从提出到上线过程不透明，谁在处理、卡在哪一步不清楚
- 历史需求无法复用，重复开发多
- 缺乏数据支撑，不知道团队产能、瓶颈需求类型、延期原因

### 1.2 核心能力

| 能力 | 描述 |
|------|------|
| 需求全生命周期 | 接收 → 评估 → 排期 → 处理 → 完成 → 验证 → 关闭 |
| 多角色协作 | 全局管理员 / 项目接收员 / 处理人 / 查看员 四种角色 |
| 多维度视图 | 列表 / 看板 / 甘特 / 仪表盘 / 日历 / 知识图谱 |
| 知识沉淀 | 处理完的需求可一键沉淀为知识条目，AI 辅助关联 |
| AI 集成 | LLM 聊天、AI 生成知识、需求摘要、智能分析 |
| MCP 协议 | 标准 MCP Server + Token 透传，AI 客户端可直接操作 |
| 第三方登录 | 企微 / 飞书 / 钉钉 OAuth 2.0 |
| 审计可追溯 | 登录、CRUD、状态变更、配置修改全部记录 |

### 1.3 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 前端 | Next.js 15 App Router + React 19 | SSR + Server Components |
| 样式 | Tailwind CSS 4 | 原子化 CSS |
| 语言 | TypeScript 5 | 严格模式 |
| 后端 | Next.js API Routes | 49 个路由 |
| 数据库 | MySQL 8.0 (生产) / SQLite (开发) | 双引擎自动切换 |
| ORM | 自研 `lib/db.ts` | 适配 better-sqlite3 + mysql CLI |
| 认证 | JWT (jsonwebtoken) + bcryptjs | 7 天有效期 |
| MCP | Node.js + stdio/SSE | 15+ 工具 |
| AI 客户端 | OpenClaw Gateway (port 18789) | 本地 Agent 编排 |
| 进程管理 | PM2 | 启动 / 重启 / 日志 |
| 备份 | mysqldump + cron | 每日 03:00，保留 30 天 |

---

## 2. 系统架构

### 2.1 总体架构

![总体架构](./images/architecture-overview.png)

**四层结构：**

1. **用户层** — 浏览器、AI Agent、第三方 OAuth 用户
2. **应用层** — Next.js 15 (前端 + API) + MCP Server + 核心服务层
3. **数据层** — MySQL 8.0 (生产) / SQLite (开发) + 文件系统
4. **外部集成** — OAuth 提供方 / LLM / ASR·TTS / OpenClaw / MCP 客户端

### 2.2 核心服务层 (`src/lib/`)

| 文件 | 职责 |
|------|------|
| `db.ts` | 数据库抽象层，统一 SQLite / MySQL API；自动建表；SQL 转义 |
| `auth.ts` | JWT 签发与校验、bcrypt 密码、Cookie、Access Token 哈希、审计日志 |
| `middleware.ts` | 全局请求拦截，鉴权，白名单路径，注入 user headers |
| `knowledge.ts` | 知识条目 CRUD、图谱构建、嵌入向量 |
| `notification.ts` | 通知生成与分发（站内 / 邮件） |
| `workflow.ts` | 状态机定义，自动化规则（指派 / 通知 / 升级） |

### 2.3 API 路由层（49 个 endpoint）

按业务域分组：

```
/api/auth/*           认证（11 路由）
/api/requirements/*   需求 CRUD + 状态流转
/api/projects/*       项目管理
/api/users/*          用户 + 角色
/api/roles/*          角色定义
/api/dashboard/*      仪表盘聚合
/api/knowledge/*      知识库
/api/chat/*           AI 聊天
/api/chat/llm/*       LLM 直连
/api/config/*         系统配置
/api/audit-logs/*     审计日志
/api/auth/tokens/*    Access Token
/api/attachments/*    附件
/api/comments/*       评论
/api/tags/*           标签
/api/calendar/*       日历
/api/kanban/*         看板
/api/gantt/*          甘特
/api/workload/*       工作量
/api/openclaw/*       OpenClaw 会话
/api/files/*          文件下载
/api/asr/*            语音转文字
/api/admin/*          管理后台
/api/health           健康检查
```

---

## 3. 功能模块

### 3.1 模块全景图

![功能模块](./images/modules.png)

### 3.2 模块清单

| # | 模块 | 主要页面 | 主要 API | 关键功能 |
|---|------|----------|----------|----------|
| 1 | **需求管理** | `/requirements`、`/requirements/[id]` | `/api/requirements/*` | CRUD、状态流转、附件、评论、标签、关系、父子需求 |
| 2 | **仪表盘** | `/dashboard` | `/api/dashboard`、`/api/dashboard/workload` | KPI 卡片、趋势图、状态分布、逾期、重复检测 |
| 3 | **项目管理** | `/projects`、`/projects/[id]` | `/api/projects/*` | 项目生命周期、成员、状态、代码 |
| 4 | **标签 / 关系** | 嵌入需求详情 | `/api/tags/*` | 标签 CRUD、需求-标签、需求-需求关系 |
| 5 | **知识库** | `/knowledge`、`/knowledge/[id]` | `/api/knowledge/*` | 知识条目、图谱、反馈、AI 生成 |
| 6 | **日历** | `/calendar` | `/api/calendar` | 计划日期、截止日期可视化 |
| 7 | **看板** | `/kanban` | `/api/kanban` | 拖拽状态流转 |
| 8 | **甘特图** | `/gantt` | `/api/gantt` | 时间线、依赖、里程碑 |
| 9 | **工作流** | `/workflows` | `/api/workflows` | 状态机配置、自动化规则 |
| 10 | **用户 / 角色** | `/admin/users` | `/api/users/*`、`/api/roles/*` | RBAC、CRUD、角色分配 |
| 11 | **认证授权** | `/login`、`/profile` | `/api/auth/*` | JWT、OAuth、Access Token |
| 12 | **AI 聊天** | `/chat` | `/api/chat`、`/api/chat/llm` | LLM 对话、工具调用、需求分析 |
| 13 | **通知中心** | `/notifications` | `/api/notifications` | 站内消息、已读未读 |
| 14 | **工作量** | `/workload` | `/api/workload` | 按人/项目/时间统计 |
| 15 | **系统配置** | `/admin/config` | `/api/config` | 12 大类 / 65 项热更新 |
| 16 | **Access Token** | `/profile/tokens` | `/api/auth/tokens` | MCP 接入、CLI 自动化 |
| 17 | **集成安装** | `/admin/integrations` | `/api/admin/integrations/*` | MCP / Skill 一键下载 |
| 18 | **审计日志** | `/admin/audit-logs` | `/api/audit-logs` | 登录、CRUD、配置修改全记录 |
| 19 | **数据库管理** | `/admin/database` | `/api/database` | 查看、备份、导入导出 |

---

## 4. 数据库设计

### 4.1 ER 总览

![ER 图](./images/er-diagram.png)

### 4.2 表清单（共 19 张）

#### 4.2.1 用户与权限（4 张）

**users** — 用户主表
```sql
id              INT PK AUTO_INCREMENT
username        VARCHAR(50) UNIQUE
password_hash   VARCHAR(255)         -- bcrypt 哈希
display_name    VARCHAR(100)
email           VARCHAR(200)
auth_type       ENUM(local,wecom,feishu,dingtalk) DEFAULT 'local'
openid          VARCHAR(200)         -- 第三方登录标识
wechat_userid   VARCHAR(200)         -- 企微 userid
unionid         VARCHAR(200)         -- 钉钉 unionid
avatar          VARCHAR(500)
status          ENUM(active,disabled) DEFAULT 'active'
created_at      DATETIME
updated_at      DATETIME
```

**roles** — 角色定义
```sql
id              INT PK
name            VARCHAR(50) UNIQUE   -- global_admin / project_receiver / requirement_handler / requirement_viewer
label           VARCHAR(100)         -- 显示名
description     TEXT
```

**user_roles** — 用户-角色多对多
```sql
user_id, role_id   -- 联合主键
```

**user_project_access** — 用户-项目多对多
```sql
user_id, project_id   -- 联合主键
```

**role_project_access** — 角色-项目多对多
```sql
role_id, project_id   -- 联合主键
```

#### 4.2.2 项目与需求（4 张）

**projects** — 项目
```sql
id              INT PK
name            VARCHAR(200)
code            VARCHAR(50) UNIQUE
description     TEXT
status          ENUM(active,archived,closed) DEFAULT 'active'
business_unit_id INT                     -- 业务单元
owner_id        INT FK→users              -- 项目负责人
start_date      DATE
end_date        DATE
created_at, updated_at
```

**requirements** — 需求（核心表）
```sql
id              INT PK
title           VARCHAR(500)
description     TEXT
status          ENUM(7 个状态，见第 5 节)
priority        ENUM(high,medium,low)
category        ENUM(project,adhoc)
project_id      INT FK→projects
submitter_id    INT FK→users              -- 提交人
handler_id      INT FK→users              -- 处理人
receiver_id     INT FK→users              -- 接收人
parent_id       INT FK→requirements       -- 父需求
start_date, due_date DATE
estimated_hours, actual_hours DECIMAL
created_at, updated_at
```

**status_log** — 状态变更日志
```sql
id, requirement_id, from_status, to_status,
operator_id, comment, created_at
```

**requirement_relations** — 需求关联
```sql
from_requirement_id, to_requirement_id, type (duplicate/related/blocks/parent)
```

#### 4.2.3 协作（4 张）

**comments** — 评论
```sql
id, requirement_id, user_id, content, parent_comment_id, created_at
```

**attachments** — 附件
```sql
id, requirement_id, file_name, file_path, file_size, mime_type, uploaded_by, created_at
```

**tags** — 标签
```sql
id, name, color, description
```

**requirement_tags** — 需求-标签
```sql
requirement_id, tag_id  -- 联合主键
```

#### 4.2.4 知识库（3 张）

**knowledge_entries** — 知识条目
```sql
id, title, content, source_type (manual/requirement/auto),
source_id, embedding (JSON/vector), created_by, created_at
```

**knowledge_relations** — 知识关联
```sql
from_entry_id, to_entry_id, type (related/references)
```

**knowledge_feedback** — 反馈
```sql
id, entry_id, user_id, useful (bool), comment, created_at
```

#### 4.2.5 系统级（4 张）

**system_config** — 系统配置
```sql
key              VARCHAR(200) PK
value            TEXT
label            VARCHAR(200)
description      VARCHAR(500)
category         ENUM(12)         -- general/auth/requirement/display/notification/database/asr_tts/llm/openclaw/wecom/feishu/dingtalk
type             VARCHAR(50)      -- text/number/boolean/select/textarea
sort_order       INT
updated_at       DATETIME
```

**access_tokens** — Access Token
```sql
id, user_id, name, token_hash (sha256), prefix,
last_used_at, created_at
```

**audit_logs** — 审计日志
```sql
id, user_id, username, action, detail,
ip_address, user_agent, created_at
```

**notifications** — 通知
```sql
id, user_id, type, title, content, payload (JSON),
read_at, created_at
```

#### 4.2.6 AI 集成（1 张）

**user_openclaw_sessions** — OpenClaw 会话
```sql
id, user_id, session_id, agent_id, model,
context (JSON), created_at, updated_at
```

### 4.3 索引策略

| 表 | 索引 | 用途 |
|----|------|------|
| users | `username`、`email`、`openid` | 登录与第三方匹配 |
| requirements | `(project_id, status)`、`(handler_id, status)`、`(priority, status)`、`updated_at` | 列表查询 |
| status_log | `(requirement_id, created_at)` | 详情时间线 |
| comments | `(requirement_id, created_at)` | 评论加载 |
| audit_logs | `(user_id, created_at)`、`(action, created_at)` | 审计查询 |
| system_config | `category`、`sort_order` | 分组排序 |
| access_tokens | `token_hash` | 鉴权 |

---

## 5. 状态流转

### 5.1 状态机

![状态流转](./images/status-flow.png)

### 5.2 7 个状态

| 状态 | key | 颜色 | 描述 |
|------|-----|------|------|
| 仅接收未评估 | `received_not_evaluated` | 灰 | 刚提交，未评估 |
| 已评估未排期 | `evaluated_not_scheduled` | 黄 | 已评估但未排期 |
| 已排期 | `scheduled` | 蓝 | 已分配处理人 |
| 处理中 | `in_progress` | 紫 | 正在处理 |
| 已完成 | `completed` | 绿 | 处理人提交完成 |
| 已验证 | `verified` | 青 | QA/业务方验证通过 |
| 已关闭 | `closed` | 深灰 | 流程结束 |

### 5.3 流转规则（可配置）

```
received_not_evaluated  → evaluated_not_scheduled   (评估)
evaluated_not_scheduled → scheduled                   (排期)
scheduled               → in_progress                (开始)
in_progress             → completed                  (提交完成)
completed               → verified                   (QA 验证)
verified                → closed                     (归档)
in_progress             → scheduled                  (退回重新排期)
任意状态                → closed                     (管理员强制关闭)
```

每次状态变更自动写入 `status_log` 表，触发通知给处理人和提交人。

### 5.4 优先级与 SLA

| 优先级 | 评估 SLA | 完成 SLA | 颜色 |
|--------|----------|----------|------|
| 高 | 24h | 3d | 🔴 红 |
| 中 | 3d | 7d | 🟡 黄 |
| 低 | 7d | 14d | 🔵 蓝 |

SLA 在 `system_config` 中可调整。仪表盘上逾期需求标红。

---

## 6. 认证与授权

### 6.1 认证流程

![认证流程](./images/auth-flow.png)

### 6.2 四种登录方式

| 方式 | 路由 | 流程 | 适用场景 |
|------|------|------|----------|
| 用户名+密码 | `POST /api/auth/login` | bcrypt 校验 → JWT 签发 → Cookie | Web 主用 |
| 企微扫码 | `/api/auth/wecom` → `/api/auth/wecom/callback` | OAuth 2.0 → code → userid | 企业内部 |
| 飞书登录 | `/api/auth/feishu` → `/api/auth/feishu/callback` | OAuth 2.0 → openid | 跨平台 |
| 钉钉登录 | `/api/auth/dingtalk` → `/api/auth/dingtalk/callback` | OAuth 2.0 → unionid | 钉钉生态 |
| Access Token | `Authorization: Bearer rms_xxx` | sha256 查表 | MCP / CLI |

### 6.3 三层鉴权

```
1. Middleware   →  全局拦截，未登录跳 /login 或返回 401
2. Route Handler →  业务级（getCurrentUser() 取上下文）
3. RBAC         →  数据级（按角色 + 项目权限过滤）
```

### 6.4 四种角色

| 角色 | 权限 |
|------|------|
| **全局需求管理 (global_admin)** | 全部项目、用户管理、系统配置、审计日志 |
| **项目需求接收员 (project_receiver)** | 接收需求、创建、指派、添加评论、导出 |
| **需求处理人 (requirement_handler)** | 处理分配给自己的需求、状态流转、添加评论 |
| **需求查看员 (requirement_viewer)** | 只读、查看仪表盘、导出 |

### 6.5 审计日志

所有写操作（登录、登出、CRUD、状态变更、配置修改）都写入 `audit_logs`：

| 字段 | 说明 |
|------|------|
| user_id | 操作人 |
| username | 操作人用户名 |
| action | login / logout / create / update / delete / transition / config_update |
| detail | 详细信息（JSON） |
| ip_address | 来源 IP |
| user_agent | 浏览器/客户端 |
| created_at | 时间 |

可在 `/admin/audit-logs` 查询、筛选、导出。

---

## 7. MCP 集成（Token 透传）

### 7.1 数据流

![MCP 数据流](./images/mcp-dataflow.png)

### 7.2 架构

```
┌──────────────┐     stdio/SSE     ┌──────────────────┐    HTTP+Bearer    ┌────────────┐
│  MCP Client  │ ←───────────────→ │  rms-mcp-server  │ ←──────────────→ │  RMS Web   │
│ (Claude/IDE) │   JSON-RPC        │     (Node.js)     │   /api/*         │  Next.js   │
└──────────────┘                   └──────────────────┘                  └────────────┘
                                          │                                     │
                                          └── _token param ────────────────────→│
                                                                                │
                                          token 所属用户身份执行业务 ←──────────┘
```

### 7.3 Token 透传机制

1. **Token 生成**：用户在 `/profile/tokens` 创建，生成 `rms_xxx...` 格式
2. **数据库存储**：仅存 `sha256(token)` 哈希，不存明文
3. **MCP 调用**：所有工具接受 `_token` 参数
4. **HTTP 转发**：`httpApiWithToken()` 在 HTTP 头注入 `Authorization: Bearer <token>`
5. **身份识别**：`getUserByAccessToken()` 查表获取 user 信息
6. **权限执行**：所有操作以 Token 所属用户身份执行，审计日志记录该用户

### 7.4 MCP 工具集（15+）

| 工具 | 用途 |
|------|------|
| `list_requirements` | 列出需求（按状态/项目/处理人筛选） |
| `get_requirement` | 获取需求详情 |
| `create_requirement` | 创建需求 |
| `update_requirement` | 更新需求 |
| `transition_requirement` | 状态流转 |
| `add_comment` | 添加评论 |
| `add_attachment` | 上传附件 |
| `list_projects` | 列出可见项目 |
| `list_users` | 列出用户 |
| `get_dashboard` | 仪表盘聚合数据 |
| `search` | 全文搜索 |
| `generate_knowledge` | 从需求生成知识 |
| `link_requirements` | 关联需求 |
| `get_my_workload` | 工作量统计 |
| `bulk_transition` | 批量状态变更 |

### 7.5 HTTP 兜底

MCP 不可用时，降级到 `rms-api.js` HTTP 客户端：

```bash
node rms-api.js list --status in_progress --token rms_xxx
node rms-api.js get 128 --token rms_xxx
node rms-api.js create --title "新需求" --token rms_xxx
```

详细参见 `/admin/integrations` 页面。

---

## 8. 部署架构

### 8.1 单机部署图

![部署架构](./images/deployment.png)

### 8.2 环境要求

| 项目 | 最低 | 推荐 |
|------|------|------|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 50 GB SSD | 100 GB SSD |
| Node.js | 20.x LTS | 24.x LTS |
| MySQL | 8.0 | 8.0+ |
| PM2 | 5.x | 最新 |

### 8.3 目录结构

```
/home/itd3/www/rms/
├── src/                           # 源代码
│   ├── app/                      # Next.js App Router
│   │   ├── (app)/               # 需登录页面
│   │   │   ├── admin/           # 管理后台
│   │   │   ├── profile/         # 个人中心
│   │   │   ├── requirements/    # 需求
│   │   │   └── ...
│   │   ├── api/                 # API 路由（49 个）
│   │   └── login/               # 登录页
│   ├── components/              # 公共组件
│   ├── lib/                     # 核心服务
│   └── middleware.ts            # 鉴权中间件
├── .next/                       # 构建产物
│   └── standalone/             # 自包含部署包
│       └── www/rms/
│           ├── server.js       # 入口
│           ├── node_modules/   # 依赖
│           ├── data/           # 运行时数据
│           └── public/         # 上传文件
├── public/
│   └── uploads/                 # 附件
├── start.sh                    # 启动脚本
├── package.json
└── tsconfig.json
```

### 8.4 进程管理（PM2）

```bash
# 启动
cd /home/itd3/www/rms && pm2 start start.sh --name rms

# 查看
pm2 status
pm2 logs rms

# 重启
pm2 restart rms

# 停止
pm2 stop rms
```

`start.sh` 内容：
```bash
#!/bin/bash
cd /home/itd3/www/rms/.next/standalone/www/rms

# 同步静态资源
rsync -au --delete /home/itd3/www/rms/.next/static/ .next/static/ 2>/dev/null || true

# 同步上传文件
rsync -au /home/itd3/www/rms/public/uploads/ public/uploads/ 2>/dev/null || true

# 确保依赖完整
if [ ! -d "node_modules/bcryptjs" ]; then
  npm install bcryptjs@3.0.3 --omit=dev --no-save 2>/dev/null || true
fi

# 环境变量
export DB_TYPE=mysql
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_DATABASE=rms
export MYSQL_USER=rms
# 密码不写在本文件（start.sh 在 git 里）：从 600 权限的 .db_password 读
DB_PASSWORD_FILE="${DB_PASSWORD_FILE:-/home/itd3/www/rms/.db_password}"
MYSQL_PASSWORD="$(tr -d '\r\n' < "$DB_PASSWORD_FILE")"
export MYSQL_PASSWORD
export PORT=3800
export HOSTNAME=0.0.0.0
export NODE_ENV=production

exec node server.js
```

### 8.5 网络与端口

| 端口 | 服务 | 监听 |
|------|------|------|
| 3800 | Next.js HTTP | 0.0.0.0 |
| 3306 | MySQL | 127.0.0.1 |
| 18789 | OpenClaw Gateway | 127.0.0.1 |
| 22 | SSH | 0.0.0.0 |

### 8.6 备份策略

- **数据库**：每日 03:00 `mysqldump` 完整备份
- **保留周期**：30 天（自动清理）
- **存储位置**：`/var/backups/rms/` + 异地同步
- **附件**：每日 `rsync` 到备份盘
- **恢复演练**：每月一次

### 8.7 监控指标

| 指标 | 阈值 | 告警方式 |
|------|------|----------|
| CPU | > 80% 持续 5min | 邮件 + 飞书 |
| 内存 | > 85% | 邮件 |
| 磁盘 | > 85% | 邮件 + 飞书 |
| 服务存活 | HTTP 3800 不可达 | 立即告警 |
| PM2 重启 | > 5 次/小时 | 告警 |
| MySQL 慢查询 | > 2s | 日报 |

---

## 9. 构建与发布

### 9.1 构建命令

```bash
cd /home/itd3/www/rms

# 1. 拉取代码
git pull origin main

# 2. 安装依赖
npm ci

# 3. 类型检查
npx tsc --noEmit

# 4. 构建
npm run build
# 输出：.next/standalone/www/rms/

# 5. 同步静态资源
rsync -au --delete .next/static/ .next/standalone/www/rms/.next/static/

# 6. 重启服务
fuser -k 3800/tcp 2>/dev/null
pm2 restart rms
```

### 9.2 数据库迁移

数据库 schema 变更使用 `ensureConfigTable` 等模式自启动迁移。新增表（如 `access_tokens`、`audit_logs`）由代码自动 `CREATE TABLE IF NOT EXISTS`。MySQL 字段名变更（`config_key` → `key`）由 `ALTER TABLE` 在线迁移。

### 9.3 升级检查清单

- [ ] 备份当前数据库
- [ ] 检查 breaking change（CHANGELOG.md）
- [ ] 在 staging 环境验证
- [ ] 选择低峰期上线
- [ ] 灰度 5% 流量观察 1 小时
- [ ] 全量发布
- [ ] 监控 24 小时
- [ ] 准备回滚方案

### 9.4 回滚

```bash
# 1. 回滚代码
git checkout <previous-tag>

# 2. 重新构建
npm run build

# 3. 重启
pm2 restart rms

# 4. 如需回滚数据库
MYSQL_PWD="$MYSQL_PASSWORD" mysql -h localhost -u rms rms < /var/backups/rms/rms_YYYYMMDD_HHMMSS.sql
```

---

## 10. 附录：API 总览

### 10.1 认证（11 路由）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户名密码登录 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户信息 |
| POST | `/api/auth/register` | 自助注册（需开启） |
| GET | `/api/auth/wecom` | 企微登录入口 |
| GET | `/api/auth/wecom/callback` | 企微回调 |
| GET | `/api/auth/feishu` | 飞书登录入口 |
| GET | `/api/auth/feishu/callback` | 飞书回调 |
| GET | `/api/auth/dingtalk` | 钉钉登录入口 |
| GET | `/api/auth/dingtalk/callback` | 钉钉回调 |
| GET/POST/DELETE | `/api/auth/tokens` | Access Token CRUD |

### 10.2 业务核心（38 路由）

按业务域分组，详细见 `/home/itd3/www/rms/src/app/api/`。

---

## 文档信息

- **创建时间**：2026-06-05
- **最后更新**：2026-06-05
- **作者**：Apple (AI 助手)
- **反馈**：飞书 / 邮件

> 📖 配套使用说明文档请参见《RMS 用户使用手册》
