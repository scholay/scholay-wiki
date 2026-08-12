import { Copy, Quote } from "lucide-react";

/** 引用弹窗 · 纯样式 fixture。来源：product-mock CitationDialog。 */
export function WikiEmbedCitationDialog() {
  return (
    <div
      className="w-[min(100%,36rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="citation-dialog"
    >
      <div className="flex items-center gap-2">
        <Quote className="size-4 text-brand-red" />
        <p className="text-16 font-medium text-foreground">生成引用</p>
      </div>
      <div className="mt-4 flex gap-2 overflow-hidden">
        {["GB/T 7714", "BibTeX", "APA", "MLA", "Chicago"].map(
          (format, index) => (
            <span
              key={format}
              className={`shrink-0 rounded-4 border px-3 py-1 text-12 ${index === 0 ? "border-brand-red bg-brand-red-soft text-brand-red" : "border-border text-muted-foreground"}`}
            >
              {format}
            </span>
          ),
        )}
      </div>
      <div className="mt-4 rounded-8 border border-border bg-surface-1 p-4 text-14 leading-paragraph text-subtle">
        Vaswani, A., et al. (2017). Attention Is All You Need. Advances in
        Neural Information Processing Systems.
      </div>
      <div className="mt-3 flex items-center justify-end gap-3">
        <span className="inline-flex h-control-md items-center gap-2 rounded-8 bg-brand-red px-4 text-12 font-medium text-on-dark">
          <Copy className="size-3" />
          复制引用
        </span>
      </div>
    </div>
  );
}
