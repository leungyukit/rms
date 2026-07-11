// Demo data seed script
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'rms.db');
if (!fs.existsSync(path.dirname(DB_PATH))) fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT NOT NULL, email TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, label TEXT NOT NULL, description TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS user_roles (user_id INTEGER NOT NULL, role_id INTEGER NOT NULL, PRIMARY KEY (user_id, role_id));
  CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', status TEXT DEFAULT 'active', created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS role_project_access (role_id INTEGER NOT NULL, project_id INTEGER NOT NULL, PRIMARY KEY (role_id, project_id));
  CREATE TABLE IF NOT EXISTS user_project_access (user_id INTEGER NOT NULL, project_id INTEGER NOT NULL, role_in_project TEXT DEFAULT 'viewer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, project_id));
  CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, color TEXT DEFAULT '#6B7280');
  CREATE TABLE IF NOT EXISTS requirements (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '', business_unit TEXT DEFAULT '', priority TEXT DEFAULT 'medium', priority_framework TEXT, priority_score REAL, status TEXT DEFAULT 'received_not_evaluated', category TEXT DEFAULT 'project', project_id INTEGER, parent_id INTEGER, sprint_id INTEGER, requester_name TEXT DEFAULT '', receiver_id INTEGER, handler_id INTEGER, verifier_id INTEGER, benefit TEXT DEFAULT '', solution TEXT DEFAULT '', lessons_learned TEXT DEFAULT '', root_cause TEXT DEFAULT '', merged_into INTEGER, planned_start TEXT, planned_end TEXT, actual_end TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS requirement_tags (requirement_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (requirement_id, tag_id));
  CREATE TABLE IF NOT EXISTS requirement_relations (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL, target_id INTEGER NOT NULL, relation_type TEXT DEFAULT 'related', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS status_log (id INTEGER PRIMARY KEY AUTOINCREMENT, requirement_id INTEGER NOT NULL, old_status TEXT, new_status TEXT NOT NULL, changed_by INTEGER, note TEXT DEFAULT '', changed_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS menu_items (id INTEGER PRIMARY KEY AUTOINCREMENT, href TEXT UNIQUE NOT NULL, icon TEXT, label_key TEXT NOT NULL, section TEXT DEFAULT 'general', sort_order INTEGER DEFAULT 0, description TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS role_menu_permissions (role_id INTEGER NOT NULL, menu_item_id INTEGER NOT NULL, allowed INTEGER DEFAULT 1, PRIMARY KEY (role_id, menu_item_id));
  CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT, content TEXT, type TEXT, is_read INTEGER DEFAULT 0, link TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS knowledge_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'faq', category TEXT, question TEXT, answer TEXT, content TEXT, tags TEXT, source_requirement_id INTEGER, status TEXT DEFAULT 'published', view_count INTEGER DEFAULT 0, useful_count INTEGER DEFAULT 0, created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS knowledge_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, knowledge_id INTEGER NOT NULL, user_id INTEGER NOT NULL, is_useful INTEGER DEFAULT 1, comment TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS knowledge_relations (id INTEGER PRIMARY KEY AUTOINCREMENT, source_id INTEGER NOT NULL, target_id INTEGER NOT NULL, relation_type TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS project_budget_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, threshold INTEGER NOT NULL, triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP, triggered_cost REAL NOT NULL, triggered_budget REAL NOT NULL, triggered_ratio REAL NOT NULL, notified_user_ids TEXT, status TEXT DEFAULT 'sent', acknowledged_by INTEGER, acknowledged_at DATETIME);
  CREATE TABLE IF NOT EXISTS system_config ("key" TEXT PRIMARY KEY, value TEXT, description TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, label TEXT DEFAULT '', category TEXT DEFAULT 'general', type TEXT DEFAULT 'text', sort_order INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS sprints (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, name TEXT NOT NULL, goal TEXT, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT DEFAULT 'planned', capacity_hours REAL DEFAULT 0, notes TEXT, created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS requirement_sprints (id INTEGER PRIMARY KEY AUTOINCREMENT, requirement_id INTEGER NOT NULL, sprint_id INTEGER NOT NULL, assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(requirement_id));
  CREATE TABLE IF NOT EXISTS requirement_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, requirement_id INTEGER NOT NULL, version INTEGER DEFAULT 1, title TEXT, description TEXT, business_unit TEXT, priority TEXT, status TEXT, handler_id INTEGER, verifier_id INTEGER, change_summary TEXT DEFAULT '', changed_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS requirement_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, requirement_id INTEGER NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS requirement_baselines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, project_id INTEGER, description TEXT, created_by INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS requirement_baseline_items (baseline_id INTEGER NOT NULL, requirement_id INTEGER NOT NULL, snapshot_json TEXT NOT NULL, PRIMARY KEY (baseline_id, requirement_id));
  INSERT OR IGNORE INTO roles (name, label, description) VALUES
    ('global_admin', '全局需求管理', '可查看系统所有项目和所有需求'),
    ('project_receiver', '项目需求接收员', '可填写需求内容、设置需求归属'),
    ('requirement_handler', '需求处理人', '处理指派的需求'),
    ('login_only', '仅登录', '只能登录系统，无菜单和功能权限');
`);

const hash = bcrypt.hashSync('123456', 10);

// Users
const insertUser = db.prepare('INSERT OR IGNORE INTO users (username, password_hash, display_name, email) VALUES (?, ?, ?, ?)');
const users = [
  ['admin', hash, '系统管理员', 'admin@rms.com'],
  ['zhangsan', hash, '张三', 'zhangsan@rms.com'],
  ['lisi', hash, '李四', 'lisi@rms.com'],
  ['wangwu', hash, '王五', 'wangwu@rms.com'],
  ['zhaoliu', hash, '赵六', 'zhaoliu@rms.com'],
];
for (const u of users) insertUser.run(...u);

// Assign roles
const adminRole = db.prepare("SELECT id FROM roles WHERE name = 'global_admin'").get();
const receiverRole = db.prepare("SELECT id FROM roles WHERE name = 'project_receiver'").get();
const handlerRole = db.prepare("SELECT id FROM roles WHERE name = 'requirement_handler'").get();
const allUsers = db.prepare('SELECT id, username FROM users').all();

const assignRole = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)');
for (const u of allUsers) {
  if (u.username === 'admin') { assignRole.run(u.id, adminRole.id); assignRole.run(u.id, receiverRole.id); }
  else if (['zhangsan', 'lisi'].includes(u.username)) { assignRole.run(u.id, receiverRole.id); }
  else { assignRole.run(u.id, handlerRole.id); }
}

// Seed menu items and role menu permissions
const menuItems = [
  { href: '/chat', icon: '💬', label_key: 'nav.chat', section: 'requirement', sort_order: 1 },
  { href: '/requirements', icon: '📋', label_key: 'nav.requirements', section: 'requirement', sort_order: 2 },
  { href: '/requirements/new', icon: '➕', label_key: 'requirement.newRequirement', section: 'requirement', sort_order: 3 },
  { href: '/kanban', icon: '📊', label_key: 'nav.kanban', section: 'requirement', sort_order: 4 },
  { href: '/gantt', icon: '📅', label_key: 'nav.gantt', section: 'requirement', sort_order: 5 },
  { href: '/checklist/my', icon: '☑️', label_key: 'nav.myTasks', section: 'requirement', sort_order: 6 },
  { href: '/workflows', icon: '⚡', label_key: 'nav.workflows', section: 'requirement', sort_order: 7 },
  { href: '/workflows/monitor', icon: '🔍', label_key: 'nav.sla', section: 'requirement', sort_order: 8 },
  { href: '/sprints', icon: '🏃', label_key: 'nav.sprint', section: 'project', sort_order: 1 },
  { href: '/timesheet', icon: '📅', label_key: 'nav.timesheet', section: 'project', sort_order: 2 },
  { href: '/projects', icon: '📁', label_key: 'nav.projects', section: 'project', sort_order: 3 },
  { href: '/dashboard', icon: '📈', label_key: 'nav.dashboard', section: 'analysis', sort_order: 1 },
  { href: '/sla-dashboard', icon: '🚨', label_key: 'nav.sla', section: 'analysis', sort_order: 2 },
  { href: '/workload', icon: '👥', label_key: 'nav.workload', section: 'analysis', sort_order: 3 },
  { href: '/calendar', icon: '📆', label_key: 'nav.calendar', section: 'analysis', sort_order: 4 },
  { href: '/knowledge', icon: '📚', label_key: 'nav.knowledge', section: 'knowledge', sort_order: 1 },
  { href: '/knowledge/graph', icon: '🕸️', label_key: 'knowledge.graph', section: 'knowledge', sort_order: 2 },
  { href: '/knowledge/insights', icon: '💡', label_key: 'knowledge.insights', section: 'knowledge', sort_order: 3 },
  { href: '/profile/tokens', icon: '🔑', label_key: 'Token 管理', section: 'admin', sort_order: 1 },
  { href: '/admin/users', icon: '👥', label_key: 'admin.users', section: 'admin', sort_order: 2 },
  { href: '/admin/audit-logs', icon: '📋', label_key: 'admin.auditLog', section: 'admin', sort_order: 3 },
  { href: '/admin/dedup', icon: '🔍', label_key: 'nav.deduplication', section: 'admin', sort_order: 4 },
  { href: '/admin/integrations', icon: '🔌', label_key: 'nav.integrations', section: 'admin', sort_order: 5 },
  { href: '/admin/field-policies', icon: '📋', label_key: 'nav.fieldPolicy', section: 'admin', sort_order: 6 },
  { href: '/admin/config', icon: '⚙️', label_key: 'nav.settings', section: 'admin', sort_order: 7 },
  { href: '/admin/menu-permissions', icon: '🔒', label_key: '菜单权限', section: 'admin', sort_order: 8 },
  { href: '/openapi', icon: '📡', label_key: 'nav.openapi', section: 'admin', sort_order: 9 },
];
const insertMenu = db.prepare('INSERT OR IGNORE INTO menu_items (href, icon, label_key, section, sort_order) VALUES (?, ?, ?, ?, ?)');
for (const m of menuItems) insertMenu.run(m.href, m.icon, m.label_key, m.section, m.sort_order);

const allMenu = db.prepare('SELECT id, href FROM menu_items').all();
const menuIdByHref = Object.fromEntries(allMenu.map(m => [m.href, m.id]));
const insertPerm = db.prepare('INSERT OR IGNORE INTO role_menu_permissions (role_id, menu_item_id, allowed) VALUES (?, ?, ?)');

// global_admin: all allowed
for (const m of allMenu) insertPerm.run(adminRole.id, m.id, 1);

// project_receiver / requirement_handler: business menus allowed, admin menus denied
const businessHrefs = [
  '/chat', '/requirements', '/requirements/new', '/kanban', '/gantt', '/checklist/my', '/workflows', '/workflows/monitor',
  '/sprints', '/timesheet', '/projects',
  '/dashboard', '/sla-dashboard', '/workload', '/calendar',
  '/knowledge', '/knowledge/graph', '/knowledge/insights',
];
for (const href of businessHrefs) {
  const mid = menuIdByHref[href];
  if (mid) {
    insertPerm.run(receiverRole.id, mid, 1);
    insertPerm.run(handlerRole.id, mid, 1);
  }
}
// login_only: no permissions (implicitly denied)

// Projects
const insertProject = db.prepare('INSERT OR IGNORE INTO projects (name, description, created_by) VALUES (?, ?, ?)');
const adminId = allUsers.find(u => u.username === 'admin').id;
const projectNames = [
  ['ERP系统升级', '企业资源管理系统全面升级改造'],
  ['移动端App开发', '面向客户的移动应用程序开发'],
  ['数据中台建设', '统一数据平台搭建与治理'],
  ['零星需求池', '日常零星需求汇总'],
];
for (const p of projectNames) insertProject.run(p[0], p[1], adminId);

const projects = db.prepare('SELECT id, name FROM projects').all();
// Grant access
for (const p of projects) {
  db.prepare('INSERT OR IGNORE INTO role_project_access (role_id, project_id) VALUES (?, ?)').run(receiverRole.id, p.id);
  db.prepare('INSERT OR IGNORE INTO role_project_access (role_id, project_id) VALUES (?, ?)').run(handlerRole.id, p.id);
}

// Tags
const tagNames = [
  ['UI优化', '#3B82F6'], ['性能', '#EF4444'], ['安全', '#F59E0B'], ['后端', '#8B5CF6'],
  ['前端', '#10B981'], ['数据库', '#06B6D4'], ['紧急', '#EF4444'], ['用户体验', '#EC4899'],
];
for (const [n, c] of tagNames) db.prepare('INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)').run(n, c);

const tags = db.prepare('SELECT id, name FROM tags').all();
const userIds = allUsers.map(u => u.id);
const projectIds = projects.map(p => p.id);
const statuses = ['received_not_evaluated', 'evaluated_not_scheduled', 'scheduled', 'in_progress', 'completed', 'verified', 'closed'];
const priorities = ['high', 'medium', 'low'];

// Requirements
const reqs = [
  { title: '订单模块性能优化', desc: '订单查询响应时间超过5s，需要优化索引和查询逻辑', bu: '运营部', priority: 'high', status: 'in_progress', cat: 'project', proj: 0 },
  { title: '用户登录支持微信扫码', desc: '增加微信扫码登录方式，提升登录便捷性', bu: '产品部', priority: 'medium', status: 'scheduled', cat: 'project', proj: 0 },
  { title: '报表导出增加Excel格式', desc: '目前仅支持PDF导出，需增加Excel格式', bu: '财务部', priority: 'medium', status: 'evaluated_not_scheduled', cat: 'project', proj: 0 },
  { title: '库存预警功能', desc: '当库存低于安全库存时自动发送预警通知', bu: '仓储部', priority: 'high', status: 'completed', cat: 'project', proj: 0 },
  { title: '审批流程配置化', desc: '将固定审批流程改为可配置的工作流引擎', bu: 'IT部', priority: 'medium', status: 'in_progress', cat: 'project', proj: 0 },
  { title: 'App首页改版', desc: '重新设计首页布局，增加个性化推荐', bu: '产品部', priority: 'high', status: 'in_progress', cat: 'project', proj: 1 },
  { title: '消息推送功能', desc: '集成JPush实现消息推送能力', bu: '产品部', priority: 'medium', status: 'scheduled', cat: 'project', proj: 1 },
  { title: '离线模式支持', desc: '关键数据支持离线查看和操作', bu: '产品部', priority: 'low', status: 'received_not_evaluated', cat: 'project', proj: 1 },
  { title: '支付接入微信支付', desc: '增加微信支付渠道', bu: '财务部', priority: 'high', status: 'completed', cat: 'project', proj: 1 },
  { title: '用户行为数据采集', desc: '采集用户浏览、点击、下单等行为数据', bu: 'IT部', priority: 'high', status: 'in_progress', cat: 'project', proj: 2 },
  { title: '数据质量监控', desc: '建立数据质量监控体系，异常自动告警', bu: 'IT部', priority: 'medium', status: 'evaluated_not_scheduled', cat: 'project', proj: 2 },
  { title: '数据权限管理', desc: '按部门/角色控制数据访问权限', bu: '安全部', priority: 'high', status: 'scheduled', cat: 'project', proj: 2 },
  { title: 'BI可视化看板', desc: '搭建管理层数据可视化看板', bu: '管理层', priority: 'medium', status: 'received_not_evaluated', cat: 'project', proj: 2 },
  { title: '修复打印机驱动兼容问题', desc: '3楼打印机在Win11下驱动不兼容', bu: '行政部', priority: 'low', status: 'completed', cat: 'adhoc', proj: 3 },
  { title: 'VPN账号批量开通', desc: '新入职30人需要开通VPN', bu: 'HR部', priority: 'medium', status: 'closed', cat: 'adhoc', proj: 3 },
  { title: '会议室预约系统故障', desc: '会议室预约系统无法显示可用时间', bu: '行政部', priority: 'high', status: 'verified', cat: 'adhoc', proj: 3 },
  { title: '邮件系统迁移', desc: '从自建邮件迁移至企业微信邮箱', bu: 'IT部', priority: 'medium', status: 'in_progress', cat: 'adhoc', proj: 3 },
  { title: '订单模块性能优化', desc: '订单列表分页加载优化（重复需求）', bu: '运营部', priority: 'medium', status: 'received_not_evaluated', cat: 'project', proj: 0 },
  { title: '数据导入导出功能', desc: '支持CSV/Excel批量导入导出', bu: '运营部', priority: 'medium', status: 'evaluated_not_scheduled', cat: 'project', proj: 0 },
  { title: '多语言支持', desc: '系统增加英文版本', bu: '产品部', priority: 'low', status: 'received_not_evaluated', cat: 'project', proj: 1 },
];

const insertReq = db.prepare(`INSERT INTO requirements (title, description, business_unit, priority, status, category, project_id, requester_name, receiver_id, handler_id, verifier_id, benefit, planned_start, planned_end, actual_end, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertLog = db.prepare('INSERT INTO status_log (requirement_id, old_status, new_status, changed_by, changed_at) VALUES (?, NULL, ?, ?, ?)');
const insertReqTag = db.prepare('INSERT OR IGNORE INTO requirement_tags (requirement_id, tag_id) VALUES (?, ?)');

const randomDate = (start, end) => {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return new Date(s + Math.random() * (e - s)).toISOString().split('T')[0];
};

for (let i = 0; i < reqs.length; i++) {
  const r = reqs[i];
  const pId = projectIds[r.proj];
  const receiverId = userIds[Math.floor(Math.random() * 2) + 1]; // zhangsan or lisi
  const handlerId = userIds[Math.floor(Math.random() * 3) + 2]; // lisi, wangwu, zhaoliu
  const verifierId = userIds[0]; // admin
  const createdAt = randomDate('2025-01-01', '2025-05-19');
  const ps = randomDate('2025-03-01', '2025-06-01');
  const pe = randomDate('2025-06-01', '2025-09-30');
  const ae = ['completed', 'verified', 'closed'].includes(r.status) ? randomDate(ps, pe) : null;

  const res = insertReq.run(r.title, r.desc, r.bu, r.priority, r.status, r.cat, pId, r.bu, receiverId, handlerId, verifierId, `提升${r.bu}工作效率`, ps, pe, ae, createdAt);
  insertLog.run(res.lastInsertRowid, r.status, adminId, createdAt);

  // Random tags (1-2)
  const shuffled = [...tags].sort(() => Math.random() - 0.5);
  insertReqTag.run(res.lastInsertRowid, shuffled[0].id);
  if (Math.random() > 0.5 && shuffled[1]) insertReqTag.run(res.lastInsertRowid, shuffled[1].id);
}

// Relations: req 1 is parent of req 18 (duplicate)
const allReqs = db.prepare('SELECT id FROM requirements ORDER BY id').all();
if (allReqs.length >= 18) {
  db.prepare('UPDATE requirements SET parent_id = ? WHERE id = ?').run(allReqs[0].id, allReqs[17].id);
  db.prepare('INSERT INTO requirement_relations (source_id, target_id, relation_type) VALUES (?, ?, ?)').run(allReqs[0].id, allReqs[4].id, 'related');
  db.prepare('INSERT INTO requirement_relations (source_id, target_id, relation_type) VALUES (?, ?, ?)').run(allReqs[5].id, allReqs[8].id, 'related');
}

console.log('✅ Seed complete!');
console.log(`  Users: ${allUsers.length}`);
console.log(`  Projects: ${projects.length}`);
console.log(`  Requirements: ${reqs.length}`);
console.log(`  Tags: ${tags.length}`);
console.log('\n  Demo login: admin / 123456');
db.close();
