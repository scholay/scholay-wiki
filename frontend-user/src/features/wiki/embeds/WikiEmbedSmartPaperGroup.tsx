import { Check, Inbox } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const PAPERS = [
  {
    title: "Attention Is All You Need",
    venue: "NeurIPS",
    year: 2017,
    staged: true,
  },
  {
    title: "Efficiently Modeling Long Sequences with Structured State Spaces",
    venue: "ICLR",
    year: 2022,
    staged: false,
  },
  {
    title: "Mamba: Linear-Time Sequence Modeling with Selective State Spaces",
    venue: "arXiv",
    year: 2023,
    staged: false,
  },
] as const;

/**
 * 智能搜索论文组 · 纯样式 fixture。
 * 对齐 product-mock PaperListScroller 组头 + 论文行勾选列。
 */
export function WikiEmbedSmartPaperGroup() {
  return (
    <div
      className="w-[min(100%,28rem)] overflow-hidden rounded-8 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="smart-paper-group"
    >
      <div className="flex h-9 items-center gap-2 border-b border-border-soft bg-surface-2/40 px-3">
        <span className="text-12 font-medium text-foreground">3 篇论文</span>
        <span className="text-12 text-faint">本轮检索组</span>
        <span className="ml-auto inline-flex h-7 items-center gap-1 rounded-8 border border-border bg-surface-card px-2 text-12 text-subtle">
          <Inbox className="size-3.5" />
          一键暂存
        </span>
      </div>

      <ul className="divide-y divide-border-hairline">
        {PAPERS.map((paper) => (
          <li key={paper.title} className="flex items-start gap-3 px-3 py-3">
            <span
              className={cn(
                "mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-4 border",
                paper.staged
                  ? "border-brand-red bg-brand-red text-on-dark"
                  : "border-border bg-surface-card",
              )}
            >
              {paper.staged ? (
                <Check className="size-3" strokeWidth={3} />
              ) : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-14 font-medium leading-sans text-foreground">
                {paper.title}
              </p>
              <p className="mt-1 text-12 text-faint">
                <span className="tabular-nums">{paper.year}</span>
                <span className="mx-2">·</span>
                <span>{paper.venue}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
