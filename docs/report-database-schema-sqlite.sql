
-- 自定义报表和Dashboard功能 - SQLite 数据库结构

-- 报表定义表
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
);

CREATE INDEX IF NOT EXISTS idx_report_creator ON reports (created_by);
CREATE INDEX IF NOT EXISTS idx_report_type ON reports (type);

-- 报表图表组件表
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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_widget_report ON report_widgets (report_id);
CREATE INDEX IF NOT EXISTS idx_widget_type ON report_widgets (widget_type);

-- Dashboard定义表
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
);

CREATE INDEX IF NOT EXISTS idx_dashboard_creator ON dashboards (created_by);
CREATE INDEX IF NOT EXISTS idx_dashboard_default ON dashboards (is_default);

-- Dashboard组件表
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
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dash_widget_dashboard ON dashboard_widgets (dashboard_id);
CREATE INDEX IF NOT EXISTS idx_dash_widget_type ON dashboard_widgets (widget_type);

-- 用户Dashboard关联表
CREATE TABLE IF NOT EXISTS user_dashboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  dashboard_id INTEGER NOT NULL,
  is_favorite INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, dashboard_id)
);

CREATE INDEX IF NOT EXISTS idx_user_dash_user ON user_dashboards (user_id);
CREATE INDEX IF NOT EXISTS idx_user_dash_dash ON user_dashboards (dashboard_id);

-- 预定义数据源
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
);

CREATE INDEX IF NOT EXISTS idx_ds_type ON data_sources (type);
CREATE INDEX IF NOT EXISTS idx_ds_system ON data_sources (is_system);
CREATE INDEX IF NOT EXISTS idx_ds_creator ON data_sources (created_by);

-- 插入一些示例数据
INSERT OR IGNORE INTO data_sources (name, description, type, query, is_system) VALUES
  ('需求统计', '按状态统计需求数量', 'sql', 'SELECT status, COUNT(*) as count FROM requirements GROUP BY status', 1),
  ('需求优先级分布', '按优先级统计需求数量', 'sql', 'SELECT priority, COUNT(*) as count FROM requirements GROUP BY priority', 1),
  ('项目需求统计', '按项目统计需求数量', 'sql', 'SELECT p.name as project_name, COUNT(r.id) as count FROM projects p LEFT JOIN requirements r ON p.id = r.project_id GROUP BY p.id, p.name', 1);
