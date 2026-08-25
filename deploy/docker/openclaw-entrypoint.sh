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

// ── 模型 ──────────────────────────────────────────
// 镜像里烤死的默认值可能是无效模型名（历史上是 tencentmaas/glm-5.2，Gateway 直接报
// "Unknown model"）。这里的策略：
//   1. 给了 OPENCLAW_MODEL       → 用它
//   2. 没给但镜像值在黑名单里     → 清掉，避免拿死名字去请求
//   3. 都没有                    → 保持不设，Gateway 用自己的默认
conf.agents = conf.agents || {};
conf.agents.defaults = conf.agents.defaults || {};
conf.agents.defaults.model = conf.agents.defaults.model || {};

const KNOWN_BAD_MODELS = ['tencentmaas/glm-5.2'];
const primary = (process.env.OPENCLAW_MODEL || '').trim();
if (primary) {
  conf.agents.defaults.model.primary = primary;
  console.log(`[openclaw-entrypoint] model.primary = ${primary}`);
} else {
  const baked = (conf.agents.defaults.model.primary || '').trim();
  if (KNOWN_BAD_MODELS.includes(baked)) {
    delete conf.agents.defaults.model.primary;
    console.warn(
      `[openclaw-entrypoint] 警告：清除失效模型 "${baked}"。` +
      '未设 OPENCLAW_MODEL，Agent 模式将无法产出回答 —— 请在 .env 里配置 OPENCLAW_MODEL。'
    );
  } else if (!baked) {
    console.warn(
      '[openclaw-entrypoint] 警告：未配置模型（OPENCLAW_MODEL 为空）。Agent 模式不可用。'
    );
  }
}

// ── 自定义模型注册（方舟新模型）──────────────────
// 2026-08-25 踩坑：OpenClaw 的 volcengine catalog 是静态硬编码的（只到
// doubao-seed-1-8-251228）。更新的型号如 doubao-seed-2-1-turbo-260628 不在表里，
// 会出现割裂现象：
//   - gateway 启动时读 model.primary 不校验 → 日志显示“已装载”，看着正常
//   - 真发请求走 /v1/chat/completions 时才查目录 → "Unknown model"
// 所以这里根据 OPENCLAW_MODEL 自动补注册 models.providers.volcengine。
//
// volcengine-plan/*（如 ark-code-latest）在内置目录里，不需要也不应该覆盖。
// 之前靠手工 docker exec 改容器内 openclaw.json 热补，容器重建就丢 —— 现在固化到这里。
const ARK_GENERAL_BASE = 'https://ark.cn-beijing.volces.com/api/v3';
const m = /^volcengine\/(.+)$/.exec(primary);
if (m) {
  const modelId = m[1];
  const ctxWindow = parseInt(process.env.OPENCLAW_MODEL_CONTEXT_WINDOW || '256000', 10);
  const maxTokens = parseInt(process.env.OPENCLAW_MODEL_MAX_TOKENS || '32768', 10);

  conf.models = conf.models || {};
  conf.models.providers = conf.models.providers || {};
  const prev = conf.models.providers.volcengine || {};
  const models = Array.isArray(prev.models) ? prev.models.slice() : [];
  if (!models.some((x) => x && x.id === modelId)) {
    models.push({
      id: modelId,
      name: process.env.OPENCLAW_MODEL_NAME || modelId,
      api: 'openai-completions',
      input: ['text'],
      contextWindow: ctxWindow,
      maxTokens,
    });
  }
  conf.models.providers.volcengine = {
    ...prev,
    baseUrl: process.env.ARK_BASE_URL || ARK_GENERAL_BASE,
    api: 'openai-completions',
    // 占位符由 OpenClaw 运行时展开环境变量，明文不落进 openclaw.json
    apiKey: '${VOLCANO_ENGINE_API_KEY}',
    contextWindow: ctxWindow,
    maxTokens,
    models,
  };
  console.log(
    `[openclaw-entrypoint] 已注册自定义模型 volcengine/${modelId} ` +
    `(ctx=${ctxWindow}, maxTokens=${maxTokens})`
  );
  if (!(process.env.VOLCANO_ENGINE_API_KEY || '').trim()) {
    console.warn(
      '[openclaw-entrypoint] 警告：VOLCANO_ENGINE_API_KEY 为空，方舟调用会 401。'
    );
  }
} else if (primary.startsWith('volcengine-plan/')) {
  console.log('[openclaw-entrypoint] volcengine-plan/* 在内置目录，无需自定义注册');
}

