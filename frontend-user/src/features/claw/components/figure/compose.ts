/**
 * 隔室细胞图渲染器 —— FigureSpec(配方,无坐标)→ 分层隔室的静态 SVG。
 * 细胞外/膜/胞质/细胞器/核 按生物学顺序分层背景 + 专业图标按区摆 + 区内 elkjs 子布局 + 跨区信号箭头。
 * 与 scripts 端的 compose-figure.mjs 同逻辑(测试用那份)。产物是自包含 SVG 字符串(经 SafeSvg 清洗后注入/下载)。
 */
import ELK from 'elkjs/lib/elk.bundled.js';
import { getIcon, ensureExtraIcons } from './icon-registry';
import type { FigureSpec, FigEntity, CompartmentKind } from './figure-spec';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const elk = new (ELK as any)();

const R = (n: number) => Math.round(n);
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const COLORS: Record<string, { fill: string; stroke: string }> = {
  blue: { fill: '#eef2ff', stroke: '#3b5bdb' }, green: { fill: '#eaf3ee', stroke: '#2f8f4e' },
  orange: { fill: '#fdeede', stroke: '#d9822b' }, purple: { fill: '#f3e8ff', stroke: '#7048e8' },
  yellow: { fill: '#fff4d6', stroke: '#d4a017' }, red: { fill: '#fdecea', stroke: '#c0392b' },
  teal: { fill: '#e6f7f4', stroke: '#0d9488' }, gray: { fill: '#eef1f4', stroke: '#94a3b8' },
};
const BAND: Record<string, { fill: string; stroke: string; lab: string }> = {
  extracellular: { fill: '#eaf1fb', stroke: '#c7d8f0', lab: '#6b86b0' },
  cytoplasm: { fill: '#f1f7f2', stroke: '#cfe0d4', lab: '#5c8a6a' },
  organelle: { fill: '#fef6ec', stroke: '#efd9bd', lab: '#b08a3a' },
  region: { fill: '#f5f6f8', stroke: '#dfe3e8', lab: '#7a828c' },
  nucleus: { fill: '#f3ecfb', stroke: '#c9b6ea', lab: '#8a6fc0' },
};
const ORDER: Record<CompartmentKind, number> = { extracellular: 0, membrane: 1, cytoplasm: 2, organelle: 3, region: 4, nucleus: 5 };

const MARGIN = 40, INNER = 960, W = INNER + MARGIN * 2;

function esize(e: FigEntity) {
  if (e.iconKey || e.kind === 'icon') return { w: 66, h: 84 };
  const chars = (e.label ?? '').length;
  return { w: Math.max(96, Math.min(190, chars * 15 + 34)), h: 46 };
}
function iconSvg(key: string, x: number, y: number, w: number, h: number): string {
  const src = getIcon(key)?.svg;
  if (!src) return '';
  const vb = src.match(/viewBox\s*=\s*"([^"]+)"/i)?.[1] ?? '0 0 64 64';
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
  return `<svg x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" viewBox="${vb}" overflow="visible">${inner}</svg>`;
}
type Box = { x: number; y: number; w: number; h: number };
function renderEntity(e: FigEntity, b: Box): string {
  if (e.iconKey || e.kind === 'icon') {
    const iw = 58, ih = 58, ix = b.x + (b.w - iw) / 2;
    const ic = e.iconKey ? iconSvg(e.iconKey, ix, b.y, iw, ih) : '';
    const lab = e.label ? `<text x="${R(b.x + b.w / 2)}" y="${R(b.y + ih + 16)}" text-anchor="middle" font-size="12.5" fill="#374151">${esc(e.label)}</text>` : '';
    return ic + lab;
  }
  const c = COLORS[e.color ?? ''] ?? COLORS.gray;
  return `<rect x="${R(b.x)}" y="${R(b.y)}" width="${R(b.w)}" height="${R(b.h)}" rx="9" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>` +
    `<text x="${R(b.x + b.w / 2)}" y="${R(b.y + b.h / 2 + 5)}" text-anchor="middle" font-size="14.5" font-weight="600" fill="#1f2937">${esc(e.label)}</text>`;
}
function boundary(b: Box, tx: number, ty: number) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const s = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * s, y: cy + dy * s };
}

