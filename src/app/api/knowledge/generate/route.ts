import { NextRequest, NextResponse } from 'next/server';
import { getAsyncDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

// POST: generate FAQ entries from completed requirements using LLM
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });

  const body = await req.json();
  const { requirement_ids, publish } = body; // optional: specific IDs, or all completed

  const db = getAsyncDb();

  // Get LLM config
  const get = async (key: string, def: string = '') => {
    try { return ((await db.prepare('SELECT value FROM system_config WHERE `key` = ?').get(key)) as any)?.value ?? def; } catch { return def; }
  };
  const config = {
    enabled: (await get('llm_enabled', 'false')) === 'true',
    apiUrl: await get('llm_api_url', ''),
    apiKey: await get('llm_api_key', ''),
    model: await get('llm_model', 'step-2-16k'),
  };

  if (!config.enabled || !config.apiKey) {
    return NextResponse.json({ error: 'LLM 未启用' }, { status: 400 });
  }

  // Get completed requirements
  let reqs;
  if (requirement_ids && requirement_ids.length > 0) {
    const placeholders = requirement_ids.map(() => '?').join(',');
    reqs = (await db.prepare(`
      SELECT r.*, p.name as project_name
      FROM requirements r LEFT JOIN projects p ON p.id = r.project_id
      WHERE r.id IN (${placeholders}) AND r.status IN ('completed','verified','closed')
    `).all(...requirement_ids)) as any[];
  } else {
    // Get completed requirements without knowledge entries
    reqs = (await db.prepare(`
      SELECT r.*, p.name as project_name
      FROM requirements r LEFT JOIN projects p ON p.id = r.project_id
      WHERE r.status IN ('completed','verified','closed')
      AND r.id NOT IN (SELECT DISTINCT source_requirement_id FROM knowledge_entries WHERE source_requirement_id IS NOT NULL)
    `).all()) as any[];
  }

  if (reqs.length === 0) {
    return NextResponse.json({ error: '没有需要生成知识的已完成需求' }, { status: 400 });
  }

  // Get comments for each requirement
  const getComments = async (reqId: number) => {
    return (await db.prepare(`
      SELECT c.content, u.display_name FROM requirement_comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.requirement_id = ? ORDER BY c.created_at LIMIT 10
    `).all(reqId)) as any[];
  };

  const getLogs = async (reqId: number) => {
    return (await db.prepare(`
      SELECT sl.old_status, sl.new_status, sl.note, sl.changed_at, u.display_name
      FROM status_log sl LEFT JOIN users u ON u.id = sl.changed_by
      WHERE sl.requirement_id = ? ORDER BY sl.changed_at LIMIT 10
    `).all(reqId));
  };

  const generated = [];

  for (const req of reqs) {
    const comments = await getComments(req.id);
    const logs = await getLogs(req.id);

    const prompt = `你是需求分析专家。根据以下已完成的需求信息，生成FAQ知识条目。

需求信息：
- 标题：${req.title}
- 描述：${req.description}
- 业务方：${req.business_unit}
- 优先级：${req.priority}
- 项目：${req.project_name || '无'}
- 分类：${req.category}
- 价值：${req.benefit}
- 解决方案：${req.solution || '未填写'}
- 经验教训：${req.lessons_learned || '未填写'}
- 根因：${req.root_cause || '未填写'}
- 评论：${comments.map((c: any) => `${c.display_name}: ${c.content}`).join('\n') || '无'}
- 状态变更：${logs.map((l: any) => `${l.display_name}: ${l.old_status||'无'} -> ${l.new_status} (${l.changed_at})`).join('\n') || '无'}

请生成一个FAQ条目，输出JSON格式：
{
  "question": "用户可能会问的问题（口语化、自然）",
  "answer": "完整解答，包含解决方案、处理过程、注意事项",
  "category": "分类（技术问题/流程问题/配置问题/故障处理/功能需求）",
  "tags": ["标签1", "标签2", "标签3"],
  "confidence": 0.85
}

只输出JSON，不要其他文字。`;

    try {
      const resp = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
          temperature: 0.3,
        }),
      });

      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content?.trim() || '';

      // Parse JSON from response
      let parsed;
      try {
        const jsonMatch = reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {}

      if (parsed) {
        const entryStatus = publish ? 'published' : 'draft';
        const result = (await db.prepare(`
          INSERT INTO knowledge_entries (source_requirement_id, type, title, question, answer, category, tags, confidence, status, created_by)
          VALUES (?, 'faq', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          req.id,
          req.title,
          parsed.question,
          parsed.answer,
          parsed.category || '',
          JSON.stringify(parsed.tags || []),
          parsed.confidence || 0.8,
          entryStatus,
          'ai'
        ));
        generated.push({ id: result.lastInsertRowid, requirement_id: req.id, title: req.title, status: entryStatus });
      }
    } catch (e: any) {
      console.error(`Failed to generate FAQ for req #${req.id}:`, e.message);
    }
  }

  return NextResponse.json({ success: true, generated, total: generated.length });
}
