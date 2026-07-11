/**
 * 验收标准（AC）· 表结构与模板初始化
 * 依据：rms-docs/RMS-优化方案-阶段1-P0.md § 3
 *
 * 1 张表：requirement_acceptance_criteria
 * 5 套预置模板：performance / functional / security / compatibility / data
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureAcceptanceCriteriaTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_acceptance_criteria (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requirement_id INT NOT NULL,
        sequence INT NOT NULL DEFAULT 0,
        criterion_text TEXT NOT NULL,
        acceptance_type VARCHAR(20) NOT NULL DEFAULT 'manual',
        target_value VARCHAR(100) DEFAULT NULL,
        is_required TINYINT NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        evidence TEXT,
        verified_by INT DEFAULT NULL,
        verified_at DATETIME DEFAULT NULL,
        created_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ac_requirement (requirement_id),
        INDEX idx_ac_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS requirement_acceptance_criteria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requirement_id INTEGER NOT NULL,
        sequence INTEGER NOT NULL DEFAULT 0,
        criterion_text TEXT NOT NULL,
        acceptance_type TEXT NOT NULL DEFAULT 'manual',
        target_value TEXT,
        is_required INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        evidence TEXT,
        verified_by INTEGER,
        verified_at DATETIME,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ac_requirement ON requirement_acceptance_criteria(requirement_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ac_status ON requirement_acceptance_criteria(status)`);
  }

  // 5 套预置 AC 模板，写入 system_config（ac_template_*）
  const templates: Array<[string, string]> = [
    [
      'ac_template_performance',
      JSON.stringify([
        { text: '核心接口 P99 响应时间 < 200ms', type: 'metric', target: '200ms' },
        { text: '页面首屏加载 < 1.5s（3G 网络下）', type: 'metric', target: '1500ms' },
        { text: 'CPU 峰值占用 < 70%（持续 1 小时）', type: 'metric', target: '70%' },
        { text: '内存泄漏检测：跑 24h 后无明显增长', type: 'manual' },
        { text: '并发 100 用户下无错误', type: 'metric', target: '100' },
        { text: '数据库慢查询 < 5 条/分钟', type: 'metric', target: '5' },
      ]),
    ],
    [
      'ac_template_functional',
      JSON.stringify([
        { text: '主流程跑通：业务方提供的 3 条核心场景用例全部通过', type: 'manual', required: true },
        { text: '异常路径覆盖：每个分支至少有 1 条对应测试', type: 'manual' },
        { text: '边界条件：空值/超长/特殊字符均不报错', type: 'manual' },
        { text: '权限隔离：未授权用户看不到/调不到对应数据', type: 'manual' },
        { text: '数据一致性：增删改后列表/详情/统计同步更新', type: 'manual' },
        { text: '回归通过：未引入新的 bug', type: 'manual', required: true },
      ]),
    ],
    [
      'ac_template_security',
      JSON.stringify([
        { text: 'SQL 注入：所有入参走参数化查询', type: 'manual', required: true },
        { text: 'XSS：用户输入展示前做转义', type: 'manual', required: true },
        { text: 'CSRF：写操作带 token 校验', type: 'manual' },
        { text: '敏感字段：密码/手机号/身份证存储加密', type: 'manual', required: true },
        { text: '越权：横向越权（A 看不到 B 的数据）和纵向越权（低权限调高权限接口）均已拦截', type: 'manual', required: true },
        { text: '审计：关键操作写入 audit_logs', type: 'manual' },
      ]),
    ],
    [
      'ac_template_compatibility',
      JSON.stringify([
        { text: 'Chrome 最新版正常', type: 'manual', required: true },
        { text: 'Safari 最新版正常', type: 'manual' },
        { text: 'Firefox 最新版正常', type: 'manual' },
        { text: 'Edge 最新版正常', type: 'manual' },
        { text: '移动端：iOS Safari + Android Chrome 主要流程 OK', type: 'manual' },
        { text: '分辨率：1280×720 / 1920×1080 / 2560×1440 均无错位', type: 'manual' },
        { text: '弱网/离线场景有降级提示', type: 'manual' },
      ]),
    ],
    [
      'ac_template_data',
      JSON.stringify([
        { text: '数据导入：Excel/CSV 1000 行 30 秒内完成', type: 'metric', target: '30s' },
        { text: '数据导出：1 万行 1 分钟内完成', type: 'metric', target: '60s' },
        { text: '数据校验：必填/格式/外键错误有明确提示', type: 'manual', required: true },
        { text: '幂等性：重复提交/重复导入不产生脏数据', type: 'manual', required: true },
        { text: '回滚：测试数据可一键回滚到导入前状态', type: 'manual' },
      ]),
    ],
  ];

  const insertConfig = isMysql
    ? `INSERT INTO system_config (\`key\`, \`value\`, \`label\`, \`description\`, \`category\`, \`type\`, \`sort_order\`)
       VALUES (?, ?, ?, ?, 'ac', 'json', ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`
    : `INSERT IGNORE INTO system_config (key, value, label, description, category, type, sort_order)
       VALUES (?, ?, ?, ?, 'ac', 'json', ?)`;

  const labels: Record<string, string> = {
    ac_template_performance: 'AC 模板 · 性能类',
    ac_template_functional: 'AC 模板 · 功能类',
    ac_template_security: 'AC 模板 · 安全类',
    ac_template_compatibility: 'AC 模板 · 兼容性',
    ac_template_data: 'AC 模板 · 数据类',
  };
  const descs: Record<string, string> = {
    ac_template_performance: '响应时间、并发、资源占用等性能验收点',
    ac_template_functional: '功能完整性、流程、异常路径、回归',
    ac_template_security: '注入、XSS、越权、加密、审计',
    ac_template_compatibility: '浏览器/移动端/分辨率兼容',
    ac_template_data: '导入导出、校验、幂等、回滚',
  };
  const sortOrders: Record<string, number> = {
    ac_template_performance: 200,
    ac_template_functional: 201,
    ac_template_security: 202,
    ac_template_compatibility: 203,
    ac_template_data: 204,
  };

  for (const [key, value] of templates) {
    db.prepare(insertConfig).run(key, value, labels[key], descs[key], sortOrders[key]);
  }

  ensured = true;
}

/**
 * 读取所有 AC 模板
 */
