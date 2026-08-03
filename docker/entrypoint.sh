#!/bin/bash
# entrypoint.sh - All-in-one container startup script
# Starts: MySQL → Memcached → RMS → OpenClaw Gateway
set -e

# ---------------------------------------------------------------------------
# Configuration (with sensible defaults, override via env vars)
# ---------------------------------------------------------------------------
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-}"
MYSQL_USER="${MYSQL_USER:-rms}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-rms123456}"
MYSQL_DATABASE="${MYSQL_DATABASE:-rms}"

RMS_PORT="${RMS_PORT:-3800}"
OPENCLAW_PORT="${OPENCLAW_PORT:-18789}"
MEMCACHE_PORT="${MEMCACHE_PORT:-11211}"

OPENCLAW_ENABLED="${OPENCLAW_ENABLED:-true}"
FEISHU_APP_ID="${FEISHU_APP_ID:-}"
FEISHU_APP_SECRET="${FEISHU_APP_SECRET:-}"

# JWT 签名密钥（2026-08-03 新增）
# 应用层已加强校验：NODE_ENV=production 且 JWT_SECRET 未设/<32 位 → 拒绝启动。
# 这里不给弱默认值，只在缺失时按容器持久卷生成一次并落盘复用，
# 避免重启后所有登录态失效（之前根本没设过 → 等于用公开的硬编码默认密钥签 token）。
JWT_SECRET_FILE="/var/lib/mysql/.rms_jwt_secret"
if [ -z "${JWT_SECRET}" ]; then
  if [ -f "$JWT_SECRET_FILE" ]; then
    JWT_SECRET="$(cat "$JWT_SECRET_FILE")"
    echo "[init] JWT_SECRET loaded from persistent volume"
  else
    JWT_SECRET="$(openssl rand -hex 32)"
    ( umask 077; printf '%s' "$JWT_SECRET" > "$JWT_SECRET_FILE" )
    echo "[init] JWT_SECRET generated and persisted to $JWT_SECRET_FILE"
    echo "[init] 生产环境建议改为通过 env / k8s secret 显式注入"
  fi
fi
export JWT_SECRET
if [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "[FATAL] JWT_SECRET 长度不足 32 位，RMS 将拒绝启动。请重新注入强随机密钥：openssl rand -hex 32" >&2
  exit 1
fi

# Flag file to track first-run
FIRST_RUN_FLAG="/var/lib/mysql/.initialized"

# ---------------------------------------------------------------------------
# 1. Initialize & Start MySQL
# ---------------------------------------------------------------------------
echo "=== [1/4] Starting MySQL ==="

# Find the MariaDB/MySQL server binary
MARIADBD_BIN=$(command -v mariadbd 2>/dev/null || command -v mysqld 2>/dev/null)
echo "[MySQL] Using binary: ${MARIADBD_BIN}"

# Initialize data directory if empty
if [ ! -d "/var/lib/mysql/mysql" ]; then
    echo "[MySQL] Initializing data directory..."
    # Use MariaDB's init tool
    if command -v mariadb-install-db >/dev/null 2>&1; then
        mariadb-install-db --user=mysql --datadir=/var/lib/mysql
    else
        ${MARIADBD_BIN} --initialize-insecure --user=mysql --datadir=/var/lib/mysql
    fi
fi

# Ensure permissions
chown -R mysql:mysql /var/lib/mysql /var/run/mysqld

# Start MySQL in background
${MARIADBD_BIN} --user=mysql --datadir=/var/lib/mysql --socket=/var/run/mysqld/mysqld.sock &
MYSQL_PID=$!

MYSQLADMIN_BIN=$(command -v mysqladmin 2>/dev/null || command -v mariadb-admin 2>/dev/null)

MYSQL_CLIENT=$(command -v mysql 2>/dev/null || command -v mariadb 2>/dev/null)

# Wait for MySQL to be ready
echo "[MySQL] Waiting for MySQL to accept connections..."
for i in $(seq 1 90); do
    if ${MYSQLADMIN_BIN} ping --socket=/var/run/mysqld/mysqld.sock --silent 2>/dev/null; then
        echo "[MySQL] Ready!"
        break
    fi
    # Show progress every 10 seconds
    if [ $((i % 10)) -eq 0 ]; then
        echo "[MySQL] Still waiting... (${i}s)"
        # Check if process is still alive
        if ! kill -0 ${MYSQL_PID} 2>/dev/null; then
            echo "[MySQL] Process died! Checking logs..."
            cat /var/log/mysql/error.log 2>/dev/null | tail -20
            exit 1
        fi
    fi
    if [ $i -eq 90 ]; then
        echo "[MySQL] Failed to start after 90s!"
        cat /var/log/mysql/error.log 2>/dev/null | tail -30
        # Don't exit, continue with other services
        break
    fi
    sleep 1
done

# First-run: create database, user, and load schema
if [ ! -f "$FIRST_RUN_FLAG" ]; then
    echo "[MySQL] First run - initializing database..."
    
    # Set root password (empty by default in initialize-insecure mode)
    ${MYSQL_CLIENT} -u root --socket=/var/run/mysqld/mysqld.sock <<EOSQL
CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}';
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'%';
GRANT ALL PRIVILEGES ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'localhost';
ALTER USER 'root'@'localhost' IDENTIFIED BY '';
FLUSH PRIVILEGES;
EOSQL

    # Load schema + data
    if [ -f "/docker-entrypoint-initdb.d/01-rms.sql" ]; then
        echo "[MySQL] Loading RMS schema and data..."
        ${MYSQL_CLIENT} -u root --socket=/var/run/mysqld/mysqld.sock "${MYSQL_DATABASE}" < /docker-entrypoint-initdb.d/01-rms.sql
    fi

    touch "$FIRST_RUN_FLAG"
    echo "[MySQL] Database initialized successfully!"
