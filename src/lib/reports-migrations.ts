/**
 * PDF 周报
 * 依据：rms-docs/RMS-优化方案-阶段4-P2.md § 7
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureReportTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();
  if (isMysql) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS weekly_report_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        scope VARCHAR(20) NOT NULL,
        project_id INT,
        delivery_channel VARCHAR(20) NOT NULL DEFAULT 'download',
        day_of_week INT NOT NULL DEFAULT 1,
        hour INT NOT NULL DEFAULT 9,
        enabled TINYINT NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS weekly_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        week_start DATE NOT NULL,
        week_end DATE NOT NULL,
        generated_by INT,
        user_id INT NOT NULL,
        scope VARCHAR(20) NOT NULL,
        project_id INT,
        file_path VARCHAR(500) NOT NULL,
        file_size INT,
        page_count INT,
        summary_json TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_wr_user_week (user_id, week_start)
      );
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS weekly_report_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        scope TEXT NOT NULL,
        project_id INTEGER,
        delivery_channel TEXT NOT NULL DEFAULT 'download',
        day_of_week INTEGER NOT NULL DEFAULT 1,
        hour INTEGER NOT NULL DEFAULT 9,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS weekly_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        generated_by INTEGER,
        user_id INTEGER NOT NULL,
        scope TEXT NOT NULL,
        project_id INTEGER,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        page_count INTEGER,
        summary_json TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_wr_user_week ON weekly_reports(user_id, week_start);
    `);
  }
  ensured = true;
}

// ISO 周
export function isoWeek(date: Date): { year: number; week: number; start: Date; end: Date } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const start = new Date(date);
  start.setDate(start.getDate() - ((day + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { year: d.getUTCFullYear(), week, start, end };
}

// 周报数据汇总
export function collectWeeklyData(weekStart: Date, weekEnd: Date, scope: 'global' | 'project', projectId?: number): any {
  ensureReportTables();
  const db = getDb();
  const startStr = weekStart.toISOString().slice(0, 10);
  const endStr = weekEnd.toISOString().slice(0, 10);

  // 基础 scope WHERE
  let projFilter = '';
  const params: any[] = [startStr, endStr];
  if (scope === 'project' && projectId) { projFilter = ' AND project_id=? '; params.push(projectId); }

  // 本周完成
  const completed = db.prepare(`SELECT id, title, priority, handler_id, project_id, updated_at FROM requirements WHERE status IN ('completed','verified','closed') AND date(updated_at) BETWEEN ? AND ?${projFilter} ORDER BY updated_at DESC LIMIT 50`).all(...params) as any[];
  // 本周新增
  const newReqs = db.prepare(`SELECT id, title, priority, status, project_id, created_at FROM requirements WHERE date(created_at) BETWEEN ? AND ?${projFilter} ORDER BY created_at DESC LIMIT 50`).all(...params) as any[];
  // 进行中
  const inProgress = db.prepare(`SELECT id, title, priority, handler_id, project_id, status, updated_at FROM requirements WHERE status IN ('in_progress','scheduled','evaluated_not_scheduled') ${scope === 'project' && projectId ? 'AND project_id=?' : ''} ORDER BY updated_at DESC LIMIT 50`).all(...(scope === 'project' && projectId ? [projectId] : [])) as any[];
  // 高优积压
  const highBacklog = db.prepare(`SELECT id, title, status, priority, project_id, created_at FROM requirements WHERE priority='high' AND status NOT IN ('completed','verified','closed') ${scope === 'project' && projectId ? 'AND project_id=?' : ''} ORDER BY created_at ASC LIMIT 20`).all(...(scope === 'project' && projectId ? [projectId] : [])) as any[];

  // 知识新增
  const knowledge = db.prepare(`SELECT id, title, category, created_at FROM knowledge_entries WHERE date(created_at) BETWEEN ? AND ?`).all(startStr, endStr) as any[];

  // 按处理人
  const byHandler = db.prepare(`SELECT handler_id, COUNT(*) as cnt FROM requirements WHERE status NOT IN ('closed') ${scope === 'project' && projectId ? 'AND project_id=?' : ''} GROUP BY handler_id`).all(...(scope === 'project' && projectId ? [projectId] : [])) as any[];
  const handlerMap: Record<number, string> = {};
  for (const u of db.prepare(`SELECT id, display_name FROM users`).all() as any[]) handlerMap[u.id] = u.display_name;

  // 预算告警
  const budgetAlerts = db.prepare(`SELECT a.*, p.name as project_name FROM project_budget_alerts a LEFT JOIN projects p ON p.id = a.project_id WHERE a.status='sent' AND a.triggered_at >= ? ${scope === 'project' && projectId ? 'AND a.project_id=?' : ''}`).all(startStr, ...(scope === 'project' && projectId ? [projectId] : [])) as any[];

  return {
    period: { from: startStr, to: endStr },
    totals: {
      completed: completed.length,
      new_received: newReqs.length,
      in_progress: inProgress.length,
      high_priority_open: highBacklog.length,
    },
    by_handler: byHandler.map((b: any) => ({ user_id: b.handler_id, name: handlerMap[b.handler_id] || `#${b.handler_id}`, in_progress: b.cnt })),
    completed_list: completed.slice(0, 20).map((c: any) => ({ id: c.id, title: c.title, priority: c.priority, handler: handlerMap[c.handler_id] || '-' })),
    new_list: newReqs.slice(0, 20).map((c: any) => ({ id: c.id, title: c.title, priority: c.priority })),
    high_priority_backlog: highBacklog.map((c: any) => ({ id: c.id, title: c.title, days_in_status: Math.floor((Date.now() - new Date(c.created_at).getTime()) / 86400000) })),
    knowledge: { new_entries: knowledge.length, samples: knowledge.slice(0, 10) },
    budget_alerts: budgetAlerts.map((a: any) => ({ project_id: a.project_id, project_name: a.project_name, threshold: a.threshold, ratio: a.triggered_ratio })),
  };
}

// 生成 HTML 报告
export function renderWeeklyHtml(data: any, opts: { userName: string; weekLabel: string }): string {
  const pct = (n: number) => n.toString();
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"/><title>RMS 周报 ${opts.weekLabel}</title>
<style>
  body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1f2937; }
  h1 { color: #1e40af; border-bottom: 3px solid #1e40af; padding-bottom: 8px; }
  h2 { color: #1e3a8a; margin-top: 24px; border-left: 4px solid #1e40af; padding-left: 8px; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .stat { background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; }
  .stat-value { font-size: 28px; font-weight: bold; color: #1e40af; }
  .stat-label { font-size: 12px; color: #6b7280; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { background: #1e40af; color: white; padding: 6px 8px; text-align: left; font-size: 12px; }
  td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }
  tr:nth-child(even) { background: #f9fafb; }
  .priority-high { color: #dc2626; font-weight: bold; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px dashed #d1d5db; font-size: 11px; color: #9ca3af; text-align: center; }
  .empty { color: #9ca3af; font-style: italic; padding: 8px; }
  .toolbar { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 100; }
  .toolbar button { padding: 6px 12px; border: 0; border-radius: 6px; background: #1e40af; color: white; font-size: 13px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  .toolbar button:hover { background: #1e3a8a; }
  @media print {
    .toolbar { display: none; }
    body { max-width: 100%; padding: 0; }
    h1 { page-break-after: avoid; }
    h2 { page-break-after: avoid; margin-top: 16px; }
    table, .stats, .stat { page-break-inside: avoid; }
    @page { margin: 1.5cm; size: A4; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨️ 打印 / 另存为 PDF</button>
  </div>
  <h1>📊 RMS 周报 - ${opts.weekLabel}</h1>
  <p><b>收件人：</b>${opts.userName}　<b>周期：</b>${data.period.from} 至 ${data.period.to}　<b>生成时间：</b>${new Date().toLocaleString('zh-CN')}</p>

  <h2>📈 全局概览</h2>
  <div class="stats">
    <div class="stat"><div class="stat-value">${pct(data.totals.completed)}</div><div class="stat-label">本周完成</div></div>
    <div class="stat"><div class="stat-value">${pct(data.totals.new_received)}</div><div class="stat-label">新增需求</div></div>
    <div class="stat"><div class="stat-value">${pct(data.totals.in_progress)}</div><div class="stat-label">进行中</div></div>
    <div class="stat"><div class="stat-value">${pct(data.totals.high_priority_open)}</div><div class="stat-label">高优积压</div></div>
  </div>

  <h2>👥 处理人分布</h2>
  ${data.by_handler.length ? `<table><tr><th>处理人</th><th>在手需求</th></tr>${data.by_handler.map((h: any) => `<tr><td>${h.name}</td><td>${h.in_progress}</td></tr>`).join('')}</table>` : '<div class="empty">暂无</div>'}

  <h2>✅ 本周完成（Top 20）</h2>
  ${data.completed_list.length ? `<table><tr><th>ID</th><th>标题</th><th>优先级</th><th>处理人</th></tr>${data.completed_list.map((c: any) => `<tr><td>#${c.id}</td><td>${c.title}</td><td class="${c.priority === 'high' ? 'priority-high' : ''}">${c.priority}</td><td>${c.handler}</td></tr>`).join('')}</table>` : '<div class="empty">本周无完成</div>'}

  <h2>🆕 本周新增（Top 20）</h2>
  ${data.new_list.length ? `<table><tr><th>ID</th><th>标题</th><th>优先级</th></tr>${data.new_list.map((c: any) => `<tr><td>#${c.id}</td><td>${c.title}</td><td class="${c.priority === 'high' ? 'priority-high' : ''}">${c.priority}</td></tr>`).join('')}</table>` : '<div class="empty">本周无新增</div>'}

  <h2>🚨 高优积压</h2>
  ${data.high_priority_backlog.length ? `<table><tr><th>ID</th><th>标题</th><th>已积压</th></tr>${data.high_priority_backlog.map((c: any) => `<tr><td>#${c.id}</td><td>${c.title}</td><td class="priority-high">${c.days_in_status} 天</td></tr>`).join('')}</table>` : '<div class="empty">无高优积压 🎉</div>'}

  <h2>📚 知识库新增</h2>
  <p>本周新增 <b>${data.knowledge.new_entries}</b> 条知识</p>
  ${data.knowledge.samples.length ? `<table><tr><th>ID</th><th>标题</th><th>分类</th></tr>${data.knowledge.samples.map((k: any) => `<tr><td>#${k.id}</td><td>${k.title}</td><td>${k.category || '-'}</td></tr>`).join('')}</table>` : ''}

  <h2>💰 预算告警</h2>
  ${data.budget_alerts.length ? `<table><tr><th>项目</th><th>阈值</th><th>使用率</th></tr>${data.budget_alerts.map((a: any) => `<tr><td>${a.project_name}</td><td>${a.threshold}%</td><td>${(a.ratio * 100).toFixed(1)}%</td></tr>`).join('')}</table>` : '<div class="empty">无预算告警</div>'}

  <div class="footer">RMS 需求管理系统 · 自动生成 · ${new Date().toISOString()}</div>
</body></html>`;
}
