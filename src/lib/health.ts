/**
 * 项目健康度计算
 * 公式：f1 (逾期权重) + f2 (完成率权重) + f3 (风险权重) + f4 (里程碑权重) = 0-100
 * 依据：rms-docs/RMS-优化方案-阶段2-P1a.md § 2.3
 */
import { getDb } from './db';

export interface HealthFactor {
  key: string;
  label: string;
  value: string | number;
  weight: number;
  contribution: number;
}

export interface HealthResult {
  score: number;
  level: 'green' | 'yellow' | 'red' | null;
  factors: HealthFactor[];
  updated_at: string;
}

export function getHealthWeights(): { overdue: number; completion: number; risks: number; milestones: number } {
  const db = getDb();
  const get = (k: string, def: number): number => {
    try {
      const r = db.prepare(`SELECT value FROM system_config WHERE \`key\`=?`).get(k) as any;
      return r ? parseInt(r.value) : def;
    } catch { return def; }
  };
  return {
    overdue: get('health.weight.overdue', 30),
    completion: get('health.weight.completion', 30),
    risks: get('health.weight.risks', 25),
    milestones: get('health.weight.milestones', 15),
  };
}

export function computeHealth(projectId: number, projectStatus?: string): HealthResult {
  const db = getDb();
  const w = getHealthWeights();

  // 归档/完成项目不重算
  const proj = projectStatus ? { status: projectStatus } : (db.prepare(`SELECT status FROM projects WHERE id=?`).get(projectId) as any);
  if (proj && (proj.status === 'archived' || proj.status === 'completed')) {
    return { score: 0, level: null, factors: [], updated_at: new Date().toISOString() };
  }

  // 1) 逾期需求
  let overdue = 0;
  try {
    overdue = (db.prepare(`
      SELECT COUNT(*) c FROM requirements
      WHERE project_id=? AND planned_end < date('now')
      AND status NOT IN ('completed','verified','closed')
      AND merged_into IS NULL
    `).get(projectId) as any).c || 0;
  } catch (e) { overdue = 0; }

  // 2) 完成率
  let total = 0, done = 0;
  try {
    const r = db.prepare(`
      SELECT COUNT(*) total,
        SUM(CASE WHEN status IN ('completed','verified','closed') THEN 1 ELSE 0 END) done
      FROM requirements WHERE project_id=? AND merged_into IS NULL
    `).get(projectId) as any;
    total = r?.total || 0;
    done = r?.done || 0;
  } catch (e) {}

  // 3) 高等级风险
  let highRisk = 0;
  try {
    highRisk = (db.prepare(`
      SELECT COUNT(*) c FROM project_risks
      WHERE project_id=? AND status IN ('open','mitigating') AND level IN ('high','critical')
    `).get(projectId) as any).c || 0;
  } catch (e) { highRisk = 0; }

  // 4) 里程碑
  let msTotal = 0, msMissed = 0;
  try {
    const r = db.prepare(`
      SELECT
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
        SUM(CASE WHEN status='missed' THEN 1 ELSE 0 END) missed
      FROM project_milestones WHERE project_id=?
    `).get(projectId) as any;
    msTotal = r?.pending || 0;
    msMissed = r?.missed || 0;
  } catch (e) {}

  // 评分
  const f1 = Math.max(0, w.overdue - overdue * 5);
  const f2 = total > 0 ? Math.round((done / total) * w.completion) : w.completion;
  const f3 = Math.max(0, w.risks - highRisk * 8);
  const f4 = Math.max(0, w.milestones - msMissed * 5 - (msTotal === 0 ? 5 : 0));
  const score = f1 + f2 + f3 + f4;
  const level: 'green' | 'yellow' | 'red' = score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red';

  return {
    score,
    level,
    factors: [
      { key: 'overdue', label: '逾期需求', value: overdue, weight: w.overdue, contribution: f1 },
      { key: 'completion', label: '需求完成率', value: total ? `${Math.round(done * 100 / total)}%` : '—', weight: w.completion, contribution: f2 },
      { key: 'risks', label: '高等级风险', value: highRisk, weight: w.risks, contribution: f3 },
      { key: 'milestones', label: '里程碑达成', value: `${msTotal - msMissed}/${msTotal}`, weight: w.milestones, contribution: f4 },
    ],
    updated_at: new Date().toISOString(),
  };
}

export function persistHealth(projectId: number, h: HealthResult) {
  const db = getDb();
  try {
    db.prepare(`UPDATE projects SET health_score=?, health_level=?, health_updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(h.score, h.level, projectId);
  } catch (e) {}
}
