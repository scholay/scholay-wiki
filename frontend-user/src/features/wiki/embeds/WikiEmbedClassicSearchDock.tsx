import { Filter, Search } from "lucide-react";
import { MockModeToggle } from "./fixtures/mock-chrome";

/**
 * 传统搜索底栏 · 纯样式 fixture。
 * 对齐 product-mock SearcherColumn dock(搜索引擎 + 筛选入口)。
 */
export function WikiEmbedClassicSearchDock() {
  return (
    <div
      className="w-[min(100%,48rem)] border-t border-border bg-background pb-3 pl-5 pr-3 pt-2"
      aria-hidden
      data-wiki-fixture="classic-search-dock"
    >
      <div className="flex h-12 items-center gap-3 rounded-4 border border-foreground bg-surface-card pl-5 pr-2">
        <MockModeToggle label="搜索引擎" tone="engine" />
        <div className="relative min-w-0 flex-1">
          <span className="block truncate text-16 text-faint">
            输入关键词,如 机器学习可解释性
          </span>
        </div>
        <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-8 bg-brand-red px-2 text-12 font-medium text-on-dark">
          <Filter className="size-3.5 shrink-0" strokeWidth={2.25} />
          筛选
        </span>
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-4 bg-destructive text-destructive-foreground">
          <Search className="size-4" strokeWidth={2.5} />
        </span>
      </div>
    </div>
  );
}
