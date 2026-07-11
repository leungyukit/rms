import { NextResponse } from 'next/server';
import { getAsyncDb, STATUS_MAP } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const db = getAsyncDb();

  // Get all requirements with workflows
  const reqs = (await db.prepare(`
    SELECT r.id, r.title, r.status, r.priority, r.workflow_id, r.current_node,
      r.handler_id, r.created_at, r.updated_at,
      w.name as workflow_name,
      h.display_name as handler_name,
      p.name as project_name
    FROM requirements r
    JOIN workflows w ON w.id = r.workflow_id
    LEFT JOIN users h ON h.id = r.handler_id
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.workflow_id IS NOT NULL
    ORDER BY r.updated_at DESC
  `).all()) as any[];

  // Enrich with workflow node info
  const result = reqs.map(async r => {
    let currentNodeInfo = null;
    let nodeEdges: any[] = [];

    if (r.workflow_id && r.current_node) {
      const node = (await db.prepare('SELECT * FROM workflow_nodes WHERE workflow_id = ? AND node_key = ?')
        .get(r.workflow_id, r.current_node)) as any;
      if (node) {
        const assignee = node.assignee_id
          ? (await db.prepare('SELECT display_name FROM users WHERE id = ?').get(node.assignee_id)) as any
          : null;
        currentNodeInfo = {
          ...node,
          assignee_name: assignee?.display_name || null,
        };
      }

      // Get outgoing edges from current node
      nodeEdges = (await db.prepare('SELECT * FROM workflow_edges WHERE workflow_id = ? AND from_node = ?')
        .all(r.workflow_id, r.current_node)) as any[];
    }

    // Calculate time at current node (from last status change)
    const lastLog = (await db.prepare('SELECT changed_at FROM status_log WHERE requirement_id = ? ORDER BY changed_at DESC LIMIT 1')
      .get(r.id)) as any;
    const nodeArrival = lastLog?.changed_at || r.updated_at || r.created_at;

    return {
      ...r,
      status_label: STATUS_MAP[r.status] || r.status,
      current_node_info: currentNodeInfo,
      outgoing_edges: nodeEdges,
      node_arrival: nodeArrival,
    };
  });

  return NextResponse.json(result);
}
