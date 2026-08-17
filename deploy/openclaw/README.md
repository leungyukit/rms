# RMS × OpenClaw 集成配置

RMS 的「对话工作台」由 OpenClaw Gateway 提供 AI 能力。本目录是**配置依据**，
用于在新机器上复现或审计 RMS 专用 agent。

> ⚠️ 本仓库是 public。这里的所有文件**只含结构与策略，不含任何凭据**。
> 真实 token / 密码 / 密钥一律留在服务器本地（见下文「敏感项清单」）。

---

## 1. 架构：两个聊天入口，后端完全不同

RMS 里有两处能聊天，别搞混：

| 入口 | 请求 | 实际后端 |
|---|---|---|
| 全局浮动面板（`layout.tsx`） | `POST /api/chat` + `mode:'agent'` | 直连 LLM，读 `llm_*` 配置，**与 OpenClaw 无关** |
| **对话工作台页面**（`chat/page.tsx`） | `POST /api/openclaw` | **真正的 OpenClaw Gateway** |

本文档只讲第二条链路。

调用链：

```
浏览器 → POST /api/openclaw
       → src/app/api/openclaw/route.ts::callOpenClaw()
       → Gateway http://<host>:18789/v1/chat/completions
       → agent id = rms
```

---

## 2. Agent 路由：靠 session key，不靠 model 名

这是最容易踩的坑。**`model` 字段只决定用哪个模型，不决定路由到哪个 agent。**
agent 由请求头 `x-openclaw-session-key` 的前缀决定：

```
❌ x-openclaw-session-key: rms-user-1            → fallback 到 default agent（会串到别人的 workspace）
✅ x-openclaw-session-key: agent:rms:rms-user-1  → 命中 rms agent
```

`route.ts` 已做兼容，库里存的旧 session_key 无前缀时运行时自动补：

```ts
const agentId = process.env.OPENCLAW_AGENT_ID || 'rms';
headers['x-openclaw-session-key'] = sessionKey.startsWith(`agent:${agentId}:`)
  ? sessionKey
  : `agent:${agentId}:${sessionKey}`;
```

→ 排查「多 agent 不生效」时**先看 session key 格式**，不要急着重启 Gateway。

---

## 3. 配置文件位置

| 内容 | 路径 |
|---|---|
| Gateway 主配置 | `$HOME/.openclaw/openclaw.json` |
| rms agent workspace | `$HOME/.openclaw/workspace-rms/` |
| rms agent 私有目录 | `$HOME/.openclaw/agents/rms/` |
| 表结构文档（注入 system prompt） | `$HOME/.openclaw/workspace/rms-db-schema.md` |

本目录对应关系：

```
deploy/openclaw/
├── README.md                        ← 本文件
├── agent-rms.config.json            ← 往 openclaw.json 的 agents.list 里加的那一项
├── gateway.config.json              ← Gateway 相关非敏感参数
└── workspace-rms/
    ├── AGENTS.md                    ← agent 职责/红线（真实内容）
    ├── SOUL.md                      ← agent 身份人格（真实内容）
    └── .rms-my.cnf.example          ← MySQL 只读凭据模板（真实文件不入库）
```

---

## 4. 部署步骤

### 4.1 建 workspace

```bash
mkdir -p "$HOME/.openclaw/workspace-rms"
cp deploy/openclaw/workspace-rms/AGENTS.md "$HOME/.openclaw/workspace-rms/"
cp deploy/openclaw/workspace-rms/SOUL.md   "$HOME/.openclaw/workspace-rms/"
```

`IDENTITY.md` / `USER.md` / `TOOLS.md` / `HEARTBEAT.md` 保持 OpenClaw 官方模板原样即可，
rms agent 不依赖它们（故本目录不收录，避免与上游模板产生分叉）。

### 4.2 配 MySQL 只读凭据

```bash
cp deploy/openclaw/workspace-rms/.rms-my.cnf.example \
   "$HOME/.openclaw/workspace-rms/.rms-my.cnf"
vi "$HOME/.openclaw/workspace-rms/.rms-my.cnf"     # 填真实值
chmod 600 "$HOME/.openclaw/workspace-rms/.rms-my.cnf"
```

建议单独建只读账号，别复用应用账号：

