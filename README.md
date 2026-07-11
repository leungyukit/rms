# RMS - 需求管理系统 · 架构与功能说明

> **版本**：v1.0 · 2026-06   
> **服务地址**：`http://localhost:3800`  
> **技术栈**：Next.js 15 + React 19 + MySQL 8.0

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构](#2-系统架构)
3. [功能模块](#3-功能模块)
4. [技术栈详解](#4-技术栈详解)
5. [数据库设计](#5-数据库设计)
6. [状态流转](#6-状态流转)
7. [认证与授权](#7-认证与授权)
8. [AI 集成与 MCP](#8-ai-集成与-mcp)
9. [部署架构](#9-部署架构)
10. [API 路由总览](#10-api-路由总览)
11. [快速开始](#11-快速开始)
12. [常见问题](#12-常见问题)

---

## 1. 项目概述

### 1.1 项目背景

RMS（Requirement Management System）是一套面向中小型团队的需求收集、管理、跟踪与分析平台。

**解决的问题：**
- 业务方反馈的需求散落在邮件、IM、Word 中，没有统一入口
- 需求从提出到上线过程不透明，谁在处理、卡在哪一步不清楚
- 历史需求无法复用，重复开发多
- 缺乏数据支撑，不知道团队产能、瓶颈需求类型、延期原因

### 1.2 核心定位

面向 **产品经理、开发、测试、业务方** 的协作平台，贯穿需求从提出到上线的完整生命周期。

---

## 2. 系统架构

### 2.1 总体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         用户层                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  浏览器   │  │ AI Agent │  │ 第三方   │  │  MCP 客户端     │  │
│  │  (Web)   │  │(OpenClaw)│  │ OAuth    │  │ (Claude/IDE)   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬────────┘  │
└───────┼────────────┼────────────┼─────────────────┼────────────┘
        │            │            │                 │
        └────────────┴────────────┴─────────────────┘
                             │
┌────────────────────────────┼───────────────────────────────────────┐
│                      应用层                                     │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              Next.js 15 App Router                       │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │    │
│  │  │  前端页面     │  │  API Routes  │  │  MCP Server   │  │    │
│  │  │  (React 19)  │  │  (49 个)     │  │  (rms-mcp)    │  │    │
│  │  └──────────────┘  └──────────────┘  └───────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              src/lib/ 核心服务层                            │    │
│  │  db.ts │ auth.ts │ knowledge.ts │ workflow.ts │ ...      │    │
│  └──────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
                             │
┌────────────────────────────┼───────────────────────────────────────┐
│                      数据层                                     │
│  ┌──────────────────┐              ┌──────────────────────────┐   │
│  │   MySQL 8.0      │              │   文件系统               │   │
│  │   (生产/测试)    │              │   uploads/               │   │
│  │   19 张表        │              │   public/                │   │
│  └──────────────────┘              └──────────────────────────┘   │
│                                                                   │
│  ┌──────────────────┐                                            │
│  │   SQLite         │  (开发模式 fallback)                       │
│  └──────────────────┘                                            │
└───────────────────────────────────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────┴────┐          ┌────┴────┐        ┌────┴────┐
   │  LLM   │          │  ASR    │        │  OAuth  │
   │(OpenAI)│          │ (TTS)   │        │ (企微/  │
   │Stepfun │          │         │        │  飞书/  │
   │Anthropic│         │         │        │  钉钉)  │
   └────────┘          └────────┘        └─────────┘
```

### 2.2 目录结构

```
/home/itd3/www/rms/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (app)/             # 需登录页面（React Server Components）
│   │   │   ├── admin/         # 管理后台（用户/配置/审计）
│   │   │   ├── dashboard/     # 仪表盘
│   │   │   ├── requirements/  # 需求列表 + 详情
│   │   │   ├── projects/      # 项目管理
│   │   │   ├── kanban/        # 看板视图
│   │   │   ├── gantt/         # 甘特图
│   │   │   ├── calendar/      # 日历视图
│   │   │   ├── knowledge/     # 知识库 + 图谱
│   │   │   ├── chat/          # AI 聊天
│   │   │   ├── workflows/     # 工作流设计器
│   │   │   ├── sprints/       # Sprint 管理
│   │   │   ├── checklist/     # 验收清单
│   │   │   ├── workload/      # 工作量统计
│   │   │   ├── sla-dashboard/ # SLA 看板
│   │   │   ├── notifications/ # 通知中心
│   │   │   ├── profile/       # 个人中心 + Token
│   │   │   └── ...
│   │   ├── api/               # API Routes（49 个 endpoint）
│   │   │   ├── auth/          # 认证（登录/登出/OAuth）
│   │   │   ├── requirements/  # 需求 CRUD + 批量 + 导入导出
│   │   │   ├── projects/      # 项目 CRUD
│   │   │   ├── users/         # 用户管理
│   │   │   ├── roles/         # 角色管理
│   │   │   ├── dashboard/     # 仪表盘聚合
│   │   │   ├── knowledge/     # 知识库
│   │   │   ├── chat/          # AI 聊天
│   │   │   ├── chat/llm/      # LLM 直连
│   │   │   ├── config/        # 系统配置（12 大类 65 项）
│   │   │   ├── audit-logs/    # 审计日志
│   │   │   ├── attachments/   # 附件管理
│   │   │   ├── tags/          # 标签管理
│   │   │   ├── sla/           # SLA 管理
│   │   │   ├── sprints/       # Sprint API
│   │   │   ├── checklist/     # 验收清单 API
│   │   │   ├── workflow-*/    # 工作流 API
│   │   │   ├── reports/       # 报表 API
│   │   │   ├── integrations/  # 集成安装
│   │   │   └── ...
│   │   ├── login/             # 登录页
│   │   ├── layout.tsx         # 根布局
│   │   └── page.tsx           # 首页
│   ├── lib/                   # 核心服务层
│   │   ├── db.ts              # 数据库抽象层（SQLite/MySQL 双引擎）
│   │   ├── auth.ts            # JWT + bcrypt + Cookie + 审计
│   │   │   ├── middleware.ts  # 全局请求拦截
│   │   ├── knowledge.ts       # 知识条目 CRUD + 图谱
│   │   ├── notification.ts    # 通知生成与分发
│   │   ├── workflow.ts        # 状态机 + 自动化规则
│   │   ├── chat-store.ts      # AI 会话存储（文件/Memcache）
│   │   ├── theme.ts           # 主题管理（亮/暗/跟随系统）
│   │   ├── sla-scanner.ts     # SLA 扫描器
│   │   ├── webhook-worker.ts  # Webhook 异步任务
│   │   ├── ai-knowledge-worker.ts  # AI 知识生成
│   │   ├── perf-indexes-migrations.ts  # 性能索引
│   │   └── *_migrations.ts    # 数据库迁移（共 15+ 个）
│   └── components/            # 公共 UI 组件
├── public/
│   └── uploads/               # 上传附件存储
├── data/                      # 运行时数据（SQLite fallback）
├── rms-mcp-server.js          # MCP Server 入口（stdio/SSE）
├── rms-api.js                 # MCP HTTP 兜底 CLI
├── start.sh                   # 生产环境启动脚本
├── Dockerfile                 # Docker 镜像
├── docker-compose.yml         # Docker Compose
├── package.json               # 依赖管理
└── tsconfig.json              # TypeScript 配置
```

### 2.3 请求流程

```
用户请求
    │
    ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│   Middleware  │───▶│  鉴权拦截      │───▶│  Route       │
│  (auth.ts)    │    │  JWT/Cookie   │    │  Handler     │
└─────────────┘    └──────────────┘    └──────┬───────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │  lib/db.ts   │
                                         │  数据库操作    │
                                         └──────┬───────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │  MySQL 8.0   │
                                         └──────────────┘
```

---

## 3. 功能模块

### 3.1 模块全景

| # | 模块 | 路径 | 说明 |
|---|------|------|------|
| 1 | 需求管理 | `/requirements` | 需求全生命周期 CRUD、状态流转、附件评论标签 |
| 2 | 仪表盘 | `/dashboard` | KPI 卡片、趋势图、状态分布、逾期预警 |
| 3 | 项目管理 | `/projects` | 项目生命周期、成员、状态 |
| 4 | 看板 | `/kanban` | 拖拽状态流转，7 列对应 7 个状态 |
| 5 | 甘特图 | `/gantt` | 时间线、依赖、里程碑 |
| 6 | 日历 | `/calendar` | 按日期查看计划/截止 |
| 7 | 知识库 | `/knowledge` | 知识条目、知识图谱、AI 生成 |
| 8 | AI 聊天 | `/chat` | LLM 对话、工具调用、需求分析 |
| 9 | 工作流 | `/workflows` | 可视化状态机设计器 + 监控 |
| 10 | Sprint | `/sprints` | 迭代规划、任务分配 |
| 11 | 验收清单 | `/checklist` | 需求验收标准管理 |
| 12 | SLA | `/sla-dashboard` | 服务水平协议监控 |
| 13 | 工作量 | `/workload` | 按人/项目/时间产能分析 |
| 14 | 通知中心 | `/notifications` | 站内消息、已读未读 |
| 15 | 用户管理 | `/admin/users` | 用户 CRUD、角色分配 |
| 16 | 系统配置 | `/admin/config` | 12 大类 65 项热更新配置 |
| 17 | 审计日志 | `/admin/audit-logs` | 登录/CRUD/配置修改全记录 |
| 18 | Access Token | `/profile/tokens` | MCP 接入、CLI 自动化 |
| 19 | 集成安装 | `/admin/integrations` | MCP/Skill 一键下载 |
| 20 | 报表 | `/reports` | 周报、统计报表 |

### 3.2 模块详情

#### 3.2.1 需求管理（核心）

需求系统是整个 RMS 的核心，围绕需求从提出到关闭的全生命周期设计：

- **CRUD**：创建、查看、编辑、删除需求
- **状态流转**：7 个状态，可配置流转规则
- **父子需求**：支持需求分解
- **关联关系**：重复、相关、阻塞关系
- **附件**：拖拽上传，支持图片/文档/压缩包
- **评论**：时间线式讨论，支持 @提及
- **标签**：多维度分类
- **筛选搜索**：全文搜索 + 多维度筛选
- **导入导出**：CSV/Excel 批量操作

#### 3.2.2 多视图

同一个需求数据，提供 6 种视图：

| 视图 | 场景 |
|------|------|
| 列表 | 全局浏览、筛选、批量操作 |
| 看板 | 拖拽改状态，可视化瓶颈 |
| 甘特图 | 时间线、依赖、里程碑 |
| 日历 | 按日期查看计划/截止 |
| 仪表盘 | 整体指标和趋势 |
| 工作量 | 团队产能分析 |

#### 3.2.3 知识库

- 手动创建知识条目
- 从需求一键沉淀为知识
- AI 自动生成知识草稿
- 知识图谱可视化关联
- 反馈机制（👍/👎）用于 AI 排序优化

#### 3.2.4 AI 聊天

- 多 LLM 厂商支持（OpenAI、Stepfun、Anthropic）
- 上下文感知的需求分析
- 工具调用（list_requirements、create_requirement 等）
- 会话持久化（文件/Memcache 双后端）
- 主题支持（亮色/暗色/跟随系统）

#### 3.2.5 工作流引擎

- 可视化状态机设计器
- 可配置流转规则（谁可以执行什么操作）
- 自动化规则（自动指派、自动通知、升级）
- 实时监控工作流执行

#### 3.2.6 SLA 管理

- 基于优先级和状态的 SLA 配置
- 自动扫描逾期需求
- SLA 看板可视化
- 告警通知

#### 3.2.7 去重检测

- 基于标题/描述相似度检测重复需求
- 批量合并建议
- 去重仪表盘

---

## 4. 技术栈详解

### 4.1 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 15.x | 全栈框架，App Router，SSR + RSC |
| React | 19.x | UI 组件库 |
| TypeScript | 5.x | 类型安全 |
| Tailwind CSS | 4.x | 原子化样式 |
| react-markdown | 10.x | Markdown 渲染 |
| xlsx | 0.18.x | Excel 导入导出 |

**关键特性：**
- App Router 架构，React Server Components 优先
- Server Actions 用于表单提交
- 客户端组件通过 `"use client"` 标记
- 响应式设计，适配桌面和平板

### 4.2 后端

| 技术 | 用途 |
|------|------|
| Next.js API Routes | 49 个 REST API endpoint |
| JWT (jsonwebtoken) | 无状态认证 |
| bcryptjs | 密码哈希 |
| better-sqlite3 / mysql2 | 双数据库驱动 |
| memcache | 会话/缓存存储 |
| xlsx | Excel 解析 |

### 4.3 AI 与外部集成

| 技术 | 用途 |
|------|------|
| OpenClaw Gateway | 本地 AI Agent 编排（端口 18789） |
| MCP (Model Context Protocol) | AI 工具调用标准 |
| 企微 OAuth | 企业内部登录 |
| 飞书 OAuth | 飞书生态登录 |
| 钉钉 OAuth | 钉钉生态登录 |
| ASR/TTS | 语音转文字 / 语音合成（可选） |

### 4.4 运维

| 技术 | 用途 |
|------|------|
| PM2 | 进程管理（启动/重启/日志） |
| Docker | 容器化部署 |
| mysqldump | 数据库备份 |
| cron | 定时备份 + SLA 扫描 |

---

## 5. 数据库设计

### 5.1 表清单（19 张）

#### 用户与权限（5 张）

| 表 | 说明 |
|----|------|
| `users` | 用户主表（本地/企微/飞书/钉钉） |
| `roles` | 角色定义（4 种） |
| `user_roles` | 用户-角色多对多 |
| `user_project_access` | 用户-项目权限 |
| `role_project_access` | 角色-项目权限 |

#### 项目与需求（5 张）

| 表 | 说明 |
|----|------|
| `projects` | 项目 |
| `requirements` | 需求（核心表，7 状态 + 优先级 + 父子） |
| `status_log` | 状态变更日志（审计追溯） |
| `requirement_relations` | 需求关联（重复/相关/阻塞/父子） |
| `requirement_tags` | 需求-标签多对多 |

#### 协作（2 张）

| 表 | 说明 |
|----|------|
| `comments` | 评论（支持回复） |
| `attachments` | 附件（文件元数据） |

#### 知识库（3 张）

| 表 | 说明 |
|----|------|
| `knowledge_entries` | 知识条目（含 embedding） |
| `knowledge_relations` | 知识关联 |
| `knowledge_feedback` | 知识反馈 |

#### 系统级（4 张）

| 表 | 说明 |
|----|------|
| `system_config` | 系统配置（12 大类，热更新） |
| `access_tokens` | Access Token（sha256 存储） |
| `audit_logs` | 审计日志（全操作记录） |
| `notifications` | 通知（站内消息） |

#### 扩展（1 张）

| 表 | 说明 |
|----|------|
| `user_openclaw_sessions` | AI 会话持久化 |

### 5.2 核心字段

**requirements 表：**
```sql
id              INT PK AUTO_INCREMENT
title           VARCHAR(500)        -- 标题
description     TEXT               -- 描述
status          ENUM               -- 7 种状态
priority        ENUM(high,medium,low)
category        ENUM(project,adhoc) -- 项目需求/零星需求
project_id      INT                -- 所属项目
submitter_id    INT                -- 提交人
handler_id      INT                -- 处理人
receiver_id     INT                -- 接收人
parent_id       INT                -- 父需求
start_date      DATE               -- 开始日期
due_date        DATE               -- 截止日期
estimated_hours DECIMAL            -- 预估工时
actual_hours    DECIMAL            -- 实际工时
created_at      DATETIME
updated_at      DATETIME
```

**system_config 表：**
```sql
key         VARCHAR(200) PK    -- 配置键
value       TEXT               -- 配置值
label       VARCHAR(200)       -- 显示名
description VARCHAR(500)       -- 说明
category    ENUM(12)           -- 12 大类
type        VARCHAR(50)        -- text/number/boolean/select/textarea
sort_order  INT                -- 排序
updated_at  DATETIME
```

---

## 6. 状态流转

### 6.1 七状态模型

```
仅接收未评估 ──→ 已评估未排期 ──→ 已排期 ──→ 处理中 ──→ 已完成 ──→ 已验证 ──→ 已关闭
   (灰)           (黄)             (蓝)       (紫)        (绿)        (青)        (深灰)
```

| 状态 | key | 描述 |
|------|-----|------|
| 仅接收未评估 | `received_not_evaluated` | 刚提交，未评估 |
| 已评估未排期 | `evaluated_not_scheduled` | 已评估但未排期 |
| 已排期 | `scheduled` | 已分配处理人 |
| 处理中 | `in_progress` | 正在处理 |
| 已完成 | `completed` | 处理人提交完成 |
| 已验证 | `verified` | QA/业务方验证通过 |
| 已关闭 | `closed` | 流程结束 |

### 6.2 流转规则

```
标准流程：
received_not_evaluated → evaluated_not_scheduled → scheduled → in_progress → completed → verified → closed

特殊流转：
in_progress → scheduled          # 退回重新排期
任意状态 → closed                # 管理员强制关闭
```

- 每次变更自动写入 `status_log` 表
- 自动通知处理人和提交人
- SLA 计时随状态变化

### 6.3 SLA 规则

| 优先级 | 评估 SLA | 完成 SLA |
|--------|----------|----------|
| 高 | 24h | 3 天 |
| 中 | 3 天 | 7 天 |
| 低 | 7 天 | 14 天 |

SLA 在 `system_config` 中可调整，仪表盘逾期需求标红。

---

## 7. 认证与授权

### 7.1 四种登录方式

| 方式 | 流程 |
|------|------|
| **用户名+密码** | bcrypt 校验 → JWT → Cookie（7 天） |
| **企微扫码** | OAuth 2.0 → code → userid |
| **飞书登录** | OAuth 2.0 → openid |
| **钉钉登录** | OAuth 2.0 → unionid |
| **Access Token** | `Authorization: Bearer rms_xxx`（MCP/CLI 用） |

### 7.2 三层鉴权

```
1. Middleware  →  全局拦截，未登录跳 /login 或返回 401
2. Route Handler  →  业务级（getCurrentUser() 取上下文）
3. RBAC  →  数据级（按角色 + 项目权限过滤）
```

### 7.3 四种角色

| 角色 | key | 权限 |
|------|-----|------|
| 全局管理员 | `global_admin` | 全部权限，用户管理，系统配置，审计日志 |
| 项目接收员 | `project_receiver` | 接收需求、创建、指派、添加评论、导出 |
| 需求处理人 | `requirement_handler` | 处理分配的需求、状态流转、添加评论 |
| 需求查看员 | `requirement_viewer` | 只读、查看仪表盘、导出 |

### 7.4 审计日志

所有写操作记录到 `audit_logs`：
- login / logout / create / update / delete / transition / config_update
- 包含 user_id、username、action、detail（JSON）、ip_address、user_agent

---

## 8. AI 集成与 MCP

### 8.1 MCP Server

RMS 提供官方 MCP Server（`rms-mcp-server.js`），支持 stdio 和 SSE 两种传输协议。

**15+ 工具：**

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

### 8.2 Token 透传机制

```
MCP Client → rms-mcp-server → RMS HTTP API
              (_token 参数)     (Authorization: Bearer)
                                    │
                                    ▼
                              getUserByAccessToken()
                                    │
                                    ▼
                              以 Token 用户身份执行
```

1. 用户在 `/profile/tokens` 创建 `rms_xxx...` 格式 Token
2. 数据库仅存 `sha256(token)` 哈希
3. MCP 工具接受 `_token` 参数
4. `httpApiWithToken()` 注入 Bearer 头
5. 所有操作以 Token 所属用户身份执行

### 8.3 HTTP 兜底

MCP 不可用时可用 CLI：

```bash
node rms-api.js list --status in_progress --token rms_xxx
node rms-api.js get 128 --token rms_xxx
node rms-api.js create --title "新需求" --token rms_xxx
```

### 8.4 OpenClaw 集成

- OpenClaw Gateway（端口 18789）作为本地 AI Agent 编排层
- 注册 RMS MCP Server 后可直接对话控制 RMS
- 会话持久化到 `user_openclaw_sessions` 表

---

## 9. 部署架构

### 9.1 环境要求

| 项目 | 最低 | 推荐 |
|------|------|------|
| OS | Ubuntu 22.04 | Ubuntu 24.04 |
| CPU | 2 核 | 4 核 |
| 内存 | 4 GB | 8 GB |
| 磁盘 | 50 GB SSD | 100 GB SSD |
| Node.js | 20.x LTS | 24.x LTS |
| MySQL | 8.0 | 8.0+ |
| PM2 | 5.x | 最新 |

### 9.2 端口

| 端口 | 服务 |
|------|------|
| 3800 | Next.js HTTP |
| 3306 | MySQL |
| 18789 | OpenClaw Gateway |

### 9.3 备份策略

- **数据库**：每日 03:00 `mysqldump` 完整备份，保留 30 天
- **附件**：每日 `rsync` 到备份盘
- **恢复演练**：每月一次

---

## 10. API 路由总览

### 10.1 认证（11 路由）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 用户名密码登录 |
| POST | `/api/auth/logout` | 登出 |
| GET | `/api/auth/me` | 当前用户信息 |
| POST | `/api/auth/register` | 自助注册 |
| GET | `/api/auth/wecom` | 企微登录入口 |
| GET | `/api/auth/wecom/callback` | 企微回调 |
| GET | `/api/auth/feishu` | 飞书登录入口 |
| GET | `/api/auth/feishu/callback` | 飞书回调 |
| GET | `/api/auth/dingtalk` | 钉钉登录入口 |
| GET | `/api/auth/dingtalk/callback` | 钉钉回调 |
| CRUD | `/api/auth/tokens` | Access Token |

### 10.2 业务核心（38 路由）

| 模块 | 路径 | 功能 |
|------|------|------|
| 需求 | `/api/requirements/*` | CRUD、状态流转、批量、导入导出 |
| 项目 | `/api/projects/*` | 项目 CRUD |
| 用户 | `/api/users/*` | 用户管理 |
| 角色 | `/api/roles/*` | 角色管理 |
| 仪表盘 | `/api/dashboard` | KPI 聚合 |
| 知识库 | `/api/knowledge/*` | 知识 CRUD、图谱、生成 |
| AI 聊天 | `/api/chat/*` | LLM 对话、会话管理 |
| 系统配置 | `/api/config` | 12 大类配置 |
| 审计日志 | `/api/audit-logs` | 审计查询 |
| 附件 | `/api/attachments` | 上传/下载 |
| 标签 | `/api/tags` | 标签 CRUD |
| 日历 | `/api/calendar` | 日历数据 |
| 看板 | `/api/kanban` | 看板数据 |
| 甘特 | `/api/gantt` | 甘特数据 |
| 工作量 | `/api/workload/*` | 工作量统计 |
| SLA | `/api/sla/*` | SLA 数据 |
| Sprint | `/api/sprints/*` | Sprint CRUD |
| 验收清单 | `/api/checklist/*` | 验收清单 |
| 工作流 | `/api/workflows/*` | 工作流定义 |
| 报表 | `/api/reports/*` | 周报、统计 |
| 集成 | `/api/integrations/*` | 集成安装 |
| 搜索 | `/api/search` | 全文搜索 |
| 数据库 | `/api/database` | 备份/恢复 |
| 健康 | `/api/health` | 健康检查 |

---

## 11. 快速开始

### 11.1 开发环境

```bash
cd /home/itd3/www/rms

# 1. 安装依赖
npm ci

# 2. 启动开发服务器（端口 3800）
npm run dev
```

访问 `http://localhost:3800`，使用 `admin` 登录。

### 11.2 生产环境

```bash
# 1. 构建
npm run build

# 2. 启动
pm2 start start.sh --name rms

# 3. 查看状态
pm2 status
pm2 logs rms
```

### 11.3 Docker

```bash
docker-compose up -d
```

### 11.4 初始化数据

```bash
node scripts/seed.mjs
```

---

## 12. 常见问题

### 12.1 数据库

**Q: SQLite 和 MySQL 有什么区别？**
A: 开发环境默认 SQLite（零配置），生产环境使用 MySQL 8.0。`lib/db.ts` 自动切换，业务代码无需修改。

**Q: 如何迁移数据？**
A: `mysqldump` 导出 → `mysql` 导入。详见第 9 章。

### 12.2 认证

**Q: 第三方登录失败？**
A: 检查系统配置 → 对应 OAuth 配置（CorpID/App ID/Secret/回调地址）。

**Q: Token 失效？**
A: 登录 → Token 管理 → 撤销旧 Token → 创建新 Token。

### 12.3 MCP

**Q: Claude Desktop 看不到 RMS 工具？**
A: 检查 `claude_desktop_config.json` 路径，重启 Claude Desktop，查看日志。

### 12.4 性能

**Q: 列表加载慢？**
A: 缩小筛选范围，减少每页条数。系统已建 20+ 性能索引。

---

## 附录

- **详细设计文档**：`public/RMS-详细设计.md`
- **使用说明文档**：`public/RMS-使用说明.md`
- **SKILL.md**：`SKILL.md`

---

> 📅 最后更新：2026-06-16