// ── RMS agent ────────────────────────────────────
// RMS 的 /api/openclaw 用 model="openclaw/rms" + session key 前缀 "agent:rms:" 做路由。
// agents.list 里没有 id=rms 时 Gateway 直接 400 "Unknown agent 'rms'"。
// 这里幂等注入：已存在只补缺失字段，不覆盖运维手工改过的值。
conf.agents.list = Array.isArray(conf.agents.list) ? conf.agents.list : [];
if (!conf.agents.list.some((a) => a && a.id === 'main')) {
  conf.agents.list.push({ id: 'main' });
}

const RMS_AGENT_ID = (process.env.OPENCLAW_AGENT_ID || 'rms').trim() || 'rms';
let rmsAgent = conf.agents.list.find((a) => a && a.id === RMS_AGENT_ID);
if (!rmsAgent) {
  rmsAgent = { id: RMS_AGENT_ID };
  conf.agents.list.push(rmsAgent);
  console.log(`[openclaw-entrypoint] 新增 agent "${RMS_AGENT_ID}"`);
}
rmsAgent.name = rmsAgent.name || 'RMS 助手';
rmsAgent.identity = rmsAgent.identity || { name: 'RMS 助手' };
rmsAgent.workspace = rmsAgent.workspace || `/root/.openclaw/workspace-${RMS_AGENT_ID}`;
rmsAgent.agentDir = rmsAgent.agentDir || `/root/.openclaw/agents/${RMS_AGENT_ID}/agent`;
// 显式 skills 列表会「替换」而非合并 defaults —— 必须带上 rms
rmsAgent.skills = rmsAgent.skills || ['rms'];
// 最小权限：只读 + 执行 skill 脚本，禁掉写文件/外发/爬网等一切多余能力
rmsAgent.tools = rmsAgent.tools || {
  allow: ['read', 'exec', 'session_status'],
  deny: [
    'write', 'edit', 'apply_patch', 'browser', 'canvas', 'nodes', 'cron',
    'sessions_send', 'sessions_spawn', 'sessions_list', 'sessions_history',
    'web_search', 'web_fetch', 'skill_workshop', 'memory_search', 'memory_get',
  ],
};

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
console.log(
  '[openclaw-entrypoint] 配置写入完成，agents.list = ' +
  JSON.stringify(conf.agents.list.map((a) => a.id))
);
JS
chmod 600 "$CONF"

# ── 2b. RMS agent workspace ──────────────────────
# workspace 目录挂的是 named volume 时镜像内容会被盖住，这里兜底建目录 + 补 skill 白名单。
RMS_AGENT_ID="${OPENCLAW_AGENT_ID:-rms}"
RMS_WS="/root/.openclaw/workspace-${RMS_AGENT_ID}"
mkdir -p "$RMS_WS"
if [ ! -f "$RMS_WS/AGENTS.md" ] && [ -f /root/.openclaw/workspace-rms-seed/AGENTS.md ]; then
  cp -an /root/.openclaw/workspace-rms-seed/. "$RMS_WS/" 2>/dev/null || true
  log "已初始化 $RMS_WS"
fi

# ── 3. 启动 ──────────────────────────────────────
PORT="${OPENCLAW_PORT:-18789}"
log "启动 gateway，端口 $PORT（bind=lan, mode=local）"
# bind 已写进 openclaw.json，命令行不再传 --bind（传 0.0.0.0 会被判非法）
# --allow-unconfigured：本容器不预置模型凭据，不加这个 gateway 会报 Missing config 抢退
# --token：容器环境 auto bind 需要显式 token，光写进 openclaw.json 不够
#          gateway 还会检查 OPENCLAW_GATEWAY_TOKEN 环境变量或 --token 参数
exec openclaw gateway --port "$PORT" --allow-unconfigured --token "$GATEWAY_TOKEN"
