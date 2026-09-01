# RMS 知识管理升级 · 修复与建设计划

> 制定：2026-09-01 · 触发：知识管理定位补全评审
> 结论先行：**上线前必须先修 P0，现有知识库有 4 处硬崩 + 全文检索实际未生效。**

---

## 0. 调研实测结论（不是推测，全部 SQL 复现过）

| 发现 | 证据 | 严重度 |
|---|---|---|
| `knowledge_feedback.entry_id` 不存在（实际列名 `knowledge_id`） | `ERROR 1054 Unknown column 'entry_id'` | 🔴 反馈接口全 500 |
| `knowledge_relations.source_entry_id/target_entry_id` 不存在（实际 `source_id/target_id`） | `ERROR 1054` | 🔴 详情页关联、删除接口全 500 |
| `knowledge_entries.approved_by` / `confidence` 不存在 | `ERROR 1054` | 🔴 详情接口全 500 |
| `knowledge_entries.freshness_status` 等 5 列不存在 | `ERROR 1054` | 🔴 保鲜/复审全挂 |
| `knowledge_relations.weight` 不存在但被 ORDER BY | 同上 | 🔴 |
| MySQL FULLTEXT 索引**一个都没建成** | `information_schema.STATISTICS WHERE INDEX_TYPE='FULLTEXT'` 返回 0 行 | 🔴 检索一直走 LIKE 兜底 |
| 即便建成也不带 `WITH PARSER ngram` | `fts-migrations.ts:22` | 🟠 中文不分词 |
| SQLite 侧 `knowledge_entries_fts` / `projects_fts` 无同步触发器 | 只有 `requirements_*` 三个 trigger | 🟠 新增知识永远搜不到 |
| `escapeFts()` 把标点全抹成空格 | `fts-migrations.ts` | 🟠 召回率损失 |
| 知识分类只有扁平 `category VARCHAR(100)`，无分类表/层级 | `DESC knowledge_entries` | 🟠 缺分类体系 |
| 知识无任何权限隔离，`hasFunctionalAccess` 一道粗门进来全看见 | `knowledge/route.ts:9` | 🔴 越权可读 |
| 知识标签是表内 JSON 字符串，与正经 `tags` 表脱节 | `tags`/`requirement_tags` 只服务需求 | 🟠 无法聚合检索 |
| 知识条目零版本历史（需求有 `requirement_versions`） | 全库无 `knowledge_versions` | 🟠 改错回不去 |
| 需求关闭无沉淀强制/提醒 | 无 capture 钩子 | 🟠 知识库会变死库 |

`ensureFreshnessTables()` / `ensureFtsIndexes()` 里的 `try{}catch(e){}` 静默吞异常，
是这些问题**能活到今天没人发现**的根因。→ 本次一并加迁移自检端点。

---

## 1. 执行顺序与验收标准

### P0 · 崩溃修复：schema/代码对齐（阻塞一切）

**做法**：新建 `src/lib/knowledge-migrations.ts` 统一收口，幂等、MySQL+SQLite 双写。

- `knowledge_feedback`：`knowledge_id` → `entry_id`（存在旧列且无新列才改名，幂等）
- `knowledge_relations`：补 `weight DOUBLE DEFAULT 1.0`
- `knowledge_entries`：补 `approved_by` / `approved_at` / `confidence` / `content_format`
- 调 `ensureFreshnessTables()` 补齐 5 个保鲜列
- 代码侧把 `source_entry_id/target_entry_id` 改回 `source_id/target_id`（DB 是对的，代码错了；且 `graph/route.ts` 已在用 `source_id`，改 DB 会连带弄坏地图）
- 所有 knowledge API 入口挂 `ensureKnowledgeTables()`

**验收**：`GET /api/knowledge/[id]`、`POST feedback`、`DELETE`、`scan-stale` 四条链路
从 500 变 200；`docs/` 下留 SQL 复现脚本。

### P1 · 全文检索真正生效

- MySQL：`ADD FULLTEXT INDEX ... WITH PARSER ngram`（**关键**，原实现漏了 parser）
- SQLite：给 `knowledge_entries_fts` / `projects_fts` 补 insert/update/delete 三件套 trigger
- 去掉裸 `try{}catch(e){}`，失败要能查：迁移结果写入 `system_config` 或日志
- 新增 `GET /api/admin/migrations/verify`：把索引/触发器/列的实际存在性列出来

