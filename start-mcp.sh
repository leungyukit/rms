#!/bin/bash
# RMS MCP Server 启动脚本
# 使用方式：./start-mcp.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="/tmp/rms-mcp.pid"
LOG_FILE="/tmp/rms-mcp.log"

# 检查是否已运行
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "RMS MCP Server 已在运行 (PID: $PID)"
    exit 0
  fi
fi

# 启动服务器
echo "启动 RMS MCP Server..."
cd "$SCRIPT_DIR"
nohup node rms-mcp-server.js > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "RMS MCP Server 已启动 (PID: $!)"
echo "日志文件：$LOG_FILE"
