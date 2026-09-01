'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const STATUS_OPTIONS = [
  { value: '', label: '-- 无 --' },
  { value: 'received_not_evaluated', label: '仅接收，未评估' },
  { value: 'evaluated_not_scheduled', label: '已评估，未排期' },
  { value: 'scheduled', label: '已排期' },
  { value: 'in_progress', label: '处理中' },
  { value: 'completed', label: '已完成' },
  { value: 'verified', label: '已验证' },
  { value: 'closed', label: '已关闭' },
];

const FIELD_OPTIONS = [
  { value: 'title', label: '标题' },
  { value: 'description', label: '描述' },
  { value: 'business_unit', label: '业务部门' },
  { value: 'category', label: '分类' },
  { value: 'priority', label: '优先级' },
  { value: 'status', label: '状态' },
  { value: 'requester_name', label: '提出人' },
  { value: 'benefit', label: '收益' },
  { value: 'solution', label: '解决方案' },
  { value: 'root_cause', label: '根本原因' },
  { value: 'story_points', label: '故事点' },
  { value: 'estimated_hours', label: '预估工时' },
  { value: 'actual_hours', label: '实际工时' },
];

const TIME_FIELD_OPTIONS = [
  { value: 'created_at', label: '创建时间' },
  { value: 'updated_at', label: '更新时间' },
  { value: 'planned_start', label: '计划开始时间' },
  { value: 'planned_end', label: '计划结束时间' },
  { value: 'actual_end', label: '实际结束时间' },
  { value: 'merged_at', label: '合并时间' },
];

// 流程节点色：语义固定（开始=绿 / 结束=红 / 任务=蓝 / 条件=橙），走 --node-* token。
// 不跟 --chart-* 混用：这四个是固定语义，不是可互换的数据系列。
const NODE_COLORS: Record<string, string> = {
  start: 'var(--node-start)', end: 'var(--node-end)',
  task: 'var(--node-task)', condition: 'var(--node-cond)',
};
const NODE_FALLBACK = 'var(--node-default)';

interface WfNode {
  node_key: string; label: string; type: string; assignee_id: number | null;
  auto_status: string | null; pos_x: number; pos_y: number; config: any;
}
interface WfEdge {
  from_node: string; to_node: string; condition_type: string; condition_value: string; label: string;
}

function WorkflowDesignerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workflowId = searchParams.get('id');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nodes, setNodes] = useState<WfNode[]>([]);
  const [edges, setEdges] = useState<WfEdge[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ key: string; offsetX: number; offsetY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (workflowId) {
      fetch(`/api/workflows?id=${workflowId}`).then(r => r.json()).then(d => {
        setName(d.name || '');
        setDescription(d.description || '');
        setNodes((d.nodes || []).map((n: any) => ({ ...n, config: typeof n.config === 'string' ? JSON.parse(n.config || '{}') : n.config || {} })));
        setEdges((d.edges || []).map((e: any) => ({ from_node: e.from_node, to_node: e.to_node, condition_type: e.condition_type, condition_value: e.condition_value, label: e.label })));
        setUsers(d.users || []);
        setLoading(false);
      }).catch(() => setLoading(false));
    } else {
      setNodes([
        { node_key: 'start', label: '开始', type: 'start', assignee_id: null, auto_status: null, pos_x: 80, pos_y: 200, config: {} },
        { node_key: 'end', label: '结束', type: 'end', assignee_id: null, auto_status: 'closed', pos_x: 600, pos_y: 200, config: {} },
      ]);
      setEdges([]);
      fetch('/api/users', { credentials: 'include' }).then(r => r.json()).then(d => setUsers(Array.isArray(d) ? d : [])).catch(() => {});
      setLoading(false);
    }
  }, [workflowId]);

  const addNode = () => {
    const key = `node_${Date.now()}`;
    const maxX = Math.max(...nodes.map(n => n.pos_x), 100);
    setNodes(prev => [...prev, { node_key: key, label: '新节点', type: 'task', assignee_id: null, auto_status: null, pos_x: maxX + 180, pos_y: 200, config: {} }]);
    setSelectedNode(key);
  };

  const deleteNode = (key: string) => {
    if (key === 'start' || key === 'end') return;
    setNodes(prev => prev.filter(n => n.node_key !== key));
    setEdges(prev => prev.filter(e => e.from_node !== key && e.to_node !== key));
    if (selectedNode === key) setSelectedNode(null);
  };

  const updateNode = (key: string, updates: Partial<WfNode>) => {
    setNodes(prev => prev.map(n => n.node_key === key ? { ...n, ...updates } : n));
  };

  const deleteEdge = (idx: number) => {
    setEdges(prev => prev.filter((_, i) => i !== idx));
    setSelectedEdge(null);
  };

  const handleNodeClick = (key: string) => {
    if (connecting) {
      if (connecting !== key) {
        setEdges(prev => [...prev, { from_node: connecting, to_node: key, condition_type: 'always', condition_value: '', label: '' }]);
      }
      setConnecting(null);
    } else {
      setSelectedNode(key);
      setSelectedEdge(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, key: string) => {
    if (connecting) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const node = nodes.find(n => n.node_key === key);
    if (!node) return;
    setDragging({ key, offsetX: e.clientX - rect.left - node.pos_x, offsetY: e.clientY - rect.top - node.pos_y });
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    updateNode(dragging.key, { pos_x: Math.max(0, e.clientX - rect.left - dragging.offsetX), pos_y: Math.max(0, e.clientY - rect.top - dragging.offsetY) });
  }, [dragging]);

  const handleMouseUp = () => setDragging(null);

  const save = async () => {
    if (!name.trim()) {
      alert('请输入工作流名称');
      return;
    }
    setSaving(true);
    try {
      const body = { name, description, nodes, edges };
      const method = workflowId ? 'PUT' : 'POST';
      const url = workflowId ? `/api/workflows?id=${workflowId}` : '/api/workflows';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '保存失败');
        return;
      }
      const data = await res.json();
      if (!workflowId && data.id) router.push(`/workflows/designer?id=${data.id}`);
    } catch (e) {
      alert('保存失败：' + ((e as Error).message || '网络错误'));
    } finally {
      setSaving(false);
    }
  };

  const selectedNodeData = nodes.find(n => n.node_key === selectedNode);
  const selectedEdgeData = selectedEdge !== null ? edges[selectedEdge] : null;

  if (loading) return <div className="p-6 text-gray-400">加载中...</div>;

  return (
    <div className="p-6 flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Header */}
      <div className="card mb-4"><div className="card-body">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/workflows')} className="btn btn-icon btn-secondary">←</button>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="工作流名称" className="form-input text-lg font-bold flex-1" />
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="描述" className="form-input flex-1" />
          <div className="flex gap-2">
            <button onClick={addNode} className="btn btn-primary">+ 添加节点</button>
            <button onClick={() => setConnecting(connecting ? null : (selectedNode || null))}
              className={`btn ${connecting ? 'btn-danger' : 'btn-secondary'}`}>
              {connecting ? '🔗 点击目标节点' : '🔗 连线'}
            </button>
            <button onClick={save} disabled={saving} className="btn btn-primary">
              {saving ? '保存中...' : '💾 保存'}
            </button>
          </div>
        </div>
      </div></div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Canvas */}
        <div className="flex-1 card flex flex-col min-w-0">
          <div className="card-body flex-1" style={{ padding: 0, overflow: 'auto', backgroundImage: 'radial-gradient(circle, var(--grid-dot) 1px, transparent 1px)', backgroundSize: '20px 20px' }} ref={canvasRef}
            onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
            <div className="relative" style={{ minWidth: 1200, minHeight: 500, backgroundImage: 'radial-gradient(circle, var(--grid-dot) 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ minWidth: 1400, minHeight: 400 }}>
                {edges.map((e, i) => {
                  const from = nodes.find(n => n.node_key === e.from_node);
                  const to = nodes.find(n => n.node_key === e.to_node);
                  if (!from || !to) return null;
                  const x1 = from.pos_x + 60, y1 = from.pos_y + 20, x2 = to.pos_x + 60, y2 = to.pos_y + 20;
                  return (
                    <g key={i} className="pointer-events-auto cursor-pointer" onClick={() => { setSelectedEdge(i); setSelectedNode(null); }}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={selectedEdge === i ? 'var(--node-sel)' : 'var(--chart-axis)'} strokeWidth={selectedEdge === i ? 3 : 2} markerEnd="url(#arrow)" />
                    </g>
                  );
                })}
                <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--chart-axis)" /></marker></defs>
              </svg>

              {nodes.map(n => (
                <div key={n.node_key}
                  className={`absolute select-none cursor-pointer rounded-lg border-2 px-4 py-2 text-sm font-medium shadow-sm transition-all ${
                    selectedNode === n.node_key ? 'ring-2 ring-gray-500 shadow-md' : connecting ? 'hover:ring-2 hover:ring-orange-400' : 'hover:shadow-md'
                  }`}
                  style={{ left: n.pos_x, top: n.pos_y, minWidth: 120, textAlign: 'center', background: NODE_COLORS[n.type] || NODE_FALLBACK, borderColor: selectedNode === n.node_key ? 'var(--node-sel)' : (NODE_COLORS[n.type] || NODE_FALLBACK), color: '#FFFFFF' }}
                  onClick={() => handleNodeClick(n.node_key)} onMouseDown={(e) => handleMouseDown(e, n.node_key)}>
                  <div>{n.label}</div>
                  {n.type === 'condition' && n.config?.condition_type && (
                    <div className="text-[10px] opacity-80 mt-0.5">
                      {(() => {
                        const condType = n.config.condition_type;
                        const condValue = n.config.condition_value || '';
                        if (condType === 'status') {
                          const statusLabel = STATUS_OPTIONS.find(s => s.value === condValue)?.label || condValue;
                          return `状态: ${statusLabel}`;
                        } else if (condType === 'priority') {
                          const priorityMap = { high: '高', medium: '中', low: '低' };
                          return `优先级: ${priorityMap[condValue as keyof typeof priorityMap] || condValue}`;
                        } else if (condType.startsWith('field_')) {
                          const [field, value] = condValue.split(':');
                          const fieldLabel = FIELD_OPTIONS.find(f => f.value === field)?.label || field;
                          const opMap = { field_eq: '=', field_contains: '包含', field_gt: '>', field_lt: '<' };
                          return `${fieldLabel} ${opMap[condType as keyof typeof opMap] || condType} ${value || ''}`;
                        } else if (condType === 'time_gt') {
                          return `时间>${condValue}`;
                        } else if (condType === 'time_diff_gt') {
                          return `时间差>${condValue}`;
                        } else if (condType === 'time_diff_lt') {
                          return `时间差<${condValue}`;
                        }
                        return condType;
                      })()}
                    </div>
                  )}
                  {n.type !== 'condition' && n.auto_status && <div className="text-[10px] opacity-80 mt-0.5">→ {STATUS_OPTIONS.find(s => s.value === n.auto_status)?.label || n.auto_status}</div>}
                  {n.assignee_id && <div className="text-[10px] opacity-80">👤 {users.find(u => u.id === n.assignee_id)?.display_name || '?'}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Properties Panel */}
        <div className="w-[420px] shrink-0 card flex flex-col" style={{ minWidth: '420px', maxWidth: '600px' }}>
          <div className="card-header"><h3 className="card-title">
            {selectedNodeData ? '节点属性' : selectedEdgeData ? '连线属性' : '属性面板'}
          </h3></div>
          <div className="card-body flex-1 overflow-y-auto">
            {selectedNodeData && (
              <div className="space-y-4 pb-4">
                <Field label="节点名称">
                  <input value={selectedNodeData.label} onChange={e => updateNode(selectedNode!, { label: e.target.value })} className="form-input" />
                </Field>
                <Field label="节点类型">
                  <select value={selectedNodeData.type} onChange={e => updateNode(selectedNode!, { type: e.target.value })} className="form-input">
                    <option value="start">开始</option><option value="task">任务</option>
                    <option value="condition">条件</option><option value="end">结束</option>
                  </select>
                </Field>
                {selectedNodeData.type === 'condition' ? (
                  <>
                    <Field label="条件类型">
                      <select 
                        value={selectedNodeData.config?.condition_type || 'status'}
                        onChange={e => updateNode(selectedNode!, { 
                          config: { 
                            ...selectedNodeData.config, 
                            condition_type: e.target.value 
                          } 
                        })}
                        className="form-input"
                      >
                        <option value="status">需求状态</option>
                        <option value="priority">优先级</option>
                        <option value="field_eq">字段等于</option>
                        <option value="field_contains">字段包含</option>
                        <option value="field_gt">字段大于</option>
                        <option value="field_lt">字段小于</option>
                        <option value="time_gt">处理时间超过（天）</option>
                        <option value="time_diff_gt">时间差大于（天）</option>
                        <option value="time_diff_lt">时间差小于（天）</option>
                      </select>
                    </Field>
                    <Field label="条件值">
                      {selectedNodeData.config?.condition_type === 'status' ? (
                        <select 
                          value={selectedNodeData.config?.condition_value || ''}
                          onChange={e => updateNode(selectedNode!, { 
                            config: { 
                              ...selectedNodeData.config, 
                              condition_value: e.target.value 
                            } 
                          })}
                          className="form-input"
                        >
                          {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      ) : selectedNodeData.config?.condition_type === 'priority' ? (
                        <select 
                          value={selectedNodeData.config?.condition_value || ''}
                          onChange={e => updateNode(selectedNode!, { 
                            config: { 
                              ...selectedNodeData.config, 
                              condition_value: e.target.value 
                            } 
                          })}
                          className="form-input"
                        >
                          <option value="high">高</option>
                          <option value="medium">中</option>
                          <option value="low">低</option>
                        </select>
                      ) : selectedNodeData.config?.condition_type?.startsWith('field_') ? (
                        <div className="space-y-2">
                          <select 
                            value={selectedNodeData.config?.condition_value?.split(':')[0] || ''}
                            onChange={e => {
                              const currentValue = selectedNodeData.config?.condition_value || '';
                              const parts = currentValue.split(':');
                              const newValue = parts.length > 1 ? `${e.target.value}:${parts.slice(1).join(':')}` : e.target.value;
                              updateNode(selectedNode!, { 
                                config: { 
                                  ...selectedNodeData.config, 
                                  condition_value: newValue 
                                } 
                              });
                            }}
                            className="form-input"
                          >
                            <option value="">选择字段</option>
                            {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                          <input 
                            value={selectedNodeData.config?.condition_value?.split(':').slice(1).join(':') || ''}
                            onChange={e => {
                              const currentValue = selectedNodeData.config?.condition_value || '';
                              const parts = currentValue.split(':');
                              const newValue = parts[0] ? `${parts[0]}:${e.target.value}` : e.target.value;
                              updateNode(selectedNode!, { 
                                config: { 
                                  ...selectedNodeData.config, 
                                  condition_value: newValue 
                                } 
                              });
                            }}
                            className="form-input" 
                            placeholder="比较值"
                          />
                        </div>
                      ) : (
                        <input 
                          value={selectedNodeData.config?.condition_value || ''}
                          onChange={e => updateNode(selectedNode!, { 
                            config: { 
                              ...selectedNodeData.config, 
                              condition_value: e.target.value 
                            } 
                          })}
                          className="form-input" 
                          placeholder="值（例如：7d 表示7天）"
                        />
                      )}
                    </Field>
                    <Field label="条件描述">
                      <input 
                        value={selectedNodeData.config?.description || ''}
                        onChange={e => updateNode(selectedNode!, { 
                          config: { 
                            ...selectedNodeData.config, 
                            description: e.target.value 
                          } 
                        })}
                        className="form-input" 
                        placeholder="可选：条件说明"
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="自动设置状态">
                    <select value={selectedNodeData.auto_status || ''} onChange={e => updateNode(selectedNode!, { auto_status: e.target.value || null })} className="form-input">
                      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </Field>
                )}
                <Field label="指派处理人">
                  <select value={selectedNodeData.assignee_id || ''} onChange={e => updateNode(selectedNode!, { assignee_id: e.target.value ? Number(e.target.value) : null })} className="form-input">
                    <option value="">-- 不指派 --</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                  </select>
                </Field>
                {selectedNode !== 'start' && selectedNode !== 'end' && (
                  <button onClick={() => deleteNode(selectedNode!)} className="btn btn-sm btn-danger w-full">删除此节点</button>
                )}
                <button onClick={() => setConnecting(selectedNode)} className="btn btn-sm btn-secondary w-full">🔗 从此节点连线</button>
              </div>
            )}
            {selectedEdgeData && selectedEdge !== null && (
              <div className="space-y-4 pb-4">
                <div className="text-xs text-gray-500">{selectedEdgeData.from_node} → {selectedEdgeData.to_node}</div>
                <Field label="连线标签">
                  <input value={selectedEdgeData.label} onChange={e => { const ne = [...edges]; ne[selectedEdge] = { ...ne[selectedEdge], label: e.target.value }; setEdges(ne); }} className="form-input" />
                </Field>
                <Field label="流转条件类型">
                  <select value={selectedEdgeData.condition_type} onChange={e => { const ne = [...edges]; ne[selectedEdge] = { ...ne[selectedEdge], condition_type: e.target.value }; setEdges(ne); }} className="form-input">
                    <option value="always">始终（无条件）</option>
                    <option value="status">需求状态变更为</option>
                    <option value="time_gt">处理时间超过（天）</option>
                    <option value="priority">优先级为</option>
                    <option value="field_eq">字段等于</option>
                    <option value="field_contains">字段包含</option>
                    <option value="field_gt">字段大于</option>
                    <option value="field_lt">字段小于</option>
                    <option value="time_diff_gt">时间差大于（天）</option>
                    <option value="time_diff_lt">时间差小于（天）</option>
                  </select>
                </Field>
                <Field label="条件值">
                  {selectedEdgeData.condition_type === 'status' ? (
                    <select value={selectedEdgeData.condition_value} onChange={e => { const ne = [...edges]; ne[selectedEdge] = { ...ne[selectedEdge], condition_value: e.target.value }; setEdges(ne); }} className="form-input">
                      {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  ) : selectedEdgeData.condition_type === 'priority' ? (
                    <select value={selectedEdgeData.condition_value} onChange={e => { const ne = [...edges]; ne[selectedEdge] = { ...ne[selectedEdge], condition_value: e.target.value }; setEdges(ne); }} className="form-input">
                      <option value="high">高</option><option value="medium">中</option><option value="low">低</option>
                    </select>
                  ) : selectedEdgeData.condition_type.startsWith('field_') ? (
                    <div className="space-y-2">
                      <select 
                        value={selectedEdgeData.condition_value?.split(':')[0] || ''}
                        onChange={e => {
                          const ne = [...edges];
                          const currentValue = ne[selectedEdge].condition_value || '';
                          const parts = currentValue.split(':');
                          const newValue = parts.length > 1 ? `${e.target.value}:${parts.slice(1).join(':')}` : e.target.value;
                          ne[selectedEdge] = { ...ne[selectedEdge], condition_value: newValue };
                          setEdges(ne);
                        }}
                        className="form-input"
                      >
                        <option value="">选择字段</option>
                        {FIELD_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <input 
                        value={selectedEdgeData.condition_value?.split(':').slice(1).join(':') || ''}
                        onChange={e => {
                          const ne = [...edges];
                          const currentValue = ne[selectedEdge].condition_value || '';
                          const parts = currentValue.split(':');
                          const newValue = parts[0] ? `${parts[0]}:${e.target.value}` : e.target.value;
                          ne[selectedEdge] = { ...ne[selectedEdge], condition_value: newValue };
                          setEdges(ne);
                        }}
                        className="form-input" 
                        placeholder="比较值"
                      />
                    </div>
                  ) : (
                    <input value={selectedEdgeData.condition_value} onChange={e => { const ne = [...edges]; ne[selectedEdge] = { ...ne[selectedEdge], condition_value: e.target.value }; setEdges(ne); }} className="form-input" placeholder="值" />
                  )}
                </Field>
                <button onClick={() => deleteEdge(selectedEdge)} className="btn btn-sm btn-danger w-full">删除此连线</button>
              </div>
            )}
            {!selectedNodeData && !selectedEdgeData && (
              <div className="text-center text-sm text-gray-400 py-8">
                点击节点或连线查看/编辑属性<br /><br />
                <span className="text-xs">
                  🟢 开始 · 🔵 任务 · 🟡 条件 · 🔴 结束<br />拖拽节点调整位置
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>{children}</div>;
}

export default function WorkflowDesignerPage() {
  return <Suspense fallback={<div className="p-6 text-gray-400">加载中...</div>}><WorkflowDesignerContent /></Suspense>;
}