type Pos = { rx?: number; ry?: number; w: number; h: number };
async function subLayout(ents: FigEntity[], edges: FigureSpec['edges']): Promise<{ pos: Record<string, Pos>; w: number; h: number }> {
  if (!ents.length) return { pos: {}, w: 0, h: 0 };
  if (ents.length === 1) { const s = esize(ents[0]); return { pos: { [ents[0].id]: { w: s.w, h: s.h } }, w: s.w, h: s.h }; }
  const ids = new Set(ents.map((e) => e.id));
  const internal = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const graph = {
    id: 'r',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'DOWN', 'elk.spacing.nodeNode': '42', 'elk.layered.spacing.nodeNodeBetweenLayers': '52', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES' },
    children: ents.map((e) => { const s = esize(e); return { id: e.id, width: s.w, height: s.h }; }),
    edges: internal.map((e, i) => ({ id: 'se' + i, sources: [e.source], targets: [e.target] })),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let res: any;
  try {
    res = await elk.layout(graph);
  } catch {
    // 退化:竖排
    const pos: Record<string, Pos> = {};
    let y = 0, w = 0;
    for (const e of ents) { const s = esize(e); pos[e.id] = { rx: 0, ry: y, w: s.w, h: s.h }; y += s.h + 40; w = Math.max(w, s.w); }
    return { pos, w, h: y };
  }
  const pos: Record<string, Pos> = {};
  let w = 0, h = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const c of res.children as any[]) { pos[c.id] = { rx: c.x, ry: c.y, w: c.width, h: c.height }; w = Math.max(w, c.x + c.width); h = Math.max(h, c.y + c.height); }
  return { pos, w, h };
}

