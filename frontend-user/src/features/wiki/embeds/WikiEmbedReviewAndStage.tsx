import {
  Check,
  Download,
  ExternalLink,
  FileText,
  Languages,
  MessageSquare,
  Minimize2,
  Quote,
  Star,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

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
 * 单一截面保留 DefaultCard 已暂存态与右侧论文详情页签，避免把暂存侧栏拼成第二状态。
 */
export function WikiEmbedReviewAndStage() {
  return (
    <div
      className="w-[min(100%,58rem)] overflow-hidden rounded-8 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="review-and-stage"
    >
      <div className="grid min-h-0 md:grid-cols-[minmax(0,1fr)_minmax(22rem,0.9fr)]">
        <div className="min-w-0 border-b border-border md:border-b-0 md:border-r">
          <div className="flex h-11 items-center justify-between border-b border-border bg-surface-1 px-3 text-12 text-muted-foreground">
            <span>找到 12,480 篇相关文献</span>
            <span className="inline-flex h-6 items-center gap-1 rounded-8 px-2 text-subtle">
              <Check className="size-3" /> 全选本页 20 篇
            </span>
          </div>
          <article
            data-paper-id="paper-alphafold"
            data-wiki-spot="暂存区"
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
              <div className="mt-3 flex items-center gap-2 text-12 text-subtle">
                <span className="inline-flex h-6 items-center gap-1 rounded-4 border border-border px-2">
                  <Star className="size-3" /> 收藏
                </span>
                <span className="inline-flex h-6 items-center gap-1 rounded-4 border border-border px-2">
                  <Languages className="size-3" /> 翻译
                </span>
                <span className="ml-auto inline-flex h-6 items-center gap-1 rounded-4 border border-border px-2">
                  <Minimize2 className="size-3" /> 折叠
                </span>
              </div>
            </div>
          </article>
        </div>

        <aside className="min-w-0 bg-background" data-wiki-spot="论文详情">
          <div className="flex h-11 items-center gap-1 border-b border-border bg-surface-1 px-2">
            {[
              { label: "PDF 对话", icon: MessageSquare },
              { label: "引用图谱", icon: Quote },
            ].map(({ label, icon: Icon }) => (
              <span
                key={label}
                className="inline-flex h-8 items-center gap-1 rounded-4 px-2 text-12 text-subtle"
              >
                <Icon className="size-3" /> {label}
              </span>
            ))}
            <span className="inline-flex h-8 min-w-0 flex-1 items-center gap-1 rounded-4 border border-border bg-background px-2 text-12 font-medium text-foreground shadow-raised">
              <FileText className="size-3 shrink-0" />
              <span className="truncate">
                Highly accurate protein structure…
              </span>
            </span>
          </div>
          <div className="p-5">
            <p className="text-12 font-medium uppercase text-faint">
              Nature · Biology · 2021
            </p>
            <h3 className="mt-4 font-serif text-24 font-medium leading-title text-foreground">
              Highly accurate protein structure prediction with AlphaFold
            </h3>
            <p className="mt-3 text-14 text-subtle">
              John Jumper, Demis Hassabis et al.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 border-b border-border pb-4 text-12 text-muted-foreground">
              <span>41.2k citations</span>
              <span>·</span>
              <span>DOI 10.1038/s41586-021-03819-2</span>
            </div>
            <div className="mt-5 flex gap-2">
              <span className="inline-flex h-8 items-center gap-1 rounded-8 bg-foreground px-3 text-12 text-on-dark">
                <ExternalLink className="size-3" /> 打开原文
              </span>
              <span className="inline-flex h-8 items-center gap-1 rounded-8 border border-border px-3 text-12 text-subtle">
                <Download className="size-3" /> PDF
              </span>
            </div>
            <h4 className="mt-7 font-serif text-20 italic text-muted-foreground">
              Abstract
            </h4>
            <p className="mt-3 text-14 leading-paragraph text-subtle">
              We greatly improve the accuracy of protein structure prediction
              with a new neural network architecture based on the evolutionary,
              physical and geometric constraints of protein structures.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
