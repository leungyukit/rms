import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET: graph data for visualization
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope');

  const db = getAsyncDb();
  const nodes: any[] = [];
  const edges: any[] = [];
  const nodeSet = new Set<string>();

  const addNode = (id: string, type: string, label: string, meta: any = {}) => {
    if (!nodeSet.has(id)) {
      nodeSet.add(id);
      nodes.push({ id, type, label, ...meta });
    }
  };

  const addEdge = (source: string, target: string, type: string, weight = 1.0) => {
    edges.push({ source, target, type, weight });
  };

  try {

  // Get requirements
  let reqFilter = "r.status IN ('completed','verified','closed')";
  let reqParams: any[] = [];
  if (scope?.startsWith('project:')) {
    reqFilter += ' AND r.project_id = ?';
    reqParams.push(parseInt(scope.split(':')[1]));
  } else if (scope?.startsWith('user:')) {
    reqFilter += ' AND r.handler_id = ?';
    reqParams.push(parseInt(scope.split(':')[1]));
  }

  const reqs = (await db.prepare(`
    SELECT r.id, r.title, r.status, r.priority, r.handler_id, r.project_id, r.business_unit,
           u.display_name as handler_name, p.name as project_name
    FROM requirements r
    LEFT JOIN users u ON u.id = r.handler_id
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE ${reqFilter}
  `).all(...reqParams)) as any[];

  for (const r of reqs) {
    addNode(`req_${r.id}`, 'requirement', `#${r.id} ${r.title}`, { priority: r.priority, status: r.status });
    if (r.project_id) {
      addNode(`proj_${r.project_id}`, 'project', r.project_name || `项目${r.project_id}`);
      addEdge(`req_${r.id}`, `proj_${r.project_id}`, 'belongs_to');
    }
    if (r.handler_id) {
      addNode(`user_${r.handler_id}`, 'person', r.handler_name || `用户${r.handler_id}`);
      addEdge(`req_${r.id}`, `user_${r.handler_id}`, 'handled_by');
    }
    if (r.business_unit) {
      addNode(`bu_${r.business_unit}`, 'business_unit', r.business_unit);
      addEdge(`req_${r.id}`, `bu_${r.business_unit}`, 'requested_by');
    }
  }

  // Tags
  const tags = (await db.prepare(`
    SELECT rt.requirement_id, t.name, t.id as tag_id
    FROM requirement_tags rt JOIN tags t ON t.id = rt.tag_id
  `).all()) as any[];
  for (const t of tags) {
    if (nodeSet.has(`req_${t.requirement_id}`)) {
      addNode(`tag_${t.tag_id}`, 'tag', t.name);
      addEdge(`req_${t.requirement_id}`, `tag_${t.tag_id}`, 'tagged_with');
    }
  }

  // Requirement relations
  const rels = (await db.prepare('SELECT source_id, target_id, relation_type FROM requirement_relations').all()) as any[];
  for (const rel of rels) {
    if (nodeSet.has(`req_${rel.source_id}`) && nodeSet.has(`req_${rel.target_id}`)) {
      addEdge(`req_${rel.source_id}`, `req_${rel.target_id}`, rel.relation_type || 'related_to');
    }
  }

  // Knowledge entries
  const entries = (await db.prepare(`
    SELECT ke.id, ke.title, ke.type, ke.source_requirement_id, ke.category
    FROM knowledge_entries ke WHERE ke.status = 'published'
  `).all()) as any[];
  for (const e of entries) {
    addNode(`ke_${e.id}`, 'knowledge', e.title, { knowledgeType: e.type, category: e.category });
    if (e.source_requirement_id && nodeSet.has(`req_${e.source_requirement_id}`)) {
      addEdge(`req_${e.source_requirement_id}`, `ke_${e.id}`, 'solved_by');
    }
  }

  // Knowledge relations
  const kRels = (await db.prepare('SELECT source_id, target_id, relation_type FROM knowledge_relations').all()) as any[];
  for (const kr of kRels) {
    if (nodeSet.has(`ke_${kr.source_id}`) && nodeSet.has(`ke_${kr.target_id}`)) {
      addEdge(`ke_${kr.source_id}`, `ke_${kr.target_id}`, kr.relation_type);
    }
  }

  return NextResponse.json({ nodes, edges, meta: { scope, nodeCount: nodes.length, edgeCount: edges.length } });
  } catch (e: any) {
    console.error('Knowledge graph API error:', e?.message || e);
    return NextResponse.json({ nodes: [], edges: [], error: '图谱数据加载失败' }, { status: 500 });
  }
}
