#!/usr/bin/env bash
# RMS mojibake 修复（2026-08-12 字符集事故）
#
# 根因：src/lib/db.ts 的 mysqlExec() 调 mysql CLI 未指定 --default-character-set，
#       连接退回 latin1（实测 character_set_client/connection/results 全为 latin1），
#       UTF-8 中文经 latin1 通道写入 utf8mb4 列 → 双重编码。
#       「创建用户」→「åˆ›å»ºç”¨æˆ·」
#
# 判定原理（保证不误伤）：
#   正常 UTF-8 中文无法无损转成 latin1 → CONVERT 返回 NULL
#   只有双重编码的坏数据才能成功还原
#   条件 `fixed IS NOT NULL AND fixed <> col` 精确命中，且天然幂等。
#
# 第一版踩的坑（务必保留此注释）：
#   CONVERT(... USING utf8mb4) 产出 utf8mb4_0900_ai_ci，而列多为 utf8mb4_unicode_ci，
#   直接 `<>` 比较报 ERROR 1267 Illegal mix of collations。
#   当时用 2>/dev/null 吞了错误 → 每列都算 0 行 → 假阴性"未发现乱码"。
#   修法：用 information_schema 里每列真实的 COLLATION_NAME 显式 COLLATE，且不吞错误。
set -uo pipefail

MODE="${1:-scan}"
CONTAINER="${CONTAINER:-rms-mysql}"
ENVFILE="${ENVFILE:-/opt/rms/.env}"

DB="$(sudo grep '^MYSQL_DATABASE=' "$ENVFILE" | cut -d= -f2)"
DBUSER="$(sudo grep '^MYSQL_USER=' "$ENVFILE" | cut -d= -f2)"
DBPASS="$(sudo grep '^MYSQL_PASSWORD=' "$ENVFILE" | cut -d= -f2)"
DB="${DB:-rms}"; DBUSER="${DBUSER:-rms}"

# 只过滤密码告警，其它错误必须可见（第一版就是吞错误吃了大亏）
q() {
  sudo docker exec -i -e MYSQL_PWD="$DBPASS" "$CONTAINER" \
    mysql -u"$DBUSER" --default-character-set=utf8mb4 -N -B "$DB" 2>&1 \
    | grep -v 'Using a password on the command line'
}

echo "=== 连接字符集自检（应为 utf8mb4）==="
echo "SHOW VARIABLES LIKE 'character_set_c%';" | q
echo

# ── 1. 生成统计 SQL：带每列真实 collation ────────────────
echo "=== 生成扫描语句（带每列真实 collation）==="
{
  echo "SET SESSION group_concat_max_len = 4194304;"
  cat <<'GENSQL'
SELECT GROUP_CONCAT(
  CONCAT(
    "SELECT '", c.TABLE_NAME, '.', c.COLUMN_NAME, "' AS col, COUNT(*) AS n FROM `",
    c.TABLE_NAME, '` WHERE `', c.COLUMN_NAME, '` IS NOT NULL AND `', c.COLUMN_NAME, "` <> '' ",
    'AND CONVERT(BINARY(CONVERT(`', c.COLUMN_NAME, '` USING latin1)) USING utf8mb4) COLLATE ',
    c.COLLATION_NAME, ' IS NOT NULL ',
    'AND CONVERT(BINARY(CONVERT(`', c.COLUMN_NAME, '` USING latin1)) USING utf8mb4) COLLATE ',
    c.COLLATION_NAME, ' <> `', c.COLUMN_NAME, '`'
  )
  SEPARATOR ' UNION ALL '
)
FROM information_schema.COLUMNS c
WHERE c.TABLE_SCHEMA = DATABASE()
  AND c.DATA_TYPE IN ('varchar','text','mediumtext','longtext','char')
  AND c.COLLATION_NAME IS NOT NULL;
GENSQL
} | q > /tmp/count-stmt.sql

if [ ! -s /tmp/count-stmt.sql ] || grep -q '^NULL$' /tmp/count-stmt.sql; then
  echo "生成失败或无文本列，退出。"; exit 1
fi
echo "语句长度：$(wc -c < /tmp/count-stmt.sql) 字节"
echo

# ── 2. 执行统计 ─────────────────────────────────────────
echo "=== 扫描中 ==="
{ cat /tmp/count-stmt.sql; echo ";"; } | q > /tmp/scan-raw.txt

# 有 ERROR 就停，绝不静默继续
if grep -qi '^ERROR' /tmp/scan-raw.txt; then
  echo "❌ 扫描 SQL 报错："; grep -i '^ERROR' /tmp/scan-raw.txt | head -5; exit 1
