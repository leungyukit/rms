# =============================================================================
# RMS + OpenClaw + Memcached All-in-One Docker Image
# 单容器包含：MariaDB 11 (MySQL兼容) + Memcached + RMS (Next.js) + OpenClaw
# =============================================================================
# FROM docker.1ms.run/node:24-slim AS base

FROM docker.1ms.run/node:latest AS base

ENV DEBIAN_FRONTEND=noninteractive

# -----------------------------------------------------------------------------
# Stage 1: System dependencies (MariaDB, Memcached, build tools)
# -----------------------------------------------------------------------------
FROM base AS system-deps

# Install MariaDB (MySQL-compatible, available in Debian repos)
# Also add MariaDB official repo for newer version
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    apt-transport-https \
    && curl -fsSL https://mariadb.org/mariadb_release_signing_key.asc \
       | gpg --dearmor -o /usr/share/keyrings/mariadb-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/mariadb-keyring.gpg] https://mirror.mariadb.org/repo/11.4/debian bookworm main" \
       > /etc/apt/sources.list.d/mariadb.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
       mariadb-server \
       mariadb-client \
       memcached \
       python3 \
       build-essential \
       pkg-config \
       curl \
       git \
       supervisor \
    && rm -rf /var/lib/apt/lists/*

# Fix MariaDB directory permissions
RUN mkdir -p /var/run/mysqld && chown mysql:mysql /var/run/mysqld && \
    mkdir -p /var/lib/mysql && chown mysql:mysql /var/lib/mysql

# -----------------------------------------------------------------------------
# Stage 2: Build RMS
# -----------------------------------------------------------------------------
FROM system-deps AS rms-builder

WORKDIR /app/rms

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY . .
RUN mkdir -p data public/uploads
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 3: Final runtime image
# -----------------------------------------------------------------------------
FROM system-deps AS runtime

# Install OpenClaw + pm2 globally
RUN npm install -g openclaw@2026.6.1 pm2@7.0.1

# Copy RMS built application
WORKDIR /app/rms
COPY --from=rms-builder /app/rms ./

# Copy OpenClaw workspace and config
WORKDIR /app/openclaw
COPY docker/openclaw-home/ ./

# Copy database dump and init scripts
COPY docker/rms-init.sql /docker-entrypoint-initdb.d/01-rms.sql
COPY docker/init-mysql.sh /docker-entrypoint-initdb.d/00-init.sh

# Copy supervisor config and entrypoint
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy MariaDB/MySQL config
COPY docker/mysql.cnf /etc/mysql/mariadb.conf.d/rms.cnf

# Create necessary directories
RUN mkdir -p /var/lib/mysql /var/run/mysqld /var/log/supervisor \
    /app/rms/data /app/rms/public/uploads \
    /app/openclaw/workspace /app/openclaw/agents /app/openclaw/plugin-skills \
    && chown mysql:mysql /var/lib/mysql /var/run/mysqld

# Expose ports
EXPOSE 3800 18789 3306 11211

# Persistent volumes
VOLUME ["/var/lib/mysql", "/app/rms/public/uploads", "/app/openclaw"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=90s \
    CMD curl -f http://localhost:3800/login || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
