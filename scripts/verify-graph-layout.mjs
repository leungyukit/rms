// 验证知识图谱标签防重叠算法：把 page.tsx 里的几何逻辑原样抄过来跑数值检验。
// 目的不是测 React，是回答一个问题：收敛后到底还有没有两个标签盒相交。

const NODE_R_ACTIVE = 20;
const LABEL_FONT = 11;
const TYPE_FONT = 9;
const MAX_LABEL_CHARS = 12;
const BOX_PAD = 7;

const NODE_TYPE_LABELS = {
  requirement: '需求', project: '项目', tag: '标签',
  person: '人员', business_unit: '业务方', knowledge: '知识',
};

function truncateLabel(label) {
  return label.length > MAX_LABEL_CHARS ? label.slice(0, MAX_LABEL_CHARS) + '...' : label;
}

function estimateTextWidth(text, fontSize) {
  let w = 0;
  for (const ch of text) {
    w += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFF60\u3000-\u303F]/.test(ch) ? fontSize : fontSize * 0.55;
  }
  return w;
}

function computeNodeBox(node) {
  const labelW = estimateTextWidth(truncateLabel(node.label), LABEL_FONT);
  const typeW = estimateTextWidth(NODE_TYPE_LABELS[node.type] || node.type, TYPE_FONT);
  const halfW = Math.max(NODE_R_ACTIVE, labelW / 2, typeW / 2) + BOX_PAD;
  const top = NODE_R_ACTIVE + 4;
  const bottom = NODE_R_ACTIVE + 27 + 5 + BOX_PAD;
  return { halfW, top, bottom, halfH: (top + bottom) / 2, offY: (bottom - top) / 2 };
}

function separateBoxes(nodes, pos, boxes, strength = 0.5) {
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
      if (ox <= 0 || oy <= 0) continue;
      overlapped = true;
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

/** 完整跑一遍模拟，返回收敛后仍相交的对数 */
function requiredHeight(nodes, w, minH) {
  let area = 0, maxBoxH = 0;
  for (const n of nodes) {
    const b = computeNodeBox(n);
    const bw = b.halfW * 2, bh = b.top + b.bottom;
    area += bw * bh;
    maxBoxH = Math.max(maxBoxH, bh);
  }
  // 目标填充率 32%：留足空隙给力学布局挪动，太满就必然挤压
  const needed = Math.ceil(area / (w * 0.32));
  return Math.max(minH, needed, maxBoxH + 40);
}

function simulate(nodes, edges, w, h) {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.4;
  const pos = new Map();
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, nodes.length);
    pos.set(n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  });
  nodes.forEach(n => { n.vx = 0; n.vy = 0; });

  const boxes = new Map();
  nodes.forEach(n => boxes.set(n.id, computeNodeBox(n)));

  const linkDist = (a, b) => {
    const ba = boxes.get(a.id), bb = boxes.get(b.id);
    return Math.max(200, ba.halfW + bb.halfW + 40);
  };
  const clamp = (id) => {
    const p = pos.get(id), b = boxes.get(id);
    p.x = Math.max(b.halfW, Math.min(w - b.halfW, p.x));
    p.y = Math.max(b.top, Math.min(h - b.bottom, p.y));
  };

  const maxTicks = 300;
  for (let tick = 1; tick <= maxTicks; tick++) {
    const alpha = Math.max(0.01, 1 - tick / maxTicks);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i].id), b = pos.get(nodes[j].id);
        const ba = boxes.get(nodes[i].id), bb = boxes.get(nodes[j].id);
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const want = ba.halfW + bb.halfW;
        const force = (want * want * 2.2 * Math.max(alpha, 0.3)) / (dist * dist);
        nodes[i].vx += (dx / dist) * force;
        nodes[i].vy += (dy / dist) * force;
        nodes[j].vx -= (dx / dist) * force;
        nodes[j].vy -= (dy / dist) * force;
      }
    }
    for (const edge of edges) {
      const a = pos.get(edge.source), b = pos.get(edge.target);
      if (!a || !b) continue;
      const sn = nodes.find(n => n.id === edge.source), tn = nodes.find(n => n.id === edge.target);
      if (!sn || !tn) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - linkDist(sn, tn)) * 0.004 * alpha;
      sn.vx += (dx / dist) * force; sn.vy += (dy / dist) * force;
      tn.vx -= (dx / dist) * force; tn.vy -= (dy / dist) * force;
    }
    nodes.forEach(n => {
      const p = pos.get(n.id);
      n.vx += (w / 2 - p.x) * 0.0001 * alpha;
      n.vy += (h / 2 - p.y) * 0.0001 * alpha;
      n.vx *= 0.85; n.vy *= 0.85;
      p.x += n.vx; p.y += n.vy;
    });
    for (let k = 0; k < 4; k++) separateBoxes(nodes, pos, boxes, 0.5);
    nodes.forEach(n => clamp(n.id));
  }
  for (let k = 0; k < 600; k++) {
    const still = separateBoxes(nodes, pos, boxes, 1);
    nodes.forEach(n => clamp(n.id));
    if (!still) break;
  }

  // 独立检查：不复用 separateBoxes，重新算一遍相交
  let bad = 0; let worst = null;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = pos.get(nodes[i].id), b = pos.get(nodes[j].id);
      const ba = boxes.get(nodes[i].id), bb = boxes.get(nodes[j].id);
      const ox = ba.halfW + bb.halfW - Math.abs(b.x - a.x);
      const oy = ba.halfH + bb.halfH - Math.abs((b.y + bb.offY) - (a.y + ba.offY));
      if (ox > 0 && oy > 0) {
        bad++;
        const overlap = Math.min(ox, oy);
        if (!worst || overlap > worst.overlap) {
          worst = { overlap, a: nodes[i].label, b: nodes[j].label };
        }
      }
    }
  }
  // 越界检查
  let oob = 0;
  for (const n of nodes) {
    const p = pos.get(n.id), b = boxes.get(n.id);
    if (p.x - b.halfW < -0.5 || p.x + b.halfW > w + 0.5 || p.y - b.top < -0.5 || p.y + b.bottom > h + 0.5) oob++;
  }
  return { bad, worst, oob };
}

