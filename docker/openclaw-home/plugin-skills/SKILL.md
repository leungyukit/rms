---
name: db-query
description: "Query SQLite and MySQL databases. Run SELECT, show schemas, analyze data. Supports RMS database and custom connections."
---

# Database Query

Query SQLite and MySQL databases directly. Use for data analysis, debugging, and reporting.

## Usage

Run the query script:

```bash
node ~/.openclaw/plugin-skills/db-query/scripts/query.js <database_url> <sql>
```

### Database URL formats

- SQLite: `sqlite:///path/to/database.db` or `sqlite:data/rms.db`
- MySQL: `mysql://user:password@host:port/database`

### Examples

```bash
# Query RMS SQLite database
node ~/.openclaw/plugin-skills/db-query/scripts/query.js sqlite:/home/itd3/www/rms/data/rms.db "SELECT * FROM requirements LIMIT 10"

# Show all tables
node ~/.openclaw/plugin-skills/db-query/scripts/query.js sqlite:/home/itd3/www/rms/data/rms.db ".tables"

# Show table schema
node ~/.openclaw/plugin-skills/db-query/scripts/query.js sqlite:/home/itd3/www/rms/data/rms.db ".schema requirements"

# Count by status
node ~/.openclaw/plugin-skills/db-query/scripts/query.js sqlite:/home/itd3/www/rms/data/rms.db "SELECT status, COUNT(*) as count FROM requirements GROUP BY status"

# MySQL query
node ~/.openclaw/plugin-skills/db-query/scripts/query.js mysql://root:password@localhost:3306/mydb "SELECT * FROM users"
```

## RMS Database

The RMS system uses SQLite at: `/home/itd3/www/rms/data/rms.db`

Main tables:
- `requirements` - 需求列表
- `projects` - 项目
- `users` - 用户
- `roles` - 角色
- `user_roles` - 用户角色关联
- `tags` - 标签
- `requirement_tags` - 需求标签关联
- `status_log` - 状态变更日志
- `system_config` - 系统配置
- `workflows` - 工作流
- `comments` - 评论

## Rules

- Always use SELECT for queries; never modify data without explicit user permission
- For large results, add LIMIT clauses
- Wrap complex queries in transactions for safety
- Show column names in output
