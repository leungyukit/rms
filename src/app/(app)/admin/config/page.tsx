'use client';

import { useState, useEffect } from 'react';
import { useT } from '@/i18n/config';
import { invalidateRequirementOptions } from '@/lib/use-requirement-options';
import { invalidateProjectRoles, invalidateSystemRoles } from '@/lib/use-role-options';

const CATEGORY_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
  general: { label: '基础设置', icon: '⚙️', desc: '系统名称、描述等基本信息' },
  database: { label: '数据库', icon: '🗄️', desc: '数据库引擎选择与 MySQL 连接配置' },
  memcache: { label: 'Memcache', icon: '💾', desc: '会话存储 Memcache 配置' },
  auth: { label: '注册与认证', icon: '🔐', desc: '用户注册、密码、登录有效期' },
  requirement: { label: '需求设置', icon: '📋', desc: '需求状态、优先级、分类等配置' },
  sla: { label: 'SLA 设置', icon: '⏱️', desc: '超期预警、升级、宽限等 SLA 规则' },
  display: { label: '显示设置', icon: '🖥️', desc: '列表分页、图表范围等显示参数' },
  notification: { label: '通知设置', icon: '🔔', desc: '通知开关及邮箱配置' },
  asr_tts: { label: '语音服务', icon: '🎙️', desc: 'ASR/TTS 语音配置' },
  duplicate: { label: '重复检测', icon: '🔁', desc: '需求去重配置' },
  estimation: { label: '估算设置', icon: '📐', desc: '工作量估算参数' },
  sprint: { label: 'Sprint', icon: '🏃', desc: '迭代冲刺配置' },
  ac: { label: 'AC 模板', icon: '✅', desc: '验收检查清单模板' },
  health: { label: '健康度', icon: '❤️', desc: '需求健康度权重' },
  wecom: { label: '企业微信', icon: '💬', desc: '企业微信登录与同步配置' },
  feishu: { label: '飞书', icon: '🐦', desc: '飞书登录与同步配置' },
  dingtalk: { label: '钉钉', icon: '💬', desc: '钉钉登录与同步配置' },
  openclaw: { label: 'OpenClaw', icon: '🤖', desc: 'AI Agent 集成配置' },
  llm: { label: '大模型', icon: '🧠', desc: 'LLM 智能对话配置' },
};

const BASIC_CATEGORIES = ['general', 'auth', 'requirement', 'sla', 'display', 'notification', 'duplicate', 'estimation', 'sprint', 'ac', 'health'];
const ADVANCED_CATEGORIES: string[] = ['database', 'memcache', 'openclaw', 'llm', 'asr_tts', 'wecom', 'feishu', 'dingtalk'];

const PRETTY_KEY_MAP: Record<string, string> = {
  system_name: '系统名称',
  system_description: '系统描述',
  company_name: '公司/组织名称',
  db_type: '数据库类型',
  db_path: 'SQLite 路径',
  mysql_host: 'MySQL 主机',
  mysql_port: 'MySQL 端口',
  mysql_user: 'MySQL 用户名',
  mysql_password: 'MySQL 密码',
  mysql_database: 'MySQL 数据库名',
  memcache_enabled: '启用 Memcache',
  memcache_host: 'Memcache 主机',
  memcache_port: 'Memcache 端口',
  memcache_ttl_days: '会话 TTL（天）',
  enable_registration: '开放注册',
  allow_open_registration: '允许开放注册',
  default_role: '默认角色',
  session_timeout: '会话超时时间',
  password_min_length: '密码最小长度',
  req_statuses: '需求状态列表',
  req_priorities: '需求优先级',
  req_categories: '需求分类',
  page_size: '每页条数',
  chart_default_range: '图表默认范围',
  notification_enabled: '启用通知',
  email_enabled: '启用邮件通知',
  smtp_host: 'SMTP 服务器',
  smtp_port: 'SMTP 端口',
  smtp_user: 'SMTP 用户名',
  smtp_password: 'SMTP 密码',
  smtp_from: '发件人地址',
  i18n_default_locale: '默认语言',
  i18n_enabled_locales: '支持语言列表',
  ai_knowledge_auto_enabled: '知识自动关联',
  ai_knowledge_default_status: '默认知识状态',
  ai_knowledge_notify_handler: '通知处理人',
  ai_knowledge_target_statuses: '目标状态',
  default_user_capacity_hours: '用户每日标准工时',
  sprint_active_count_limit: '活跃 Sprint 数量限制',
  llm_enabled: '启用 LLM',
  llm_api_key: 'LLM API Key',
  llm_max_tokens: 'LLM 最大 Token 数',
  llm_temperature: 'LLM 温度参数',
  openclaw_enabled: '启用 OpenClaw',
  openclaw_gateway_url: 'OpenClaw Gateway 地址',
  openclaw_gateway_token: 'OpenClaw Gateway Token',
};

