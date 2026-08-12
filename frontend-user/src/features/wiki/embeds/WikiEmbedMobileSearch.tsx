import { Search, Share2, X } from "lucide-react";

const RESULTS = [
  {
    mark: "NMI",
    title: "Nature Machine Intelligence",
    meta: "Springer Nature · United Kingdom",
    badges: ["JCR Q1", "IF 18.8"],
  },
  {
    mark: "JMLR",
    title: "Journal of Machine Learning Research",
    meta: "Microtome Publishing · United States",
    badges: ["CCF A", "开放获取"],
  },
] as const;

/**
 * 移动搜索浮层 · 纯样式 fixture。
 * 对齐 product-mock MobileSearchOverlay 的期刊模式 + MobileJournalResultCard。
 * 搜索对象由打开浮层时所在的 Feed Tab 固定：期刊 Feed 进入即搜索期刊；
 * 浮层内部没有“论文 / 期刊”模式切换。期刊模式也不展示论文专用筛选。
 */
export function WikiEmbedMobileSearch() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden rounded-20 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="mobile-search"
    >
      <header className="flex h-14 items-center gap-2 border-b border-border px-3">
        <X className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-pill border border-border bg-surface-1 px-3">
          <Search className="size-4 shrink-0 text-faint" />
          <span className="truncate text-14 text-foreground">
            machine learning
          </span>
        </div>
        <span className="rounded-pill bg-brand-red px-3 py-2 text-12 font-medium text-on-dark">
          搜索
        </span>
      </header>

      <main>
        <p className="border-b border-border-hairline px-4 py-3 text-12 text-faint">
          从“期刊”Feed 进入 · 找到相关期刊
        </p>
        <ul data-wiki-spot="移动搜索结果">
          {RESULTS.map((journal) => (
            <li
              key={journal.title}
              className="flex items-start gap-3 border-b border-border px-4 py-4"
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-8 bg-brand-amber-soft font-display text-12 font-medium text-brand-amber">
                {journal.mark}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-14 font-medium leading-sans text-foreground">
                  {journal.title}
                </p>
                <p className="mt-1 truncate text-12 text-faint">
                  {journal.meta}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {journal.badges.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-pill bg-brand-green-soft px-2 py-1 text-12 font-medium text-brand-green"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
              <Share2 className="size-4 shrink-0 text-muted-foreground" />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
