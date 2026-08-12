import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const NODES = [
  {
    id: "root",
    label: "Denoising Diffusion Probabilistic Models",
    initials: "DD",
    position: "left-1/2 top-1/2",
    size: "lg",
    tone: "root",
  },
  {
    id: "paper-1",
    label: "Latent Diffusion Models",
    initials: "LD",
    position: "left-3/4 top-1/2",
    size: "md",
    tone: "paper",
  },
  {
    id: "paper-2",
    label: "Elucidating the Design Space",
    initials: "ED",
    position: "left-1/3 top-2/3",
    size: "md",
    tone: "paper",
  },
  {
    id: "paper-3",
    label: "Scalable Diffusion Transformers",
    initials: "SD",
    position: "left-1/3 top-1/3",
    size: "md",
    tone: "paper",
  },
  {
    id: "author-1",
    label: "Jonathan Ho",
    initials: "JH",
    position: "left-1/2 top-12",
    size: "sm",
    tone: "author",
  },
  {
    id: "author-2",
    label: "Robin Rombach",
    initials: "RR",
    position: "right-20 top-1/4",
    size: "sm",
    tone: "author",
  },
  {
    id: "author-3",
    label: "Tero Karras",
    initials: "TK",
    position: "right-12 top-1/2",
    size: "sm",
    tone: "author",
  },
  {
    id: "author-4",
    label: "William Peebles",
    initials: "WP",
    position: "right-20 bottom-16",
    size: "sm",
    tone: "author",
  },
] as const;

const EDGES = [
  [480, 280, 720, 280, false],
  [480, 280, 320, 373, false],
  [480, 280, 320, 187, false],
  [480, 280, 480, 60, true],
  [480, 280, 780, 140, true],
  [480, 280, 840, 280, true],
  [480, 280, 780, 420, true],
] as const;

/** 尚未上线的文献图谱画布预览，直接复刻 CitationGraphMock 的单一画布状态。 */
export function WikiEmbedCitationGraphPreview() {
  return (
    <div
      className="relative h-[34rem] w-full max-w-5xl overflow-hidden rounded-8 border border-border bg-[radial-gradient(circle_at_center,hsl(var(--surface-1))_0%,hsl(var(--surface-2))_100%)]"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="citation-graph-preview"
      data-wiki-spot="图谱关系"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 960 560"
        preserveAspectRatio="xMidYMid meet"
        role="presentation"
      >
        {EDGES.map(([x1, y1, x2, y2, dashed], index) => (
          <line
            key={`${x1}-${y1}-${index}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth={dashed ? 1.2 : 1.8}
            strokeDasharray={dashed ? "5 4" : undefined}
            className="text-border-strong"
          />
        ))}
      </svg>

      {NODES.map((node) => (
        <GraphNode key={node.id} node={node} />
      ))}

      <div className="absolute left-4 top-4 rounded-8 border border-border bg-background/90 px-3 py-2 text-12 text-subtle backdrop-blur-sm">
        <p className="font-medium text-foreground">图谱图例</p>
        <div className="mt-2 space-y-1">
          <Legend tone="root" label="核心论文" />
          <Legend tone="paper" label="引用 / 被引" />
          <Legend tone="author" label="合作作者" />
        </div>
      </div>

      <div className="absolute bottom-4 right-4 rounded-8 border border-border bg-background/90 px-3 py-2 text-12 text-subtle backdrop-blur-sm">
        4 篇节点 · 7 条关联
      </div>
    </div>
  );
}

function GraphNode({ node }: { node: (typeof NODES)[number] }) {
  const sizeClass =
    node.size === "lg"
      ? "size-16 text-12"
      : node.size === "md"
        ? "size-12 text-12"
        : "size-9 text-12";
  const toneClass =
    node.tone === "root"
      ? "border-brand-green/40 bg-brand-green-soft text-brand-green"
      : node.tone === "paper"
        ? "border-brand-red/30 bg-brand-red-soft text-brand-red"
        : "border-border bg-background text-subtle";

  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${node.position}`}
    >
      <div
        className={`flex items-center justify-center rounded-pill border font-medium shadow-raised ${sizeClass} ${toneClass}`}
      >
        {node.initials}
      </div>
      <p className="mt-2 max-w-28 truncate text-center text-12 font-medium text-subtle">
        {node.label}
      </p>
    </div>
  );
}

function Legend({
  tone,
  label,
}: {
  tone: "root" | "paper" | "author";
  label: string;
}) {
  return (
    <p className="flex items-center gap-2">
      <span
        className={
          tone === "root"
            ? "size-2 rounded-pill bg-brand-green"
            : tone === "paper"
              ? "size-2 rounded-pill bg-brand-red"
              : "size-2 rounded-pill bg-muted-foreground"
        }
      />
      {label}
    </p>
  );
}