export function getAcTemplates(): Array<{ key: string; label: string; items: any[] }> {
  ensureAcceptanceCriteriaTables();
  const db = getDb();
  const rows = db.prepare(
    `SELECT \`key\`, label, value FROM system_config WHERE category = 'ac' AND \`key\` LIKE 'ac_template_%' ORDER BY sort_order`
  ).all() as any[];

  return rows.map((r) => {
    let items: any[] = [];
    try {
      const parsed = JSON.parse(r.value);
      if (Array.isArray(parsed)) items = parsed;
    } catch {}
    return { key: r.key, label: r.label, items };
  });
}

/**
 * 聚合统计某需求的 AC 进度
 */
export function getAcAggregate(requirementId: number) {
  ensureAcceptanceCriteriaTables();
  const db = getDb();
  const rows = db.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
       SUM(CASE WHEN is_required = 1 THEN 1 ELSE 0 END) as required_total,
       SUM(CASE WHEN is_required = 1 AND status = 'passed' THEN 1 ELSE 0 END) as required_passed,
       SUM(CASE WHEN is_required = 1 AND status != 'passed' AND status != 'skipped' THEN 1 ELSE 0 END) as required_blocking
     FROM requirement_acceptance_criteria WHERE requirement_id = ?`
  ).get(requirementId) as any;

  const total = rows?.total || 0;
  const passed = rows?.passed || 0;
  const requiredTotal = rows?.required_total || 0;
  const requiredPassed = rows?.required_passed || 0;
  const requiredBlocking = rows?.required_blocking || 0;
  const progressPct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const requiredPct = requiredTotal > 0 ? Math.round((requiredPassed / requiredTotal) * 100) : 0;

  return {
    ac_total: total,
    ac_passed: passed,
    ac_required_total: requiredTotal,
    ac_required_passed: requiredPassed,
    ac_required_blocking: requiredBlocking,
    ac_progress_pct: progressPct,
    ac_required_pct: requiredPct,
    ac_can_complete: requiredBlocking === 0, // required 全 passed 或 skipped 才可进 completed
  };
}
