#!/usr/bin/env node

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || 'data/rms.db';
const DB_FULL_PATH = path.join(process.cwd(), DB_PATH);

console.log('📊 开始报表和Dashboard功能数据库迁移');
console.log('📁 数据库路径:', DB_FULL_PATH);

try {
  const db = new Database(DB_FULL_PATH);

  // 检查表是否已存在
  const checkTable = (tableName) => {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
    ).get(tableName);
    return !!row;
  };

  // 创建 reports 表
  if (!checkTable('reports')) {
    console.log('📝 创建 reports 表...');
    db.exec(`
      CREATE TABLE reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL DEFAULT 'custom',
        config TEXT,
        layout TEXT,
        created_by INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);
    db.prepare('CREATE INDEX idx_report_creator ON reports(created_by)').run();
    db.prepare('CREATE INDEX idx_report_type ON reports(type)').run();
    console.log('✅ reports 表创建完成');
  } else {
    console.log('ℹ️ reports 表已存在');
  }

  // 创建 report_widgets 表
  if (!checkTable('report_widgets')) {
    console.log('📝 创建 report_widgets 表...');
    db.exec(`
      CREATE TABLE report_widgets (
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
      )
    `);
    db.prepare('CREATE INDEX idx_widget_report ON report_widgets(report_id)').run();
    db.prepare('CREATE INDEX idx_widget_type ON report_widgets(widget_type)').run();
    console.log('✅ report_widgets 表创建完成');
  } else {
    console.log('ℹ️ report_widgets 表已存在');
  }

  // 创建 dashboards 表
  if (!checkTable('dashboards')) {
    console.log('📝 创建 dashboards 表...');
    db.exec(`
      CREATE TABLE dashboards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        is_default INTEGER DEFAULT 0,
        config TEXT,
        layout TEXT,
        created_by INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);
    db.prepare('CREATE INDEX idx_dashboard_creator ON dashboards(created_by)').run();
    db.prepare('CREATE INDEX idx_dashboard_default ON dashboards(is_default)').run();
    console.log('✅ dashboards 表创建完成');
  } else {
    console.log('ℹ️ dashboards 表已存在');
  }

  // 创建 dashboard_widgets 表
  if (!checkTable('dashboard_widgets')) {
    console.log('📝 创建 dashboard_widgets 表...');
    db.exec(`
      CREATE TABLE dashboard_widgets (
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
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
      )
    `);
    db.prepare('CREATE INDEX idx_dash_widget_dashboard ON dashboard_widgets(dashboard_id)').run();
    db.prepare('CREATE INDEX idx_dash_widget_type ON dashboard_widgets(widget_type)').run();
    console.log('✅ dashboard_widgets 表创建完成');
  } else {
    console.log('ℹ️ dashboard_widgets 表已存在');
  }

  // 创建 user_dashboards 表
  if (!checkTable('user_dashboards')) {
    console.log('📝 创建 user_dashboards 表...');
    db.exec(`
      CREATE TABLE user_dashboards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        dashboard_id INTEGER NOT NULL,
        is_favorite INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, dashboard_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (dashboard_id) REFERENCES dashboards(id)
      )
    `);
    db.prepare('CREATE INDEX idx_user_dash_user ON user_dashboards(user_id)').run();
    db.prepare('CREATE INDEX idx_user_dash_dash ON user_dashboards(dashboard_id)').run();
    console.log('✅ user_dashboards 表创建完成');
  } else {
    console.log('ℹ️ user_dashboards 表已存在');
  }

  // 创建 data_sources 表
  if (!checkTable('data_sources')) {
    console.log('📝 创建 data_sources 表...');
    db.exec(`
      CREATE TABLE data_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        type TEXT NOT NULL,
        query TEXT NOT NULL,
        config TEXT,
        is_system INTEGER DEFAULT 0,
        created_by INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id)
      )
    `);
    db.prepare('CREATE INDEX idx_ds_type ON data_sources(type)').run();
    db.prepare('CREATE INDEX idx_ds_system ON data_sources(is_system)').run();
    db.prepare('CREATE INDEX idx_ds_creator ON data_sources(created_by)').run();
    console.log('✅ data_sources 表创建完成');
    
    // 插入预定义的系统数据源
    console.log('📊 插入预定义的系统数据源...');
    const seedData = [
      {
        name: '需求按状态统计',
        description: '统计不同状态的需求数量',
        type: 'sql',
        query: 'SELECT status, COUNT(*) as count FROM requirements GROUP BY status',
        config: JSON.stringify({ xKey: 'status', yKey: 'count' }),
        is_system: 1
      },
      {
        name: '需求按优先级统计',
        description: '统计不同优先级的需求数量',
        type: 'sql',
        query: 'SELECT priority, COUNT(*) as count FROM requirements GROUP BY priority',
        config: JSON.stringify({ xKey: 'priority', yKey: 'count' }),
        is_system: 1
      },
      {
        name: '需求按业务方统计',
        description: '统计不同业务部门的需求数量',
        type: 'sql',
        query: 'SELECT business_unit, COUNT(*) as count FROM requirements WHERE business_unit IS NOT NULL GROUP BY business_unit',
        config: JSON.stringify({ xKey: 'business_unit', yKey: 'count' }),
        is_system: 1
      },
      {
        name: '需求按创建时间趋势',
        description: '按日期统计需求创建数量',
        type: 'sql',
        query: 'SELECT DATE(created_at) as date, COUNT(*) as count FROM requirements GROUP BY DATE(created_at) ORDER BY date',
        config: JSON.stringify({ xKey: 'date', yKey: 'count' }),
        is_system: 1
      },
      {
        name: '项目按状态统计',
        description: '统计不同状态的项目数量',
        type: 'sql',
        query: 'SELECT status, COUNT(*) as count FROM projects GROUP BY status',
        config: JSON.stringify({ xKey: 'status', yKey: 'count' }),
        is_system: 1
      }
    ];

    const stmt = db.prepare(
      'INSERT INTO data_sources (name, description, type, query, config, is_system) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const data of seedData) {
      stmt.run(data.name, data.description, data.type, data.query, data.config, data.is_system);
    }
    console.log('✅ 系统数据源初始化完成');
  } else {
    console.log('ℹ️ data_sources 表已存在');
  }

  db.close();
  console.log('🎉 数据库迁移完成！');
} catch (error) {
  console.error('❌ 迁移失败:', error);
  process.exit(1);
}
