#!/bin/bash
# healthcheck.sh —— 部署后自检（2026-08-31 新增）
#
# 存在理由：8/28 那次 rebuild 之后全站样式崩了 3 天没人发现，因为「首页返回 200」
# 看起来一切正常 —— 崩的是 CSS/JS 子资源。光测首页状态码是不够的。
#
# 本脚本从 HTML 里把真实引用的 CSS/JS 抓出来逐个回验，能抓住同类静默故障。
#
# 用法：bash scripts/healthcheck.sh [base-url]
set -uo pipefail

BASE="${1:-http://localhost:3800}"
FAIL=0

say()  { printf '%s\n' "$*"; }
ok()   { printf '  ✅ %s\n' "$*"; }
bad()  { printf '  ❌ %s\n' "$*"; FAIL=$((FAIL+1)); }

say "== RMS 健康检查 @ $BASE =="

# 1) 服务是否活着
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/login" 2>/dev/null || echo 000)
if [ "$code" = "200" ]; then ok "/login 200"; else bad "/login 返回 $code（期望 200）"; fi

# 2) 关键：把 HTML 里引用的静态资源抓出来逐个验证
#    这是 8/28 事故唯一能被自动发现的检查点
html=$(curl -sS --max-time 10 "$BASE/login" 2>/dev/null || true)
assets=$(printf '%s' "$html" | grep -oE '/_next/static/[^"]+\.(css|js)' | sort -u)

if [ -z "$assets" ]; then
  bad "HTML 里抓不到任何 /_next/static 资源引用（页面可能没正常渲染）"
else
  n=0; nbad=0
  while IFS= read -r a; do
    [ -z "$a" ] && continue
    n=$((n+1))
    c=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$a" 2>/dev/null || echo 000)
    if [ "$c" != "200" ]; then nbad=$((nbad+1)); bad "静态资源 $c: $a"; fi
  done <<< "$assets"
  if [ "$nbad" = "0" ]; then ok "静态资源全部 200（共 $n 个）"; fi
fi

# 3) 健康端点
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/api/health" 2>/dev/null || echo 000)
if [ "$code" = "200" ]; then ok "/api/health 200"; else bad "/api/health 返回 $code"; fi

# 4) 未鉴权访问必须被拦（防止哪天守卫被改坏而没人知道）
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/api/users" 2>/dev/null || echo 000)
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  ok "/api/users 未登录被拦（$code）"
else
  bad "/api/users 未登录返回 $code —— 鉴权可能失效！"
fi

say ""
if [ "$FAIL" = "0" ]; then
  say "== 全部通过 =="
  exit 0
else
  say "== 有 $FAIL 项失败 =="
  exit 1
fi