**验收**：verify 端点显示 3 张表索引全在；新建一条知识后立刻能被 `/api/search` 搜到。

### P2 · 知识权限模型（安全优先，排在分类树之前）

- `knowledge_categories`：`id, name, parent_id, path, sort_order, is_restricted`
- `knowledge_category_acl`：`category_id, role_name, can_read, can_write, can_manage`
- `knowledge_entries` 补 `category_id INT`
- `src/lib/knowledge-acl.ts`：`getReadableCategoryIds(user)` / `canWriteCategory()`
- **过滤要落到所有出口**：list / detail / search / suggest / graph / stats / recommend
  （只挡列表页不挡搜索 = 没挡）
- 兼容策略：`is_restricted=0` 的分类默认开放，未分类条目视同开放；
  打了 `is_restricted=1` 才要显式授权 → 不破坏现有数据，又能收紧敏感分类

**验收**：建一个 restricted 分类，用无授权角色的 token 打 7 个出口，全部搜不到、看不到、图里没有。

### P3 · 分类树 + 标签归一化

- 从现有 `DISTINCT category` 字符串回填分类树，`category` 老列保留只读兼容
- `knowledge_tags(entry_id, tag_id)` join 表，复用 `tags` 表
- 标签归一化键：trim + 折叠大小写/全半角，避免"权限管理"和"权限管理 "算两个
- 读取：join 表优先，回落 JSON 列；写入：双写一轮，后续再摘掉 JSON

**验收**：按分类树节点（含子树）过滤、按标签聚合检索均可用；标签统计无重复变体。

### P4 · 知识版本历史

- `knowledge_versions`：`entry_id, version_no, title/question/answer/content/category_id/tags_snapshot, change_summary, changed_by, changed_at`
- PUT 时先快照后更新（同一事务）
- API：`GET /[id]/versions`、`GET /[id]/versions/[v]`、`POST /[id]/versions/[v]/restore`

**验收**：改 3 次能看到 3 个版本、能 diff、能回滚；回滚本身也产生新版本（不丢历史）。

### P5 · 中文分词升级

- MySQL：靠 P1 的 `WITH PARSER ngram` + 已确认 `ngram_token_size=2`
- SQLite：知识/需求/项目 FTS 改 `tokenize='trigram'`（CJK 子串召回好），需重建虚表 + 回填
- 重写 `escapeFts()`：保留中文与必要操作符，只清理 FTS5 语法危险字符
- 加检索单测：中文短词、跨词组、英文混排、标点

**验收**：搜"审批流""权限管理"能召回；对照测试集召回率明显优于 LIKE 兜底。

### P6 · 需求关闭 → 知识沉淀闭环

- `knowledge_capture_tasks`：`requirement_id, assigned_to, status, due_at, resolved_entry_id`
- 需求进 `completed/verified/closed` 且无 `source_requirement_id` 指向时自动建任务
- 软门禁：`system_config.knowledge_capture_gate`（off / warn / block），默认 `warn`
- 待沉淀数进 dashboard，逾期走既有通知

**验收**：关闭一个无知识产出的需求 → 自动生成 capture 任务 + dashboard 计数 +1；
沉淀后任务自动 resolve。

---

## 2. 风险与约束

- **不删列、不删数据**：老 `category` / `tags` JSON 列全部保留只读，回滚只需还原代码
- **迁移幂等**：所有 DDL 先探 `information_schema` / `PRAGMA` 再执行
- **双数据库**：每条迁移必须 MySQL + SQLite 两套分支，本机跑 MySQL（`DB_TYPE=mysql`）
- **FTS 重建有写放大**：P5 重建虚表放最后，且先备份
- **每个 P 独立 commit**，出问题按 P 粒度回退

## 3. 进度

- [ ] P0 崩溃修复
- [ ] P1 全文检索生效
- [ ] P2 知识权限模型
- [ ] P3 分类树 + 标签归一化
- [ ] P4 版本历史
- [ ] P5 中文分词
- [ ] P6 沉淀闭环
