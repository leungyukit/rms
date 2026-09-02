'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

interface GraphNode { id: string; type: string; label: string; x?: number; y?: number; vx?: number; vy?: number; }
interface GraphEdge { source: string; target: string; type: string; }

// 图谱节点色：走 --chart-* token（节点类型本质也是「多系列区分」，跟图表同一套色盘）。
// 深浅两套自动跟随；保留多色相是故意的 —— 6 种节点全刷成绿色深浅就分不出类型了。
const NODE_COLORS: Record<string, string> = {
  requirement: 'var(--chart-2)', project: 'var(--chart-5)', tag: 'var(--chart-3)',
  person: 'var(--chart-4)', business_unit: 'var(--chart-6)', knowledge: 'var(--chart-1)',
};
const NODE_FALLBACK = 'var(--node-default)';

const NODE_TYPE_LABELS: Record<string, string> = {
  requirement: '需求', project: '项目', tag: '标签',
  person: '人员', business_unit: '业务方', knowledge: '知识',
};

// ── 标签防重叠（2026-09-02）──────────────────────────────
// 旧实现只防「节点圆」重叠（MIN_DIST=55），但真正占地方的是圆下方那
// 两行文字：12 个中文 @11px 宽约 132px，圆心间距 55px 根本不够 —— 标签必叠。
// 所以改成拿【包围盒】做分离，而不是圆心距。
const NODE_R = 14;
const NODE_R_ACTIVE = 20; // hover/选中会变大，用大的算才不会一 hover 就撞上
const LABEL_FONT = 11;
const TYPE_FONT = 9;
const MAX_LABEL_CHARS = 12;
const BOX_PAD = 7; // 盒子四周留白，避免文字“贴”在一起
const MIN_CANVAS_H = 600; // 画布最小高度；节点多时由 requiredHeight() 往下拉

/** 渲染和测量必须用同一个截断结果，不然盒子宽度算的不是屏上真实文字 */
function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_CHARS ? label.slice(0, MAX_LABEL_CHARS) + '...' : label;
}

/**
 * 估算文本宽度。SVG 里要拿准宽度得用 getComputedTextLength()，但那要先渲染、
 * 且每 tick 读一遍会持续触发 layout。这里用字符宽度估算：
 * CJK/全角 ≈ 1.0em，其余 ASCII ≈ 0.55em。寍一点不亏。
 */
function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\u3000-\u303F]/.test(ch) ? fontSize : fontSize * 0.55;
  }
  return w;
}

interface NodeBox {
  halfW: number; // 以圆心为基准的半宽（取圆、主标签、类型标签里最宽的）
  top: number;   // 圆心向上延伸
  bottom: number; // 圆心向下延伸（要盖住两行标签）
  halfH: number;
  offY: number;  // 盒子中心相对圆心的 y 偏移（标签在下方，所以盒子重心偏下）
}

/** 节点占地盒：圆 + 下方两行标签 */
function computeNodeBox(node: GraphNode): NodeBox {
  const labelW = estimateTextWidth(truncateLabel(node.label), LABEL_FONT);
  const typeW = estimateTextWidth(NODE_TYPE_LABELS[node.type] || node.type, TYPE_FONT);
  const halfW = Math.max(NODE_R_ACTIVE, labelW / 2, typeW / 2) + BOX_PAD;
  const top = NODE_R_ACTIVE + 4;
  // 渲染时两行标签在 y+r+15 和 y+r+27，9px 字体再往下约 4px
  const bottom = NODE_R_ACTIVE + 27 + 5 + BOX_PAD;
  return { halfW, top, bottom, halfH: (top + bottom) / 2, offY: (bottom - top) / 2 };
}

/**
 * 画布需要多高。
 *
 * 节点多 + 标签长时，900x600 里盒子总面积能占到画布 56%，
 * 那种密度下硬分离迭代再多也收敛不了（实测 40 个同名节点仍余 8 对重叠）。
 * 所以画布高度按内容动态给：目标填充率 32%，留足空隙让力学布局挪得开。
 */
function requiredHeight(nodes: GraphNode[], w: number, minH: number): number {
  let area = 0, maxBoxH = 0;
  for (const n of nodes) {
    const b = computeNodeBox(n);
    const bh = b.top + b.bottom;
    area += b.halfW * 2 * bh;
    maxBoxH = Math.max(maxBoxH, bh);
  }
  const needed = Math.ceil(area / (w * 0.32));
  return Math.max(minH, needed, maxBoxH + 40);
}

