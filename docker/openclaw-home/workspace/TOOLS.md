# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics - the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## Related

- [Agent workspace](/concepts/agent-workspace)

### RMS Database

- **Type**: **MySQL**(生产/测试都走 MySQL,不用 SQLite)
- **MySQL 连接**：`mysql://rms@127.0.0.1:3306/rms`（密码由环境变量 `MYSQL_PASSWORD` 注入，勿写进文档或命令行）
- **Query tool**：`node ~/.openclaw/plugin-skills/db-query/scripts/query.js "mysql://rms:$MYSQL_PASSWORD@127.0.0.1:3306/rms" "<sql>"`
- **SQLite fallback**:`/home/itd3/www/rms/data/rms.db`(⚠️ **不要再用**,写 SQL 时要兼容 MySQL;写完用 MySQL 测过才算数)
- **MySQL 专有函数**:CURDATE()、DATE_SUB(... INTERVAL n ...)、DATE_FORMAT()、NOW()、INTERVAL -- 这些 SQLite 没有
- **MySQL 保留字(列名/表名必须加反引号 `\`留字\``)**:
  - `key` (最常见!system_config 表主键名就是 key)-- WHERE key = X 必报错
  - `order` / `group` / `read` / `write` / `desc` / `range` / `option` / `key` / `index` / `check` / `status` / `value` / `name` / `type` / `table`
  - 列别名同样:`high_priority` / `low_priority` / `delayed` / `ignore` / `using` / `order` / `read` 都会在 SQL hint 上下文报语法错
  - 保险起见:别名别用保留字,或一律反引号包裹
- **async db.transaction 坑**:`getAsyncDb().transaction(fn)` 是 async 方法,返回 `Promise<asyncFn>`,需 `await` 两层 + 内层 `await stmt.run()`。同步调用会 `TypeError: updateTx is not a function`
- **Main tables**:
  - `requirements` - 需求列表 (id, title, description, status, priority, business_unit, project_id, handler_id, ...)
  - `projects` - 项目 (id, name, description)
  - `users` - 用户 (id, username, display_name, email)
  - `roles` - 角色
  - `status_log` - 状态变更日志
  - `system_config` - 系统配置
- **Status values**: received_not_evaluated, evaluated_not_scheduled, scheduled, in_progress, completed, verified, closed
- **Priority values**: high, medium, low