fi

awk -F'\t' '$2 > 0 { print }' /tmp/scan-raw.txt > /tmp/broken.tsv

if [ ! -s /tmp/broken.tsv ]; then
  echo "✅ 未发现乱码数据。"; exit 0
fi

echo "发现乱码列："
awk -F'\t' '{ printf "  ❌ %-45s %6s 行\n", $1, $2 }' /tmp/broken.tsv
TOTAL=$(awk -F'\t' '{s+=$2} END {print s+0}' /tmp/broken.tsv)
COLS=$(wc -l < /tmp/broken.tsv)
echo
echo "=== 汇总：$COLS 个列 / $TOTAL 行 ==="
echo

# 取某列的 collation
coll_of() {
  echo "SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='$1' AND COLUMN_NAME='$2';" | q | head -1
}

echo "=== 样例（修复前 → 修复后）==="
head -6 /tmp/broken.tsv | while IFS=$'\t' read -r ref n; do
  T="${ref%%.*}"; C="${ref#*.}"
  CO="$(coll_of "$T" "$C")"
  echo "--- $ref ---"
  cat <<EOSQL | q
SELECT LEFT(\`$C\`,42) AS bad,
       LEFT(CONVERT(BINARY(CONVERT(\`$C\` USING latin1)) USING utf8mb4) COLLATE $CO,42) AS fixed
FROM \`$T\`
WHERE \`$C\` IS NOT NULL AND \`$C\` <> ''
  AND CONVERT(BINARY(CONVERT(\`$C\` USING latin1)) USING utf8mb4) COLLATE $CO IS NOT NULL
  AND CONVERT(BINARY(CONVERT(\`$C\` USING latin1)) USING utf8mb4) COLLATE $CO <> \`$C\`
LIMIT 2;
EOSQL
done
echo

if [ "$MODE" != "apply" ]; then
  echo "[scan] 未改动数据。执行修复：$0 apply"
  exit 0
fi

# ── 3. 修复前强制备份 ───────────────────────────────────
BK="/tmp/rms-mojibake-backup-$(date +%Y%m%d-%H%M%S).sql"
echo "=== 备份 → $BK ==="
sudo docker exec -e MYSQL_PWD="$DBPASS" "$CONTAINER" \
  mysqldump -u"$DBUSER" --single-transaction --default-character-set=utf8mb4 "$DB" \
  2>/dev/null > "$BK"
ls -lh "$BK"
[ -s "$BK" ] || { echo "❌ 备份为空，中止修复。"; exit 1; }
echo

# ── 4. 执行修复 ─────────────────────────────────────────
echo "=== 执行修复 ==="
while IFS=$'\t' read -r ref n; do
  T="${ref%%.*}"; C="${ref#*.}"
  CO="$(coll_of "$T" "$C")"
  OUT=$(cat <<EOSQL | q
UPDATE \`$T\`
SET \`$C\` = CONVERT(BINARY(CONVERT(\`$C\` USING latin1)) USING utf8mb4) COLLATE $CO
WHERE \`$C\` IS NOT NULL AND \`$C\` <> ''
  AND CONVERT(BINARY(CONVERT(\`$C\` USING latin1)) USING utf8mb4) COLLATE $CO IS NOT NULL
  AND CONVERT(BINARY(CONVERT(\`$C\` USING latin1)) USING utf8mb4) COLLATE $CO <> \`$C\`;
EOSQL
)
  if echo "$OUT" | grep -qi '^ERROR'; then
    echo "  ❌ $ref : $(echo "$OUT" | head -1)"
  else
    echo "  ✅ $ref（$n 行）"
  fi
done < /tmp/broken.tsv

# ── 5. 复查 ─────────────────────────────────────────────
echo
echo "=== 复查 ==="
{ cat /tmp/count-stmt.sql; echo ";"; } | q > /tmp/scan-after.txt
awk -F'\t' '$2 > 0 { print }' /tmp/scan-after.txt > /tmp/broken-after.tsv

if [ ! -s /tmp/broken-after.tsv ]; then
  echo "✅ 全部乱码已清除（原 $TOTAL 行）"
  echo "备份保留：$BK"
else
  echo "⚠️ 仍有残留："
  awk -F'\t' '{ printf "  %-45s %s 行\n", $1, $2 }' /tmp/broken-after.tsv
  echo "备份在 $BK，可回滚。"
  exit 1
fi
