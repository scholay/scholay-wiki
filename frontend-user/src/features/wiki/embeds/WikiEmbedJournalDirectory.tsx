import { ArrowUpRight, BookOpen, Sparkles, TrendingUp } from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const DIRECTORY_JOURNALS = [
  {
    abbreviation: "NMI",
    title: "Nature Machine Intelligence",
    publisher: "Springer Nature · United Kingdom · OA",
    impact: "18.8",
    cas: "1区",
    ccf: "—",
    cover: "bg-cat-1",
  },
  {
    abbreviation: "TNNLS",
    title: "IEEE Transactions on Neural Networks and Learning Systems",
    publisher: "IEEE · United States",
    impact: "14.3",
    cas: "1区",
    ccf: "B",
    cover: "bg-cat-5",
  },
] as const;

/** 四个预设榜单中的 SCI Q1 落地页代表状态。 */
export function WikiEmbedJournalDirectory() {
  return (
    <section
      className="w-full max-w-6xl space-y-6 rounded-8 border border-border bg-background p-6 sm:p-8"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="journal-directory"
    >
      <header className="space-y-2">
        <p className="text-12 font-medium uppercase text-faint">期刊榜单</p>
        <h2 className="font-display text-32 font-medium leading-display-tight text-foreground">
          SCI 一区（JCR Q1）期刊
        </h2>
        <p className="max-w-3xl text-20 leading-paragraph text-muted-foreground">
          JCR 分区中的 Q1 代表各学科领域影响力最高的前 25%
          期刊。下方按影响因子排序， 可继续打开详情核对分区、趋势与投稿信息。
        </p>
        <nav
          className="flex flex-wrap items-center gap-2 pt-1"
          data-wiki-spot="期刊目录入口"
        >
          {["中科院一区", "CCF A 类", "高影响因子", "全部期刊检索"].map(
            (label) => (
              <span
                key={label}
                className="inline-flex h-7 items-center rounded-pill border border-border px-3 text-16 font-medium text-subtle"
              >
                {label}
              </span>
            ),
          )}
        </nav>
      </header>

      <div className="h-px bg-border" />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-28 font-medium leading-display-tight text-foreground">
            期刊列表
          </h3>
          <p className="text-16 text-faint">按影响因子排序</p>
        </div>
        <div className="flex items-center gap-2">
          <Sort icon={Sparkles} label="相关度" />
          <Sort icon={TrendingUp} label="影响因子" active />
          <Sort icon={BookOpen} label="最新" />
        </div>
      </header>

      <div
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        data-wiki-spot="榜单期刊卡片"
      >
        {DIRECTORY_JOURNALS.map((journal) => (
          <article
            key={journal.title}
            className="flex min-h-48 items-stretch gap-4 rounded-8 border border-border bg-background p-4"
          >
            <div
              className={`flex w-28 shrink-0 flex-col justify-between rounded-8 p-3 text-on-brand ${journal.cover}`}
            >
              <span className="text-28 font-medium leading-display-tight">
                {journal.abbreviation}
              </span>
              <span className="line-clamp-3 text-12 text-on-brand/85">
                {journal.title}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <h4 className="min-w-0 flex-1 truncate font-display text-18 font-medium text-foreground">
                    {journal.title}
                  </h4>
                  <span className="inline-flex h-6 shrink-0 items-center rounded-4 bg-brand-green-soft px-2 text-12 font-medium text-brand-green">
                    新锐 1 区
                  </span>
                </div>
                <p className="mt-1 truncate text-16 text-faint">
                  {journal.publisher}
                </p>
              </div>

              <div className="grid grid-cols-3 overflow-hidden rounded-8 border border-border-hairline">
                <Cell label="影响因子" value={journal.impact} hint="JCR Q1" />
                <Cell
                  label="中科院分区"
                  value={journal.cas}
                  hint="Top"
                  bordered
                />
                <Cell
                  label="CCF 等级"
                  value={journal.ccf}
                  hint={journal.ccf === "—" ? "—" : `CCF ${journal.ccf}`}
                  bordered
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-5 items-center rounded-4 bg-foreground px-2 text-12 font-medium text-on-dark">
                    JOURNAL
                  </span>
                  <span className="inline-flex h-5 items-center rounded-4 bg-surface-2 px-2 text-12 text-subtle">
                    7 个数据源
                  </span>
                </div>
                <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-8 border border-border px-2 text-16 font-medium text-foreground">
                  查看详情 <ArrowUpRight className="size-3" />
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Sort({
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
          : "inline-flex h-7 items-center gap-1 rounded-8 border border-border px-3 text-16 text-subtle"
      }
    >
      <Icon className="size-3" /> {label}
    </span>
  );
}

function Cell({
  label,
  value,
  hint,
  bordered = false,
}: {
  label: string;
  value: string;
  hint: string;
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
      <p className="truncate text-12 text-faint">{hint}</p>
    </div>
  );
}
