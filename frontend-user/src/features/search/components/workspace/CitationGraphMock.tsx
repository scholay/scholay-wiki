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

/** 文献图谱样式 mock —— 静态节点 + 连线 */
export function CitationGraphMock({ staged }: { staged: Paper[] }) {
  const nodes = buildNodes(staged);
  const edges = buildEdges(nodes);

  return (
    <div className="relative h-full min-h-[520px] w-full overflow-hidden rounded-lg border border-border bg-[radial-gradient(circle_at_center,#fafafa_0%,#f3f4f6_100%)]">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 960 560"
        preserveAspectRatio="xMidYMid meet"
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

      {nodes.map((node) => (
        <div
          key={node.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(node.x / 960) * 100}%`, top: `${(node.y / 560) * 100}%` }}
        >
          <div
            className={cn(
              'flex items-center justify-center rounded-full border font-bold shadow-sm',
              node.size === 'lg' && 'size-16 text-2xs',
              node.size === 'md' && 'size-12 text-[10px]',
              node.size === 'sm' && 'size-9 text-[9px]',
              node.tone === 'root' &&
                'border-brand-green/40 bg-brand-green/10 text-brand-green',
              node.tone === 'paper' &&
                'border-brand-red/30 bg-brand-red/5 text-brand-red',
              node.tone === 'author' &&
                'border-border bg-background text-subtle',
            )}
            title={node.label}
          >
            {node.label.slice(0, 2).toUpperCase()}
          </div>
          <div className="mt-1.5 max-w-[120px] truncate text-center text-[10px] font-semibold text-subtle">
            {node.label}
          </div>
        </div>
      ))}

      <div className="absolute left-4 top-4 rounded-md border border-border bg-background/90 px-3 py-2 text-2xs text-subtle backdrop-blur-sm">
        <div className="font-bold text-foreground">图谱图例</div>
        <div className="mt-1.5 space-y-1">
          <LegendDot tone="root" label="核心论文" />
          <LegendDot tone="paper" label="引用 / 被引" />
          <LegendDot tone="author" label="合作作者" />
        </div>
      </div>

      <div className="absolute bottom-4 right-4 rounded-md border border-border bg-background/90 px-3 py-2 text-2xs text-subtle backdrop-blur-sm">
        {staged.length} 篇节点 · {edges.length} 条关联
      </div>
    </div>
  );
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
          'size-2.5 rounded-full',
          tone === 'root' && 'bg-brand-green',
          tone === 'paper' && 'bg-brand-red',
          tone === 'author' && 'bg-subtle',
        )}
      />
      {label}
    </div>
  );
}

function buildNodes(staged: Paper[]): GraphNode[] {
  const root = staged[0];
  const nodes: GraphNode[] = [
    {
      id: 'root',
      label: shorten(root?.title ?? 'Core Paper', 28),
      x: 480,
      y: 280,
      size: 'lg',
      tone: 'root',
    },
  ];

  staged.slice(1, 5).forEach((paper, i) => {
    const angle = (i / Math.max(staged.length - 1, 1)) * Math.PI * 2;
    nodes.push({
      id: paper.paperId,
      label: shorten(paper.title ?? 'Paper', 22),
      x: 480 + Math.cos(angle) * 180,
      y: 280 + Math.sin(angle) * 130,
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
    const angle = -Math.PI / 2 + (i / Math.max(authorNames.length, 1)) * Math.PI;
    nodes.push({
      id: `author-${i}`,
      label: name,
      x: 480 + Math.cos(angle) * 280,
      y: 280 + Math.sin(angle) * 200,
      size: 'sm',
      tone: 'author',
    });
  });

  if (nodes.length === 1) {
    nodes.push(
      { id: 'p1', label: 'Related A', x: 300, y: 180, size: 'md', tone: 'paper' },
      { id: 'p2', label: 'Related B', x: 660, y: 180, size: 'md', tone: 'paper' },
      { id: 'p3', label: 'Related C', x: 660, y: 380, size: 'md', tone: 'paper' },
      { id: 'a1', label: 'Author Hub', x: 300, y: 380, size: 'sm', tone: 'author' },
    );
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
