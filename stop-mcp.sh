#!/bin/bash
# 停止 RMS MCP Server
PID_FILE="/tmp/rms-mcp.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    rm -f "$PID_FILE"
    echo "RMS MCP Server 已停止"
  else
    rm -f "$PID_FILE"
    echo "RMS MCP Server 未在运行"
  fi
else
  echo "未找到 PID 文件"
fi
