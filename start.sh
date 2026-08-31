#!/bin/bash
cd /home/itd3/www/rms/.next/standalone/www/rms

# 2026-08-31：原先这里用 rsync 单向同步 static/uploads，且「只在启动时跑一次」。
# 后果：build 完不重启 = 静态资源永久错位 —— 8/28 那次全站样式崩了 3 天就是这么来的。
# 现改为 scripts/postbuild.sh 建软链（挂在 npm postbuild，每次 build 自动重建），
# 让运行期状态只有一份权威副本，从物理上消灭双份不一致。
# 这里只做兜底：软链缺失说明有人绕过了 postbuild，补跑一次。
if [ ! -e ".next/static" ] || [ ! -e "data" ] || [ ! -e "public/uploads" ] || [ ! -d "node_modules/bcryptjs" ]; then
  echo "[start] standalone 软链/依赖缺失，补跑 postbuild..."
  bash /home/itd3/www/rms/scripts/postbuild.sh || echo "[start] ⚠️ postbuild 失败，静态资源可能不可用" >&2
fi

# MySQL configuration
export DB_TYPE=mysql
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_DATABASE=rms
export MYSQL_USER=rms
export MYSQL_PASSWORD=***

# JWT 签名密钥（2026-08-03 新增）
# 应用层已强校验：生产模式下 JWT_SECRET 未设或 <32 位 → 直接拒绝启动。
# 密钥不写在本文件（本文件在 git 里），而是放 600 权限的外部文件。
# 首次部署：openssl rand -hex 32 > /home/itd3/www/rms/.jwt_secret && chmod 600 同文件
JWT_SECRET_FILE="${JWT_SECRET_FILE:-/home/itd3/www/rms/.jwt_secret}"
if [ -z "$JWT_SECRET" ] && [ -f "$JWT_SECRET_FILE" ]; then
  JWT_SECRET="$(cat "$JWT_SECRET_FILE")"
fi
if [ -z "$JWT_SECRET" ]; then
  echo "[FATAL] JWT_SECRET 未配置。执行：" >&2
  echo "  openssl rand -hex 32 > $JWT_SECRET_FILE && chmod 600 $JWT_SECRET_FILE" >&2
  exit 1
fi
if [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "[FATAL] JWT_SECRET 长度不足 32 位，拒绝启动。" >&2
  exit 1
fi
export JWT_SECRET

export PORT=3800
export HOSTNAME=0.0.0.0
export NODE_ENV=production

# Cookie Secure（2026-08-03）
# 本机是内网 HTTP 部署（http://10.128.16.58:3800）—— 若开着 secure，
# 浏览器会直接丢弃 rms_token cookie，表现为“登录无反应”（接口实际返回 200）。
# 以后上 HTTPS 时把这行改回 true 或删掉。
export COOKIE_SECURE=false
exec node server.js
