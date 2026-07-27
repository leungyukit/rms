import { getAsyncDb, isMysqlEnabled } from './db';

export async function runMetadataMigrations() {
  const db = getAsyncDb();
  
  let tables: string[] = [];
  
  if (isMysqlEnabled()) {
    const tablesResult = await db.prepare('SHOW TABLES').all();
    tables = (tablesResult as any[]).map(r => Object.values(r)[0] as string);
  } else {
    const tablesResult = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all();
    tables = (tablesResult as any[]).map(r => r.name);
  }
  
  // 创建 table_metadata 表
  if (!tables.includes('table_metadata')) {
    if (isMysqlEnabled()) {
      await db.exec(`
        CREATE TABLE table_metadata (
          id INT AUTO_INCREMENT PRIMARY KEY,
          table_name VARCHAR(255) NOT NULL UNIQUE,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
    } else {
      await db.exec(`
        CREATE TABLE table_metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL UNIQUE,
          description TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `);
    }
    console.log('✅ 创建 table_metadata 表');
  }
  
  // 创建 column_metadata 表
  if (!tables.includes('column_metadata')) {
    if (isMysqlEnabled()) {
      await db.exec(`
        CREATE TABLE column_metadata (
          id INT AUTO_INCREMENT PRIMARY KEY,
          table_name VARCHAR(255) NOT NULL,
          column_name VARCHAR(255) NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE(table_name, column_name)
        )
      `);
    } else {
      await db.exec(`
        CREATE TABLE column_metadata (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          column_name TEXT NOT NULL,
          description TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          UNIQUE(table_name, column_name)
        )
      `);
    }
    console.log('✅ 创建 column_metadata 表');
  }

  // 插入默认表说明
  const defaultTableDescs: Record<string, string> = {
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
    'custom_reports': '自定义报表表',
    'custom_dashboards': '自定义仪表盘表',
    'menu_items': '菜单项表',
    'role_menu_permissions': '角色菜单权限表',
    'system_config': '系统配置表',
    'sla_policies': 'SLA 策略表',
    'knowledge_items': '知识库条目表',
    'webhooks': 'Webhook 配置表',
    'checklists': '检查表模板表',
    'checklist_items': '检查表项目表',
    'workflows': '工作流定义表',
    'workflow_instances': '工作流实例表',
    'workflow_tasks': '工作流任务表'
  };

  const insertTableDesc = db.prepare('INSERT OR IGNORE INTO table_metadata (table_name, description) VALUES (?, ?)');
  let existingTables: string[] = [];
  
  if (isMysqlEnabled()) {
    const existingTablesResult = await db.prepare('SHOW TABLES').all();
    existingTables = (existingTablesResult as any[]).map(r => Object.values(r)[0] as string);
  } else {
    const existingTablesResult = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all();
    existingTables = (existingTablesResult as any[]).map(r => r.name);
  }
  
  for (const [table, desc] of Object.entries(defaultTableDescs)) {
    if (existingTables.includes(table)) {
      await insertTableDesc.run(table, desc);
    }
  }

  // 插入默认字段说明（requirements 表）
  const insertColDesc = db.prepare('INSERT OR IGNORE INTO column_metadata (table_name, column_name, description) VALUES (?, ?, ?)');
  const reqColumnDescs: Record<string, string> = {
    'id': '需求主键 ID',
    'title': '需求标题',
    'description': '需求描述',
    'status': '需求状态',
    'priority': '优先级',
    'project_id': '所属项目 ID',
    'handler_id': '处理人 ID',
    'created_at': '创建时间',
    'updated_at': '更新时间',
    'business_unit': '业务单元',
    'created_by': '创建人 ID'
  };

  if (existingTables.includes('requirements')) {
    let reqCols: string[] = [];
    if (isMysqlEnabled()) {
      const reqColsResult = await db.prepare('DESCRIBE requirements').all();
      reqCols = (reqColsResult as any[]).map(c => c.Field);
    } else {
      const reqColsResult = await db.prepare('PRAGMA table_info(requirements)').all();
      reqCols = (reqColsResult as any[]).map(c => c.name);
    }
    
    for (const [col, desc] of Object.entries(reqColumnDescs)) {
      if (reqCols.includes(col)) {
        await insertColDesc.run('requirements', col, desc);
      }
    }
  }
  
  console.log('✅ 数据库元数据迁移完成');
}