// ── 造测试数据 ────────────────────────────────────────────────
const TYPES = ['requirement', 'project', 'tag', 'person', 'business_unit', 'knowledge'];
function makeNodes(count, labelMaker) {
  return Array.from({ length: count }, (_, i) => ({
    id: 'n' + i, type: TYPES[i % TYPES.length], label: labelMaker(i),
  }));
}
function chainEdges(nodes, density = 1) {
  const edges = [];
  for (let i = 1; i < nodes.length; i++) {
    edges.push({ source: nodes[i - 1].id, target: nodes[i].id, type: '关联' });
  }
  for (let i = 0; i < nodes.length * density; i++) {
    const a = nodes[i % nodes.length], b = nodes[(i * 7 + 3) % nodes.length];
    if (a.id !== b.id) edges.push({ source: a.id, target: b.id, type: '关联' });
  }
  return edges;
}

const cases = [
  { name: '10 节点 / 短中文标签', nodes: makeNodes(10, i => `标签${i}`), w: 900, h: 600 },
  { name: '20 节点 / 长中文标签（会被截断）', nodes: makeNodes(20, i => `这是一个很长的需求名称编号${i}`), w: 900, h: 600 },
  { name: '30 节点 / 混合中英', nodes: makeNodes(30, i => (i % 2 ? `需求管理系统${i}` : `Requirement-${i}`)), w: 900, h: 600 },
  { name: '40 节点 / 全部同名（最坏情况）', nodes: makeNodes(40, () => '完全相同的标签'), w: 900, h: 600 },
  { name: '15 节点 / 窄画布 600x600', nodes: makeNodes(15, i => `业务方名称${i}`), w: 600, h: 600 },
  { name: '60 节点 / 密集边', nodes: makeNodes(60, i => `节点${i}`), w: 1200, h: 600 },
];

let failures = 0;
console.log('知识图谱标签防重叠验证\n' + '='.repeat(60));
for (const c of cases) {
  const edges = chainEdges(c.nodes, 1);
  const h = requiredHeight(c.nodes, c.w, c.h);
  const t0 = Date.now();
  const { bad, worst, oob } = simulate(c.nodes, edges, c.w, h);
  const ms = Date.now() - t0;
  const ok = bad === 0 && oob === 0;
  if (!ok) failures++;
  console.log(`${ok ? '✅' : '❌'} ${c.name}`);
  console.log(`     节点=${c.nodes.length} 边=${edges.length} 画布=${c.w}x${h} 重叠对=${bad} 越界=${oob} 耗时=${ms}ms`);
  if (worst) console.log(`     最严重重叠 ${worst.overlap.toFixed(1)}px: "${worst.a}" vs "${worst.b}"`);
}
console.log('='.repeat(60));
console.log(failures === 0 ? '全部通过：收敛后无标签重叠、无越界' : `${failures} 个场景失败`);
process.exit(failures === 0 ? 0 : 1);
