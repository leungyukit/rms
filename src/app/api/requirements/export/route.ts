import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb, STATUS_MAP, PRIORITY_MAP } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// GET /api/requirements/export - 导出需求为 CSV 格式
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id');
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');

  const db = getAsyncDb();
  let sql = `
    SELECT r.id, r.title, r.description, r.business_unit, r.priority, r.status,
      r.category, p.name as project_name, r.requester_name, r.benefit,
      r.planned_start, r.planned_end, r.actual_end,
      recv.display_name as receiver_name, hdl.display_name as handler_name,
      vrf.display_name as verifier_name, r.created_at, r.updated_at
    FROM requirements r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN users recv ON recv.id = r.receiver_id
    LEFT JOIN users hdl ON hdl.id = r.handler_id
    LEFT JOIN users vrf ON vrf.id = r.verifier_id
    WHERE 1=1
  `;

  const params: any[] = [];

  if (projectId) {
    sql += ' AND r.project_id = ?';
    params.push(projectId);
  }
  if (status) {
    sql += ' AND r.status = ?';
    params.push(status);
  }
  if (priority) {
    sql += ' AND r.priority = ?';
    params.push(priority);
  }

  sql += ' ORDER BY r.id DESC';

  const rows = (await db.prepare(sql).all(...params)) as any[];

  // CSV header
  const headers = [
    'ID', '标题', '描述', '业务方', '优先级', '状态', '分类',
    '所属项目', '请求方', '价值/收益', '计划开始', '计划结束', '实际结束',
    '接收人', '处理人', '验证人', '创建时间', '更新时间'
  ];

  // CSV content
  const csvRows = [headers.join(',')];

  for (const row of rows) {
    const values = [
      row.id,
      `"${(row.title || '').replace(/"/g, '""')}"`,
      `"${(row.description || '').replace(/"/g, '""')}"`,
      `"${(row.business_unit || '').replace(/"/g, '""')}"`,
      PRIORITY_MAP[row.priority] || row.priority,
      STATUS_MAP[row.status] || row.status,
      row.category,
      `"${(row.project_name || '').replace(/"/g, '""')}"`,
      `"${(row.requester_name || '').replace(/"/g, '""')}"`,
      `"${(row.benefit || '').replace(/"/g, '""')}"`,
      row.planned_start || '',
      row.planned_end || '',
      row.actual_end || '',
      row.receiver_name || '',
      row.handler_name || '',
      row.verifier_name || '',
      row.created_at || '',
      row.updated_at || '',
    ];
    csvRows.push(values.join(','));
  }

  const csv = '\uFEFF' + csvRows.join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="requirements_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

// POST /api/requirements/export - 批量导入需求
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json();
  const db = getAsyncDb();

  if (!body.data || !Array.isArray(body.data)) {
    return NextResponse.json({ error: '请提供有效的数据数组' }, { status: 400 });
  }

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  const insertStmt = db.prepare(`
    INSERT INTO requirements (title, description, business_unit, priority, status, category, project_id, requester_name, benefit, planned_start, planned_end, receiver_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getProjectId = db.prepare('SELECT id FROM projects WHERE name LIKE ?');

  for (let i = 0; i < body.data.length; i++) {
    const item = body.data[i];
    try {
      let projectId = null;
      if (item.project_name) {
        const proj = (await getProjectId.get(`%${item.project_name}%`)) as any;
        if (proj) projectId = proj.id;
      }

      await insertStmt.run(
        item.title || `导入需求 ${i + 1}`,
        item.description || '',
        item.business_unit || '',
        item.priority || 'medium',
        item.status || 'received_not_evaluated',
        item.category || 'project',
        projectId,
        item.requester_name || '',
        item.benefit || '',
        item.planned_start || null,
        item.planned_end || null,
        user.id
      );
      results.success++;
    } catch (e: any) {
      results.failed++;
      results.errors.push(`第 ${i + 1} 行: ${e.message}`);
    }
  }

  return NextResponse.json(results, { status: 201 });
}
