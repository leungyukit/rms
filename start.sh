#!/bin/bash
cd /home/itd3/www/rms/.next/standalone/www/rms

# Ensure public directory exists and is linked
if [ ! -d "public" ]; then
  mkdir -p public
fi

# Sync static files from build
rsync -au --delete /home/itd3/www/rms/.next/static/ .next/static/ 2>/dev/null || true

# Sync uploads from main project (one-way, only newer files)
rsync -au /home/itd3/www/rms/public/uploads/ public/uploads/ 2>/dev/null || true

# Ensure bcryptjs is installed (Next.js standalone build may strip it)
if [ ! -d "node_modules/bcryptjs" ]; then
  echo "Installing bcryptjs..."
  npm install bcryptjs@3.0.3 --omit=dev --no-save 2>/dev/null || true
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
exec node server.js
