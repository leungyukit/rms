# RMS MCP Server

## 概述

RMS 需求管理系统的 MCP (Model Context Protocol) 接口，为 AI Agent 提供标准化的需求管理工具。

**RMS 现在有两套 MCP 实现，用途不同，别搞混：**

| | `rms-mcp-server.js`（本文档） | `/api/mcp`（2026-09-02 新增） |
|---|---|---|
| 传输 | **stdio only**，不监听端口 | Streamable HTTP（SSE 或单次 JSON） |
| 生命周期 | 每次调用 `spawn` 一个进程，用完即退 | 随 Next.js 常驻 |
| 谁在用 | OpenClaw 的 `rms` agent（通过 skill 调） | 外部客户端：Claude Desktop / Cursor / Cline |
| 鉴权 | 无（靠本机进程边界 + 环境变量注入凭据） | **强制 RMS Access Token** |
| 开关 | 无 | 系统配置 → 高级配置 → 🔌 MCP 服务（**默认全关**） |
| DB 访问 | `execFileSync('mysql', ...)` 子进程 | 复用 Next.js 连接池 |

外部工具接入请用 `/api/mcp`，不要试图从网络访问本文档描述的 stdio server —— 它没有端口。

## 文件位置

| 文件 | 说明 |
|------|------|
| `/home/itd3/www/rms/rms-mcp-server.js` | stdio MCP 服务器主程序 |
| `/home/itd3/www/rms/SKILL.md` | 本文档 |
| `src/lib/mcp-server.ts` + `src/app/api/mcp/route.ts` | HTTP 版 MCP（常驻服务） |

## 提供的工具

| 工具 | 说明 | 必填参数 |
|------|------|----------|
| `search_requirements` | 搜索需求 | keyword/status/priority/project_name/handler_name (均可选) |
| `get_requirement` | 获取需求详情 | id |
| `create_requirement` | 创建需求 | title (必填) |
| `update_requirement` | 更新需求 | id (必填) |
| `list_projects` | 列出项目 | 无 |
| `list_users` | 列出用户 | 无 |
| `get_dashboard_stats` | 获取统计 | 无 |
| `get_schema` | 获取表结构 | table (可选) |

## 启动方式

**不需要「启动」—— stdio server 没有常驻形态。**

> 历史说明（2026-09-02）：这里原先写着 `./start-mcp.sh` / `./stop-mcp.sh`。
> 那两个脚本用 `nohup` 把一个 stdio server 挂到后台并记 PID 文件，
> 是照「HTTP 服务」的思路写的 —— 但 stdio server 的输入输出就是它自己的
> stdin/stdout，**没有客户端接上管道时它什么也做不了**，挂在后台纯属占进程。
> 脚本已删除（`git log -- start-mcp.sh` 可查历史）。

正确的调用方式是由 MCP 客户端把它作为子进程拉起并接管管道：

```bash
# 手工验证（凭据从环境变量注入，缺 MYSQL_PASSWORD 会 fail-closed 直接退出）
cd /home/itd3/www/rms
MYSQL_HOST=localhost MYSQL_DATABASE=rms MYSQL_USER=rms MYSQL_PASSWORD=*** \
  node rms-mcp-server.js
# 进程会静默等在 stdin 上 —— 这是正常的，不是卡住
```

OpenClaw 的 `rms` agent 走的是 skill 封装（凭据由 wrapper 从 `chmod 600` 的
`.rms-my.cnf` 注入，不进配置文件也不进 `ps`）：

```bash
~/.openclaw/workspace-rms/skills/rms/scripts/run.sh dashboard
# 输出里没有 `_fallback` 标记 = 真的走了 MCP，不是 HTTP 兜底
```

### 容器部署

`rms-mcp-server.js` **已纳入镜像构建**，不是手工 copy：

- `deploy/docker/Dockerfile.openclaw` → `COPY rms-mcp-server.js /root/rms-mcp-server.js` + 装 SDK/zod 并 require 自检
- `deploy/docker/build-openclaw.sh` 用暂存目录把仓库根这份带进构建上下文，并做缺文件前置校验
- `deploy/docker/docker-compose.yml` 把 `RMS_MCP_PATH` 覆盖为 `/root/rms-mcp-server.js`

改了这个文件后**重建 `rms-openclaw` 镜像**即可同步，不用手工往容器里塞。
验证口诉：拿容器内 `md5sum /root/rms-mcp-server.js` 跟仓库根那份对。

⚠️ **仓库根那个 all-in-one `Dockerfile` 没带 MCP**（它本来就不推荐用：
内置 MariaDB 11 不支持 `WITH PARSER ngram`，中文全文检索直接废掉）。
而 `docker/openclaw-home/plugin-skills/rms/skill.json` 里 `RMS_MCP_PATH` 的默认值是
**宕机路径** `/home/itd3/www/rms/rms-mcp-server.js` —— all-in-one 容器把 RMS 放在 `/app/rms`，
那个路径不存在。compose 部署因为显式覆盖了环境变量才没事。
如果以后真要用 all-in-one，得补 `COPY rms-mcp-server.js` 并修默认路径。

## OpenClaw 集成

在 OpenClaw 配置中添加 MCP 服务器：

```json
{
  "tools": {
    "mcpServers": {
      "rms": {
        "command": "node",
        "args": ["/home/itd3/www/rms/rms-mcp-server.js"],
        "env": {
          "MYSQL_HOST": "localhost",
          "MYSQL_PORT": "3306",
          "MYSQL_DATABASE": "rms",
          "MYSQL_USER": "rms",
          "MYSQL_PASSWORD": "<从环境变量注入，勿写死>"
        }
      }
    }
  }
}
```

## 使用示例

### 创建需求

```json
{
  "name": "create_requirement",
  "arguments": {
    "title": "用户登录优化",
    "description": "优化登录页面加载速度",
    "business_unit": "产品部",
    "priority": "high",
    "project_name": "ERP系统升级",
    "handler_name": "张三"
  }
}
```

### 搜索需求

```json
{
  "name": "search_requirements",
  "arguments": {
    "keyword": "登录",
    "status": "in_progress",
    "limit": 5
  }
}
```

### 更新需求

```json
{
  "name": "update_requirement",
  "arguments": {
    "id": 1,
    "status": "completed",
    "priority": "high"
  }
}
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MYSQL_HOST` | localhost | MySQL 主机 |
| `MYSQL_PORT` | 3306 | MySQL 端口 |
| `MYSQL_DATABASE` | rms | 数据库名 |
| `MYSQL_USER` | rms | 数据库用户 |
| `MYSQL_PASSWORD` | （必填，无默认值） | 数据库密码，须由环境变量注入 |