export async function composeFigure(spec: FigureSpec): Promise<string> {
  await ensureExtraIcons(); // 保证 bioicons 的 iconKey 可解析
  const comps = [...(spec.compartments ?? [])].sort((a, c) => (ORDER[a.kind] ?? 4) - (ORDER[c.kind] ?? 4));
  const entsByComp = new Map<string, FigEntity[]>();
  for (const e of spec.entities ?? []) { const a = entsByComp.get(e.compartment) ?? []; a.push(e); entsByComp.set(e.compartment, a); }
  const edges = spec.edges ?? [];
  const box = new Map<string, Box>();
  const parts: string[] = [];
  const bandRects: string[] = [];
  let y = spec.subtitle ? 84 : 70;

  for (const comp of comps) {
    const ents = entsByComp.get(comp.id) ?? [];
    if (comp.kind === 'membrane') {
      const memH = 48, memY = y;
      bandRects.push(`<rect x="${MARGIN}" y="${memY}" width="${INNER}" height="${memH}" fill="${BAND.organelle.fill}" stroke="${BAND.organelle.stroke}" stroke-width="1"/>`);
      const heads = Math.floor(INNER / 32);
      for (let i = 0; i < heads; i++) {
        const cx = MARGIN + 18 + i * 32;
        bandRects.push(`<circle cx="${cx}" cy="${memY + 9}" r="6" fill="#f0c674" stroke="#c9962a" stroke-width="0.8"/><line x1="${cx}" y1="${memY + 15}" x2="${cx}" y2="${memY + 23}" stroke="#c9962a" stroke-width="1.2"/><circle cx="${cx}" cy="${memY + memH - 9}" r="6" fill="#f0c674" stroke="#c9962a" stroke-width="0.8"/><line x1="${cx}" y1="${memY + memH - 15}" x2="${cx}" y2="${memY + memH - 23}" stroke="#c9962a" stroke-width="1.2"/>`);
      }
      bandRects.push(`<text x="${W - MARGIN - 12}" y="${memY + 29}" text-anchor="end" font-size="12" font-weight="600" fill="${BAND.organelle.lab}">${esc(comp.label ?? '细胞膜')}</text>`);
      const n = ents.length;
      ents.forEach((e, i) => {
        const rw = 42, rh = 78, gap = 150;
        const totalW = n * rw + (n - 1) * gap;
        const startX = MARGIN + (INNER - totalW) / 2;
        const rx = startX + i * (rw + gap), ry = memY + memH / 2 - rh / 2;
        box.set(e.id, { x: rx, y: ry, w: rw, h: rh });
        parts.push(iconSvg(e.iconKey || 'membrane_receptor', rx, ry, rw, rh));
        if (e.label) parts.push(`<text x="${R(rx + rw / 2)}" y="${R(memY + memH + 16)}" text-anchor="middle" font-size="12" fill="#374151">${esc(e.label)}</text>`);
      });
      y = memY + memH + (n ? 22 : 0);
      continue;
    }
    const lay = await subLayout(ents, edges);
    const isNuc = comp.kind === 'nucleus';
    const padTop = 34, padSide = 40, padBot = isNuc ? 30 : 24;
    const bandH = lay.h + padTop + padBot;
    const bandY = y;
    const contentX = MARGIN + Math.max(padSide, (INNER - lay.w) / 2);
    const contentY = bandY + padTop;
    const bstyle = BAND[comp.kind] ?? BAND.region;
    if (isNuc) {
      const cx = W / 2, cy = bandY + bandH / 2, rx = Math.min(INNER / 2, lay.w / 2 + 90), ry = bandH / 2;
      bandRects.push(`<ellipse cx="${R(cx)}" cy="${R(cy)}" rx="${R(rx)}" ry="${R(ry)}" fill="${bstyle.fill}" stroke="${bstyle.stroke}" stroke-width="1.5"/>`);
      bandRects.push(`<text x="${R(cx - rx + 22)}" y="${R(bandY + 24)}" font-size="12" font-weight="600" fill="${bstyle.lab}">${esc(comp.label ?? '细胞核')}</text>`);
    } else {
      bandRects.push(`<rect x="${MARGIN}" y="${R(bandY)}" width="${INNER}" height="${R(bandH)}" rx="${comp.kind === 'extracellular' ? 10 : 0}" fill="${bstyle.fill}" stroke="${bstyle.stroke}" stroke-width="1"/>`);
      bandRects.push(`<text x="${MARGIN + 16}" y="${R(bandY + 22)}" font-size="12" font-weight="600" fill="${bstyle.lab}">${esc(comp.label ?? '')}</text>`);
    }
    for (const e of ents) {
      const p = lay.pos[e.id];
      if (!p) continue;
      const b = { x: contentX + (p.rx ?? (lay.w - p.w) / 2), y: contentY + (p.ry ?? 0), w: p.w, h: p.h };
      box.set(e.id, b);
      parts.push(renderEntity(e, b));
    }
    y = bandY + bandH + 16;
  }

  const edgeParts: string[] = [];
  for (const e of edges) {
    const s = box.get(e.source), t = box.get(e.target);
    if (!s || !t) continue;
    const sp = boundary(s, t.x + t.w / 2, t.y + t.h / 2), tp = boundary(t, s.x + s.w / 2, s.y + s.h / 2);
    const inhibit = e.type === 'inhibit';
    const col = inhibit ? '#c0392b' : e.type === 'transport' ? '#7048e8' : '#4b5563';
    const dash = e.type === 'transport' ? ' stroke-dasharray="6 4"' : '';
    edgeParts.push(`<path d="M${R(sp.x)},${R(sp.y)} L${R(tp.x)},${R(tp.y)}" fill="none" stroke="${col}" stroke-width="2.1"${dash} marker-end="url(#${inhibit ? 'tbar' : 'ah'})"/>`);
    if (e.label) edgeParts.push(`<text x="${R((sp.x + tp.x) / 2)}" y="${R((sp.y + tp.y) / 2 - 4)}" text-anchor="middle" font-size="11.5" fill="#6b7280">${esc(e.label)}</text>`);
  }

  const H = y + 20;
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${R(H)}" width="${W}" height="${R(H)}" font-family="'Helvetica Neue','Segoe UI',Arial,'Noto Serif SC','Songti SC',SimSun,'Source Han Serif SC','Noto Serif CJK SC',system-ui,serif">`];
  out.push(`<defs><marker id="ah" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#4b5563"/></marker><marker id="tbar" markerWidth="10" markerHeight="12" refX="1" refY="6" orient="auto"><line x1="1" y1="1" x2="1" y2="11" stroke="#c0392b" stroke-width="2.4"/></marker></defs>`);
  out.push(`<rect x="0" y="0" width="${W}" height="${R(H)}" fill="#ffffff"/>`);
  if (spec.title) out.push(`<text x="${W / 2}" y="40" text-anchor="middle" font-size="23" font-weight="700" fill="#111">${esc(spec.title)}</text>`);
  if (spec.subtitle) out.push(`<text x="${W / 2}" y="62" text-anchor="middle" font-size="13" fill="#9aa0a6">${esc(spec.subtitle)}</text>`);
  out.push(bandRects.join('\n'), edgeParts.join('\n'), parts.join('\n'));
  out.push(`</svg>`);
  return out.join('\n');
}
