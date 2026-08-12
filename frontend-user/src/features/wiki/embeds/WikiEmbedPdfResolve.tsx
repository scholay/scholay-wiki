import {
  Check,
  ExternalLink,
  FileText,
  FolderInput,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

const STEPS = [
  { label: "上传 PDF", icon: Upload, complete: true, active: false },
  { label: "自动检索", icon: Search, complete: true, active: false },
  { label: "确认匹配", icon: Check, complete: false, active: true },
  { label: "加入并完善", icon: FolderInput, complete: false, active: false },
] as const;

/**
 * PDF 上传、识别与在线关联 · 纯样式 fixture。
 * 对齐 product-mock PdfUploadEntry + PdfUploadInspecting + PdfUploadDecide 的确认态。
 */
export function WikiEmbedPdfResolve() {
  return (
    <div
      className="w-[min(100%,48rem)] rounded-16 border border-border bg-surface-card p-6"
      aria-hidden
      data-wiki-fixture="pdf-resolve"
    >
      <header>
        <p className="text-12 font-medium text-brand-amber">
          State 2 · 等待确认
        </p>
        <h2 className="mt-1 text-20 font-medium text-foreground">确认匹配</h2>
        <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
          从候选中选出这份 PDF 对应的论文；都不对时也可以跳过并直接保存。
        </p>
      </header>

      <ol className="mt-6 grid grid-cols-2 gap-2 rounded-12 border border-border bg-surface-1 p-3 sm:grid-cols-4">
        {STEPS.map(({ label, icon: Icon, complete, active }, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                complete
                  ? "flex size-7 shrink-0 items-center justify-center rounded-pill bg-brand-green-soft text-brand-green"
                  : active
                    ? "flex size-7 shrink-0 items-center justify-center rounded-pill border border-brand-amber text-brand-amber"
                    : "flex size-7 shrink-0 items-center justify-center rounded-pill border border-border text-faint"
              }
            >
              {complete ? (
                <Check className="size-3" />
              ) : (
                <Icon className="size-3" />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-12 font-medium text-foreground">{label}</p>
              <p className="text-12 text-faint">步骤 {index + 1}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-4 md:grid-cols-[14rem_1fr]">
        <aside className="rounded-12 border border-border bg-surface-1 p-3">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <FileText className="size-4 text-brand-red" />
            <div className="min-w-0">
              <p className="truncate text-12 font-medium text-foreground">
                attention-paper.pdf
              </p>
              <p className="text-12 text-faint">2.4 MB · 15 页</p>
            </div>
          </div>
          <div className="mt-3 bg-surface-card p-4 text-center">
            <p className="font-display text-14 font-medium leading-display text-foreground">
              Attention Is All You Need
            </p>
            <p className="mt-2 text-12 text-faint">Vaswani et al.</p>
            <div className="mt-4 space-y-2 text-left">
              <span className="block h-1 rounded-pill bg-border" />
              <span className="block h-1 w-4/5 rounded-pill bg-border" />
              <span className="block h-1 w-3/4 rounded-pill bg-border" />
            </div>
          </div>
          <p className="mt-3 text-center text-12 tabular-nums text-faint">
            1 / 15
          </p>
        </aside>

        <main className="min-w-0 space-y-3">
          <div className="flex items-start gap-3 rounded-12 border border-brand-amber/30 bg-brand-amber-soft p-3">
            <Sparkles className="mt-1 size-4 shrink-0 text-brand-amber" />
            <div>
              <p className="text-14 font-medium text-foreground">
                找到 4 条匹配结果，请确认
              </p>
              <p className="mt-1 text-12 text-muted-foreground">
                已根据 PDF 内容按相关度排序
              </p>
            </div>
          </div>

          <section
            className="overflow-hidden rounded-12 border border-border"
            data-wiki-spot="最佳匹配"
          >
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-1 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3 text-brand-amber" />
                <span className="text-12 font-medium text-foreground">
                  最佳建议
                </span>
                <span className="rounded-4 bg-surface-2 px-2 py-1 text-12 text-subtle">
                  Graph
                </span>
                <span className="rounded-pill bg-brand-green-soft px-2 py-1 text-12 font-medium text-brand-green">
                  标题精确匹配
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-12 text-subtle">
                <ExternalLink className="size-3" />
                查看原文
              </span>
            </header>
            <div className="p-4">
              <h3 className="text-14 font-medium leading-sans text-foreground">
                Attention Is All You Need
              </h3>
              <p className="mt-1 text-12 text-muted-foreground">
                Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit
              </p>
              <p className="mt-2 text-12 text-faint">
                DOI 10.48550/arXiv.1706.03762 · NeurIPS · 2017 · 128,416 引用
              </p>
              <div className="mt-4 flex gap-2">
                <span className="inline-flex h-8 items-center gap-2 rounded-8 bg-brand-green px-3 text-12 font-medium text-on-dark">
                  <Check className="size-3" />
                  接受并加入
                </span>
                <span className="inline-flex h-8 items-center gap-2 rounded-8 px-3 text-12 text-subtle">
                  <X className="size-3" />
                  拒绝
                </span>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
