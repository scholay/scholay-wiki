import { ArrowUpRight, BadgeCheck, Bookmark, ExternalLink } from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const STATS = [
  ["发表论文", "186"],
  ["被引次数", "24,731"],
  ["H-Index", "68"],
  ["篇均被引", "133"],
] as const;

const PAPERS = [
  [
    "Robust Evaluation of Foundation Models",
    "Nature Machine Intelligence · 2024",
    "1,284",
  ],
  [
    "Evidence-Grounded Scientific Retrieval",
    "Information Retrieval Journal · 2023",
    "906",
  ],
  ["Human Oversight in Research Assistants", "CHI · 2022", "445"],
] as const;

const COLLABORATORS = [
  ["Maya Gupta", "University of Cambridge", "12", "bg-cat-2"],
  ["Daniel Park", "Institute for AI Research", "9", "bg-cat-5"],
  ["Sofia Rossi", "ETH Zürich", "7", "bg-cat-6"],
] as const;

const YEARS = [
  ["2019", "h-10", false],
  ["2020", "h-14", false],
  ["2021", "h-20", false],
  ["2022", "h-24", false],
  ["2023", "h-28", true],
  ["2024", "h-20", false],
] as const;

/** 学者详情页的数据完整态：Hero、主题、代表作、合作者与年度产出。 */
export function WikiEmbedAuthorProfile() {
  return (
    <article
      className="w-full max-w-6xl space-y-6 rounded-8 border border-border bg-background p-4 sm:p-8"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="author-profile"
    >
      <section className="flex flex-col gap-4 rounded-8 border border-border-hairline bg-surface-1 p-4 sm:flex-row sm:items-stretch sm:gap-8 sm:p-8">
        <div className="flex size-24 shrink-0 items-center justify-center rounded-pill bg-cat-6 text-on-brand sm:size-36">
          <span className="font-display text-32 font-medium leading-display-tight">
            L
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center gap-2 text-12 font-medium uppercase">
            <span className="text-brand-green">学者档案</span>
            <span className="text-border-strong">·</span>
            <span className="text-faint">Scholay Graph</span>
          </div>
          <h2 className="font-display text-32 font-medium leading-display-tight text-foreground">
            Lin Chen
          </h2>
          <p className="text-24 text-subtle">
            Institute for AI Research · Example University
          </p>
          <span className="inline-flex h-6 w-fit items-center gap-2 rounded-pill bg-brand-green-soft px-2 text-12 font-medium text-brand-green">
            <BadgeCheck className="size-4" /> ORCID 0000-0002-1825-0097
          </span>

          <div
            className="flex flex-wrap items-end gap-8 pt-2"
            data-wiki-spot="作者指标"
          >
            {STATS.map(([label, value]) => (
              <div key={label} className="space-y-1">
                <p className="font-display text-28 font-medium leading-display-tight tabular-nums text-foreground">
                  {value}
                </p>
                <p className="text-12 font-medium uppercase text-faint">
                  {label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 flex-row flex-wrap items-start gap-2 sm:flex-col sm:items-end">
          <Action icon={ExternalLink}>个人主页</Action>
          <Action icon={ExternalLink}>原始档案</Action>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end gap-3">
          <h3 className="font-display text-28 font-medium leading-display-tight text-foreground">
            研究方向
          </h3>
          <span className="text-16 text-faint">6 个方向</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["Artificial Intelligence", "18"],
            ["Machine Learning", "15"],
            ["Information Retrieval", "11"],
            ["Human–Computer Interaction", "8"],
            ["Scientific Discovery", "7"],
            ["Evaluation", "5"],
          ].map(([topic, count]) => (
            <span
              key={topic}
              className="inline-flex h-8 items-center gap-2 rounded-pill border border-border-hairline bg-surface-2 px-3 text-16"
            >
              <span className="font-medium text-foreground">{topic}</span>
              <span className="tabular-nums text-faint">{count}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <h3 className="font-display text-28 font-medium leading-display-tight text-foreground">
              代表作品
            </h3>
            <span className="text-16 text-faint">共 186 篇</span>
          </div>
          <ul className="space-y-3" data-wiki-spot="代表作品">
            {PAPERS.map(([title, meta, citations]) => (
              <li
                key={title}
                className="flex items-start gap-4 rounded-8 border border-border bg-background p-4 sm:p-6"
              >
                <div className="min-w-0 flex-1 space-y-2">
                  <h4 className="line-clamp-2 text-18 font-medium leading-sans text-foreground">
                    {title}
                  </h4>
                  <p className="text-16 text-faint">
                    {meta} · 被引{" "}
                    <span className="tabular-nums">{citations}</span> ·
                    <span className="font-medium text-brand-green"> OA</span>
                  </p>
                </div>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-subtle">
                  <Bookmark className="size-4" />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <h3 className="font-display text-28 font-medium leading-display-tight text-foreground">
              合作学者
            </h3>
            <span className="text-16 text-faint">Top 3</span>
          </div>
          <ul className="overflow-hidden rounded-8 border border-border bg-background">
            {COLLABORATORS.map(([name, affiliation, count, tone], index) => (
              <li
                key={name}
                className={`flex items-center gap-3 px-4 py-3 ${index > 0 ? "border-t border-border-hairline" : ""}`}
              >
                <span
                  className={`flex size-8 shrink-0 items-center justify-center rounded-pill text-12 font-medium text-on-brand ${tone}`}
                >
                  {name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-20 font-medium text-foreground">
                    {name}
                  </p>
                  <p className="truncate text-12 text-faint">{affiliation}</p>
                </div>
                <span className="shrink-0 text-12 tabular-nums text-faint">
                  合作 {count} 次
                </span>
                <ArrowUpRight className="size-4 shrink-0 text-faint" />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-4 rounded-8 border border-border bg-background p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-3">
            <h3 className="font-display text-28 font-medium leading-display-tight text-foreground">
              年度发表趋势
            </h3>
            <span className="text-16 text-faint">近 6 年</span>
          </div>
          <div className="flex items-center gap-4 text-12 text-faint">
            <span className="inline-flex items-center gap-2">
              <i className="size-2 rounded-4 bg-foreground" /> 年发表量
            </span>
            <span className="inline-flex items-center gap-2">
              <i className="size-2 rounded-4 bg-brand-amber" /> 峰值
            </span>
          </div>
        </div>
        <div className="flex h-36 items-end gap-4">
          {YEARS.map(([year, heightClass, peak]) => (
            <div
              key={year}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <span
                className={
                  peak
                    ? `${heightClass} w-full rounded-t-8 bg-brand-amber`
                    : `${heightClass} w-full rounded-t-8 bg-foreground`
                }
              />
              <span className="text-12 tabular-nums text-faint">{year}</span>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

function Action({
  icon: Icon,
  children,
}: {
  icon: typeof ExternalLink;
  children: string;
}) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-8 border border-border px-4 text-16 font-medium text-subtle">
      <Icon className="size-4" /> {children}
    </span>
  );
}
