#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RMS mojibake 修复脚本（2026-08-12 字符集事故）

背景：
  src/lib/db.ts 的 mysqlExec() 调 mysql CLI 时未指定 --default-character-set，
  连接退回 latin1（Docker MySQL 实测 character_set_client/connection/results 全为 latin1）。
  UTF-8 中文经 latin1 通道写入 utf8mb4 列 → 双重编码。
  表现：「创建用户」→「åˆ›å»ºç”¨æˆ·」

判定原理（关键）：
  正常的 UTF-8 中文无法无损转换成 latin1（CONVERT 返回 NULL），
  只有双重编码的坏数据才能成功还原。所以：
      fixed = CONVERT(BINARY(CONVERT(col USING latin1)) USING utf8mb4)
      坏数据：fixed IS NOT NULL AND fixed <> col   → 需要修
      好数据：fixed IS NULL                        → 跳过，绝不误伤
  这个判定天然幂等，重复跑不会二次破坏。

用法：
  python3 fix-mojibake.py --dry-run    # 只报告，不改库
  python3 fix-mojibake.py --apply      # 实际修复
"""
import argparse
import os
import subprocess
import sys

DB = os.environ.get("MYSQL_DATABASE", "rms")
USER = os.environ.get("MYSQL_USER", "rms")
PASSWORD = os.environ.get("MYSQL_PASSWORD", "")

BASE_ARGS = [
    "mysql",
    "-u", USER,
    "--default-character-set=utf8mb4",
    "-N", "-B",
]


def run_sql(sql, db=None):
    """执行 SQL，返回 stdout 文本。"""
    args = list(BASE_ARGS)
    if db:
        args.append(db)
    env = dict(os.environ)
    if PASSWORD:
        env["MYSQL_PWD"] = PASSWORD
    proc = subprocess.run(
        args, input=sql, capture_output=True, text=True, env=env, timeout=120
    )
    if proc.returncode != 0:
        err = (proc.stderr or "").strip()
        # 过滤掉密码告警噪音
        err_lines = [l for l in err.splitlines() if "insecure" not in l.lower()]
        if err_lines:
            raise RuntimeError("\n".join(err_lines))
    return (proc.stdout or "").strip()


def get_text_columns():
    """取全库文本列 + 主键，只处理有单列主键的表（修复要靠主键定位）。"""
    sql = f"""
SELECT c.TABLE_NAME, c.COLUMN_NAME, k.COLUMN_NAME AS PK
FROM information_schema.COLUMNS c
JOIN (
    SELECT TABLE_NAME, COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = '{DB}' AND CONSTRAINT_NAME = 'PRIMARY'
    GROUP BY TABLE_NAME, COLUMN_NAME
    HAVING COUNT(*) = 1
) k ON k.TABLE_NAME = c.TABLE_NAME
WHERE c.TABLE_SCHEMA = '{DB}'
  AND c.DATA_TYPE IN ('varchar','text','mediumtext','longtext','char')
ORDER BY c.TABLE_NAME, c.COLUMN_NAME;
"""
    out = run_sql(sql, DB)
    cols = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) >= 3:
            cols.append((parts[0], parts[1], parts[2]))
    return cols


FIX_EXPR = "CONVERT(BINARY(CONVERT(`{col}` USING latin1)) USING utf8mb4)"


def count_broken(table, col):
    expr = FIX_EXPR.format(col=col)
    sql = (
        f"SELECT COUNT(*) FROM `{table}` "
        f"WHERE `{col}` IS NOT NULL AND `{col}` <> '' "
        f"AND {expr} IS NOT NULL AND {expr} <> `{col}`;"
    )
    out = run_sql(sql, DB)
    try:
        return int(out.splitlines()[0])
    except (ValueError, IndexError):
        return 0


def sample_broken(table, col, pk, limit=2):
    expr = FIX_EXPR.format(col=col)
    sql = (
        f"SELECT `{pk}`, LEFT(`{col}`,50), LEFT({expr},50) FROM `{table}` "
        f"WHERE `{col}` IS NOT NULL AND `{col}` <> '' "
        f"AND {expr} IS NOT NULL AND {expr} <> `{col}` LIMIT {limit};"
    )
    return run_sql(sql, DB)


def fix_column(table, col):
    expr = FIX_EXPR.format(col=col)
    sql = (
        f"UPDATE `{table}` SET `{col}` = {expr} "
        f"WHERE `{col}` IS NOT NULL AND `{col}` <> '' "
        f"AND {expr} IS NOT NULL AND {expr} <> `{col}`;"
    )
    run_sql(sql, DB)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true", help="只报告不改库")
    g.add_argument("--apply", action="store_true", help="实际修复")
    args = ap.parse_args()

    print("=== 字符集连接状态 ===")
    print(run_sql("SHOW VARIABLES LIKE 'character_set_c%';", DB))
    print()

    cols = get_text_columns()
    print(f"=== 扫描 {len(cols)} 个文本列 ===")

    broken = []
    for table, col, pk in cols:
        try:
            n = count_broken(table, col)
        except RuntimeError as e:
            print(f"  [跳过] {table}.{col}: {e}")
            continue
        if n > 0:
            broken.append((table, col, pk, n))
            print(f"  ❌ {table}.{col}: {n} 行乱码")

    if not broken:
        print("\n✅ 未发现乱码数据。")
        return 0

    total = sum(b[3] for b in broken)
    print(f"\n=== 汇总：{len(broken)} 个列，共 {total} 行需修复 ===")

    print("\n=== 样例（修复前 → 修复后）===")
    for table, col, pk, n in broken[:6]:
        print(f"--- {table}.{col} ---")
        print(sample_broken(table, col, pk))

    if args.dry_run:
        print("\n[dry-run] 未改动任何数据。加 --apply 执行修复。")
        return 0

    print("\n=== 开始修复 ===")
    fixed_cols = 0
    for table, col, pk, n in broken:
        try:
            fix_column(table, col)
            after = count_broken(table, col)
            status = "✅" if after == 0 else f"⚠️ 仍剩 {after}"
            print(f"  {status} {table}.{col}（原 {n} 行）")
            fixed_cols += 1
        except RuntimeError as e:
            print(f"  ❌ {table}.{col} 修复失败: {e}")

    print(f"\n=== 完成：处理了 {fixed_cols}/{len(broken)} 个列 ===")

    remaining = 0
    for table, col, pk, n in broken:
        try:
            remaining += count_broken(table, col)
        except RuntimeError:
            pass
    if remaining == 0:
        print("✅ 复查：全部乱码已清除。")
    else:
        print(f"⚠️ 复查：仍有 {remaining} 行未修复，需人工介入。")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