/**
 * 硬分离：任意两个盒子重叠就沿「需要移动最少」的轴推开。
 * 这是保证不重叠的关键 —— 光靠弹力/斥力只能「倾向于」不重叠，不能保证。
 * 返回是否还有重叠（供调用方判断能不能提前收工）。
 */
function separateBoxes(
  nodes: GraphNode[],
  pos: Map<string, { x: number; y: number }>,
  boxes: Map<string, NodeBox>,
  strength = 0.5
): boolean {
  let overlapped = false;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = pos.get(nodes[i].id), b = pos.get(nodes[j].id);
      const ba = boxes.get(nodes[i].id), bb = boxes.get(nodes[j].id);
      if (!a || !b || !ba || !bb) continue;

      const dx = b.x - a.x;
      const dy = (b.y + bb.offY) - (a.y + ba.offY);
      const ox = ba.halfW + bb.halfW - Math.abs(dx);
      const oy = ba.halfH + bb.halfH - Math.abs(dy);
      if (ox <= 0 || oy <= 0) continue; // 某一轴已分开 = 不重叠

      overlapped = true;
      // 完全重合时方向不确定，给个确定性微扰动把它们弹开
      if (dx === 0 && dy === 0) {
        const jitter = 0.5 + i * 0.01;
        a.x -= jitter; b.x += jitter;
        continue;
      }
      if (ox < oy) {
        const push = (ox / 2 + 0.5) * strength * (dx >= 0 ? 1 : -1);
        a.x -= push; b.x += push;
      } else {
        const push = (oy / 2 + 0.5) * strength * (dy >= 0 ? 1 : -1);
        a.y -= push; b.y += push;
      }
    }
  }
  return overlapped;
}

