#!/usr/bin/env node

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || 'data/rms.db';
const DB_FULL_PATH = path.join(process.cwd(), DB_PATH);

console.log('📊 开始数据库元数据迁移');
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

  // 创建 table_metadata 表
  if (!checkTable('table_metadata')) {
    console.log('📝 创建 table_metadata 表...');
    db.exec(`
      CREATE TABLE table_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ table_metadata 表创建完成');
  } else {
    console.log('ℹ️ table_metadata 表已存在');
  }

  // 创建 column_metadata 表
  if (!checkTable('column_metadata')) {
    console.log('📝 创建 column_metadata 表...');
    db.exec(`
      CREATE TABLE column_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        column_name TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(table_name, column_name)
      )
    `);
    console.log('✅ column_metadata 表创建完成');
  } else {
    console.log('ℹ️ column_metadata 表已存在');
  }

  // 插入默认的表说明
  console.log('📝 插入默认表说明...');
  const defaultTableDescs = {
    'requirements': '需求主表，存储所有需求信息',
    'projects': '项目表，存储项目信息',
    'users': '用户表，存储用户基本信息',
    'roles': '角色表，存储系统角色',
    'user_roles': '用户角色关联表',
    'status_log': '状态变更日志',
    'requirements_versions': '需求版本历史',
    'sprints': '迭代/冲刺表',
    'milestones': '里程碑表',
    'data_sources': '数据源配置表',
    'reports': '自定义报表表',
    'report_widgets': '报表组件表',
    'dashboards': '自定义仪表盘表',
    'dashboard_widgets': '仪表盘组件表',
    'user_dashboards': '用户仪表盘关联表',
    'menu_items': '菜单项表',
    'role_menu_permissions': '角色菜单权限表',
    'system_config': '系统配置表',
    'sla_policies': 'SLA 策略表',
    'knowledge_entries': '知识库条目表',
    'webhooks': 'Webhook 配置表',
    'checklists': '检查表模板表',
    'checklist_items': '检查表项目表',
    'weekly_reports': '周报记录表',
    'weekly_report_subscriptions': '周报订阅表',
    'workflows': '工作流定义表',
    'workflow_instances': '工作流实例表',
    'workflow_tasks': '工作流任务表'
  };

  const insertTableDesc = db.prepare('INSERT OR IGNORE INTO table_metadata (table_name, description) VALUES (?, ?)');
  for (const [table, desc] of Object.entries(defaultTableDescs)) {
    insertTableDesc.run(table, desc);
  }
  console.log('✅ 表说明插入完成');

  // 插入默认的字段说明（requirements 表）
  console.log('📝 插入默认字段说明...');
  const insertColDesc = db.prepare('INSERT OR IGNORE INTO column_metadata (table_name, column_name, description) VALUES (?, ?, ?)');
  const reqColumnDescs = {
    'id': '需求主键 ID',
    'title': '需求标题',
    'description': '需求描述',
    'status': '需求状态',
    'priority': '优先级',
    'project_id': '所属项目 ID',
    'handler_id': '处理人 ID',
    'created_at': '创建时间',
    'updated_at': '更新时间',
    'business_unit': '业务方',
    'created_by': '创建人 ID'
  };

  for (const [col, desc] of Object.entries(reqColumnDescs)) {
    insertColDesc.run('requirements', col, desc);
  }
  console.log('✅ 字段说明插入完成');

  db.close();
  console.log('🎉 数据库元数据迁移完成！');
} catch (error) {
  console.error('❌ 迁移失败:', error);
  process.exit(1);
}
