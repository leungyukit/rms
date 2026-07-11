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

export PORT=3800
export HOSTNAME=0.0.0.0
export NODE_ENV=production
exec node server.js
