import {
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  ExternalLink,
  Languages,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

const PAPERS = [
  {
    title: "Attention Is All You Need",
    venue: "NeurIPS",
    year: 2017,
    authors: "Ashish Vaswani, Noam Shazeer",
    abstract:
      "The dominant sequence transduction models are based on recurrent or convolutional neural networks. We propose a new architecture based solely on attention mechanisms.",
    staged: true,
  },
  {
    title: "Efficiently Modeling Long Sequences with Structured State Spaces",
    venue: "ICLR",
    year: 2022,
    authors: "Albert Gu, Karan Goel",
    abstract:
      "A new parameterization of state space models allows efficient modeling of long-range dependencies while retaining linear scaling in sequence length.",
    staged: false,
  },
  {
    title: "Mamba: Linear-Time Sequence Modeling with Selective State Spaces",
    venue: "arXiv",
    year: 2023,
    authors: "Albert Gu, Tri Dao",
    abstract:
      "Selective state spaces improve content-based reasoning while preserving linear-time inference and hardware-aware recurrent computation.",
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
      className="w-[min(100%,40rem)] overflow-hidden rounded-8 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="smart-paper-group"
    >
      <div className="flex h-9 items-center gap-2 border-b border-border-soft bg-surface-2/40 px-2">
        <ChevronDown className="size-3 text-muted-foreground" />
        <span className="text-12 font-medium text-foreground">3 篇论文</span>
        <span className="text-12 text-faint">· 1 已暂存</span>
        <span className="ml-auto inline-flex h-6 items-center gap-1 rounded-4 px-2 text-12 font-medium text-brand-green">
          <BookmarkPlus className="size-3" />
          一键暂存 2 篇
        </span>
      </div>

      <ul className="divide-y divide-border-hairline">
        {PAPERS.map((paper) => (
          <li key={paper.title} className="flex items-start gap-2 px-4 py-4">
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
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-14 font-medium leading-sans text-foreground">
                  {paper.title}
                </p>
                <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-4 border border-brand-green/30 bg-brand-green/10 px-2 text-12 font-medium text-brand-green">
                  <ExternalLink className="size-3" /> OA PDF
                </span>
              </div>
              <p className="mt-1 truncate text-12 text-muted-foreground">
                {paper.venue} · {paper.authors} · {paper.year}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="inline-flex h-5 items-center rounded-4 bg-brand-green px-2 text-12 font-medium text-on-brand">
                  JCR Q1
                </span>
                <span className="inline-flex h-5 items-center rounded-4 bg-danger-soft px-2 text-12 font-medium text-brand-red">
                  高被引
                </span>
                <span className="inline-flex h-5 items-center rounded-4 bg-cat-blue-soft px-2 text-12 font-medium text-cat-blue">
                  Computer Science
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-14 leading-paragraph text-subtle">
                {paper.abstract}
              </p>
              <div className="mt-3 flex items-center gap-2 text-12 text-subtle">
                <span className="inline-flex h-6 items-center gap-1 rounded-4 border border-border px-2">
                  <Bookmark className="size-3" /> 收藏
                </span>
                <span className="inline-flex h-6 items-center gap-1 rounded-4 border border-border px-2">
                  <Languages className="size-3" /> 翻译
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
