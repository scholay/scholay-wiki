import { Search } from "lucide-react";
import { BrandLogo } from "@/shared/components/BrandLogo";
import { MockModeToggle } from "./fixtures/mock-chrome";

/**
 * 传统搜索入口 · 纯样式 fixture。
 * 对应 SearchClassicLanding 的居中品牌区与 SearchAutocomplete 聚焦态。
 */
export function WikiEmbedSearchAutocomplete() {
  return (
    <div
      className="flex w-[min(100%,36rem)] flex-col items-center"
      aria-hidden
      data-wiki-fixture="search-autocomplete"
    >
      <BrandLogo size="xl" />
      <p className="mt-3 text-14 text-muted-foreground">
        学术搜索 · AI 审稿 · LaTeX 协作
      </p>
      <div className="relative mt-8 w-full">
        <div className="flex h-12 items-center gap-3 rounded-4 border border-foreground bg-surface-card pl-5 pr-2">
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
