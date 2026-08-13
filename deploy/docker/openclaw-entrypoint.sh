#!/usr/bin/env bash
# OpenClaw Gateway 容器启动脚本
#
# 职责：
#  1. 强校验 gateway token —— 仓库那份 openclaw.json 里是 CHANGE_ME 占位符，
#     等于裸奔。这里未注入或仍是占位符就直接拒绝启动。
#  2. 把 GATEWAY_TOKEN 环境变量写进 openclaw.json（配置文件不含明文密钥）
#  3. 可选注入飞书凭据（默认关闭）
#
# 注意：改 JSON 用 node，不用 python3 —— node:24-slim 基础镜像里没有 python3，
#       之前用 python3 导致容器起不来（exit 127 反复重启）。node 是必然存在的。
set -euo pipefail

CONF="${OPENCLAW_HOME:-/root/.openclaw}/openclaw.json"

log() { echo "[openclaw-entrypoint] $*"; }

# ── 1. token 强校验 ──────────────────────────────
if [ -z "${GATEWAY_TOKEN:-}" ]; then
  echo "[FATAL] GATEWAY_TOKEN 未注入。生成方式：openssl rand -hex 32" >&2
  exit 1
fi
if [ "${#GATEWAY_TOKEN}" -lt 24 ]; then
  echo "[FATAL] GATEWAY_TOKEN 长度不足 24 位，拒绝启动。" >&2
  exit 1
fi
case "$GATEWAY_TOKEN" in
  CHANGE*|change*|test*|123*)
    echo "[FATAL] GATEWAY_TOKEN 是占位符/弱值，拒绝启动。" >&2
    exit 1 ;;
esac

# ── 2. 写入配置 ──────────────────────────────────
log "注入 gateway token 与运行参数到 $CONF"
CONF="$CONF" node <<'JS'
const fs = require('fs');
const path = process.env.CONF;
const conf = JSON.parse(fs.readFileSync(path, 'utf8'));

conf.gateway = conf.gateway || {};
// mode=local 必须显式保留：缺了会报
//   "Missing config. Run `openclaw setup` or set gateway.mode=local"
conf.gateway.mode = conf.gateway.mode || 'local';
conf.gateway.auth = conf.gateway.auth || {};
conf.gateway.auth.mode = 'token';
conf.gateway.auth.token = process.env.GATEWAY_TOKEN;
conf.gateway.port = parseInt(process.env.OPENCLAW_PORT || '18789', 10);
// 容器内必须监听所有网卡，否则 docker bridge 的 -p 转发打不进来。
// 注意：bind 只认模式名（auto/loopback/lan/tailnet/custom），不认 0.0.0.0 这种 host 别名，
// 写 0.0.0.0 会被拒：Invalid --bind。lan 等价于 0.0.0.0。
// 对外暴露范围由 compose 的 ports 绑定 127.0.0.1 控制。
conf.gateway.bind = 'lan';

// OpenAI 兼容端点默认关闭（返回 404），RMS 走 /v1/chat/completions 调用，必须显式开启。
// 2026-08-13：生产实测未开时 POST /v1/chat/completions → 404，而 GET /v1/models 被
// Control UI 的 catch-all 接走返回 200 text/html，导致 RMS 健康检查假绿灯。
conf.gateway.http = conf.gateway.http || {};
conf.gateway.http.endpoints = conf.gateway.http.endpoints || {};
conf.gateway.http.endpoints.chatCompletions = { enabled: true };

const primary = (process.env.OPENCLAW_MODEL || '').trim();
if (primary) {
  conf.agents = conf.agents || {};
  conf.agents.defaults = conf.agents.defaults || {};
  conf.agents.defaults.model = conf.agents.defaults.model || {};
  conf.agents.defaults.model.primary = primary;
}

// 飞书渠道：只有显式给了 appId/appSecret 才启用
const appId = (process.env.FEISHU_APP_ID || '').trim();
const appSecret = (process.env.FEISHU_APP_SECRET || '').trim();
conf.channels = conf.channels || {};
conf.channels.feishu = conf.channels.feishu || {};
if (appId && appSecret) {
  Object.assign(conf.channels.feishu, { enabled: true, appId, appSecret });
} else {
  Object.assign(conf.channels.feishu, { enabled: false, appId: '', appSecret: '' });
}

fs.writeFileSync(path, JSON.stringify(conf, null, 2) + '\n');
console.log('[openclaw-entrypoint] 配置写入完成');
JS
chmod 600 "$CONF"

# ── 3. 启动 ──────────────────────────────────────
PORT="${OPENCLAW_PORT:-18789}"
log "启动 gateway，端口 $PORT（bind=lan, mode=local）"
# bind 已写进 openclaw.json，命令行不再传 --bind（传 0.0.0.0 会被判非法）
# --allow-unconfigured：本容器不预置模型凭据，不加这个 gateway 会报 Missing config 抢退
# --token：容器环境 auto bind 需要显式 token，光写进 openclaw.json 不够
#          gateway 还会检查 OPENCLAW_GATEWAY_TOKEN 环境变量或 --token 参数
exec openclaw gateway --port "$PORT" --allow-unconfigured --token "$GATEWAY_TOKEN"
