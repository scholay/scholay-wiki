import { Search, SlidersHorizontal, Sparkles, TrendingUp } from "lucide-react";

const JOURNALS = [
  {
    monogram: "NMI",
    title: "Nature Machine Intelligence",
    publisher: "Springer Nature · United Kingdom",
    badges: ["JCR Q1", "中科院 1 区", "IF 18.8"],
  },
  {
    monogram: "JMLR",
    title: "Journal of Machine Learning Research",
    publisher: "Microtome Publishing · United States",
    badges: ["JCR Q1", "CCF A", "Open Access"],
  },
] as const;

/**
 * 期刊搜索与筛选 · 纯样式 fixture。
 * 对齐 product-mock JournalSearchResults + JournalFiltersPanel。
 */
export function WikiEmbedJournalSearch() {
  return (
    <div
      className="w-[min(100%,48rem)] overflow-hidden rounded-16 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="journal-search"
    >
      <section className="border-b border-border bg-surface-1 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-24 font-medium leading-display text-foreground">
              期刊搜索
            </h2>
            <p className="mt-1 text-12 text-faint">
              按刊名、ISSN、主办机构与评价信号检索
            </p>
          </div>
          <div className="flex gap-6 text-right text-12 text-faint">
            <p>
              <span className="block text-18 font-medium tabular-nums text-foreground">
                26,481
              </span>
              收录期刊
            </p>
            <p>
              <span className="block text-18 font-medium text-foreground">
                实时
              </span>
              同步状态
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-12 border border-border-strong bg-surface-card px-4">
            <Search className="size-4 shrink-0 text-faint" />
            <span className="truncate text-14 text-subtle">
              machine learning
            </span>
          </div>
          <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-12 bg-foreground px-4 text-14 font-medium text-on-dark">
            <Search className="size-4" />
            搜索期刊
          </span>
        </div>
      </section>

      <div className="grid md:grid-cols-[12rem_1fr]">
        <aside className="border-b border-border p-4 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-14 font-medium text-foreground">
              <SlidersHorizontal className="size-4" />
              筛选器
            </span>
            <span className="text-12 text-brand-red">清空</span>
          </div>

          <FilterGroup
            title="JCR 分区"
            options={["不限", "Q1", "Q2", "Q3 / Q4"]}
            active="Q1"
          />
          <FilterGroup
            title="中科院分区"
            options={["不限", "1 区", "2 区", "3 / 4 区"]}
          />
          <FilterGroup title="影响因子" options={["不限", "≥ 5", "≥ 10"]} />
        </aside>

        <main className="min-w-0 p-4">
          <header className="flex flex-wrap items-center justify-between gap-3 pb-3">
            <div>
              <h3 className="text-16 font-medium text-foreground">
                “machine learning” 的搜索结果
              </h3>
              <p className="mt-1 text-12 text-faint">按相关度排序</p>
            </div>
            <div className="flex gap-1">
              <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-foreground px-3 text-12 text-on-dark">
                <Sparkles className="size-3" />
                相关度
              </span>
              <span className="inline-flex h-7 items-center gap-1 rounded-8 border border-border px-3 text-12 text-subtle">
                <TrendingUp className="size-3" />
                影响因子
              </span>
            </div>
          </header>

          <ul className="space-y-3" data-wiki-spot="期刊结果">
            {JOURNALS.map((journal) => (
              <li
                key={journal.title}
                className="flex gap-3 rounded-12 border border-border p-3"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-8 bg-brand-amber-soft font-display text-12 font-medium text-brand-amber">
                  {journal.monogram}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-14 font-medium leading-sans text-foreground">
                    {journal.title}
                  </p>
                  <p className="mt-1 truncate text-12 text-faint">
                    {journal.publisher}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {journal.badges.map((badge, index) => (
                      <span
                        key={badge}
                        className={
                          index === 0
                            ? "rounded-pill bg-brand-green-soft px-2 py-1 text-12 font-medium text-brand-green"
                            : "rounded-pill bg-surface-2 px-2 py-1 text-12 text-subtle"
                        }
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}

function FilterGroup({
  title,
  options,
  active = "不限",
}: {
  title: string;
  options: readonly string[];
  active?: string;
}) {
  return (
    <section className="mt-4 border-t border-border-hairline pt-3">
      <h4 className="text-12 font-medium text-faint">{title}</h4>
      <div className="mt-2 space-y-1">
        {options.map((option) => (
          <div key={option} className="flex items-center gap-2 py-1 text-12">
            <span
              className={
                option === active
                  ? "flex size-3 items-center justify-center rounded-pill border border-brand-red"
                  : "size-3 rounded-pill border border-border"
              }
            >
              {option === active ? (
                <span className="size-1 rounded-pill bg-brand-red" />
              ) : null}
            </span>
            <span
              className={
                option === active
                  ? "font-medium text-foreground"
                  : "text-subtle"
              }
            >
              {option}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
