---
name: rms
description: "RMS 需求管理系统操作：搜索/创建/更新/删除需求、查看项目、查看用户、查看统计、操作日志。混合模式：优先 MCP，HTTP API 兜底。"
---

# RMS 需求管理 Skill

通过混合模式操作 RMS 系统：**优先调用 MCP 服务，MCP 不可用时自动 fallback 到 HTTP API**。

## Token 透传机制

所有调用都会携带用户的 Access Token，确保：
- 审计日志准确记录是哪个用户操作的
- 权限控制基于用户角色
- MCP 和 HTTP 两种模式行为一致

## 配置要求

使用前需确认：

1. **用户 Access Token** — 在 RMS 系统「🔑 Token 管理」页面生成
2. **RMS 服务地址** — 默认 `http://localhost:3800`

如用户未配置 Token，提示：
> 请先登录 RMS 系统，进入「🔑 Token 管理」页面生成 Access Token，然后告诉我 Token 和服务器地址。

## 使用方式

调用脚本：`node ~/.openclaw/plugin-skills/rms/scripts/rms-api.js <command> [JSON参数]`

环境变量：
- `RMS_BASE_URL` — RMS 服务器地址（默认 http://localhost:3800）
- `RMS_ACCESS_TOKEN` — 用户的 Access Token
- `RMS_MCP_PATH` — MCP 脚本路径（默认 /home/itd3/www/rms/rms-mcp-server.js）

## 工作流程

```
用户 Token → Skill 脚本 → MCP Server（携带 _token）→ HTTP API → RMS 服务
                ↓ (MCP 失败)
            HTTP API（携带 Token）→ RMS 服务
```

## 命令参考

### search — 搜索需求
```bash
RMS_ACCESS_TOKEN="***" node ~/.openclaw/plugin-skills/rms/scripts/rms-api.js search '{"keyword":"登录","status":"in_progress"}'
```

### get — 获取需求详情
```bash
RMS_ACCESS_TOKEN="***" node ~/.openclaw/plugin-skills/rms/scripts/rms-api.js get '{"id":1}'
```

### create — 创建需求
```bash
RMS_ACCESS_TOKEN="***" node ~/.openclaw/plugin-skills/rms/scripts/rms-api.js create '{"title":"需求标题","priority":"high"}'
```

### update — 更新需求
```bash
RMS_ACCESS_TOKEN="***" node ~/.openclaw/plugin-skills/rms/scripts/rms-api.js update '{"id":1,"status":"completed"}'
```

### delete — 删除需求（仅 HTTP）
```bash
RMS_ACCESS_TOKEN="***" node ~/.openclaw/plugin-skills/rms/scripts/rms-api.js delete '{"id":1}'
```

### list-projects — 列出项目
### list-users — 列出用户
### dashboard — 统计概览
### audit-logs — 操作日志（仅 HTTP）
### health — 健康检查（仅 HTTP）

## 输出说明

- 正常输出：JSON 数据
- fallback 提示：`{"_fallback": true, "_mcp_error": "错误信息"}` 表示 MCP 调用失败，已切换到 HTTP

## 状态说明

| 状态码 | 含义 |
|--------|------|
| received_not_evaluated | 仅接收，未评估 |
| evaluated_not_scheduled | 已评估，未排期 |
| scheduled | 已排期 |
| in_progress | 处理中 |
| completed | 已完成 |
| verified | 已验证 |
| closed | 已关闭 |

## 安全规则

- 不要在对话中暴露用户的 Access Token
- 删除操作前需确认
- 所有操作会记录审计日志（包含操作用户信息）
