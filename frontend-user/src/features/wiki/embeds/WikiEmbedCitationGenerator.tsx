import { Copy, Quote, Search } from "lucide-react";

/**
 * 独立引用生成器 · 纯样式 fixture。
 * 来源：CitationGeneratorPage 的 DOI 解析、手动录入与结果面板代表状态。
 */
export function WikiEmbedCitationGenerator() {
  return (
    <div
      className="w-[min(100%,44rem)] rounded-12 border border-border bg-surface-card p-4 md:p-6"
      aria-hidden
      data-wiki-fixture="citation-generator"
    >
      <div className="text-12 font-medium uppercase text-faint">
        Citation Generator
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Quote className="size-4 text-brand-red" />
        <p className="text-20 font-medium text-foreground">
          参考文献引用格式生成器
        </p>
      </div>
      <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
        输入 DOI 自动解析，或手动录入文献信息，再生成五种引用格式。
      </p>

      <div className="mt-6 flex items-center gap-1 border-b border-border">
        <span className="border-b-2 border-brand-red px-3 py-2 text-12 font-medium text-foreground">
          DOI 解析
        </span>
        <span className="px-3 py-2 text-12 text-faint">手动录入</span>
      </div>

      <div className="mt-4 flex gap-2">
        <div className="flex h-control-md min-w-0 flex-1 items-center rounded-8 border border-border px-3 font-mono text-12 text-subtle">
          10.1038/nature14539
        </div>
        <span className="inline-flex h-control-md items-center gap-2 rounded-8 bg-foreground px-4 text-12 font-medium text-on-dark">
          <Search className="size-3" />
          解析
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-1">
        {["GB/T 7714", "BibTeX", "APA", "MLA", "Chicago"].map(
          (format, index) => (
            <span
              key={format}
              className={
                index === 0
                  ? "rounded-8 bg-foreground px-3 py-1 text-12 font-medium text-on-dark"
                  : "rounded-8 px-3 py-1 text-12 text-muted-foreground"
              }
            >
              {format}
            </span>
          ),
        )}
      </div>

      <div className="relative mt-3 rounded-12 border border-border bg-surface-1 px-4 py-4 pr-20 text-14 leading-paragraph text-subtle">
        Jumper J, Evans R, Pritzel A, et al. Highly accurate protein structure
        prediction with AlphaFold[J]. Nature, 2021, 596: 583–589.
        <span className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-8 border border-border bg-surface-card px-2 text-12 text-subtle">
          <Copy className="size-3" />
          复制
        </span>
      </div>
      <p className="mt-2 text-12 text-faint">
        示例题录 · 自动解析后仍应核对作者、卷期和页码
      </p>
    </div>
  );
}
