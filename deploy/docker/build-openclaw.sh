#!/usr/bin/env bash
# 构建 rms-openclaw 镜像
#
# 为什么要暂存目录，不能直接 `docker build -f deploy/docker/Dockerfile.openclaw .`：
#   仓库根 .dockerignore 里有 `*.md` + `!workspace/*.md`。Docker 的忽略规则按
#   「相对上下文的完整路径」匹配，`docker/openclaw-home/workspace/SKILL.md`
#   匹配不上那条 `!workspace/*.md` 反选 —— 于是 SKILL.md / AGENTS.md 全被排除，
#   rms skill 静默残废。所以上下文必须留在 deploy/docker/（它有自己的 .dockerignore）。
#
# 而镜像又需要两个上下文外的东西：
#   - 仓库根 rms-mcp-server.js   （MCP 服务器本体）
#   - deploy/openclaw/workspace-rms/（rms agent 的 workspace 种子）
# 复制进仓库会产生第二份副本 → 将来改一处漏一处（参见 8-25 的 RCE 漏修教训）。
# 所以这里用临时暂存目录，构建完即删。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TAG="${1:-rms-openclaw:$(date +%Y%m%d-%H%M)}"
STAGE="$(mktemp -d /tmp/oc-build.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

echo "[build] repo   = $REPO_ROOT"
echo "[build] tag    = $TAG"
echo "[build] stage  = $STAGE"

# 1. deploy/docker 全量（含 .dockerignore、openclaw-home、entrypoint）
cp -a "$REPO_ROOT/deploy/docker/." "$STAGE/"

# 2. 上下文外的依赖
cp -a "$REPO_ROOT/rms-mcp-server.js" "$STAGE/rms-mcp-server.js"
cp -a "$REPO_ROOT/deploy/openclaw/workspace-rms" "$STAGE/workspace-rms"

# 3. 不需要的大文件别进上下文（rms-data.sql 450K，只有 mysql 服务用）
rm -f "$STAGE/rms-data.sql"

# 4. 前置校验：缺文件就早失败，别等 docker 报模糊错误
for f in Dockerfile.openclaw openclaw-entrypoint.sh rms-mcp-server.js \
         openclaw-home/openclaw.json \
         openclaw-home/plugin-skills/rms/SKILL.md \
         openclaw-home/plugin-skills/rms/scripts/rms-api.js \
         workspace-rms/AGENTS.md; do
  [ -e "$STAGE/$f" ] || { echo "[FATAL] 暂存目录缺 $f" >&2; exit 1; }
done
echo "[build] 上下文校验通过"

docker build -f "$STAGE/Dockerfile.openclaw" -t "$TAG" "$STAGE"

echo
echo "[build] 完成: $TAG"
docker images "${TAG%%:*}" | head -5
