import { Check, ChevronDown, Plus } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const PAPERS = [
  {
    title: "Attention Is All You Need",
    year: 2017,
    authors: "Vaswani et al.",
    selected: true,
  },
  {
    title: "BERT: Pre-training of Deep Bidirectional Transformers",
    year: 2019,
    authors: "Devlin et al.",
    selected: false,
  },
  {
    title: "Mamba: Linear-Time Sequence Modeling with Selective State Spaces",
    year: 2023,
    authors: "Gu & Dao",
    selected: false,
  },
] as const;

/**
 * 检索工作区 · 暂存文献单元 · 纯样式 fixture。
 * 对齐现行 StagingTabs + 暂存论文单元；分区按当前位置显示 A–E。
 */
export function WikiEmbedStagingUnits() {
  return (
    <div
      className="w-[min(100%,36rem)] overflow-hidden rounded-8 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="staging-units"
    >
      <div className="flex h-9 items-center justify-between gap-2 border-b border-border bg-background px-3">
        <div className="flex h-full min-w-0 items-center gap-1">
          {[
            { label: "A", count: 3, active: true },
            { label: "B", count: 1, active: false },
            { label: "C", count: 0, active: false },
          ].map((area) => (
            <span
              key={area.label}
              className={cn(
                "relative inline-flex h-full items-center gap-2 px-2 text-12",
                area.active ? "font-medium text-foreground" : "text-faint",
              )}
            >
              {area.label}
              <span
                className={cn(
                  "inline-flex h-4 min-w-4 items-center justify-center rounded-pill px-1 text-12 font-medium tabular-nums",
                  area.active
                    ? "bg-brand-red text-on-brand"
                    : "bg-surface-2 text-muted-foreground",
                )}
              >
                {area.count}
              </span>
              {area.active ? (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-pill bg-brand-red" />
              ) : null}
            </span>
          ))}
        </div>
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-8 border border-border-strong text-subtle">
          <Plus className="size-3" strokeWidth={2.5} />
        </span>
      </div>

      <div>
        {PAPERS.map((paper) => (
          <div
            key={paper.title}
            className="flex min-h-10 items-center gap-2 border-b border-brand-green/30 bg-brand-green/5 px-3 py-2"
          >
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-4 text-brand-green">
              <span className="inline-flex size-4 items-center justify-center rounded-4 border border-brand-green bg-brand-green text-on-brand">
                <Check className="size-3" strokeWidth={3} />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "line-clamp-2 text-12 leading-sans",
                  paper.selected ? "text-foreground" : "text-subtle",
                )}
              >
                {paper.title}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-12 text-faint">
                <span className="shrink-0 tabular-nums">{paper.year}</span>
                <span className="min-w-0 truncate">{paper.authors}</span>
              </div>
            </div>
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-4 text-muted-foreground">
              <ChevronDown className="size-3" />
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between bg-surface-1 px-3 py-2 text-12 text-faint">
          <span>当前 A 区 · 3 篇</span>
          <span>最多 5 个暂存区</span>
        </div>
      </div>
    </div>
  );
}
