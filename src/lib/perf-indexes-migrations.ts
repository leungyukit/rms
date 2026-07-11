/**
 * 性能优化 · 索引 + priority_rank 列
 *
 * 需求 600225：优化需求池页面加载性能
 * 依据：src/lib/sla-migrations.ts 模式
 *
 * 加索引避免 EXPLAIN 显示 Using temporary; Using filesort；
 * 加 priority_rank 数值列让 ORDER BY 走索引（避免 CASE 表达式排序）。
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensurePerfIndexes() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  // 1) 加 priority_rank 数值列（high=1, medium=2, low=3）
  if (isMysql) {
    // 列存在性检查
    const cols = (db.prepare(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'requirements' AND COLUMN_NAME = 'priority_rank'
    `).all() as any[]);
    if (cols.length === 0) {
      db.exec(`ALTER TABLE requirements ADD COLUMN priority_rank TINYINT NOT NULL DEFAULT 3`);
    }
    // 同步已有数据的 priority_rank（按 priority 字符串映射）—— 每次启动都重算，保证一致性
    db.exec(`
      UPDATE requirements SET priority_rank = CASE priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 3
      END
    `);
  } else {
    // SQLite 路径
    const cols = (db.prepare(`PRAGMA table_info(requirements)`).all() as any[]).map((c: any) => c.name);
    if (!cols.includes('priority_rank')) {
      db.exec(`ALTER TABLE requirements ADD COLUMN priority_rank INTEGER NOT NULL DEFAULT 3`);
    }
    db.exec(`
      UPDATE requirements SET priority_rank = CASE priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 3
        ELSE 3
      END
    `);
  }

  // 2) 加 6 个索引（覆盖状态过滤 + 排序 + 高频筛选）
  const indexes: Array<[string, string, string]> = [
    // P0：覆盖"状态过滤 + priority 排序 + updated_at 倒序"主查询
    ['idx_req_status_pri_updated', 'requirements', 'status, priority_rank, updated_at'],
    // P0：业务单元过滤（高频筛选）
    ['idx_req_business_unit', 'requirements', 'business_unit'],
    // P1：分类过滤
    ['idx_req_category', 'requirements', 'category'],
    // P1：创建时间排序
    ['idx_req_created_at', 'requirements', 'created_at'],
    // P2：迭代 + 状态组合查询
    ['idx_req_sprint_status', 'requirements', 'sprint_id, status'],
  ];

  for (const [idxName, tableName, cols] of indexes) {
    if (isMysql) {
      try {
        db.exec(`CREATE INDEX ${idxName} ON ${tableName}(${cols})`);
      } catch (e: any) {
        if (!/Duplicate key name|already exists/i.test(e.message)) {
          console.error(`[perf-idx] ${idxName}:`, e.message);
        }
      }
    } else {
      try {
        db.exec(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${tableName}(${cols})`);
      } catch (e) {
        console.error(`[perf-idx] ${idxName}:`, e);
      }
    }
  }

  ensured = true;
}

/**
 * 同步 priority_rank 字段（在 POST / PUT 修改 priority 时调用，保证新增/更新数据一致）
 */
export function syncPriorityRank(priority: string): number {
  switch (priority) {
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
    default: return 3;
  }
}
