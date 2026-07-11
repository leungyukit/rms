/**
 * 数据导入 · 核心算法（解析、字段映射、校验、提交）
 */
import * as XLSX from 'xlsx';
import { getDb, isMysqlEnabled } from './db';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// 字段配置：目标字段 + 别名（用于自动匹配）
export const FIELDS = [
  { target: 'title', label: '标题', aliases: ['title', '标题', '需求标题', 'name'] },
  { target: 'description', label: '描述', aliases: ['description', '描述', '详情', '内容'] },
  { target: 'business_unit', label: '业务方', aliases: ['business_unit', '业务方', '业务部门'] },
  { target: 'priority', label: '优先级', aliases: ['priority', '优先级', '重要程度'] },
  { target: 'category', label: '类别', aliases: ['category', '类别', '分类'] },
  { target: 'project_name', label: '所属项目', aliases: ['project_name', '项目', '所属项目', 'project'] },
  { target: 'handler_username', label: '处理人', aliases: ['handler', '处理人', '负责人'] },
  { target: 'requester_name', label: '提出人', aliases: ['requester', '提出人', '需求人'] },
  { target: 'benefit', label: '价值/收益', aliases: ['benefit', '价值', '收益'] },
  { target: 'planned_start', label: '计划开始', aliases: ['planned_start', '计划开始', '开始日期'] },
  { target: 'planned_end', label: '计划结束', aliases: ['planned_end', '计划结束', '结束日期'] },
  { target: 'tags', label: '标签', aliases: ['tags', '标签'] },
];

// Excel 公式注入安全过滤
export function escapeFormula(s: string): string {
  if (typeof s !== 'string') return s;
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

// 解析 buffer → 行数组（保留原始列名）
export function parseFile(buf: Buffer, filename: string): { rows: any[]; columns: string[]; extraSheets: string[] } {
  const wb = XLSX.read(buf, { type: 'buffer', codepage: 65001, cellDates: true });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  const columns: string[] = rows.length ? Object.keys(rows[0]) : [];
  return { rows, columns, extraSheets: wb.SheetNames.slice(1) };
}

// 自动推断映射
export function autoMapping(columns: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const col of columns) {
    const colLow = String(col).toLowerCase().trim();
    for (const f of FIELDS) {
      if (f.aliases.some(a => a.toLowerCase() === colLow)) {
        result[col] = f.target;
        break;
      }
    }
  }
  return result;
}

// 校验优先级等枚举
const PRIORITIES = ['high', 'medium', 'low'];
const CATEGORIES = ['project', 'bug', 'consult', 'data'];

function normalizeValue(target: string, value: any, ctx: { projects: Map<string, number>; users: Map<string, number>; tags: string[] }): { ok: boolean; value?: any; error?: string } {
  if (value === undefined || value === null || value === '') {
    if (target === 'title') return { ok: false, error: '标题必填' };
    if (target === 'priority') return { ok: true, value: 'medium' };
    if (target === 'category') return { ok: true, value: 'project' };
    return { ok: true, value: null };
  }
  const s = String(value).trim();
  if (target === 'title') {
    if (s.length < 2 || s.length > 500) return { ok: false, error: '标题长度 2-500' };
    return { ok: true, value: escapeFormula(s) };
  }
  if (target === 'description' || target === 'benefit') {
    return { ok: true, value: escapeFormula(s) };
  }
  if (target === 'priority') {
    const low = s.toLowerCase();
    if (PRIORITIES.includes(low)) return { ok: true, value: low };
    const map: any = { '高': 'high', '极高': 'high', '中': 'medium', '普通': 'medium', '低': 'low' };
    if (map[s]) return { ok: true, value: map[s] };
    return { ok: false, error: `优先级非法: "${s}"，应为 ${PRIORITIES.join('/')}` };
  }
  if (target === 'category') {
    const low = s.toLowerCase();
    if (CATEGORIES.includes(low)) return { ok: true, value: low };
    const map: any = { '项目': 'project', '缺陷': 'bug', '咨询': 'consult', '数据': 'data' };
    if (map[s]) return { ok: true, value: map[s] };
    return { ok: false, error: `类别非法: "${s}"，应为 ${CATEGORIES.join('/')}` };
  }
  if (target === 'project_name') {
    const key = s.toLowerCase();
    if (ctx.projects.has(key)) return { ok: true, value: ctx.projects.get(key) };
    return { ok: false, error: `项目不存在: "${s}"` };
  }
  if (target === 'handler_username' || target === 'requester_name') {
    if (target === 'requester_name') return { ok: true, value: escapeFormula(s) };
    const key = s.toLowerCase();
    if (ctx.users.has(key)) return { ok: true, value: ctx.users.get(key) };
    return { ok: false, error: `处理人用户不存在: "${s}"` };
  }
  if (target === 'business_unit') {
    return { ok: true, value: escapeFormula(s).substring(0, 200) };
  }
  if (target === 'planned_start' || target === 'planned_end') {
    // 接受 YYYY-MM-DD / YYYY/MM/DD / M/D/YY / M/D/YYYY
    const re1 = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/;
    const m1 = s.match(re1);
    if (m1) return { ok: true, value: `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}` };
    const re2 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;
    const m2 = s.match(re2);
    if (m2) {
      let y = parseInt(m2[3]);
      if (y < 100) y = 2000 + y;
      return { ok: true, value: `${y}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}` };
    }
    return { ok: false, error: `日期格式错误: "${s}"` };
  }
  if (target === 'tags') {
    return { ok: true, value: s.split(/[,，;；]/).map(t => t.trim()).filter(Boolean) };
  }
  return { ok: true, value: s };
}

