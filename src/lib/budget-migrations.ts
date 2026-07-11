/**
 * 项目预算/成本管理
 * 依据：rms-docs/RMS-优化方案-阶段4-P2.md § 4
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureBudgetTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    // projects 扩字段
    try { db.exec(`ALTER TABLE projects ADD COLUMN budget DOUBLE DEFAULT 0`); } catch (e) {}
    try { db.exec(`ALTER TABLE projects ADD COLUMN currency VARCHAR(10) DEFAULT 'CNY'`); } catch (e) {}
    try { db.exec(`ALTER TABLE projects ADD COLUMN cost_center VARCHAR(50)`); } catch (e) {}
    try { db.exec(`ALTER TABLE projects ADD COLUMN budget_period VARCHAR(20) DEFAULT 'total'`); } catch (e) {}
    try { db.exec(`ALTER TABLE projects ADD COLUMN alert_threshold_80 TINYINT NOT NULL DEFAULT 1`); } catch (e) {}
    try { db.exec(`ALTER TABLE projects ADD COLUMN alert_threshold_100 TINYINT NOT NULL DEFAULT 1`); } catch (e) {}
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_costs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        category VARCHAR(30) NOT NULL,
        amount DOUBLE NOT NULL,
        occurred_on DATE NOT NULL,
        description TEXT,
        vendor VARCHAR(200),
        requirement_id INT,
        attachment_id INT,
        created_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_pc_project_date (project_id, occurred_on),
        KEY idx_pc_requirement (requirement_id)
      );
      CREATE TABLE IF NOT EXISTS project_budget_alerts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        threshold INT NOT NULL,
        triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        triggered_cost DOUBLE NOT NULL,
        triggered_budget DOUBLE NOT NULL,
        triggered_ratio DOUBLE NOT NULL,
        notified_user_ids TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'sent',
        acknowledged_by INT,
        acknowledged_at DATETIME,
        KEY idx_pba_project_status (project_id, status)
      );
    `);
  } else {
    const cols = (db.prepare(`PRAGMA table_info(projects)`).all() as any[]).map((c: any) => c.name);
    if (!cols.includes('budget')) db.exec(`ALTER TABLE projects ADD COLUMN budget REAL DEFAULT 0`);
    if (!cols.includes('currency')) db.exec(`ALTER TABLE projects ADD COLUMN currency TEXT DEFAULT 'CNY'`);
    if (!cols.includes('cost_center')) db.exec(`ALTER TABLE projects ADD COLUMN cost_center TEXT`);
    if (!cols.includes('budget_period')) db.exec(`ALTER TABLE projects ADD COLUMN budget_period TEXT DEFAULT 'total'`);
    if (!cols.includes('alert_threshold_80')) db.exec(`ALTER TABLE projects ADD COLUMN alert_threshold_80 INTEGER NOT NULL DEFAULT 1`);
    if (!cols.includes('alert_threshold_100')) db.exec(`ALTER TABLE projects ADD COLUMN alert_threshold_100 INTEGER NOT NULL DEFAULT 1`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_costs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        occurred_on TEXT NOT NULL,
        description TEXT,
        vendor TEXT,
        requirement_id INTEGER,
        attachment_id INTEGER,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_pc_project_date ON project_costs(project_id, occurred_on);
      CREATE INDEX IF NOT EXISTS idx_pc_requirement ON project_costs(requirement_id);
      CREATE TABLE IF NOT EXISTS project_budget_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        threshold INTEGER NOT NULL,
        triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        triggered_cost REAL NOT NULL,
        triggered_budget REAL NOT NULL,
        triggered_ratio REAL NOT NULL,
        notified_user_ids TEXT,
        status TEXT NOT NULL DEFAULT 'sent',
        acknowledged_by INTEGER,
        acknowledged_at DATETIME
      );
      CREATE INDEX IF NOT EXISTS idx_pba_project_status ON project_budget_alerts(project_id, status);
    `);
  }

  ensured = true;
}

// 计算实际成本
export function getActualCost(projectId: number): number {
  ensureBudgetTables();
  const db = getDb();
  const r = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM project_costs WHERE project_id=?`).get(projectId) as any;
  return r?.total || 0;
}

export interface BudgetSummary {
  project_id: number;
  budget: number;
  currency: string;
  actual_cost: number;
  remaining: number;
  usage_ratio: number;
  by_category: { category: string; amount: number; ratio: number }[];
  alerts: any[];
}

export function getBudgetSummary(projectId: number): BudgetSummary {
  ensureBudgetTables();
  const db = getDb();
  const p = db.prepare(`SELECT id, budget, currency, alert_threshold_80, alert_threshold_100 FROM projects WHERE id=?`).get(projectId) as any;
  if (!p) return { project_id: projectId, budget: 0, currency: 'CNY', actual_cost: 0, remaining: 0, usage_ratio: 0, by_category: [], alerts: [] };
  const actual = getActualCost(projectId);
  const ratio = p.budget > 0 ? actual / p.budget : 0;
  const byCat = db.prepare(`SELECT category, COALESCE(SUM(amount), 0) AS amount FROM project_costs WHERE project_id=? GROUP BY category`).all(projectId) as any[];
  const alerts = db.prepare(`SELECT * FROM project_budget_alerts WHERE project_id=? ORDER BY triggered_at DESC LIMIT 20`).all(projectId) as any[];
  return {
    project_id: projectId,
    budget: p.budget,
    currency: p.currency,
    actual_cost: actual,
    remaining: Math.max(0, p.budget - actual),
    usage_ratio: ratio,
    by_category: byCat.map(c => ({ category: c.category, amount: c.amount, ratio: p.budget > 0 ? c.amount / p.budget : 0 })),
    alerts,
  };
}

// 触发预算告警
export function checkBudgetAlerts(projectId: number): { triggered: any[] } {
  ensureBudgetTables();
  const db = getDb();
  const summary = getBudgetSummary(projectId);
  if (summary.budget <= 0) return { triggered: [] };
  const p = db.prepare(`SELECT alert_threshold_80, alert_threshold_100 FROM projects WHERE id=?`).get(projectId) as any;
  const triggered: any[] = [];

  for (const t of [80, 100]) {
    const pct = t;
    if (summary.usage_ratio * 100 < pct) continue;
    if (t === 80 && !p?.alert_threshold_80) continue;
    if (t === 100 && !p?.alert_threshold_100) continue;
    // 去重：同 threshold 已 sent/acknowledged 跳过
    const exists = db.prepare(`SELECT id FROM project_budget_alerts WHERE project_id=? AND threshold=? AND status IN ('sent','acknowledged') LIMIT 1`).get(projectId, pct) as any;
    if (exists) continue;
    const r = db.prepare(`
      INSERT INTO project_budget_alerts(project_id, threshold, triggered_cost, triggered_budget, triggered_ratio, status)
      VALUES (?, ?, ?, ?, ?, 'sent')
    `).run(projectId, pct, summary.actual_cost, summary.budget, summary.usage_ratio);
    triggered.push({ id: r.lastInsertRowid, threshold: pct, project_id: projectId });
  }
  return { triggered };
}
