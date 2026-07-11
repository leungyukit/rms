#!/bin/bash
# init-mysql.sh - Initialize MySQL database for RMS
# Runs before rms-init.sql
set -e

echo "[init-mysql] Waiting for MySQL socket..."
for i in $(seq 1 30); do
    if mysqladmin ping --silent 2>/dev/null; then
        break
    fi
    sleep 1
done

echo "[init-mysql] Creating RMS database and user..."
mysql -u root <<'EOSQL'
CREATE DATABASE IF NOT EXISTS rms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'rms'@'%' IDENTIFIED BY 'rms123456';
CREATE USER IF NOT EXISTS 'rms'@'localhost' IDENTIFIED BY 'rms123456';
GRANT ALL PRIVILEGES ON rms.* TO 'rms'@'%';
GRANT ALL PRIVILEGES ON rms.* TO 'rms'@'localhost';
FLUSH PRIVILEGES;
EOSQL

echo "[init-mysql] MySQL user and database ready."
