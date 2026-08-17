import type { CSSProperties } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Filter,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";

/**
 * The product mock predates the current token scales. Keep its white/gray
 * palette and compact type/radius geometry local to these frozen Wiki scenes.
 */
export const DISCOVERY_MOCK_THEME = {
  "--wiki-discovery-background": "0 0% 100%",
  "--wiki-discovery-surface-1": "0 0% 98%",
  "--wiki-discovery-surface-2": "0 0% 96.1%",
  "--wiki-discovery-surface-3": "0 0% 97.3%",
  "--wiki-discovery-foreground": "0 0% 6.7%",
  "--wiki-discovery-subtle": "0 0% 26.7%",
  "--wiki-discovery-muted": "0 0% 40%",
  "--wiki-discovery-faint": "0 0% 60%",
  "--wiki-discovery-border-soft": "0 0% 93.3%",
  "--wiki-discovery-border": "0 0% 91.4%",
  "--wiki-discovery-border-strong": "0 0% 84.7%",
  "--wiki-discovery-red": "0 71% 47%",
  "--wiki-discovery-green": "120 49% 32%",
  "--wiki-discovery-amber": "41 84% 47%",
  "--background": "hsl(var(--wiki-discovery-background))",
  "--surface-card": "hsl(var(--wiki-discovery-background))",
  "--surface-1": "hsl(var(--wiki-discovery-surface-1))",
  "--surface-2": "hsl(var(--wiki-discovery-surface-2))",
  "--surface-3": "hsl(var(--wiki-discovery-surface-3))",
  "--foreground": "hsl(var(--wiki-discovery-foreground))",
  "--subtle-foreground": "hsl(var(--wiki-discovery-subtle))",
  "--muted-foreground": "hsl(var(--wiki-discovery-muted))",
  "--faint-foreground": "hsl(var(--wiki-discovery-faint))",
  "--border-hairline": "hsl(var(--wiki-discovery-border-soft))",
  "--border": "hsl(var(--wiki-discovery-border))",
  "--border-strong": "hsl(var(--wiki-discovery-border-strong))",
  "--brand-red": "hsl(var(--wiki-discovery-red))",
  "--brand-green": "hsl(var(--wiki-discovery-green))",
  "--brand-amber": "hsl(var(--wiki-discovery-amber))",
  "--brand-red-soft":
    "color-mix(in srgb, hsl(var(--wiki-discovery-red)) 8%, hsl(var(--wiki-discovery-background)))",
  "--brand-green-soft":
    "color-mix(in srgb, hsl(var(--wiki-discovery-green)) 10%, hsl(var(--wiki-discovery-background)))",
  "--brand-amber-soft":
    "color-mix(in srgb, hsl(var(--wiki-discovery-amber)) 12%, hsl(var(--wiki-discovery-background)))",
  "--on-dark": "hsl(var(--wiki-discovery-background))",
  "--on-brand": "hsl(var(--wiki-discovery-background))",
  "--radius-4": "0.25rem",
  "--radius-8": "0.375rem",
  "--radius-12": "0.5rem",
  "--radius-16": "0.75rem",
  "--radius-20": "1rem",
  "--text-12": "0.625rem",
  "--text-14": "0.6875rem",
  "--text-16": "0.75rem",
  "--text-18": "0.8125rem",
  "--text-20": "0.875rem",
  "--text-24": "1rem",
  "--text-28": "1.25rem",
  "--text-32": "2rem",
  "--font-weight-medium": "700",
} as CSSProperties;

const JOURNALS = [
  {
    abbreviation: "NMI",
    title: "Nature Machine Intelligence",
    publisher: "Springer Nature",
    country: "United Kingdom",
    impact: "18.8",
    jcr: "JCR Q1",
    cas: "1区",
    ccf: "—",
    sources: "7 个数据源",
    submission: true,
    cover: "bg-cat-1",
  },
  {
    abbreviation: "JMLR",
    title: "Journal of Machine Learning Research",
    publisher: "Microtome Publishing",
    country: "United States",
    impact: "6.0",
    jcr: "JCR Q1",
    cas: "2区",
    ccf: "A",
    sources: "6 个数据源",
    submission: false,
    cover: "bg-cat-4",
  },
] as const;

