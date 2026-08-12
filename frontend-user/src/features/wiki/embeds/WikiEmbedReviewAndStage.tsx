import { Check, ExternalLink, Info, Plus, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const STAGED_PAPERS = [
  {
    title: "Denoising Diffusion Probabilistic Models",
    year: 2020,
    authors: "Jonathan Ho, Pieter Abbeel",
    selected: false,
  },
  {
    title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    year: 2020,
    authors: "Patrick Lewis, Douwe Kiela",
    selected: false,
  },
  {
    title: "Highly accurate protein structure prediction with AlphaFold",
    year: 2021,
    authors: "John Jumper, Demis Hassabis",
    selected: true,
  },
] as const;

const PAPER_TAGS = [
  { label: "JCR Q1", tone: "green" },
  { label: "IF 50.5", tone: "green" },
  { label: "中科院 1 区", tone: "green" },
  { label: "新锐 1 区", tone: "amber" },
  { label: "41.2k 引用", tone: "neutral" },
  { label: "Biology", tone: "field" },
  { label: "Machine Learning", tone: "field" },
] as const;

/**
 * 传统搜索 · 核对结果并加入暂存区 · 纯样式 fixture。
 * 对齐 product-mock DefaultCard(已暂存) + WorkspaceFolderTree 暂存区手风琴。
 */
export function WikiEmbedReviewAndStage() {
  return (
    <div
      className="w-[min(100%,42rem)] overflow-hidden rounded-8 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="review-and-stage"
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface-1 px-4 py-2 text-12 text-muted-foreground">
        <Info className="size-3.5 shrink-0" />
        示例论文与指标；实际值随论文数据源更新。
      </div>
      <div className="flex min-h-0 flex-col md:flex-row">
        <aside className="w-full shrink-0 border-b border-border md:w-[240px] md:border-b-0 md:border-r">
          <div className="flex flex-col pb-2">
            <div className="flex h-9 items-center gap-1 border-b border-border bg-background px-3">
              <span className="relative inline-flex h-full items-center gap-2 px-2 text-12 font-medium text-foreground">
                A
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand-red px-1 text-12 font-medium text-on-brand tabular-nums">
                  3
                </span>
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-pill bg-brand-red" />
              </span>
              <span className="inline-flex h-full items-center gap-2 px-2 text-12 text-faint">
                B
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-surface-2 px-1 text-12 font-medium text-muted-foreground tabular-nums">
                  1
                </span>
              </span>
              <span className="ml-auto inline-flex size-6 items-center justify-center rounded-8 border border-border-strong text-subtle">
                <Plus className="size-3" strokeWidth={2.5} />
              </span>
            </div>

            <div className="flex flex-col pb-1 pt-1">
              {STAGED_PAPERS.map((paper) => (
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
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <article
            data-paper-id="paper-alphafold"
            className="group flex items-start gap-2 border-b border-border bg-brand-green/5 px-4 py-4"
          >
            <span
              className="mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-4 border border-brand-red bg-brand-red text-on-dark"
              title="已加入暂存区"
            >
              <Check className="size-3" strokeWidth={3} />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <h3 className="min-w-0 flex-1 text-16 font-medium leading-sans text-foreground">
                  Highly accurate protein structure prediction with AlphaFold
                </h3>
                <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-4 border border-brand-green/30 bg-brand-green/10 px-2 text-12 font-medium text-brand-green">
                  <ExternalLink className="size-2.5" strokeWidth={2.5} />
                  OA PDF
                </span>
              </div>

              <div className="mt-1 flex min-w-0 items-center gap-2 text-12 text-muted-foreground">
                <span className="min-w-0 truncate">Nature</span>
                <span className="shrink-0 text-faint">·</span>
                <span className="min-w-0 truncate">
                  John Jumper, Demis Hassabis
                </span>
                <span className="ml-auto shrink-0 tabular-nums">2021</span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {PAPER_TAGS.map((tag) => (
                  <span
                    key={tag.label}
                    className={cn(
                      "inline-flex h-5 items-center rounded-4 px-2 text-12 font-medium",
                      tag.tone === "green" &&
                        "bg-brand-green/10 text-brand-green",
                      tag.tone === "amber" && "bg-brand-amber text-foreground",
                      tag.tone === "neutral" && "bg-surface-2 text-subtle",
                      tag.tone === "field" && "bg-cat-blue-soft text-cat-blue",
                    )}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>

              <p className="mt-2 line-clamp-2 text-14 leading-paragraph text-subtle">
                A neural network architecture that predicts protein structure
                from amino-acid sequence with accuracy competitive with
                experimental methods in many cases.
              </p>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
