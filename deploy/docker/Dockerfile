# RMS 生产镜像（精简版）
# 只含 RMS 本身；MySQL / memcached 走独立容器（见 docker-compose.yml）
# 相比仓库根目录那份 all-in-one：不塞 MariaDB、不塞 OpenClaw、不用 supervisor
#
# 两个踩过的坑：
#  1. next standalone 的嵌套层级跟着"源码绝对路径"变：
#     本地在 /home/itd3/www/rms → 产物落 .next/standalone/www/rms/
#     容器里 WORKDIR=/app     → 产物平铺在 .next/standalone/（server.js 在顶层）
#     所以容器里绝不能照抄本地的 www/rms 路径。
#  2. standalone 依赖追踪会漏掉 bcryptjs / deasync / memcache，必须手工补，
#     否则运行时才炸（bcryptjs 缺了直接登录不了）。

# ---------- Stage 1: 依赖 ----------
FROM docker.1ms.run/node:24-slim AS deps
WORKDIR /app

# better-sqlite3 / deasync 是 native 模块，需要编译工具链
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 build-essential pkg-config ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---------- Stage 2: 构建 ----------
FROM deps AS builder
WORKDIR /app
COPY . .
RUN mkdir -p data public/uploads logs
RUN npm run build

# ---------- Stage 3: 运行时 ----------
FROM docker.1ms.run/node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3800 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

# 运行时依赖：
#  - curl：healthcheck
#  - tini：信号转发，保证 SIGTERM 能干净停容器
#  - default-mysql-client：src/lib/db.ts 的 mysqlExec() 用 execFileSync 直接 shell 调
#    `mysql` 命令行客户端。不装的话运行时刷 spawnSync mysql ENOENT，DB 全查不出来。
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates tini default-mysql-client \
    && rm -rf /var/lib/apt/lists/*

# 字符集兜底（2026-08-12 乱码事故）：
# mysql CLI 默认走 latin1，中文经 latin1 通道写 utf8mb4 列会双重编码。
# 代码里已显式传 --default-character-set=utf8mb4，这里再加一道配置层防线，
# 以防将来新增的 CLI 调用点忘了带参数。
RUN printf '[client]\ndefault-character-set=utf8mb4\n\n[mysql]\ndefault-character-set=utf8mb4\n' \
      > /etc/mysql/conf.d/zz-utf8mb4.cnf 2>/dev/null \
    || { mkdir -p /etc/mysql/conf.d && printf '[client]\ndefault-character-set=utf8mb4\n\n[mysql]\ndefault-character-set=utf8mb4\n' > /etc/mysql/conf.d/zz-utf8mb4.cnf; }

# standalone 主体（平铺，server.js 在顶层；已含大部分 node_modules）
COPY --from=builder /app/.next/standalone/ ./
# 静态资源与 public（standalone 不含这两块）
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# standalone 漏掉的依赖，逐个补齐
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY --from=builder /app/node_modules/deasync ./node_modules/deasync
COPY --from=builder /app/node_modules/memcache ./node_modules/memcache

RUN mkdir -p /app/data /app/public/uploads /app/logs \
    && chown -R node:node /app/data /app/public/uploads /app/logs

USER node
EXPOSE 3800

HEALTHCHECK --interval=30s --timeout=8s --retries=4 --start-period=45s \
    CMD curl -fsS http://127.0.0.1:3800/login >/dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
