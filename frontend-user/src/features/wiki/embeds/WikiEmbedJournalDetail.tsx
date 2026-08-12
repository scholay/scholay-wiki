import {
  CalendarClock,
  ExternalLink,
  FileArchive,
  FileText,
  Lock,
  Share2,
  Unlock,
} from "lucide-react";
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

const INDEXES = [
  ["JCR 分区", "Q1", "科睿唯安"],
  ["中科院分区", "1区", "Top"],
  ["H-index", "h 142", "累计 h-index"],
  ["影响因子", "18.8", "IF"],
] as const;

const TREND = ["h-12", "h-14", "h-12", "h-16", "h-20", "h-24"] as const;

/** 期刊详情页：Hero、投稿资源、决策摘要、指标与年度趋势的完整数据态。 */
export function WikiEmbedJournalDetail() {
  return (
    <article
      className="w-full max-w-6xl space-y-6 rounded-8 border border-border bg-background p-4 sm:p-6"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="journal-detail"
    >
      <section className="flex flex-col gap-4 rounded-8 border border-border-hairline bg-surface-1 p-4 sm:flex-row sm:items-stretch sm:gap-6 sm:p-6">
        <div className="flex h-44 w-32 shrink-0 flex-col justify-between overflow-hidden rounded-8 bg-cat-1 p-3 text-on-brand">
          <span className="text-28 font-medium leading-display-tight">NMI</span>
          <span className="line-clamp-3 text-12 text-on-brand/85">
            Nature Machine Intelligence
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Springer Nature</Badge>
            <Badge>United Kingdom</Badge>
            <span className="inline-flex h-6 items-center rounded-pill bg-foreground px-3 text-12 font-medium uppercase text-on-dark">
              JOURNAL
            </span>
            <span className="inline-flex h-6 items-center rounded-pill bg-brand-green-soft px-3 text-12 font-medium text-brand-green">
              Open Access
            </span>
            <span className="inline-flex h-6 items-center rounded-pill bg-brand-green-soft px-3 text-12 font-medium text-brand-green">
              新锐 1 区 · Top
            </span>
          </div>

          <h2 className="font-display text-32 font-medium leading-display-tight text-foreground">
            Nature Machine Intelligence
          </h2>
          <p className="text-24 leading-paragraph text-subtle">
            由 Springer Nature 出版、总部位于 United Kingdom，属于学术期刊。
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-16 text-faint">
            <span className="font-mono">ISSN 2522-5839</span>
            <span>
              <strong className="font-medium text-subtle">h-index </strong>
              142
            </span>
            <span>
              <strong className="font-medium text-subtle">已收录于 </strong>7
              个数据源
            </span>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="inline-flex h-8 items-center gap-2 rounded-8 bg-foreground px-3 text-16 font-medium text-on-dark">
              <ExternalLink className="size-3" /> 查询原刊
            </span>
            <span className="inline-flex h-8 items-center gap-2 rounded-8 border border-border px-3 text-16 font-medium text-subtle">
              <Share2 className="size-3" /> 分享
            </span>
          </div>
        </div>

        <aside className="shrink-0 border-t border-border-hairline pt-4 sm:w-60 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-18 font-medium leading-display-tight text-foreground">
              投稿资源
            </h3>
            <span className="rounded-pill bg-brand-amber-soft px-2 py-1 text-12 font-medium text-brand-amber">
              Max
            </span>
          </div>
          <div className="mt-3 space-y-2">
            <Resource
              icon={FileText}
              title="投稿须知"
              detail="Guide for Authors · .md"
            />
            <Resource
              icon={FileArchive}
              title="LaTeX 模板"
              detail="nature · .zip"
            />
          </div>
          <p className="mt-3 text-12 leading-paragraph text-faint">
            下载为 Max 会员专享，升级后解锁。
          </p>
        </aside>
      </section>

      <section className="space-y-3 rounded-8 border border-border bg-background p-4 sm:p-6">
        <p className="text-12 font-medium uppercase text-faint">投稿决策</p>
        <p className="text-24 leading-paragraph text-foreground">
          影响因子 18.8 · 中科院新锐 1 区 · Top · 开放获取 · DOAJ 收录 · 初审约
          2.4 个月。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Signal icon={Unlock}>正规 OA（DOAJ）</Signal>
          <Signal icon={CalendarClock}>初审约 2.4 个月</Signal>
        </div>
        <p className="text-12 text-faint">
          数据综合自 JCR、中科院分区、SciRev、DOAJ 等来源，仅供选刊参考。
        </p>
      </section>

      <section data-wiki-spot="期刊指标">
        <h3 className="font-display text-28 font-medium leading-display-tight text-foreground">
          分区与影响因子
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {INDEXES.map(([label, value, sub], index) => (
            <IndexCard
              key={label}
              label={label}
              value={value}
              sub={sub}
              highlight={index === INDEXES.length - 1}
            />
          ))}
        </div>
      </section>

      <section className="rounded-8 border border-border bg-background p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-28 font-medium leading-display-tight text-foreground">
              年度影响因子趋势
            </h3>
            <p className="mt-1 text-16 text-faint">2019–2024 · JCR</p>
          </div>
          <span className="text-16 text-muted-foreground">
            最新 <strong className="font-medium text-foreground">18.8</strong>
          </span>
        </div>
        <div className="mt-6 flex h-28 items-end gap-3">
          {TREND.map((heightClass, index) => (
            <div
              key={`${heightClass}-${index}`}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <span
                className={
                  index === TREND.length - 1
                    ? `${heightClass} w-full rounded-t-8 bg-brand-amber`
                    : `${heightClass} w-full rounded-t-8 bg-foreground`
                }
              />
              <span className="text-12 tabular-nums text-faint">
                {2019 + index}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-8 border border-border bg-background p-4 sm:p-6">
        <h3 className="font-display text-18 font-medium leading-display-tight text-foreground">
          出版与收录
        </h3>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-16">
          <Field label="出版社" value="Springer Nature" />
          <Field label="国家 / 地区" value="United Kingdom" />
          <Field label="期刊类型" value="JOURNAL" />
          <Field label="开放获取" value="✓ Open Access" />
        </dl>
      </section>
    </article>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-pill border border-border bg-background px-3 text-12 font-medium text-subtle">
      {children}
    </span>
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
    <div className="flex items-center gap-2 rounded-8 border border-border bg-background p-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-subtle">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-16 font-medium text-foreground">{title}</p>
        <p className="truncate text-12 text-muted-foreground">{detail}</p>
      </div>
      <Lock className="size-4 shrink-0 text-faint" />
    </div>
  );
}

function Signal({
  icon: Icon,
  children,
}: {
  icon: typeof Unlock;
  children: string;
}) {
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-pill bg-brand-green-soft px-3 text-16 font-medium text-brand-green">
      <Icon className="size-4" /> {children}
    </span>
  );
}

function IndexCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "space-y-2 rounded-8 bg-foreground p-4 sm:p-6 text-on-dark"
          : "space-y-2 rounded-8 border border-border bg-background p-4 sm:p-6"
      }
    >
      <p
        className={
          highlight
            ? "text-12 font-medium uppercase text-on-dark/60"
            : "text-12 font-medium uppercase text-faint"
        }
      >
        {label}
      </p>
      <p className="font-display text-32 font-medium leading-display-tight tabular-nums">
        {value}
      </p>
      <p
        className={
          highlight
            ? "text-16 text-on-dark/60"
            : "text-16 text-muted-foreground"
        }
      >
        {sub}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-12 font-medium uppercase text-faint">{label}</dt>
      <dd className="mt-1 text-foreground">{value}</dd>
    </div>
  );
}