else
    echo "[MySQL] Data directory already initialized, skipping schema load."
fi

# ---------------------------------------------------------------------------
# 2. Start Memcached
# ---------------------------------------------------------------------------
echo "=== [2/4] Starting Memcached ==="
memcached -u memcache -p ${MEMCACHE_PORT} -l 0.0.0.0 -m 64 &
MEMCACHED_PID=$!
sleep 1
echo "[Memcached] Ready on port ${MEMCACHE_PORT}!"

# ---------------------------------------------------------------------------
# 3. Start RMS (Next.js)
# ---------------------------------------------------------------------------
echo "=== [3/4] Starting RMS ==="
cd /app/rms

# Update .env.local with runtime config
cat > .env.local <<EOF
DB_TYPE=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=${MYSQL_DATABASE}
MYSQL_USER=${MYSQL_USER}
MYSQL_PASSWORD=${MYSQL_PASSWORD}
JWT_SECRET=${JWT_SECRET}
EOF
chmod 600 .env.local

# Start RMS with pm2
pm2 start "npm run start" --name rms --cwd /app/rms || pm2 restart rms
sleep 2
echo "[RMS] Starting on port ${RMS_PORT}..."

# Wait for RMS to be ready
for i in $(seq 1 30); do
    if curl -sf http://localhost:${RMS_PORT}/login >/dev/null 2>&1; then
        echo "[RMS] Ready on port ${RMS_PORT}!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "[RMS] Warning: RMS not responding yet, continuing anyway..."
    fi
    sleep 1
done

# ---------------------------------------------------------------------------
# 4. Start OpenClaw Gateway (if enabled)
# ---------------------------------------------------------------------------
if [ "${OPENCLAW_ENABLED}" = "true" ]; then
    echo "=== [4/4] Starting OpenClaw Gateway ==="
    
    OPENCLAW_HOME="/app/openclaw"
    export OPENCLAW_HOME
    
    # Generate openclaw.json if not exists
    if [ ! -f "${OPENCLAW_HOME}/openclaw.json" ]; then
        echo "[OpenClaw] Generating default config..."
        mkdir -p "${OPENCLAW_HOME}/agents/main/workspace"
        cat > "${OPENCLAW_HOME}/openclaw.json" <<'OCEOF'
{
  "agents": {
    "defaults": {
      "workspace": "/app/openclaw/workspace",
      "model": {
        "primary": "tencentmaas/glm-5.2"
      }
    },
    "list": [
      { "id": "main" }
    ]
  },
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token",
      "token": "CHANGE_ME_PLEASE"
    },
    "port": 18789,
    "bind": "0.0.0.0",
    "controlUi": {
      "allowInsecureAuth": true
    }
  },
  "channels": {
    "feishu": {
      "enabled": false,
      "appId": "",
      "appSecret": "",
      "connectionMode": "websocket",
      "domain": "feishu",
      "dmPolicy": "open",
      "groupPolicy": "open",
      "requireMention": true
    }
  },
  "session": {
    "dmScope": "per-channel-peer"
  },
  "tools": {
    "profile": "coding"
  },
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "boot-md": { "enabled": true },
        "session-memory": { "enabled": true }
      }
    }
  },
  "bindings": []
}
OCEOF
    fi

    # Start OpenClaw gateway
    openclaw gateway start --port ${OPENCLAW_PORT} --bind 0.0.0.0 &
    OPENCLAW_PID=$!
    sleep 2
    echo "[OpenClaw] Gateway starting on port ${OPENCLAW_PORT}!"
else
    echo "=== [4/4] OpenClaw disabled, skipping ==="
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🍎 RMS + OpenClaw + Memcached All-in-One Container      ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  RMS Web:          http://localhost:${RMS_PORT}              ║"
echo "║  RMS Login:        admin / admin                          ║"
echo "║  OpenClaw Gateway: http://localhost:${OPENCLAW_PORT}           ║"
echo "║  MySQL:           localhost:3306 (user: ${MYSQL_USER})        ║"
echo "║  Memcached:       localhost:${MEMCACHE_PORT}                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------
shutdown() {
    echo "[Shutdown] Stopping services..."
    if [ -n "${OPENCLAW_PID:-}" ]; then kill ${OPENCLAW_PID} 2>/dev/null; fi
    pm2 kill 2>/dev/null
    kill ${MEMCACHED_PID} 2>/dev/null
    ${MYSQLADMIN_BIN} --socket=/var/run/mysqld/mysqld.sock shutdown 2>/dev/null
    wait ${MYSQL_PID} 2>/dev/null
    echo "[Shutdown] All services stopped."
    exit 0
}

trap shutdown SIGTERM SIGINT

# Keep running
echo "Container is running. Press Ctrl+C to stop."
wait
