/**
 * 知识管理 · 分类级权限（ACL）
 *
 * 背景：改造前知识库只有 hasFunctionalAccess() 一道粗门 —— 拿到功能权限就能看全部知识，
 * 而 role_project_access 只管项目、不管知识。等于「进来即全见」。
 *
 * 设计取舍：
 *
 * 1. **默认开放，显式收紧**（fail-open by default, fail-closed when marked）
 *    分类默认 is_restricted=0 → 所有有功能权限的人可读；
 *    只有打了 is_restricted=1 的分类才要显式 ACL 授权。
 *    这样不破坏现有数据（当前 0 条知识、无分类），又能对敏感分类真正收紧。
 *    ⚠️ 与「安全默认拒绝」的取舍：知识库的定位是共享，全局默认拒绝会让功能不可用；
 *    但**受限分类内部是 fail-closed 的** —— 没有明确 grant 一律拒。
 *
 * 2. **祖先继承**：父分类受限，整棵子树都受限。
 *    否则把子分类挂到受限父节点下就能绕过 —— 常见的越权路径。
 *
 * 3. **算「拒绝集」而不是「允许集」**
 *    受限分类通常是少数，拒绝集小得多，生成的 SQL 也短。
 *    并且未分类（category_id IS NULL）的条目天然可读，不会因为漏配 ACL 而消失。
 */
import { getDb } from './db';
import type { UserInfo } from './auth';
import { isGlobalAdmin } from './auth';

interface CategoryRow {
  id: number;
  parent_id: number | null;
  is_restricted: number;
}

/** 取全部分类的最小字段集（建树用） */
function loadCategories(): CategoryRow[] {
  const db = getDb();
  try {
    return db.prepare(
      `SELECT id AS id, parent_id AS parent_id, is_restricted AS is_restricted FROM knowledge_categories`
    ).all() as any[];
  } catch {
    // 分类表还没建（P3 之前）→ 视为无受限分类
    return [];
  }
}

/** 该用户被授予读权限的受限分类 id */
function loadGrantedIds(user: UserInfo): Set<number> {
  const db = getDb();
  const roles = (user.roles || []).filter(Boolean);
  if (roles.length === 0) return new Set();

  const placeholders = roles.map(() => '?').join(',');
  try {
    const rows = db.prepare(
      `SELECT DISTINCT category_id AS category_id FROM knowledge_category_acl
       WHERE can_read = 1 AND role_name IN (${placeholders})`
    ).all(...roles) as any[];
    return new Set(rows.map(r => Number(r.category_id)));
  } catch {
    return new Set();
  }
}

/**
 * 计算「该用户不可读」的分类 id 集合（含继承）。
 *
 * 一个分类不可读 = 它自己或任一祖先 is_restricted=1，且用户没拿到对应 grant。
 * 授权按「谁受限就要谁的 grant」判定：受限节点自身没被授权，整棵子树都拒。
 */
export function getDeniedCategoryIds(user: UserInfo): number[] {
  if (isGlobalAdmin(user.roles)) return [];

  const cats = loadCategories();
  if (cats.length === 0) return [];

  const byId = new Map<number, CategoryRow>();
  for (const c of cats) byId.set(Number(c.id), c);

  const granted = loadGrantedIds(user);
  const denied: number[] = [];

  for (const c of cats) {
    // 沿祖先链找所有受限节点，任一未被授权即拒
    let cursor: CategoryRow | undefined = c;
    let blocked = false;
    const guard = new Set<number>(); // 防脏数据成环导致死循环

    while (cursor && !guard.has(Number(cursor.id))) {
      guard.add(Number(cursor.id));
      if (Number(cursor.is_restricted) === 1 && !granted.has(Number(cursor.id))) {
        blocked = true;
        break;
      }
      cursor = cursor.parent_id != null ? byId.get(Number(cursor.parent_id)) : undefined;
    }

    if (blocked) denied.push(Number(c.id));
  }

  return denied;
}

/**
 * 生成读权限的 SQL 过滤片段。
 *
 * @param alias knowledge_entries 的表别名（无别名传空串）
 * @returns sql 为空字符串表示无需过滤
 *
 * 用法：把 sql 直接 AND 进 WHERE，params 按顺序拼进参数列表。
 */
export function buildKnowledgeReadFilter(
  user: UserInfo,
  alias = 'ke'
): { sql: string; params: number[] } {
  const denied = getDeniedCategoryIds(user);
  if (denied.length === 0) return { sql: '', params: [] };

  const col = alias ? `${alias}.category_id` : 'category_id';
  const placeholders = denied.map(() => '?').join(',');
  // IS NULL 必须显式放行：NOT IN 遇 NULL 结果是 NULL（不是 true），
  // 未分类条目会被整体吞掉 —— SQL 三值逻辑的经典坑。
  return {
    sql: `(${col} IS NULL OR ${col} NOT IN (${placeholders}))`,
    params: denied,
  };
}

/** 单个分类是否可读 */
export function canReadCategory(user: UserInfo, categoryId: number | null | undefined): boolean {
  if (categoryId == null) return true;
  if (isGlobalAdmin(user.roles)) return true;
  return !getDeniedCategoryIds(user).includes(Number(categoryId));
}

/**
 * 单个分类是否可写。
 *
 * 写权限比读严格：受限分类必须有 can_write grant；
 * 非受限分类沿用原有的功能权限判定（调用方已做 hasFunctionalAccess）。
 */
export function canWriteCategory(user: UserInfo, categoryId: number | null | undefined): boolean {
  if (isGlobalAdmin(user.roles)) return true;
  if (categoryId == null) return true;

  const denied = getDeniedCategoryIds(user);
  if (denied.includes(Number(categoryId))) return false;

  const db = getDb();
  const roles = (user.roles || []).filter(Boolean);
  if (roles.length === 0) return false;

  // 该分类（含祖先）是否受限；不受限则不额外要求 can_write
  const cats = loadCategories();
  const byId = new Map<number, CategoryRow>();
  for (const c of cats) byId.set(Number(c.id), c);

  let cursor = byId.get(Number(categoryId));
  let restricted = false;
  const guard = new Set<number>();
  while (cursor && !guard.has(Number(cursor.id))) {
    guard.add(Number(cursor.id));
    if (Number(cursor.is_restricted) === 1) { restricted = true; break; }
    cursor = cursor.parent_id != null ? byId.get(Number(cursor.parent_id)) : undefined;
  }
  if (!restricted) return true;

  const placeholders = roles.map(() => '?').join(',');
  try {
    const row = db.prepare(
      `SELECT COUNT(*) AS cnt FROM knowledge_category_acl
       WHERE can_write = 1 AND category_id = ? AND role_name IN (${placeholders})`
    ).get(Number(categoryId), ...roles) as any;
    return Number(row?.cnt || 0) > 0;
  } catch {
    return false;
  }
}
