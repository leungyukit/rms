import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, STATUS_MAP, isMysqlEnabled } from '@/lib/db';
import { getCurrentUser, isGlobalAdmin, hasFunctionalAccess } from '@/lib/auth';

let tablesEnsured = false;
function ensureWorkflowTables() {
  if (tablesEnsured) return;
  const db = getAsyncDb();
  const isMysql = isMysqlEnabled();
  if (isMysql) {
    db.exec(`CREATE TABLE IF NOT EXISTS workflows (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'draft' NOT NULL,
      is_default TINYINT DEFAULT 0,
      created_by INT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS workflow_nodes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      workflow_id INT NOT NULL,
      node_key VARCHAR(100) NOT NULL,
      label VARCHAR(200) NOT NULL,
      type VARCHAR(30) NOT NULL,
      assignee_id INT DEFAULT NULL,
      auto_status VARCHAR(50) DEFAULT NULL,
      pos_x INT DEFAULT 0,
      pos_y INT DEFAULT 0,
      config TEXT DEFAULT NULL,
      INDEX idx_wf (workflow_id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS workflow_edges (
      id INT AUTO_INCREMENT PRIMARY KEY,
      workflow_id INT NOT NULL,
      from_node VARCHAR(100) NOT NULL,
      to_node VARCHAR(100) NOT NULL,
      condition_type VARCHAR(30) NOT NULL DEFAULT 'always',
      condition_value TEXT DEFAULT NULL,
      label VARCHAR(200) DEFAULT NULL,
      INDEX idx_wf (workflow_id)
    )`);
  } else {
    db.exec(`CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'draft' NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS workflow_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      node_key TEXT NOT NULL,
      label TEXT NOT NULL,
      type TEXT NOT NULL,
      assignee_id INTEGER,
      auto_status TEXT,
      pos_x INTEGER DEFAULT 0,
      pos_y INTEGER DEFAULT 0,
      config TEXT
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS workflow_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL,
      from_node TEXT NOT NULL,
      to_node TEXT NOT NULL,
      condition_type TEXT NOT NULL DEFAULT 'always',
      condition_value TEXT,
      label TEXT
    )`);
  }
  tablesEnsured = true;
}

// GET: List workflows or get single workflow with nodes/edges
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });
  ensureWorkflowTables();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  const db = getAsyncDb();

  if (id) {
    const workflow = (await db.prepare('SELECT * FROM workflows WHERE id = ?').get(id)) as any;
    if (!workflow) return NextResponse.json({ error: '工作流不存在' }, { status: 404 });

    const nodes = (await db.prepare('SELECT * FROM workflow_nodes WHERE workflow_id = ? ORDER BY pos_x').all(id));
    const edges = (await db.prepare('SELECT * FROM workflow_edges WHERE workflow_id = ?').all(id));
    const users = (await db.prepare('SELECT id, display_name FROM users').all());

    return NextResponse.json({ ...workflow, nodes, edges, users, statusOptions: STATUS_MAP });
  }

  const workflows = (await db.prepare('SELECT w.*, (SELECT COUNT(*) FROM workflow_nodes WHERE workflow_id = w.id) as node_count FROM workflows w ORDER BY w.is_default DESC, w.created_at DESC').all());
  return NextResponse.json(workflows);
}

// POST: Create workflow
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });
  ensureWorkflowTables();

  const { name, description, nodes, edges } = await req.json();
  if (!name) return NextResponse.json({ error: '名称不能为空' }, { status: 400 });

  const db = getAsyncDb();
  const result = (await db.prepare('INSERT INTO workflows (name, description, created_by) VALUES (?, ?, ?)').run(name, description || '', user.id));
  const idRow = (await db.prepare('SELECT MAX(id) as id FROM workflows').get()) as any;
  const wfId = (idRow?.id ?? 0) as number;

  if (nodes && Array.isArray(nodes)) {
    const nStmt = db.prepare('INSERT INTO workflow_nodes (workflow_id, node_key, label, type, assignee_id, auto_status, pos_x, pos_y, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const n of nodes) {
      await nStmt.run(wfId, n.node_key || n.key, n.label, n.type || 'task', n.assignee_id || null, n.auto_status || null, n.pos_x || 0, n.pos_y || 0, JSON.stringify(n.config || {}));
    }
  }

  if (edges && Array.isArray(edges)) {
    const eStmt = db.prepare('INSERT INTO workflow_edges (workflow_id, from_node, to_node, condition_type, condition_value, label) VALUES (?, ?, ?, ?, ?, ?)');
    for (const e of edges) {
      await eStmt.run(wfId, e.from_node || e.from, e.to_node || e.to, e.condition_type || 'always', e.condition_value || '', e.label || '');
    }
  }

  return NextResponse.json({ success: true, id: wfId });
}

// PUT: Update workflow
export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!hasFunctionalAccess(user.roles)) return NextResponse.json({ error: '无功能权限' }, { status: 403 });
  ensureWorkflowTables();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const { name, description, nodes, edges, is_default, status } = await req.json();
  if (!id) return NextResponse.json({ error: '缺少工作流ID' }, { status: 400 });

  const db = getAsyncDb();

  if (name !== undefined || status !== undefined) {
    const sets: string[] = [];
    const vals: any[] = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
    if (description !== undefined) { sets.push('description = ?'); vals.push(description || ''); }
    if (status !== undefined) { sets.push('status = ?'); vals.push(status); }
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(id);
    await db.prepare(`UPDATE workflows SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  }
  if (is_default !== undefined) {
    (await db.prepare('UPDATE workflows SET is_default = 0').run());
    (await db.prepare('UPDATE workflows SET is_default = 1 WHERE id = ?').run(id));
  }

  if (nodes && Array.isArray(nodes)) {
    (await db.prepare('DELETE FROM workflow_nodes WHERE workflow_id = ?').run(id));
    const nStmt = db.prepare('INSERT INTO workflow_nodes (workflow_id, node_key, label, type, assignee_id, auto_status, pos_x, pos_y, config) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const n of nodes) {
      await nStmt.run(id, n.node_key || n.key, n.label, n.type || 'task', n.assignee_id || null, n.auto_status || null, n.pos_x || 0, n.pos_y || 0, JSON.stringify(n.config || {}));
    }
  }

  if (edges && Array.isArray(edges)) {
    (await db.prepare('DELETE FROM workflow_edges WHERE workflow_id = ?').run(id));
    const eStmt = db.prepare('INSERT INTO workflow_edges (workflow_id, from_node, to_node, condition_type, condition_value, label) VALUES (?, ?, ?, ?, ?, ?)');
    for (const e of edges) {
      await eStmt.run(id, e.from_node || e.from, e.to_node || e.to, e.condition_type || 'always', e.condition_value || '', e.label || '');
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE: Remove workflow
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!isGlobalAdmin(user.roles)) return NextResponse.json({ error: '无权限' }, { status: 403 });
  ensureWorkflowTables();

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少工作流ID' }, { status: 400 });

  const db = getAsyncDb();
  (await db.prepare('DELETE FROM workflow_edges WHERE workflow_id = ?').run(id));
  (await db.prepare('DELETE FROM workflow_nodes WHERE workflow_id = ?').run(id));
  (await db.prepare('DELETE FROM workflows WHERE id = ?').run(id));
  return NextResponse.json({ success: true });
}
