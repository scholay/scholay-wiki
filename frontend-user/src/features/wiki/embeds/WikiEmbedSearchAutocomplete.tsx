import { Search } from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { MockModeToggle } from "./fixtures/mock-chrome";

/**
 * 传统搜索入口 · 纯样式 fixture。
 * 首页式构图: BrandLogo + SearchAutocomplete(literature, focused) + SmartSearchToggle(engine)。
 */
export function WikiEmbedSearchAutocomplete() {
  return (
    <div
      className="flex w-[min(100%,36rem)] flex-col items-center"
      aria-hidden
      data-wiki-fixture="search-autocomplete"
    >
      <BrandLogo size="xl" />
      <div className="relative mt-6 w-full">
        <div className="flex h-12 items-center gap-3 rounded-4 border border-foreground bg-surface-card pl-6 pr-2">
          <MockModeToggle label="搜索引擎" tone="engine" />
          <div className="relative min-w-0 flex-1">
            <span className="block h-auto w-full truncate text-16 text-faint">
              搜索学术论文、期刊、作者…
            </span>
          </div>
          <span
            className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-4 bg-destructive text-destructive-foreground"
            aria-hidden
          >
            <Search className="size-4" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </div>
  );
}
