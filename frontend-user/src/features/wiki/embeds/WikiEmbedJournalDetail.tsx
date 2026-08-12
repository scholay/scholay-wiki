import {
  ExternalLink,
  FileArchive,
  FileText,
  Lock,
  Share2,
} from "lucide-react";

const METRICS = [
  ["JCR 分区", "Q1", "科睿唯安"],
  ["中科院分区", "1 区", "大类分区"],
  ["H-index", "h 142", "累计指标"],
  ["影响因子", "18.8", "IF"],
] as const;

/**
 * 期刊详情与投稿资源 · 纯样式 fixture。
 * 对齐 product-mock JournalDetailPane + JournalMetricsGroups + JournalSubmissionCard。
 */
export function WikiEmbedJournalDetail() {
  return (
    <article
      className="w-[min(100%,48rem)] space-y-6 rounded-16 border border-border bg-surface-card p-6"
      aria-hidden
      data-wiki-fixture="journal-detail"
    >
      <section className="flex flex-col gap-6 rounded-12 border border-border bg-surface-1 p-6 sm:flex-row">
        <div className="flex h-36 w-28 shrink-0 flex-col justify-between rounded-8 bg-brand-amber-soft p-4 text-brand-amber">
          <span className="text-12 font-medium">NATURE</span>
          <span className="font-display text-20 font-medium leading-display">
            Machine Intelligence
          </span>
          <span className="text-12">JOURNAL</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-pill border border-border bg-surface-card px-2 py-1 text-12 text-subtle">
              Springer Nature
            </span>
            <span className="rounded-pill bg-brand-green-soft px-2 py-1 text-12 font-medium text-brand-green">
              Open Access
            </span>
            <span className="rounded-pill bg-brand-green-soft px-2 py-1 text-12 font-medium text-brand-green">
              新锐 1 区 · Top
            </span>
          </div>
          <h2 className="mt-3 font-display text-28 font-medium leading-display text-foreground">
            Nature Machine Intelligence
          </h2>
          <p className="mt-2 text-14 leading-paragraph text-subtle">
            由 Springer Nature 出版，收录人工智能、机器人与机器学习研究。
          </p>
          <p className="mt-2 text-12 text-faint">
            ISSN 2522-5839 · 已收录于 7 个数据源
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex h-8 items-center gap-2 rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark">
              <ExternalLink className="size-3" />
              查询原刊
            </span>
            <span className="inline-flex h-8 items-center gap-2 rounded-8 border border-border bg-surface-card px-3 text-12 text-subtle">
              <Share2 className="size-3" />
              分享
            </span>
          </div>
        </div>

        <aside className="border-t border-border pt-4 sm:w-40 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-16 font-medium text-foreground">
              投稿资源
            </h3>
            <span className="rounded-pill bg-brand-amber-soft px-2 py-1 text-12 font-medium text-brand-amber">
              Max
            </span>
          </div>
          <Resource
            icon={FileText}
            title="投稿须知"
            detail="Guide for Authors"
          />
          <Resource icon={FileArchive} title="LaTeX 模板" detail=".zip" />
          <p className="mt-2 text-12 leading-paragraph text-faint">
            下载为 Max 会员专享
          </p>
        </aside>
      </section>

      <section data-wiki-spot="期刊指标">
        <h3 className="font-display text-18 font-medium text-foreground">
          分区与影响因子
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {METRICS.map(([label, value, hint], index) => (
            <div
              key={label}
              className={
                index === METRICS.length - 1
                  ? "rounded-12 bg-foreground p-4 text-on-dark"
                  : "rounded-12 border border-border p-4"
              }
            >
              <p
                className={
                  index === METRICS.length - 1
                    ? "text-12 text-on-dark-muted"
                    : "text-12 text-faint"
                }
              >
                {label}
              </p>
              <p className="mt-2 font-display text-24 font-medium tabular-nums">
                {value}
              </p>
              <p
                className={
                  index === METRICS.length - 1
                    ? "mt-1 text-12 text-on-dark-muted"
                    : "mt-1 text-12 text-muted-foreground"
                }
              >
                {hint}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-display text-18 font-medium text-foreground">
          全部指标
        </h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <MetricGroup
            title="JCR · 科睿唯安"
            rows={[
              ["影响因子", "18.8"],
              ["数据年份", "2025"],
            ]}
          />
          <MetricGroup
            title="OpenAlex"
            rows={[
              ["发文量", "1,284"],
              ["被引量", "42,918"],
            ]}
          />
          <MetricGroup
            title="审稿与收录"
            rows={[
              ["平均初审", "2.4 月"],
              ["DOAJ 收录", "是"],
            ]}
          />
        </div>
      </section>
    </article>
  );
}

function Resource({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof FileText;
  title: string;
  detail: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-8 border border-border bg-surface-card p-2">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-subtle">
        <Icon className="size-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-12 font-medium text-foreground">{title}</p>
        <p className="truncate text-12 text-faint">{detail}</p>
      </div>
      <Lock className="size-3 shrink-0 text-faint" />
    </div>
  );
}

function MetricGroup({
  title,
  rows,
}: {
  title: string;
  rows: readonly (readonly [string, string])[];
}) {
  return (
    <div className="rounded-12 border border-border p-4">
      <h4 className="text-12 font-medium text-faint">{title}</h4>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-12">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
