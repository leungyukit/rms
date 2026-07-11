'use client';

import { useEffect, useState } from 'react';

const CHANNELS = [
  { value: 'feishu', label: '飞书', icon: '🪶' },
  { value: 'wecom', label: '企微', icon: '💼' },
  { value: 'dingtalk', label: '钉钉', icon: '📌' },
];

const TABS = [
  { key: 'configs', label: '配置' },
  { key: 'messages', label: '消息日志' },
  { key: 'test', label: '测试工具' },
];

function statusBadgeHtml(s: string) {
  if (s === 'processed') return '<span class="badge badge-success">' + s + '</span>';
  if (s === 'failed') return '<span class="badge badge-danger">' + s + '</span>';
  if (s === 'ignored') return '<span class="badge badge-gray">' + s + '</span>';
  return '<span class="badge badge-warning">' + s + '</span>';
}

function enabledBadgeHtml(on: boolean) {
  return on ? '<span class="badge badge-success">启用</span>' : '<span class="badge badge-gray">停用</span>';
}

export default function IntegrationsPage() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [tab, setTab] = useState<'configs' | 'messages' | 'test'>('configs');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    channel: 'feishu',
    name: '',
    webhook_url: '',
    secret: '',
    project_id: '',
    notify_on_create: 1,
    notify_on_status_change: 1,
    notify_on_high_priority: 1,
  });
  const [testResult, setTestResult] = useState<any>(null);

  const load = async () => {
    const r1 = await fetch('/api/admin/integrations', { credentials: 'include' });
    const j1 = await r1.json();
    setConfigs(j1.configs || []);
    const r2 = await fetch('/api/admin/integrations/messages', { credentials: 'include' });
    const j2 = await r2.json();
    setMessages(j2.messages || []);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    await fetch('/api/admin/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, project_id: form.project_id ? parseInt(form.project_id) : null }),
    });
    setShowForm(false);
    setForm({
      channel: 'feishu',
      name: '',
      webhook_url: '',
      secret: '',
      project_id: '',
      notify_on_create: 1,
      notify_on_status_change: 1,
      notify_on_high_priority: 1,
    });
    load();
  };

  const toggle = async (c: any) => {
    await fetch('/api/admin/integrations/' + c.id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: c.enabled ? 0 : 1 }),
    });
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('确认删除？')) return;
    await fetch('/api/admin/integrations/' + id, { method: 'DELETE' });
    load();
  };

  const runTest = async (id: number) => {
    setTestResult({ loading: true });
    const r = await fetch('/api/admin/integrations/' + id + '/test', { method: 'POST' });
    setTestResult(await r.json());
  };

  const tabClass = (k: string) => tab === k ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';

  const tabLabel = (k: string) => {
    if (k === 'configs') return '配置 (' + configs.length + ')';
    if (k === 'messages') return '消息日志 (' + messages.length + ')';
    return '测试工具';
  };

  return (
    <div className="p-6">
      <div className="page-header">
        <h1>🔌 集成中心（IM 机器人）</h1>
        <p>飞书 / 企微 / 钉钉 群机器人配置 · 出站推送 + 入站建需求</p>
      </div>

      <div className="flex gap-2 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={tabClass(t.key)}>
            {tabLabel(t.key)}
          </button>
        ))}
      </div>

      {tab === 'configs' && (
        <>
          <div className="flex justify-end mb-3">
            <button onClick={() => setShowForm(true)} className="btn btn-primary">➕ 新建集成</button>
          </div>
          {showForm && (
            <div className="card mb-4">
              <div className="card-body">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="form-label">渠道</label>
                    <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} className="form-input">
                      {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">名称</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="form-input" placeholder="生产飞书一群" />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Webhook URL（出站）</label>
                  <input value={form.webhook_url} onChange={e => setForm({ ...form, webhook_url: e.target.value })} className="form-input font-mono" />
                </div>
                <div className="mb-3">
                  <label className="form-label">签名 Secret（可选）</label>
                  <input value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value })} className="form-input" />
                </div>
                <div className="mb-3">
                  <label className="form-label">项目 ID（可选，限定推送范围）</label>
                  <input value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })} className="form-input" />
                </div>
                <div className="mb-3">
                  <label className="form-label">触发事件</label>
                  <div className="flex gap-3 text-sm">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!form.notify_on_create} onChange={e => setForm({ ...form, notify_on_create: e.target.checked ? 1 : 0 })} /> 需求创建
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!form.notify_on_status_change} onChange={e => setForm({ ...form, notify_on_status_change: e.target.checked ? 1 : 0 })} /> 状态变更
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={!!form.notify_on_high_priority} onChange={e => setForm({ ...form, notify_on_high_priority: e.target.checked ? 1 : 0 })} /> 高优告警
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={save} className="btn btn-primary">保存</button>
                  <button onClick={() => setShowForm(false)} className="btn btn-secondary">取消</button>
                </div>
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-body">
              <div className="table-wrap">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">渠道</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">名称</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Webhook</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">项目</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">触发</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">状态</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map(c => {
                      const ch = CHANNELS.find(x => x.value === c.channel);
                      let trig = '';
                      if (c.notify_on_create) trig += '🆕 ';
                      if (c.notify_on_status_change) trig += '🔄 ';
                      if (c.notify_on_high_priority) trig += '🚨 ';
                      if (!trig) trig = '-';
                      return (
                        <tr key={c.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2">{ch ? ch.icon + ' ' + ch.label : c.channel}</td>
                          <td className="px-3 py-2 font-medium">{c.name}</td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-500">{c.webhook_url_masked}</td>
                          <td className="px-3 py-2 text-xs">{c.project_id || '全部'}</td>
                          <td className="px-3 py-2 text-xs">{trig}</td>
                          <td className="px-3 py-2 text-xs" dangerouslySetInnerHTML={{ __html: enabledBadgeHtml(c.enabled) }} />
                          <td className="px-3 py-2 text-xs">
                            <button onClick={() => runTest(c.id)} className="btn btn-sm btn-secondary">测试</button>
                            <button onClick={() => toggle(c)} className="btn btn-sm btn-secondary">{c.enabled ? '停用' : '启用'}</button>
                            <button onClick={() => remove(c.id)} className="btn btn-sm btn-danger">删除</button>
                          </td>
                        </tr>
                      );
                    })}
                    {configs.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-gray-400 py-8">暂无配置，点击「新建集成」开始</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'messages' && (
        <div className="card">
          <div className="card-body">
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">时间</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">渠道</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">群</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">发送人</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">命令</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">需求</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-500">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m: any) => (
                    <tr key={m.id} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 text-xs text-gray-500">{m.received_at}</td>
                      <td className="px-3 py-2 text-xs">{m.channel}</td>
                      <td className="px-3 py-2 text-xs font-mono">{m.chat_id ? m.chat_id.substring(0, 20) : '-'}</td>
                      <td className="px-3 py-2 text-xs font-mono">{m.sender_id ? m.sender_id.substring(0, 20) : '-'}</td>
                      <td className="px-3 py-2 text-xs truncate max-w-xs">{m.parsed_command ? m.parsed_command.substring(0, 80) : '-'}</td>
                      <td className="px-3 py-2 text-xs">{m.requirement_id ? '#' + m.requirement_id : '-'}</td>
                      <td className="px-3 py-2 text-xs" dangerouslySetInnerHTML={{ __html: statusBadgeHtml(m.status) }} />
                    </tr>
                  ))}
                  {messages.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-gray-400 py-8">暂无消息</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'test' && (
        <div className="card">
          <div className="card-body">
            <p className="form-hint">点击「测试」按钮向所选配置发送一条测试消息</p>
            <div className="space-y-2 mt-3">
              {configs.map(c => {
                const ch = CHANNELS.find(x => x.value === c.channel);
                return (
                  <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="text-sm">{ch ? ch.icon + ' ' : ''}<b>{c.name}</b> · {c.webhook_url_masked}</div>
                    <button onClick={() => runTest(c.id)} className="btn btn-sm btn-primary">📤 发送测试</button>
                  </div>
                );
              })}
              {configs.length === 0 && (
                <div className="text-center text-gray-400 py-4 text-sm">请先在「配置」tab 创建配置</div>
              )}
            </div>
            {testResult && (
              <div className={'alert mt-3 ' + (testResult.ok ? 'alert-success' : 'alert-danger')}>
                <div>状态码：{testResult.status}</div>
                <div className="text-xs mt-1">返回：{testResult.body ? testResult.body.substring(0, 200) : ''}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
