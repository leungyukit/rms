# RMS MCP Server

## 概述

RMS 需求管理系统的 MCP (Model Context Protocol) 服务器，为 AI Agent 提供标准化的需求管理工具接口。

## 文件位置

| 文件 | 说明 |
|------|------|
| `/home/itd3/www/rms/rms-mcp-server.js` | MCP 服务器主程序 |
| `/home/itd3/www/rms/start-mcp.sh` | 启动脚本 |
| `/home/itd3/www/rms/stop-mcp.sh` | 停止脚本 |
| `/home/itd3/www/rms/SKILL.md` | OpenClaw Skill 配置 |

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

```bash
# 启动
cd /home/itd3/www/rms
./start-mcp.sh

# 停止
./stop-mcp.sh

# 查看日志
tail -f /tmp/rms-mcp.log
```

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
          "MYSQL_PASSWORD": "rms123456"
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
| `MYSQL_PASSWORD` | rms123456 | 数据库密码 |
