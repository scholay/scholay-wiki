import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import type { Paper } from '../../api/papers';

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  size: 'sm' | 'md' | 'lg';
  tone: 'root' | 'paper' | 'author';
}

interface GraphEdge {
  from: string;
  to: string;
  dashed?: boolean;
}

const CANVAS_ASPECT = 960 / 560;

function containBox(frameW: number, frameH: number) {
  if (frameW < 8 || frameH < 8) return { w: 0, h: 0 };
  const hFromW = frameW / CANVAS_ASPECT;
  if (hFromW <= frameH) return { w: frameW, h: Math.round(hFromW) };
  return { w: Math.round(frameH * CANVAS_ASPECT), h: frameH };
}

/** 文献图谱样式 mock —— 画布按 960:560 完整装进可用区域,节点与连线共用实测坐标 */
export function CitationGraphMock({ staged }: { staged: Paper[] }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      const w = Math.round(width);
      const h = Math.round(height);
      setFrame((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const box = useMemo(() => containBox(frame.w, frame.h), [frame.h, frame.w]);
  const nodes = useMemo(
    () => buildNodes(staged, box.w, box.h),
    [staged, box.h, box.w],
  );
  const edges = useMemo(() => buildEdges(nodes), [nodes]);
  const compact = Math.min(box.w, box.h) < 400;

  return (
    <div
      ref={frameRef}
      className="flex h-full min-h-0 w-full items-center justify-center"
    >
      <div
        className="relative overflow-hidden rounded-8 border border-border bg-[radial-gradient(circle_at_center,hsl(var(--surface-1))_0%,hsl(var(--surface-2))_100%)]"
        style={{ width: box.w, height: box.h }}
      >
      {box.w > 0 && box.h > 0 ? (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${box.w} ${box.h}`}
          preserveAspectRatio="none"
        >
          {edges.map((edge) => {
            const from = nodes.find((n) => n.id === edge.from);
            const to = nodes.find((n) => n.id === edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="currentColor"
                strokeWidth={edge.dashed ? 1.2 : 1.8}
                strokeDasharray={edge.dashed ? '5 4' : undefined}
                className="text-border-strong"
              />
            );
          })}
        </svg>
      ) : null}

      {nodes.map((node) => (
        <div
          key={node.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: node.x, top: node.y }}
        >
          <div
            className={cn(
              'mx-auto flex items-center justify-center rounded-pill border font-bold shadow-sm',
              nodeSizeClass(node.size, compact),
              node.tone === 'root' &&
                'border-brand-green/40 bg-brand-green-soft text-brand-green',
              node.tone === 'paper' &&
                'border-brand-red/30 bg-brand-red-soft text-brand-red',
              node.tone === 'author' &&
                'border-border bg-background text-subtle',
            )}
            title={node.label}
          >
            {node.label.slice(0, 2).toUpperCase()}
          </div>
          <div
            className="mt-1 truncate text-center text-2xs font-semibold text-subtle"
            style={{ maxWidth: compact ? 72 : 120 }}
          >
            {node.label}
          </div>
        </div>
      ))}

      <div className="absolute left-3 top-3 rounded-8 border border-border bg-background/90 px-3 py-2 text-2xs text-subtle backdrop-blur-sm">
        <div className="font-bold text-foreground">图谱图例</div>
        <div className="mt-1.5 space-y-1">
          <LegendDot tone="root" label="核心论文" />
          <LegendDot tone="paper" label="引用 / 被引" />
          <LegendDot tone="author" label="合作作者" />
        </div>
      </div>

      <div className="absolute bottom-3 right-3 rounded-8 border border-border bg-background/90 px-3 py-2 text-2xs text-subtle backdrop-blur-sm">
        {staged.length} 篇节点 · {edges.length} 条关联
      </div>
      </div>
    </div>
  );
}

function nodeSizeClass(size: GraphNode['size'], compact: boolean) {
  if (compact) {
    if (size === 'lg') return 'size-12 text-2xs';
    if (size === 'md') return 'size-9 text-2xs';
    return 'size-7 text-2xs';
  }
  if (size === 'lg') return 'size-16 text-2xs';
  if (size === 'md') return 'size-12 text-2xs';
  return 'size-9 text-2xs';
}

function LegendDot({
  tone,
  label,
}: {
  tone: GraphNode['tone'];
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'size-2.5 rounded-pill',
          tone === 'root' && 'bg-brand-green',
          tone === 'paper' && 'bg-brand-red',
          tone === 'author' && 'bg-muted-foreground',
        )}
      />
      {label}
    </div>
  );
}

function buildNodes(staged: Paper[], w: number, h: number): GraphNode[] {
  if (w < 8 || h < 8) return [];

  const padX = Math.min(96, Math.max(56, w * 0.16));
  const padY = Math.min(80, Math.max(48, h * 0.16));
  const cx = w / 2;
  const cy = h / 2;
  const rx = Math.max(28, w / 2 - padX);
  const ry = Math.max(28, h / 2 - padY);

  const root = staged[0];
  const nodes: GraphNode[] = [
    {
      id: 'root',
      label: shorten(root?.title ?? 'Core Paper', 28),
      x: cx,
      y: cy,
      size: 'lg',
      tone: 'root',
    },
  ];

  staged.slice(1, 5).forEach((paper, i) => {
    const n = Math.max(staged.length - 1, 1);
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      id: paper.paperId,
      label: shorten(paper.title ?? 'Paper', 22),
      x: cx + Math.cos(angle) * rx * 0.55,
      y: cy + Math.sin(angle) * ry * 0.55,
      size: 'md',
      tone: 'paper',
    });
  });

  const authorNames = [
    ...new Set(
      staged.flatMap((p) => (p.authors ?? []).map((a) => a.name).filter(Boolean)),
    ),
  ].slice(0, 4);

  authorNames.forEach((name, i) => {
    const n = Math.max(authorNames.length, 1);
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 1.6 + 0.2;
    nodes.push({
      id: `author-${i}`,
      label: name,
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
      size: 'sm',
      tone: 'author',
    });
  });

  if (nodes.length === 1) {
    const spots: Array<[number, number, GraphNode['size'], GraphNode['tone'], string, string]> = [
      [-0.7, -0.55, 'md', 'paper', 'p1', 'Related A'],
      [0.7, -0.55, 'md', 'paper', 'p2', 'Related B'],
      [0.7, 0.55, 'md', 'paper', 'p3', 'Related C'],
      [-0.7, 0.55, 'sm', 'author', 'a1', 'Author Hub'],
    ];
    for (const [dx, dy, size, tone, id, label] of spots) {
      nodes.push({
        id,
        label,
        x: cx + dx * rx,
        y: cy + dy * ry,
        size,
        tone,
      });
    }
  }

  return nodes;
}

function buildEdges(nodes: GraphNode[]): GraphEdge[] {
  const root = nodes.find((n) => n.id === 'root');
  if (!root) return [];

  const edges: GraphEdge[] = [];
  for (const node of nodes) {
    if (node.id === root.id) continue;
    edges.push({
      from: root.id,
      to: node.id,
      dashed: node.tone === 'author',
    });
  }
  return edges;
}

function shorten(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t || 'Untitled';
  return `${t.slice(0, max - 1)}…`;
}
