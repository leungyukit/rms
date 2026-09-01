#!/bin/bash
# postbuild.sh —— next build 之后必须执行的收尾（2026-08-31 新增）
#
# 背景：2026-08-31 排查出一起潜伏 3 天的事故 —— 8/28 rebuild 之后全站 CSS/JS
# 返回 400、样式全崩，直到 8/31 才被发现。
#
# 根因：next build 会重建 .next/standalone/，而 standalone 需要的
# .next/static 不在构建产物里，得手动同步。原先这个 rsync 只写在 start.sh，
# 也就是「只在服务启动时才跑」。于是 build 完不重启 = 静态资源永久错位。
#
# 同类隐患还有两处（本次一并根治）：
#   - public/uploads：用户上传的附件，build 会把 standalone 侧重置
#   - data/：聊天记录、周报 JSON、SQLite 库，build 会用主目录旧版本覆盖
#     （运行期代码用 process.cwd() 写入，cwd 就是 standalone 目录）
#
# 解法：不再用「启动时单向 rsync」这种脆弱做法，改成软链 —— 让运行期状态
# 只有一份权威副本，从物理上消灭双份不一致。
# 软链会被 next build 清掉，所以本脚本挂在 npm postbuild 上，每次 build 自动重建。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Docker 镜像构建时跳过软链（2026-09-01 新增）
# 容器里 data/ 与 public/uploads 是挂载卷，.next/static 由 Dockerfile 显式 COPY，
# 再建软链只会制造冲突。
if [ "${RMS_SKIP_POSTBUILD_LINKS:-0}" = "1" ]; then
  echo "[postbuild] RMS_SKIP_POSTBUILD_LINKS=1 —— 容器构建场景，跳过软链"
  exit 0
fi

# standalone 产物路径不是固定的（2026-09-01 踩坑）：
#   · 本机 58：.next/standalone/www/rms/   ← 仓库外层有多个 lockfile，
#     Next.js 把 outputFileTracingRoot 推到了 /，产物带上完整路径前缀
#   · Docker：.next/standalone/            ← WORKDIR=/app 单一 lockfile，无前缀
# 原先写死前者，导致容器内 npm run build 在 postbuild 阶段 exit 1。改成动态定位。
SA=""
for cand in "$ROOT/.next/standalone/www/rms" "$ROOT/.next/standalone"; do
  if [ -f "$cand/server.js" ]; then SA="$cand"; break; fi
done
if [ -z "$SA" ]; then
  # 兜底：树里找第一个 server.js
  found="$(find "$ROOT/.next/standalone" -maxdepth 4 -name server.js -print -quit 2>/dev/null || true)"
  [ -n "$found" ] && SA="$(dirname "$found")"
fi

if [ -z "$SA" ] || [ ! -f "$SA/server.js" ]; then
  echo "[postbuild] 在 $ROOT/.next/standalone 下找不到 server.js —— standalone 构建产物缺失，中止" >&2
  exit 1
fi
echo "[postbuild] standalone 目录：$SA"

# link_dir <标准位置(主目录)> <standalone 侧路径>
# 若 standalone 侧已是真目录，先把里面「更新的」文件回捞进主目录再替换成软链，
# 避免丢掉上一轮运行期写入的数据。
link_dir() {
  local target="$1" link="$2"
  mkdir -p "$target"

  if [ -L "$link" ]; then
    # 已是软链：确认指向正确，指错了就重建
    if [ "$(readlink -f "$link")" = "$(readlink -f "$target")" ]; then
      echo "[postbuild] ok(已软链)  $link"
      return
    fi
    rm -f "$link"
  elif [ -d "$link" ]; then
    # 真目录：把 standalone 侧较新的内容合并回主目录，别丢数据
    rsync -au "$link/" "$target/" 2>/dev/null || true
    rm -rf "$link"
  fi

  mkdir -p "$(dirname "$link")"
  ln -s "$target" "$link"
  echo "[postbuild] 已软链      $link -> $target"
}

# 1) 静态资源 —— 今早事故的直接原因
link_dir "$ROOT/.next/static" "$SA/.next/static"

# 2) 用户上传附件
link_dir "$ROOT/public/uploads" "$SA/public/uploads"

# 3) 运行期数据（聊天记录 / 周报 / imports / SQLite）
link_dir "$ROOT/data" "$SA/data"

# 4) standalone 构建会漏掉 bcryptjs
if [ ! -d "$SA/node_modules/bcryptjs" ]; then
  echo "[postbuild] 补装 bcryptjs..."
  (cd "$SA" && npm install bcryptjs@3.0.3 --omit=dev --no-save >/dev/null 2>&1) || \
    echo "[postbuild] ⚠️ bcryptjs 安装失败，登录可能不可用" >&2
fi

echo "[postbuild] 完成"
