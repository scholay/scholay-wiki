import { Search, Share2, X } from "lucide-react";
import { JournalCover } from "@/shared/components/JournalCover";

const RESULTS = [
  {
    id: 901,
    title: "Nature Machine Intelligence",
    meta: "Springer Nature · United Kingdom",
    badges: ["JCR Q1", "IF 18.8", "h-index 96"],
  },
  {
    id: 902,
    title: "Journal of Machine Learning Research",
    meta: "Microtome Publishing · United States",
    badges: ["CCF A", "IF 6.0", "开放获取"],
  },
  {
    id: 903,
    title: "Machine Learning",
    meta: "Springer Nature · Netherlands",
    badges: ["JCR Q2", "IF 7.5", "h-index 210"],
  },
] as const;

/** MobileSearchOverlay 的期刊结果冻结态。 */
export function WikiEmbedMobileSearch() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-surface-card"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-search"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        <X className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-16 border border-border-control bg-surface-card px-3">
          <Search className="size-4 shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate text-14 text-foreground">
            machine learning
          </span>
          <X className="size-4 shrink-0 text-faint" />
        </div>
        <span className="shrink-0 rounded-pill bg-brand-red px-3 py-2 text-12 font-medium text-on-brand">
          搜索
        </span>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden bg-surface-card">
        <ul data-wiki-spot="移动搜索结果">
          {RESULTS.map((journal) => (
            <li
              key={journal.id}
              className="flex items-start gap-3 border-b border-border px-4"
              style={{ paddingBlock: 14 }}
            >
              <JournalCover
                id={journal.id}
                name={journal.title}
                size="tile"
                className="h-12 w-12 shrink-0 rounded-8"
              />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-16 font-medium text-foreground">
                  {journal.title}
                </p>
                <p className="mt-1 truncate text-12 text-faint">
                  {journal.meta}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {journal.badges.map((badge, index) => (
                    <span
                      key={badge}
                      className={
                        index === 0
                          ? "rounded-pill bg-brand-green px-2 py-1 text-12 font-medium text-on-brand"
                          : badge === "开放获取"
                            ? "rounded-pill bg-brand-green/10 px-2 py-1 text-12 font-medium text-brand-green"
                            : "rounded-pill bg-surface-2 px-2 py-1 text-12 font-medium text-muted-foreground"
                      }
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-pill text-muted-foreground">
                <Share2 className="size-4" />
              </span>
            </li>
          ))}
        </ul>
        <p className="py-8 text-center text-12 text-faint">没有更多了</p>
      </main>
    </div>
  );
}
