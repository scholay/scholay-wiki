import { Share2 } from "lucide-react";

/**
 * 文献图谱设计预览 · 纯样式 fixture。
 * 对齐 product-mock CitationGraphPanel + CitationGraphMock；明确标注为未上线预览。
 */
export function WikiEmbedCitationGraphPreview() {
  return (
    <div
      className="w-[min(100%,48rem)] overflow-hidden rounded-16 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="citation-graph-preview"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Share2 className="size-4 text-brand-green" />
          <span className="text-14 font-medium text-foreground">文献图谱</span>
          <span className="text-12 text-faint">4 篇工作区文献</span>
        </div>
        <span className="rounded-pill bg-brand-amber-soft px-3 py-1 text-12 font-medium text-brand-amber">
          设计预览 · 当前未上线
        </span>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex gap-1">
          {["引文链", "共引簇", "合作者", "时间轴"].map((label, index) => (
            <span
              key={label}
              className={
                index === 0
                  ? "rounded-pill bg-foreground px-3 py-1 text-12 font-medium text-on-dark"
                  : "rounded-pill px-3 py-1 text-12 text-subtle"
              }
            >
              {label}
            </span>
          ))}
        </div>
        <span className="text-12 tabular-nums text-faint">
          4 篇 · 7 作者 · 8 关联
        </span>
      </div>

      <div className="relative h-96 bg-surface-1 p-4" data-wiki-spot="图谱关系">
        <svg
          className="h-full w-full"
          viewBox="0 0 720 360"
          role="presentation"
        >
          <g className="stroke-border-strong" fill="none" strokeWidth="2">
            <line x1="360" y1="180" x2="180" y2="90" />
            <line x1="360" y1="180" x2="540" y2="90" />
            <line x1="360" y1="180" x2="570" y2="260" />
            <line x1="360" y1="180" x2="160" y2="260" />
            <line x1="360" y1="180" x2="350" y2="45" strokeDasharray="6 6" />
            <line x1="360" y1="180" x2="365" y2="320" strokeDasharray="6 6" />
          </g>

          <g>
            <circle
              cx="360"
              cy="180"
              r="42"
              className="fill-brand-green-soft stroke-brand-green"
              strokeWidth="2"
            />
            <text
              x="360"
              y="176"
              textAnchor="middle"
              className="fill-brand-green text-12 font-medium"
            >
              核心论文
            </text>
            <text
              x="360"
              y="193"
              textAnchor="middle"
              className="fill-brand-green text-12"
            >
              DDPM
            </text>
          </g>

          <GraphNode x={180} y={90} short="LDM" label="引用论文" />
          <GraphNode x={540} y={90} short="EDM" label="被引论文" />
          <GraphNode x={570} y={260} short="DiT" label="引用论文" />
          <GraphNode x={160} y={260} short="CFG" label="共引论文" />

          <g>
            <circle
              cx="350"
              cy="45"
              r="24"
              className="fill-surface-card stroke-border"
              strokeWidth="2"
            />
            <text
              x="350"
              y="49"
              textAnchor="middle"
              className="fill-subtle text-12"
            >
              作者 A
            </text>
            <circle
              cx="365"
              cy="320"
              r="24"
              className="fill-surface-card stroke-border"
              strokeWidth="2"
            />
            <text
              x="365"
              y="324"
              textAnchor="middle"
              className="fill-subtle text-12"
            >
              作者 B
            </text>
          </g>
        </svg>

        <div className="absolute left-4 top-4 rounded-8 border border-border bg-surface-card/90 p-3 text-12 text-subtle">
          <p className="font-medium text-foreground">图谱图例</p>
          <p className="mt-2">绿色 · 核心论文</p>
          <p className="mt-1">红色 · 引用 / 被引</p>
          <p className="mt-1">灰色 · 合作作者</p>
        </div>
      </div>
    </div>
  );
}

function GraphNode({
  x,
  y,
  short,
  label,
}: {
  x: number;
  y: number;
  short: string;
  label: string;
}) {
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r="30"
        className="fill-brand-red-soft stroke-brand-red"
        strokeWidth="2"
      />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        className="fill-brand-red text-12 font-medium"
      >
        {short}
      </text>
      <text
        x={x}
        y={y + 48}
        textAnchor="middle"
        className="fill-subtle text-12"
      >
        {label}
      </text>
    </g>
  );
}
