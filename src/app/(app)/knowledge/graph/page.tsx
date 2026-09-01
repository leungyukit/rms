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

export default function KnowledgeGraphPage() {
  const [data, setData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('');
  const [projects, setProjects] = useState<{ id: number; name: string }[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [size, setSize] = useState({ w: 900, h: 600 });
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

    const w = size.w, h = size.h;
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
  }, [size]);

  const runForceSimulation = (nodes: GraphNode[], edges: GraphEdge[], posMap: Map<string, { x: number; y: number }>, w: number, h: number) => {
    let tick = 0;
    const maxTicks = 300;
    const pos = new Map(posMap);
    nodes.forEach(n => { n.vx = 0; n.vy = 0; });

    const step = () => {
      tick++;
      const alpha = Math.max(0.01, 1 - tick / maxTicks);

      // 节点间排斥力（所有节点都强排斥，防止任何重叠）
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = pos.get(nodes[i].id)!, b = pos.get(nodes[j].id)!;
          let dx = a.x - b.x, dy = a.y - b.y;
          let dist = Math.sqrt(dx * dx + dy * dy) || 1;
          // 所有节点都用强排斥力，防止任何重叠
          const force = (500000 * Math.max(alpha, 0.3)) / (dist * dist);
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
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 200) * 0.004 * alpha;
        sn.vx = (sn.vx || 0) + (dx / dist) * force;
        sn.vy = (sn.vy || 0) + (dy / dist) * force;
        tn.vx = (tn.vx || 0) - (dx / dist) * force;
        tn.vy = (tn.vy || 0) - (dy / dist) * force;
      }

      // 中心引力（较弱）
      nodes.forEach(n => {
        const p = pos.get(n.id)!;
        n.vx = (n.vx || 0) + (w / 2 - p.x) * 0.0001 * alpha;
        n.vy = (n.vy || 0) + (h / 2 - p.y) * 0.0001 * alpha;
        // 阻尼
        n.vx = (n.vx || 0) * 0.85;
        n.vy = (n.vy || 0) * 0.85;
        p.x += n.vx || 0;
        p.y += n.vy || 0;
        // 最小间距保护：确保节点之间不会重叠
        const MIN_DIST = 55;
        for (const other of nodes) {
          if (other.id === n.id) continue;
          const op = pos.get(other.id)!;
          const ndx = p.x - op.x, ndy = p.y - op.y;
          const ndist = Math.sqrt(ndx * ndx + ndy * ndy) || 1;
          if (ndist < MIN_DIST) {
            const push = (MIN_DIST - ndist) * 1.0;
            p.x += (ndx / ndist) * push;
            p.y += (ndy / ndist) * push;
          }
        }
        p.x = Math.max(50, Math.min(w - 50, p.x));
        p.y = Math.max(50, Math.min(h - 50, p.y));
      });
      setPositions(new Map(pos));
      if (tick < maxTicks) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (containerRef.current) setSize({ w: containerRef.current.clientWidth, h: 600 });
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
            <svg width={size.w} height={size.h}
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
                const r = isHovered || isSelected ? 20 : 14;
                return (
                  <g key={node.id} style={{ cursor: 'pointer' }}>
                    <circle cx={p.x} cy={p.y} r={r + 4} fill="transparent" />
                    <circle cx={p.x} cy={p.y} r={r} fill={color} stroke={isSelected ? 'var(--node-sel)' : isHovered ? 'var(--card-bg)' : 'none'} strokeWidth={isSelected ? 3 : 2} />
                    <text x={p.x} y={p.y + r + 15} textAnchor="middle" fill="var(--foreground)" fontSize={11} fontWeight="bold">{node.label.length > 12 ? node.label.slice(0, 12) + '...' : node.label}</text>
                    <text x={p.x} y={p.y + r + 27} textAnchor="middle" fill="var(--muted-fg)" fontSize={9}>{NODE_TYPE_LABELS[node.type] || node.type}</text>
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
