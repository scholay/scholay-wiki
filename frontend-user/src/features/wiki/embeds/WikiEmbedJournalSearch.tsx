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
    publisher: "Springer Nature · United Kingdom · OA",
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
    publisher: "Microtome Publishing · United States · OA",
    impact: "6.0",
    jcr: "JCR Q1",
    cas: "2区",
    ccf: "A",
    sources: "6 个数据源",
    submission: false,
    cover: "bg-cat-4",
  },
] as const;

/** 期刊搜索结果页：默认 Hero、排序栏、双列结果卡与关闭态悬浮筛选器。 */
export function WikiEmbedJournalSearch() {
  return (
    <div
      className="relative w-full max-w-6xl overflow-hidden rounded-8 border border-border bg-background"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="journal-search"
    >
      <div className="space-y-6 p-6 sm:p-8">
        <section className="space-y-4 rounded-8 border border-border-hairline bg-surface-1 p-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="space-y-1">
              <h2 className="font-display text-32 font-medium leading-display-tight text-foreground">
                期刊搜索
              </h2>
              <p className="text-24 text-faint">
                Journal Search ·
                检索全球期刊与顶会，按学科、分区、影响因子精准筛选
              </p>
            </div>
            <div className="hidden shrink-0 items-end gap-6 md:flex">
              <Kpi value="26,481" label="收录期刊" />
              <Kpi value="184,706" label="数据源覆盖" />
              <Kpi value="实时" label="同步状态" />
            </div>
          </div>

          <div className="flex h-13 items-center gap-2">
            <div className="flex h-13 min-w-0 flex-1 items-center gap-3 rounded-8 border border-border-strong bg-background px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-18 text-foreground">
                machine learning
              </span>
            </div>
            <span className="inline-flex h-13 shrink-0 items-center gap-2 rounded-8 bg-foreground px-6 text-24 font-medium text-on-dark">
              <Search className="size-4" />
              搜索期刊
            </span>
          </div>
        </section>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-display text-28 font-medium leading-display-tight text-foreground">
              关键词 “machine learning” 的搜索结果
            </h3>
            <p className="text-16 text-faint">按相关度排序</p>
          </div>
          <div className="flex items-center gap-2">
            <SortChip icon={Sparkles} label="相关度" active />
            <SortChip icon={TrendingUp} label="影响因子" />
            <SortChip icon={BookOpen} label="最新" />
          </div>
        </header>

        <div
          className="grid grid-cols-1 gap-4 lg:grid-cols-2"
          data-wiki-spot="期刊结果"
        >
          {JOURNALS.map((journal) => (
            <JournalCard key={journal.title} journal={journal} />
          ))}
        </div>
      </div>

      <span className="absolute right-4 top-4 inline-flex h-10 items-center gap-2 rounded-pill border border-border bg-background/95 px-4 text-16 font-medium text-foreground shadow-raised">
        <Filter className="size-4" />
        筛选
        <span className="inline-flex size-5 items-center justify-center rounded-pill bg-brand-red text-12 text-on-brand">
          1
        </span>
      </span>
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="font-display text-28 font-medium leading-display-tight tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-12 font-medium uppercase text-faint">{label}</span>
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

function JournalCard({ journal }: { journal: (typeof JOURNALS)[number] }) {
  return (
    <article className="flex min-h-48 items-stretch gap-4 rounded-8 border border-border bg-background p-4">
      <div
        className={`flex w-28 shrink-0 flex-col justify-between overflow-hidden rounded-8 p-3 text-on-brand ${journal.cover}`}
      >
        <span className="text-28 font-medium leading-display-tight">
          {journal.abbreviation}
        </span>
        <span className="line-clamp-3 text-12 text-on-brand/85">
          {journal.title}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <h4 className="truncate font-display text-18 font-medium text-foreground">
              {journal.title}
            </h4>
            <p className="truncate text-16 text-faint">{journal.publisher}</p>
          </div>
          <span className="inline-flex h-6 shrink-0 items-center rounded-4 bg-brand-green-soft px-2 text-12 font-medium text-brand-green">
            新锐 1 区
          </span>
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-8 border border-border-hairline">
          <Metric label="影响因子" value={journal.impact} sub={journal.jcr} />
          <Metric
            label="中科院分区"
            value={journal.cas}
            sub="大类分区"
            bordered
          />
          <Metric
            label="CCF 等级"
            value={journal.ccf}
            sub={journal.ccf === "—" ? "—" : `CCF ${journal.ccf}`}
            bordered
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="inline-flex h-5 items-center rounded-4 bg-foreground px-2 text-12 font-medium uppercase text-on-dark">
              JOURNAL
            </span>
            <span className="inline-flex h-5 items-center rounded-4 bg-surface-2 px-2 text-12 text-subtle">
              {journal.sources}
            </span>
            {journal.submission ? (
              <span className="inline-flex h-5 items-center rounded-4 bg-brand-amber-soft px-2 text-12 text-brand-amber">
                投稿资源
              </span>
            ) : null}
          </div>
          <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-8 border border-border px-2 text-16 font-medium text-foreground">
            查看详情 <ArrowUpRight className="size-3" />
          </span>
        </div>
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  sub,
  bordered = false,
}: {
  label: string;
  value: string;
  sub: string;
  bordered?: boolean;
}) {
  return (
    <div
      className={`min-w-0 space-y-1 px-3 py-2 ${bordered ? "border-l border-border-hairline" : ""}`}
    >
      <p className="truncate text-12 font-medium uppercase text-faint">
        {label}
      </p>
      <p className="truncate font-display text-28 font-medium leading-display-tight tabular-nums text-foreground">
        {value}
      </p>
      <p className="truncate text-12 text-faint">{sub}</p>
    </div>
  );
}
