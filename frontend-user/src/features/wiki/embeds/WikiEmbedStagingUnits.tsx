import { Plus, X } from "lucide-react";
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

      <div className="py-2">
        {PAPERS.map((paper) => (
          <div
            key={paper.title}
            className={cn(
              "group/unit relative mx-2 mb-2 rounded-8 border px-3 py-2 text-left",
              paper.selected
                ? "border-brand-red/40 bg-danger-soft"
                : "border-border bg-surface-card",
            )}
          >
            <span className="absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-4 text-faint opacity-40">
              <X className="size-3" />
            </span>
            <div
              className={cn(
                "line-clamp-2 pr-6 text-12 font-medium leading-sans",
                paper.selected ? "text-brand-red" : "text-foreground",
              )}
            >
              {paper.title}
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2 text-12 text-faint">
              <span className="shrink-0 tabular-nums">{paper.year}</span>
              <span className="min-w-0 truncate">{paper.authors}</span>
            </div>
          </div>
        ))}
        <p className="px-3 pb-1 text-12 leading-paragraph text-faint">
          最多 5 个暂存区，按当前位置显示 A–E；空区切走后会自动移除。
        </p>
      </div>
    </div>
  );
}