const prettyKey = (k: string) => {
  if (PRETTY_KEY_MAP[k]) return PRETTY_KEY_MAP[k];
  // 处理带点的 key，如 i18n.default_locale
  const dotReplaced = k.replace(/\./g, '_');
  if (PRETTY_KEY_MAP[dotReplaced]) return PRETTY_KEY_MAP[dotReplaced];
  // 通用 fallback：把下划线/点换成空格，首字母大写
  return k.replace(/[_.]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

export default function AdminConfigPage() {
  const { t } = useT();
  const [configs, setConfigs] = useState<any[]>([]);
  const [grouped, setGrouped] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('general');

  useEffect(() => {
    fetch('/api/config', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (!d.configs && !d.grouped) {
          window.location.href = '/login';
          return;
        }
        setConfigs(d.configs || []);
        setGrouped(d.grouped || {});
        const vals: Record<string, string> = {};
        for (const c of (d.configs || [])) vals[c.key] = c.value;
        setValues(vals);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateValue = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: values }),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '保存失败'); return; }
      invalidateRequirementOptions();
      invalidateProjectRoles();
      invalidateSystemRoles();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('网络错误'); }
    finally { setSaving(false); }
  };

  const hasChanges = () => {
    for (const c of configs) {
      if (values[c.key] !== c.value) return true;
    }
    return false;
  };

  if (loading) return <div className="p-6 empty-state"><div className="empty-state-icon">⏳</div><div className="empty-state-text">加载中...</div></div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">⚙️ 系统配置</h1>
          <p className="text-sm text-gray-500 mt-0.5">修改系统参数和行为设置</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-lg">✅ 已保存</span>}
          {error && <span className="text-sm text-red-600 bg-red-50 px-3 py-1 rounded-lg">{error}</span>}
          <button
            onClick={save}
            disabled={saving || !hasChanges()}
            className="btn btn-primary"
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Tabs sidebar */}
        <div className="w-48 shrink-0">
          <div className="card p-2">
            {BASIC_CATEGORIES.map(cat => {
              const info = CATEGORY_LABELS[cat] || { label: cat, icon: '📄', desc: '' };
              const items = grouped[cat] || [];
              if (items.length === 0) return null;
              const changed = items.some(c => values[c.key] !== c.value);
              return (
                <button key={cat} onClick={() => setActiveTab(cat)}
                  className={`sidebar-link text-xs transition-all flex items-center gap-2 ${
                    activeTab === cat ? 'active' : ''
                  }`}>
                  <span>{info.icon}</span>
                  <span className="flex-1">{info.label}</span>
                  {changed && <span className="w-2 h-2 rounded-full bg-gray-800" />}
                </button>
              );
            })}
            {ADVANCED_CATEGORIES.some(cat => (grouped[cat] || []).length > 0) && (
              <div className="my-2 border-t border-gray-100" />
            )}
            {ADVANCED_CATEGORIES.map(cat => {
              const info = CATEGORY_LABELS[cat] || { label: cat, icon: '📄', desc: '' };
              const items = grouped[cat] || [];
              if (items.length === 0) return null;
              const changed = items.some(c => values[c.key] !== c.value);
              return (
                <button key={cat} onClick={() => setActiveTab(cat)}
                  className={`sidebar-link text-xs transition-all flex items-center gap-2 ${
                    activeTab === cat ? 'active' : ''
                  }`}>
                  <span>{info.icon}</span>
                  <span className="flex-1">{info.label}</span>
                  {changed && <span className="w-2 h-2 rounded-full bg-gray-800" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Config items */}
        <div className="flex-1">
          {[...BASIC_CATEGORIES, ...ADVANCED_CATEGORIES].filter(cat => cat === activeTab).map(cat => {
            const info = CATEGORY_LABELS[cat] || { label: cat, icon: '📄', desc: '' };
            const items = grouped[cat] || [];
            if (items.length === 0) return null;
            return (
              <div key={cat} className="bg-white rounded-xl">
                <div className="card-header"><h2 className="card-title flex items-center gap-2">
                    <span>{info.icon}</span> {info.label}
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">{info.desc}</p>
                </div>
                <div className="card-body">
                  {items.filter((c: any) => {
                    // 过滤 SLA 规则（单独面板处理）
                    if (cat === 'sla' && c.key.startsWith('sla_rules_')) return false;
                    
                    // 当数据库类型为 sqlite 时，隐藏 MySQL 相关配置
                    if (cat === 'database') {
                      const dbType = values['db_type'] || 'mysql';
                      if (dbType === 'sqlite' && c.key.startsWith('mysql_')) {
                        return false;
                      }
                    }
                    
                    return true;
                  }).map((c: any) => (
                    <div key={c.key} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex-1 min-w-0">
                          <label className="block text-sm font-medium text-gray-800">{c.label || prettyKey(c.key)}</label>
                          <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>
                          <code className="text-[10px] text-gray-300 mt-1 block">{c.key}</code>
                        </div>
                        <div className="w-80 shrink-0">
                          <ConfigInput config={c} value={values[c.key] || ''} onChange={(v: string) => updateValue(c.key, v)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* MySQL actions panel */}
                {cat === 'database' && <MysqlPanel dbType={values['db_type'] || 'mysql'} />}
                {cat === 'sla' && <SlaRulesPanel values={values} updateValue={updateValue} />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ConfigInput({ config, value, onChange }: { config: any; value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  const type = config.type || 'text';

  const label = config.label || prettyKey(config.key);
  // 检查是否为敏感字段（API Key、Token、密码等）
  const isSensitive = config.key && (/(secret|token|key|password|app_secret|app_key|api_key|auth_code)/i.test(config.key));

  if (type === 'boolean') {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => onChange(value === 'true' ? 'false' : 'true')}
          className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${value === 'true' ? 'bg-gray-800' : 'bg-gray-300'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${value === 'true' ? 'translate-x-5.5 ml-0.5' : 'translate-x-0.5'}`} />
        </button>
        <span className="text-sm text-gray-600">{value === 'true' ? t('common.enabled') : t('common.disabled')}</span>
      </div>
    );
  }

  if (type === 'number') {
    return (
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="form-input"
      />
    );
  }

  if (type === 'textarea') {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-800"
      />
    );
  }

  if (type.startsWith('select:')) {
    const options = type.slice(7).split(',').map((o: string) => {
      const [val, label] = o.split('|');
      return { value: val, label: label || val };
    });
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="form-input"
      >
        {options.map((o: any) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  // 敏感字段始终以密文显示，不再提供明文切换
  if (isSensitive) {
    return (
      <input
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="请输入密钥"
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-800"
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="form-input"
    />
  );
}

// ====== MySQL Panel ======
function MysqlPanel({ dbType }: { dbType: string }) {
  const [testing, setTesting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<any>(null);

  if (dbType !== 'mysql') return null;

  const handleTest = async () => {
    setTesting(true); setResult(null);
    try {
      const res = await fetch('/api/database', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      });
      setResult({ type: 'test', ...(await res.json()) });
    } catch { setResult({ type: 'test', success: false, error: '请求失败' }); }
    finally { setTesting(false); }
  };

  const handleMigrate = async () => {
    if (!confirm('确定要将 SQLite 数据迁移到 MySQL 吗？现有数据不会丢失。')) return;
    setMigrating(true); setResult(null);
    try {
      const res = await fetch('/api/database', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'migrate' }),
      });
      setResult({ type: 'migrate', ...(await res.json()) });
    } catch { setResult({ type: 'migrate', success: false, error: '迁移失败' }); }
    finally { setMigrating(false); }
  };

  return (
    <div className="card-body bg-gray-50 border-t">
      <h3 className="font-medium mb-4 flex items-center gap-2">🔧 MySQL 操作</h3>
      <div className="flex gap-3 mb-4">
        <button onClick={handleTest} disabled={testing}
          className="btn btn-secondary">
          {testing ? '测试中...' : '🔌 测试连接'}
        </button>
        <button onClick={handleMigrate} disabled={migrating}
          className="btn btn-secondary">
          {migrating ? '迁移中...' : '📦 迁移数据到 MySQL'}
        </button>
      </div>
      {result && (
        <div className={`alert ${result.success ? 'alert-success' : 'alert-danger'} mb-4`}>
          <div className="font-medium">{result.success ? '✅ ' + (result.type === 'test' ? '连接成功' : '迁移完成') : '❌ ' + (result.type === 'test' ? '连接失败' : '迁移失败')}</div>
          {result.tables !== undefined && <div className="mt-1">数据表数量：{result.tables}</div>}
          {result.migrated && (
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              {Object.entries(result.migrated).map(([k, v]: any) => (
                <div key={k} className="bg-white/60 rounded px-2 py-1">{k}: {v} 条</div>
              ))}
            </div>
          )}
          {result.error && <div className="mt-1">{result.error}</div>}
        </div>
      )}
      <div className="text-xs text-gray-400 space-y-1">
        <p>💡 先保存配置，再点测试连接。确认连接成功后再执行数据迁移。</p>
        <p>📌 系统配置始终存储在 SQLite 中，MySQL 仅存储业务数据（需求、项目、用户等）。</p>
      </div>
    </div>
  );
}

// ====== SLA 规则面板 ======
function SlaRulesPanel({ values, updateValue }: { values: Record<string, string>; updateValue: (k: string, v: string) => void }) {
  const parse = (key: string) => {
    try { return JSON.parse(values[key] || '{}'); }
    catch { return {}; }
  };
  const high = parse('sla_rules_high');
  const medium = parse('sla_rules_medium');
  const low = parse('sla_rules_low');

  const set = (key: string, field: string, val: number) => {
    const current = parse(key);
    current[field] = val;
    updateValue(key, JSON.stringify(current));
  };

  const resetToDefault = (key: string, defaults: Record<string, number>) => {
    updateValue(key, JSON.stringify(defaults));
  };

  const RuleRow = ({ label, data, ruleKey, defaults }: { label: string; data: Record<string, number>; ruleKey: string; defaults: Record<string, number> }) => (
    <div className="flex items-center gap-4 py-3">
      <div className="w-20 shrink-0 text-sm font-medium text-gray-700">{label}</div>
      <div className="flex-1 grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-gray-400 block mb-1">即将超期阈值 (%)</label>
          <input type="number" value={data.approachingPct ?? ''} onChange={e => set(ruleKey, 'approachingPct', Number(e.target.value))} className="form-input" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">超期宽限天数</label>
          <input type="number" value={data.overdueGraceDays ?? ''} onChange={e => set(ruleKey, 'overdueGraceDays', Number(e.target.value))} className="form-input" />
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">升级阈值 (天)</label>
          <input type="number" value={data.escalateAfterDays ?? ''} onChange={e => set(ruleKey, 'escalateAfterDays', Number(e.target.value))} className="form-input" />
        </div>
      </div>
      <button onClick={() => resetToDefault(ruleKey, defaults)} className="text-xs text-gray-800 hover:text-gray-900 whitespace-nowrap">恢复默认</button>
    </div>
  );

  return (
    <div className="card-body bg-gray-50">
      <h3 className="font-medium mb-2 flex items-center gap-2">⏱️ SLA 规则配置</h3>
      <p className="text-xs text-gray-400 mb-4">按需求优先级设置不同的 SLA 规则。保存配置后，下次扫描生效。</p>
      <div className="bg-white rounded-lg">
        <RuleRow label="🔴 高优先级" data={high} ruleKey="sla_rules_high" defaults={{ approachingPct: 50, overdueGraceDays: 0, escalateAfterDays: 2 }} />
        <RuleRow label="🟡 中优先级" data={medium} ruleKey="sla_rules_medium" defaults={{ approachingPct: 70, overdueGraceDays: 1, escalateAfterDays: 3 }} />
        <RuleRow label="🟢 低优先级" data={low} ruleKey="sla_rules_low" defaults={{ approachingPct: 90, overdueGraceDays: 2, escalateAfterDays: 5 }} />
      </div>
      <div className="mt-3 text-xs text-gray-400">
        💡 即将超期阈值：剩余时间百分比 ≤ 此值时触发预警 | 升级阈值：超期多少天后通知验证人
      </div>
    </div>
  );
}
