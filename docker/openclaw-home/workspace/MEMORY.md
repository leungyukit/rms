# MEMORY.md - Apple 的长期记忆

## 核心规则

### 质量红线
- 提交前必须验证：TS 编译零错误 + 关键页面 HTTP 200
- 不改已知能工作的代码（"不碰就没错"原则）
- 每项改动都要有可验证的验收标准，不接受"应该没问题"
- 发现问题立刻修，不遗留已知 bug

### 默认需求归属
- **项目**：RMS 系统项目（id=10）
- **处理人**：KennyJin（id=100009）
- **适用范围**：**本群聊（Feishu group）** 中提出的所有需求、bug 修复、测试任务，除非大哥明确指定其他项目/处理人
- **群聊 ID**：`chat:oc_bf43c5b48efd810aca93f78997ac6481`（【Apple】-高级开发工程师）
- **注意**：群里的 @Apple 提的任务 = RMS 项目 + KennyJin，这是默认值，不需要每次确认

## 关键配置

### 数据库
- MySQL 主库：`mysql://rms:***@127.0.0.1:3306/rms`
- 密码从 `/home/itd3/www/rms/.env.local` 读
- SQLite fallback 已废弃（不再使用）

### RMS 系统
- Dev 地址：`http://127.0.0.1:3800`
- Admin 登录：`admin/***`（bcrypt hash: `$2b$10$uGX.fzb/AuBaoF82ZMwaU.dHxuTqPlj3Kze4LtEYUPqFqHY25JBDm`）
- 默认项目：RMS系统项目（id=10）
- 默认处理人：KennyJin（id=100009，角色：project_receiver + requirement_handler）

### Memcache
- 服务：`memcached` 在 `127.0.0.1:11211`
- 配置开关：`system_config.memcache_enabled`
- 存储：`src/lib/chat-store.ts`（双后端：文件/Memcache）

### 主题
- 用户偏好存在 `users.theme` 列（light/dark/system）
- API：`/api/user/theme`（GET/PUT）

## 经验教训

### MySQL 兼容性
- 保留字必须反引号：`key / order / group / read / write / desc / range / option / index / check / status / value / name / type / table`
- `INSERT IGNORE` 双兼容（SQLite 也接受），不要用 `INSERT OR IGNORE`

### better-sqlite3 / MySQL 抽象层
- `db.transaction(fn)` 在 async 上下文中返回 `Promise<asyncFn>`
- 必须 `await db.transaction(async (...) => { await stmt.run() })`
- 所有 transaction 内的 stmt 都要 await

### LLM 集成
- `get()` 是 async，配置对象必须全部 `await`
- Prompt 精简很重要（155K → 800 字，响应 30s → 5s）

### TS 编译
- `await` 只能在 async 函数或模块顶层使用
- `db.transaction()` 返回值需要两层 await（外层 + 内层 stmt）

## 今日工作汇总（2026-06-09）

### 完成的需求
| ID | 标题 | 状态 |
|---|---|---|
| 600225 | 性能优化 | completed |
| 600226 | 通知中心 404 | completed |
| 600227 | AI 模式网络错误 | completed |
| 600228 | OpenClaw 401 | completed |
| 600229 | Agent 前端报错 | completed |
| 600230 | 会话持久化 Memcache | completed |
| 600231 | 对话工作台对齐修复 | completed |
| 600232 | 高级配置 tab 改名 | completed |
| 600233 | Tapeli 样式改造 | completed |
| 600234 | Tapeli 全页面覆盖 | completed |
| 600235 | Tapeli 回归测试 | completed |
| 600236 | 深色/浅色主题切换 | completed |
| 600237 | 主题全页面适配+持久化 | completed |
| 600238 | TS 编译错误修复（79→0） | completed |

### 关键文件
- `src/lib/theme.ts` — 主题管理
- `src/lib/chat-store.ts` — Memcache 双后端
- `src/lib/perf-indexes-migrations.ts` — 性能索引迁移
- `src/app/api/user/theme/route.ts` — 主题 API
- `src/app/(app)/notifications/page.tsx` — 通知中心页面
- `src/app/globals.css` — Tapeli 样式 + 深色模式
- `src/app/(app)/chat/page.tsx` — 对话工作台（含删除历史对话功能）
- `src/app/api/chat/conversations/[id]/route.ts` — 删除单个对话 API（DELETE）
