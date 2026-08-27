/**
 * 自定义报表 / 自定义 Dashboard · 表结构初始化
 *
 * 背景（2026-08-27 线上 bug）：
 *   `/custom-reports` 和 `/custom-dashboards` 点「新建」完全没反应。
 *   根因是这 6 张表**从来没被创建过** —— 建表 SQL 只躺在
 *   `docs/report-database-schema.sql` 里，仓库里没有任何代码执行它，
 *   也没有对应的 migration。于是 API 的 INSERT 直接撞
 *   `ERROR 1146 Table 'rms.reports' doesn't exist`，
 *   而前端 catch 里只有 console.error → 界面静默，表现为「点了没反应」。
 *
 * 依赖顺序（外键）：reports → report_widgets，
 *                  dashboards → dashboard_widgets / user_dashboards。
 * 故下面的建表顺序不可随意调换。
 */
import { getDb, isMysqlEnabled } from './db';

let ensured = false;

export function ensureCustomReportTables() {
  if (ensured) return;
  const db = getDb();
  const isMysql = isMysqlEnabled();

  if (isMysql) {
    // 报表定义
    db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        type VARCHAR(50) NOT NULL DEFAULT 'custom',
        config TEXT,
        layout TEXT,
        created_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_report_creator (created_by),
        INDEX idx_report_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 报表内的图表组件
    db.exec(`
      CREATE TABLE IF NOT EXISTS report_widgets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_id INT NOT NULL,
        name VARCHAR(200) NOT NULL,
        widget_type VARCHAR(50) NOT NULL,
        chart_type VARCHAR(50) NOT NULL,
        data_source TEXT NOT NULL,
        config TEXT,
        position_x INT DEFAULT 0,
        position_y INT DEFAULT 0,
        width INT DEFAULT 4,
        height INT DEFAULT 3,
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_widget_report (report_id),
        INDEX idx_widget_type (widget_type),
        CONSTRAINT fk_report_widgets_report FOREIGN KEY (report_id)
          REFERENCES reports (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Dashboard 定义
    db.exec(`
      CREATE TABLE IF NOT EXISTS dashboards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        is_default TINYINT(1) DEFAULT 0,
        config TEXT,
        layout TEXT,
        created_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_dashboard_creator (created_by),
        INDEX idx_dashboard_default (is_default)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Dashboard 内的组件
    db.exec(`
      CREATE TABLE IF NOT EXISTS dashboard_widgets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        dashboard_id INT NOT NULL,
        widget_type VARCHAR(50) NOT NULL,
        chart_type VARCHAR(50) NOT NULL,
        name VARCHAR(200) NOT NULL,
        data_source TEXT NOT NULL,
        config TEXT,
        position_x INT DEFAULT 0,
        position_y INT DEFAULT 0,
        width INT DEFAULT 4,
        height INT DEFAULT 3,
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_dash_widget_dashboard (dashboard_id),
        INDEX idx_dash_widget_type (widget_type),
        CONSTRAINT fk_dashboard_widgets_dashboard FOREIGN KEY (dashboard_id)
          REFERENCES dashboards (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 用户 ↔ Dashboard 关联（收藏 / 排序）
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_dashboards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        dashboard_id INT NOT NULL,
        is_favorite TINYINT(1) DEFAULT 0,
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_dash (user_id, dashboard_id),
        INDEX idx_user_dash_user (user_id),
        INDEX idx_user_dash_dash (dashboard_id),
        CONSTRAINT fk_user_dashboards_dashboard FOREIGN KEY (dashboard_id)
          REFERENCES dashboards (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // 预定义数据源（/api/data-sources 依赖，同样从未建过）
    db.exec(`
      CREATE TABLE IF NOT EXISTS data_sources (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        description TEXT,
        type VARCHAR(50) NOT NULL,
        query TEXT NOT NULL,
        config TEXT,
        is_system TINYINT(1) DEFAULT 0,
        created_by INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ds_type (type),
        INDEX idx_ds_system (is_system),
        INDEX idx_ds_creator (created_by)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'custom',
        config TEXT,
        layout TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS report_widgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        widget_type TEXT NOT NULL,
        chart_type TEXT NOT NULL,
        data_source TEXT NOT NULL,
        config TEXT,
        position_x INTEGER DEFAULT 0,
        position_y INTEGER DEFAULT 0,
        width INTEGER DEFAULT 4,
        height INTEGER DEFAULT 3,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS dashboards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        is_default INTEGER DEFAULT 0,
        config TEXT,
        layout TEXT,
        created_by INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS dashboard_widgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dashboard_id INTEGER NOT NULL,
        widget_type TEXT NOT NULL,
        chart_type TEXT NOT NULL,
        name TEXT NOT NULL,
        data_source TEXT NOT NULL,
        config TEXT,
        position_x INTEGER DEFAULT 0,
        position_y INTEGER DEFAULT 0,
        width INTEGER DEFAULT 4,
        height INTEGER DEFAULT 3,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dashboard_id) REFERENCES dashboards (id) ON DELETE CASCADE
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_dashboards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        dashboard_id INTEGER NOT NULL,
        is_favorite INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, dashboard_id),
        FOREIGN KEY (dashboard_id) REFERENCES dashboards (id) ON DELETE CASCADE
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS data_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        query TEXT NOT NULL,
        config TEXT,
        is_system INTEGER DEFAULT 0,
        created_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_report_creator ON reports(created_by)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_widget_report ON report_widgets(report_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_dashboard_creator ON dashboards(created_by)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_dash_widget_dashboard ON dashboard_widgets(dashboard_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_user_dash_user ON user_dashboards(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_ds_type ON data_sources(type)`);
  }

  seedSystemDataSources();
  ensured = true;
}

/**
 * 预置系统数据源（is_system = 1）。
 *
 * 背景（2026-08-27 二次修复）：
 *   「新建报表 → 编辑图表 → 数据源」下拉框全空。
 *   前端是 `dataSources.map(...)` 直接渲染，数组为空就一个 option 也没有。
 *   这 5 条种子数据原本只存在于 `scripts/migrate-reports.mjs`，
 *   而那个脚本是写给 SQLite 的，从来没在 MySQL 上跑过 ——
 *   于是表建出来了却是空的。
 *
 * 幂等：按 name 逐条查存在，不依赖唯一索引，也能修补上次只建了空表的部署。
 * 注意：这些 query 会被 `/api/data-sources/query` 的安全校验拦一道
 * （仅 SELECT/WITH、单语句、禁感斄表），所以必须全是纯只读单语句。
 */
function seedSystemDataSources() {
  const db = getDb();
  const seeds = [
    {
      name: '需求按状态统计',
      description: '统计不同状态的需求数量',
      query: 'SELECT status, COUNT(*) as count FROM requirements GROUP BY status',
      config: JSON.stringify({ xKey: 'status', yKey: 'count' }),
    },
    {
      name: '需求按优先级统计',
      description: '统计不同优先级的需求数量',
      query: 'SELECT priority, COUNT(*) as count FROM requirements GROUP BY priority',
      config: JSON.stringify({ xKey: 'priority', yKey: 'count' }),
    },
    {
      name: '需求按业务方统计',
      description: '统计不同业务部门的需求数量',
      query: 'SELECT business_unit, COUNT(*) as count FROM requirements WHERE business_unit IS NOT NULL GROUP BY business_unit',
      config: JSON.stringify({ xKey: 'business_unit', yKey: 'count' }),
    },
    {
      name: '需求按创建时间趋势',
      description: '按日期统计需求创建数量',
      query: 'SELECT DATE(created_at) as date, COUNT(*) as count FROM requirements GROUP BY DATE(created_at) ORDER BY date',
      config: JSON.stringify({ xKey: 'date', yKey: 'count' }),
    },
    {
      name: '项目按状态统计',
      description: '统计不同状态的项目数量',
      query: 'SELECT status, COUNT(*) as count FROM projects GROUP BY status',
      config: JSON.stringify({ xKey: 'status', yKey: 'count' }),
    },
  ];

  for (const s of seeds) {
    try {
      const existing = db.prepare(
        'SELECT id FROM data_sources WHERE name = ? AND is_system = 1'
      ).get(s.name) as any;
      if (existing) continue;
      db.prepare(
        'INSERT INTO data_sources (name, description, type, query, config, is_system, created_by) VALUES (?, ?, ?, ?, ?, 1, NULL)'
      ).run(s.name, s.description, 'sql', s.query, s.config);
    } catch (e) {
      // 单条种子失败不能让整个页面 500，其余数据源仍应可用
      // eslint-disable-next-line no-console
      console.error('[custom-report-migrations] seed 失败:', s.name, (e as any)?.message || e);
    }
  }
}