```sql
CREATE USER 'rms_ro'@'localhost' IDENTIFIED BY '<强密码>';
GRANT SELECT ON rms.* TO 'rms_ro'@'localhost';
FLUSH PRIVILEGES;
```

### 4.3 注册 agent

把 `agent-rms.config.json` 的内容追加进 `openclaw.json` 的 `agents.list` 数组，
**只新增，不要覆盖已有键**。然后重启 Gateway：

```bash
openclaw gateway restart
```

> 磁盘配置改了 ≠ 运行中进程生效。CLI 子命令现读磁盘会「假通过」，
> 而实际请求走 Gateway 内存态 —— 改完 `agents.list` 必须重启。

### 4.4 配 RMS 侧

RMS 从数据库 `system_config` 表读 Gateway 地址与 token，**库优先，为空才 fallback**
到 `openclaw.json`：

```sql
-- 注意：库里有错值时永远不会 fallback，会一直 401
UPDATE system_config SET value = 'http://127.0.0.1:18789' WHERE `key` = 'openclaw_gateway_url';
UPDATE system_config SET value = '<Gateway token>'        WHERE `key` = 'openclaw_gateway_token';
```

可选环境变量：

| 变量 | 默认值 | 作用 |
|---|---|---|
| `OPENCLAW_AGENT_ID` | `rms` | session key 前缀用的 agent id |
| `OPENCLAW_AGENT_MODEL` | `openclaw/rms` | 请求体 `model` 字段 |

### 4.5 给用户开通

`user_openclaw_sessions` 表控制谁能用，需 `enabled = 1`。
走 `POST /api/openclaw` 的开通 action 会自动生成 `session_key`。

---

## 5. 安全设计

### 工具白名单

rms agent 只给三个工具，其余全 deny（见 `agent-rms.config.json`）：

- allow：`read`、`exec`、`session_status`
- deny：`write`、`edit`、`apply_patch`、`browser`、`canvas`、`nodes`、`cron`、
  `sessions_*`、`web_search`、`web_fetch`、`skill_workshop`、`memory_*`

留 `exec` 是因为查库要跑 `mysql` 命令；写操作、外发、跨 session 全封死。

### 硬红线（写在 AGENTS.md 里，agent 每轮都读）

- 只读，不执行 INSERT / UPDATE / DELETE / DDL
- 不执行用户提交的 SQL 原文（防注入），按意图重写
- `system_config` 严禁 `SELECT *`（含密钥）
- 不返回密钥、连接串、token、服务器路径
- 不读写 workspace 之外的文件
- 越界请求用固定一句话回绝，不给替代方案

### 敏感项清单（**均不在本仓库**）

| 项 | 存放位置 | 权限 |
|---|---|---|
| Gateway auth token | `openclaw.json` → `gateway.auth.token` + 库 `system_config` | 600 |
| MySQL 只读密码 | `$HOME/.openclaw/workspace-rms/.rms-my.cnf` | 600 |
| RMS JWT 签名密钥 | `<repo>/.jwt_secret` | 600，已 gitignore |
| 应用 MySQL 密码 | `<repo>/.env.systemd` | 600，已 gitignore |

---

## 6. 验收用例

改完配置跑这三条，全过才算通：

| 问 | 期望 |
|---|---|
| 你是谁 | 「我是 **RMS 助手**…」——**出现 Apple 或其他名字说明 agent 路由错了** |
| 帮我写一份 Java 工程师 JD | 「该请求超出 RMS 系统的能力范围…」一字不差 |
| 需求总数按状态分组 | 真实数字，需与 `mysql` 直连结果一致 |

---

## 7. 已知坑

| 现象 | 真因 |
|---|---|
| agent 回复「我是 Apple」 | session key 缺 `agent:rms:` 前缀，fallback 到 default agent |
| 一直 401，但后台显示「连接正常」 | `system_config.openclaw_gateway_token` 存了错值；库优先于 fallback，永远不会用 `openclaw.json` 里的正确值。绿灯是假的 |
| 改完 `agents.list` 不生效 | Gateway 内存态未刷新，需 restart |
| agent 到处翻文件找凭据 | AGENTS.md 里没给现成命令。授权时要**连带给可直接照抄的命令行** |
| agent 写文件报权限错 | `rms.service` 设了 `ProtectHome=read-only`；只读查询不受影响 |