/** 期刊库搜索结果页：单列行卡、顶栏筛选与三种互斥排序状态。 */
export function WikiEmbedJournalSearch() {
  return (
    <div
      className="w-full max-w-4xl overflow-hidden rounded-8 border border-border bg-background"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="journal-search"
    >
      <div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-7">
        <section className="flex flex-col items-center gap-6">
          <h2 className="font-display text-32 font-medium leading-display-tight text-foreground">
            期刊库搜索
          </h2>
          <div className="flex h-13 w-full items-center gap-3 rounded-8 border border-border-strong bg-background px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-18 text-foreground">
              machine learning
            </span>
          </div>
        </section>

        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-display text-28 font-medium leading-display-tight text-foreground">
                关键词 “machine learning” 的搜索结果
              </h3>
              <p className="text-16 text-faint">按相关度排序</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-7 items-center gap-1 rounded-8 border border-border bg-background px-3 text-16 text-subtle">
                <Filter className="size-3" />
                筛选
              </span>
              <SortChip icon={Sparkles} label="相关度" active />
              <SortChip icon={TrendingUp} label="影响因子" />
              <SortChip icon={BookOpen} label="最新" />
            </div>
          </div>
        </header>

        <div className="divide-y divide-border" data-wiki-spot="期刊结果">
          {JOURNALS.map((journal) => (
            <JournalRow key={journal.title} journal={journal} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SortChip({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof Sparkles;
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={
        active
          ? "inline-flex h-7 items-center gap-1 rounded-8 bg-foreground px-3 text-16 font-medium text-on-dark"
          : "inline-flex h-7 items-center gap-1 rounded-8 border border-border bg-background px-3 text-16 text-subtle"
      }
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

function JournalRow({ journal }: { journal: (typeof JOURNALS)[number] }) {
  return (
    <article className="flex items-start gap-4 py-4">
      <div
        className={`flex h-24 w-16 shrink-0 flex-col justify-between overflow-hidden rounded-4 p-2 text-on-brand ${journal.cover}`}
      >
        <span className="text-18 font-medium leading-display-tight">
          {journal.abbreviation}
        </span>
        <span className="line-clamp-3 text-12 text-on-brand/85">
          {journal.title}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <h4 className="truncate font-display text-18 font-medium text-foreground">
          {journal.title}
        </h4>
        <div className="mt-1 flex items-center gap-1 text-16 text-faint">
          <span className="min-w-0 truncate">{journal.publisher}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">{journal.country}</span>
          <span className="min-w-0 flex-1" />
          <span className="shrink-0 uppercase">JOURNAL</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ResultChip label={journal.jcr} tone="green" />
          <ResultChip label={`IF ${journal.impact}`} />
          <ResultChip label={`中科院 ${journal.cas}`} tone="green" />
          {journal.ccf !== "—" ? (
            <ResultChip label={`CCF ${journal.ccf}`} tone="green" />
          ) : null}
          <ResultChip label="OA" />
          {journal.submission ? <ResultChip label="投稿资源" /> : null}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <span className="text-12 text-faint">{journal.sources}</span>
          <span className="ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-8 border border-border px-2 text-16 font-medium text-foreground">
            查看详情 <ArrowUpRight className="size-3" />
          </span>
        </div>
      </div>
    </article>
  );
}

function ResultChip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "green" | "neutral";
}) {
  return (
    <span
      className={
        tone === "green"
          ? "inline-flex h-5 items-center rounded-4 bg-brand-green-soft px-2 text-12 font-medium text-brand-green"
          : "inline-flex h-5 items-center rounded-4 bg-surface-2 px-2 text-12 text-subtle"
      }
    >
      {label}
    </span>
  );
}