// 归一化整行
export function normalizeRow(raw: any, mapping: Record<string, string>, ctx: any): { normalized: any; errors: any[] } {
  const result: any = {};
  const errors: any[] = [];
  for (const [sourceCol, target] of Object.entries(mapping)) {
    if (!target) continue;
    const v = normalizeValue(target, raw[sourceCol], ctx);
    if (v.ok) result[target] = v.value;
    else errors.push({ field: target, message: v.error });
  }
  return { normalized: result, errors };
}

// 生成模板（xlsx/csv）
export function generateTemplate(format: 'xlsx' | 'csv'): { filename: string; content: Buffer; contentType: string } {
  const headers = FIELDS.map(f => f.label);
  const sample = [
    '首页加载速度优化',
    '客户反馈首页加载超过 5s，竞品都在 2s 内，需要优化',
    '电商',
    'high',
    'project',
    'ERP系统升级',
    'admin',
    '张三',
    '提升用户留存率',
    '2026-06-01',
    '2026-06-15',
    '性能,前端',
  ];
  if (format === 'csv') {
    const lines = [headers.join(','), sample.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')];
    const content = Buffer.from('\uFEFF' + lines.join('\n'), 'utf8'); // UTF-8 BOM
    return { filename: 'RMS需求导入模板.csv', content, contentType: 'text/csv; charset=utf-8' };
  }
  // xlsx
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '需求');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return { filename: 'RMS需求导入模板.xlsx', content: buf, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

// 单行 commit
export function insertOneRow(norm: any, createdBy: number): number {
  const db = getDb();
  const r = db.prepare(`
    INSERT INTO requirements(title, description, business_unit, priority, category, project_id, handler_id, requester_name, benefit, planned_start, planned_end, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received_not_evaluated')
  `).run(
    norm.title,
    norm.description || null,
    norm.business_unit || null,
    norm.priority || 'medium',
    norm.category || 'project',
    norm.project_name || null,
    norm.handler_username || null,
    norm.requester_name || null,
    norm.benefit || null,
    norm.planned_start || null,
    norm.planned_end || null,
  );
  return r.lastInsertRowid as number;
}

// 计算 SHA256
export function fileHash(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// 生成错误报告 CSV
export function writeErrorReport(importId: number, errors: any[]): string {
  const dir = path.join(process.cwd(), 'data', 'imports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = path.join(dir, `${importId}_errors.csv`);
  const lines = ['row_no,raw_title,error_field,error_message'];
  for (const e of errors) {
    lines.push([e.row_no, `"${String(e.raw_title || '').replace(/"/g, '""')}"`, e.error_field, `"${String(e.error_message || '').replace(/"/g, '""')}"`].join(','));
  }
  fs.writeFileSync(filename, '\uFEFF' + lines.join('\n'), 'utf8');
  return filename;
}

// 加载上下文（项目 + 用户 + 标签）
export function loadContext(): { projects: Map<string, number>; users: Map<string, number> } {
  const db = getDb();
  const projects = new Map<string, number>();
  for (const r of db.prepare(`SELECT id, name FROM projects`).all() as any[]) {
    projects.set(String(r.name).toLowerCase().trim(), r.id);
  }
  const users = new Map<string, number>();
  for (const r of db.prepare(`SELECT id, username, display_name FROM users`).all() as any[]) {
    users.set(String(r.username).toLowerCase().trim(), r.id);
    if (r.display_name) users.set(String(r.display_name).toLowerCase().trim(), r.id);
  }
  return { projects, users };
}
