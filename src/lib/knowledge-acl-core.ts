/**
 * 知识分类 ACL · 纯逻辑内核
 *
 * 单独成文件的原因：这里的继承判定是真正容易出错的地方（祖先链、环、授权归属），
 * 必须能被独立测试。knowledge-acl.ts 依赖 db/auth，跑不了单测；
 * 本文件零依赖，可直接编译执行验证。
 *
 * 教训来源：项目历史上多次「自己写的检测器骗了自己」，
 * 所以这里的逻辑必须有阳性对照测试（见 scripts/test-knowledge-acl.mjs）。
 */

export interface AclCategory {
  id: number;
  parent_id: number | null;
  is_restricted: number;
}

/**
 * 计算「不可读」的分类 id 集合。
 *
 * 规则：一个分类不可读 = 它自己或任一祖先 is_restricted=1，且该受限节点未被授权。
 * 即「谁受限就要谁的 grant」——受限节点自身没被授权，整棵子树都拒。
 *
 * @param cats    全部分类
 * @param granted 用户已获读授权的分类 id
 */
export function computeDeniedCategoryIds(
  cats: AclCategory[],
  granted: Set<number>
): number[] {
  const byId = new Map<number, AclCategory>();
  for (const c of cats) byId.set(Number(c.id), c);

  const denied: number[] = [];

  for (const c of cats) {
    let cursor: AclCategory | undefined = c;
    let blocked = false;
    // 脏数据可能让 parent 链成环，走过的节点不再走，避免死循环
    const seen = new Set<number>();

    while (cursor && !seen.has(Number(cursor.id))) {
      seen.add(Number(cursor.id));
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

/** 某分类（含祖先）是否处于受限状态 */
export function isCategoryRestricted(
  cats: AclCategory[],
  categoryId: number
): boolean {
  const byId = new Map<number, AclCategory>();
  for (const c of cats) byId.set(Number(c.id), c);

  let cursor = byId.get(Number(categoryId));
  const seen = new Set<number>();
  while (cursor && !seen.has(Number(cursor.id))) {
    seen.add(Number(cursor.id));
    if (Number(cursor.is_restricted) === 1) return true;
    cursor = cursor.parent_id != null ? byId.get(Number(cursor.parent_id)) : undefined;
  }
  return false;
}
