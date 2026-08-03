/**
 * AI 知识自动沉淀 Worker
 * 简化的内存定时器（5s 拉一次，2 个并发）
 */
import { claimNextJob, completeJob, failJob, getConfig } from './ai-knowledge-migrations';
import { getDb } from './db';

let started = false;
let workerHandle: ReturnType<typeof setInterval> | null = null;
const POLL_INTERVAL_MS = Number(process.env.AI_KNOWLEDGE_POLL_INTERVAL_MS || 5000);

interface Job { id: number; requirement_id: number; trigger_status: string; }

async function callLLM(prompt: string): Promise<{ content: string; model?: string }> {
  const apiUrl = process.env.LLM_API_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || 'mimo-v2';
  if (!apiUrl) {
    // 离线/无 LLM 时返回占位（用于开发与测试）
    return { content: JSON.stringify({ title: 'AI 模拟草稿', question: '请描述此问题', answer: '当前未配置 LLM，请配置 LLM_API_URL 后重试' }), model: 'mock' };
  }
  try {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error('LLM HTTP ' + r.status);
    const j = await r.json();
    return { content: j.choices?.[0]?.message?.content || j.content || '', model };
  } catch (e: any) {
    throw new Error('LLM 调用失败: ' + e.message);
  }
}

async function processOne(job: Job) {
  const t0 = Date.now();
  const db = getDb();
  const r = db.prepare(`SELECT id, title, description, solution, root_cause, lessons_learned, handler_id FROM requirements WHERE id=?`).get(job.requirement_id) as any;
  if (!r) { failJob(job.id, '需求不存在'); return; }

  const prompt = `请基于以下需求信息生成一条知识库 FAQ 草稿。
需求标题：${r.title}
需求描述：${r.description || '（未填写）'}
解决方案：${r.solution || '（未填写）'}
根因分析：${r.root_cause || '（未填写）'}
经验教训：${r.lessons_learned || '（未填写）'}

请用 JSON 格式返回（不要其他文字）：
{"title": "不超过30字的问题标题", "question": "问题的清晰描述", "answer": "完整答案（建议 100-300 字）", "category": "技术问题/业务流程/数据处理/系统设计", "tags": "逗号分隔标签"}`;

  try {
    const { content, model } = await callLLM(prompt);
    // 解析 JSON（可能含 ```json 围栏）
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('LLM 返回非 JSON');
    const data = JSON.parse(m[0]);

    const defaultStatus = getConfig('ai_knowledge_default_status', 'draft');
    const eid = db.prepare(`
      INSERT INTO knowledge_entries(title, question, answer, category, tags, source_requirement_id, confidence, status, ai_generated, source_job_id, created_by)
      VALUES (?, ?, ?, ?, ?, ?, 0.7, ?, 1, ?, 'ai')
    `).run(
      String(data.title || r.title).substring(0, 200),
      String(data.question || ''),
      String(data.answer || ''),
      String(data.category || '技术问题'),
      String(data.tags || ''),
      r.id,
      defaultStatus,
      job.id,
    ).lastInsertRowid as number;

    completeJob(job.id, eid, Date.now() - t0, model);

    // 通知处理人
    if (getConfig('ai_knowledge_notify_handler', 'true') === 'true' && r.handler_id) {
      try {
        db.prepare(`
          INSERT INTO notifications(user_id, type, title, content, link, created_at)
          VALUES (?, 'ai_knowledge_review', ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(r.handler_id, '🆕 AI 知识草稿待审阅', `AI 已为需求 #${r.id} "${r.title}" 生成知识草稿，请审阅`,
          `/knowledge/${eid}?from=req-${r.id}`);
      } catch (e) {}
    }
  } catch (e: any) {
    failJob(job.id, e.message || String(e));
  }
}

export function startAiKnowledgeWorker() {
  if (started) return;
  started = true;
  // 2026-08-03: 原来 setInterval 不留句柄 —— 无法停止、热重载会叠加多个定时器
  // （dev/HMR 下每次模块重载都新起一个，重复抢占同一批 job）。现保存句柄并支持停止。
  workerHandle = setInterval(async () => {
    if (getConfig('ai_knowledge_auto_enabled', 'true') !== 'true') return;
    try {
      // 并发 2
      const jobs = [];
      for (let i = 0; i < 2; i++) {
        const j = claimNextJob();
        if (j) jobs.push(processOne(j));
      }
      if (jobs.length) await Promise.allSettled(jobs);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai-knowledge-worker]', (e as any).message);
    }
  }, POLL_INTERVAL_MS);
  // Node 下不要因为这个定时器阻止进程退出
  (workerHandle as any)?.unref?.();
  // eslint-disable-next-line no-console
  console.log(`[ai-knowledge] worker started (${POLL_INTERVAL_MS}ms interval, 2 concurrent)`);
}

/** 停止 worker（幂等；用于优雅退出或 admin 关停） */
export function stopAiKnowledgeWorker(): void {
  if (workerHandle) {
    clearInterval(workerHandle);
    workerHandle = null;
  }
  started = false;
}

/** 状态查询 */
export function getAiKnowledgeWorkerStatus(): { running: boolean; pollIntervalMs: number } {
  return { running: workerHandle !== null, pollIntervalMs: POLL_INTERVAL_MS };
}