export default function KnowledgeGraphPage() {
  const [data, setData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('');
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  // 宽度跟容器走；高度按内容算（节点多/标签长就往下长），不然密度一高就必叠
  const [size, setSize] = useState({ w: 900 });
  const [canvasH, setCanvasH] = useState(MIN_CANVAS_H);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const animRef = useRef<number>(0);

  const fetchGraph = useCallback(async (s: string) => {
    setLoading(true);
    let d: { nodes: GraphNode[]; edges: GraphEdge[] } = { nodes: [], edges: [] };
    try {
      const params = s ? `?scope=${s}` : '';
      const res = await fetch(`/api/knowledge/graph${params}`);
      if (!res.ok) {
        const text = await res.text().catch(() => '请求失败');
        console.error('Graph API error:', res.status, text);
      } else {
        const text = await res.text();
        d = text ? JSON.parse(text) : { nodes: [], edges: [] };
      }
    } catch (e) {
      console.error('Graph fetch failed:', e);
    }
    setData(d);

    const w = size.w;
    // 先算高度再摆初始位置 —— 初始圆环的半径跟画布尺寸有关
    const h = requiredHeight(d.nodes, w, MIN_CANVAS_H);
    setCanvasH(h);
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.40;
    const newPos = new Map<string, { x: number; y: number }>();
    d.nodes.forEach((n: GraphNode, i: number) => {
      const angle = (2 * Math.PI * i) / Math.max(1, d.nodes.length);
      newPos.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    });
    setPositions(newPos);
    setLoading(false);
    runForceSimulation(d.nodes, d.edges, newPos, w, h);
  }, [size.w]);

  const runForceSimulation = (nodes: GraphNode[], edges: GraphEdge[], posMap: Map<string, { x: number; y: number }>, w: number, h: number) => {
    let tick = 0;
    const maxTicks = 300;
    const pos = new Map(posMap);
    nodes.forEach(n => { n.vx = 0; n.vy = 0; });

    // 包围盒只跟 label/type 有关，模拟期间不变 —— 算一次就够，别每 tick 重算
    const boxes = new Map<string, NodeBox>();
    nodes.forEach(n => boxes.set(n.id, computeNodeBox(n)));

    // 边的目标长度要大于两端盒子的半宽之和，否则弹簧一直把已分离的节点拽回去打架
    const linkDist = (a: GraphNode, b: GraphNode) => {
      const ba = boxes.get(a.id)!, bb = boxes.get(b.id)!;
      return Math.max(200, ba.halfW + bb.halfW + 40);
    };

    const clamp = (id: string) => {
      const p = pos.get(id)!, b = boxes.get(id)!;
      // 用盒子边界夹，避免标签被画到画布外面（旧代码固定夹 50，长标签会被裁）
      p.x = Math.max(b.halfW, Math.min(w - b.halfW, p.x));
      p.y = Math.max(b.top, Math.min(h - b.bottom, p.y));
    };

    const step = () => {
      tick++;
      const alpha = Math.max(0.01, 1 - tick / maxTicks);

      // 节点间排斥力：按盒子尺寸缩放，大标签的节点需要更大地盘
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = pos.get(nodes[i].id)!, b = pos.get(nodes[j].id)!;
          const ba = boxes.get(nodes[i].id)!, bb = boxes.get(nodes[j].id)!;
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const want = ba.halfW + bb.halfW;
          const force = (want * want * 2.2 * Math.max(alpha, 0.3)) / (dist * dist);
          nodes[i].vx = (nodes[i].vx || 0) + (dx / dist) * force;
          nodes[i].vy = (nodes[i].vy || 0) + (dy / dist) * force;
          nodes[j].vx = (nodes[j].vx || 0) - (dx / dist) * force;
          nodes[j].vy = (nodes[j].vy || 0) - (dy / dist) * force;
        }
      }

      // 边弹簧吸引力
      for (const edge of edges) {
        const a = pos.get(edge.source), b = pos.get(edge.target);
        if (!a || !b) continue;
        const sn = nodes.find(n => n.id === edge.source), tn = nodes.find(n => n.id === edge.target);
        if (!sn || !tn) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - linkDist(sn, tn)) * 0.004 * alpha;
        sn.vx = (sn.vx || 0) + (dx / dist) * force;
        sn.vy = (sn.vy || 0) + (dy / dist) * force;
        tn.vx = (tn.vx || 0) - (dx / dist) * force;
        tn.vy = (tn.vy || 0) - (dy / dist) * force;
      }

      // 中心引力（较弱）+ 阻尼 + 位移
      nodes.forEach(n => {
        const p = pos.get(n.id)!;
        n.vx = (n.vx || 0) + (w / 2 - p.x) * 0.0001 * alpha;
        n.vy = (n.vy || 0) + (h / 2 - p.y) * 0.0001 * alpha;
        n.vx = (n.vx || 0) * 0.85;
        n.vy = (n.vy || 0) * 0.85;
        p.x += n.vx || 0;
        p.y += n.vy || 0;
      });

      // 硬分离：力只能「倾向于」不重叠，保证不重叠得靠这个。多迭代几轮解连锁挤压
      for (let k = 0; k < 4; k++) separateBoxes(nodes, pos, boxes, 0.5);
      nodes.forEach(n => clamp(n.id));

      setPositions(new Map(pos));

      if (tick < maxTicks) {
        animRef.current = requestAnimationFrame(step);
      } else {
        // 收尾：夹边界可能又压出重叠，再多跑几轮直到干净（有上限，别死循环）
        for (let k = 0; k < 600; k++) {
          const still = separateBoxes(nodes, pos, boxes, 1);
          nodes.forEach(n => clamp(n.id));
          if (!still) break;
        }
        setPositions(new Map(pos));
      }
    };
    animRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (containerRef.current) setSize({ w: containerRef.current.clientWidth });
  }, []);

  useEffect(() => { fetchGraph(scope); return () => cancelAnimationFrame(animRef.current); }, [scope, fetchGraph]);

  useEffect(() => {
    fetch('/api/projects', { credentials: 'include' })
      .then(r => r.json())
      .then(data => setProjects(data.projects || data || []))
      .catch(() => setProjects([]));
  }, []);

  const getNodeId = (e: React.MouseEvent): string | null => {
    const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect();
    if (!rect) return null;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    for (const [id, p] of positions) {
      const dx = mx - p.x, dy = my - p.y;
      if (dx * dx + dy * dy < 400) return id;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const id = getNodeId(e);
    if (id) {
      const p = positions.get(id)!;
      const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
      dragRef.current = { id, ox: e.clientX - rect.left - p.x, oy: e.clientY - rect.top - p.y };
      setSelectedId(id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) {
      const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
      const newPositions = new Map(positions);
      newPositions.set(dragRef.current.id, { x: e.clientX - rect.left - dragRef.current.ox, y: e.clientY - rect.top - dragRef.current.oy });
      setPositions(newPositions);
    } else {
      setHoveredId(getNodeId(e));
    }
  };

  const handleMouseUp = () => { dragRef.current = null; };

  const selectedNode = data.nodes.find(n => n.id === selectedId);
  const hoveredNode = data.nodes.find(n => n.id === hoveredId);

  return (
    <div className="p-6 max-w-6xl">
      <div className="page-header">
        <h1>🕸️ 知识图谱</h1>
        <p>可视化展示需求、项目、知识、标签之间的关联</p>
      </div>

      <div className="flex gap-2 mb-4">
        <select value={scope} onChange={e => setScope(e.target.value)} className="form-input">
          <option value="">全局视图</option>
          {projects.map(p => (
            <option key={p.id} value={`project:${p.id}`}>{p.name}</option>
          ))}
        </select>
        <Link href="/knowledge" className="btn btn-secondary">← 返回</Link>
        <div className="flex gap-3 ml-auto items-center">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded-full" style={{ background: color }} />
              {NODE_TYPE_LABELS[type] || type}
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="card-body text-center text-gray-400 py-20">加载中...</div></div>
      ) : data.nodes.length === 0 ? (
        <div className="card"><div className="card-body text-center text-gray-400 py-20">暂无图谱数据</div></div>
      ) : (
        <div ref={containerRef} className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <svg width={size.w} height={canvasH}
              className="w-full cursor-grab select-none"
              onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp} onMouseLeave={() => { handleMouseUp(); setHoveredId(null); }}>
              {data.edges.map((edge, i) => {
                const s = positions.get(edge.source), t = positions.get(edge.target);
                if (!s || !t) return null;
                return <g key={i}><line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="var(--border-c)" strokeWidth={1.5} /><text x={(s.x + t.x) / 2} y={(s.y + t.y) / 2 - 6} textAnchor="middle" fill="var(--muted-fg)" fontSize={9}>{edge.type}</text></g>;
              })}
              {data.nodes.map(node => {
                const p = positions.get(node.id);
                if (!p) return null;
                const color = NODE_COLORS[node.type] || NODE_FALLBACK;
                const isHovered = hoveredId === node.id, isSelected = selectedId === node.id;
                const r = isHovered || isSelected ? NODE_R_ACTIVE : NODE_R;
                return (
                  <g key={node.id} style={{ cursor: 'pointer' }}>
                    <circle cx={p.x} cy={p.y} r={r + 4} fill="transparent" />
                    <circle cx={p.x} cy={p.y} r={r} fill={color} stroke={isSelected ? 'var(--node-sel)' : isHovered ? 'var(--card-bg)' : 'none'} strokeWidth={isSelected ? 3 : 2} />
                    <text x={p.x} y={p.y + r + 15} textAnchor="middle" fill="var(--foreground)" fontSize={LABEL_FONT} fontWeight="bold">{truncateLabel(node.label)}</text>
                    <text x={p.x} y={p.y + r + 27} textAnchor="middle" fill="var(--muted-fg)" fontSize={TYPE_FONT}>{NODE_TYPE_LABELS[node.type] || node.type}</text>
                  </g>
                );
              })}
              {hoveredNode && !dragRef.current && (() => {
                const p = positions.get(hoveredNode.id);
                if (!p) return null;
                return (
                  <g><rect x={p.x + 22} y={p.y - 18} width={220} height={36} rx={6} fill="var(--tooltip-bg)" stroke="var(--border-c)" />
                    <text x={p.x + 32} y={p.y - 1} fill="var(--tooltip-fg)" fontSize={12} fontWeight="bold">{hoveredNode.label.length > 20 ? hoveredNode.label.slice(0, 20) + '...' : hoveredNode.label}</text>
                    <text x={p.x + 32} y={p.y + 14} fill="var(--tooltip-muted)" fontSize={10}>{NODE_TYPE_LABELS[hoveredNode.type] || hoveredNode.type}</text>
                  </g>
                );
              })()}
            </svg>
          </div>
        </div>
      )}

      {selectedNode && (
        <div className="card mt-4">
          <div className="card-body">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS[selectedNode.type] || NODE_FALLBACK }} />
              <span className="text-xs text-gray-500">{NODE_TYPE_LABELS[selectedNode.type] || selectedNode.type}</span>
            </div>
            <h3 className="font-bold text-gray-900">{selectedNode.label}</h3>
            <p className="text-xs text-gray-400 mt-1">ID: {selectedNode.id}</p>
          </div>
        </div>
      )}
    </div>
  );
}
