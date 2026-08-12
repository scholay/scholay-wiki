import {
  Bookmark,
  ChevronUp,
  Compass,
  LayoutGrid,
  Search,
  Share2,
  SlidersHorizontal,
  User,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";
import { JournalCover } from "@/shared/components/JournalCover";

const TREND = [
  { year: 2020, value: 11.6 },
  { year: 2021, value: 13.2 },
  { year: 2022, value: 15.5 },
  { year: 2023, value: 18.8 },
] as const;

/** JournalFeedPage + JournalFeedCard 的当前刊冻结态。 */
export function WikiEmbedMobileJournalFeed() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-surface-card"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-journal-feed"
    >
      <FeedHeader />

      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-1">
        <article
          className="relative flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-background py-4 pr-16"
          style={{ paddingLeft: 20 }}
        >
          <div className="flex shrink-0 items-center gap-3">
            <JournalCover
              id={901}
              name="Nature Machine Intelligence"
              size="tile"
            />
            <div className="min-w-0 flex-1">
              <h2 className="line-clamp-2 text-24 font-medium leading-display-tight text-foreground">
                Nature Machine Intelligence
              </h2>
              <p className="mt-1 truncate text-14 text-muted-foreground">
                计算机科学 · 人工智能
              </p>
              <p className="mt-1 truncate text-12 text-faint">
                Springer Nature · United Kingdom
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Pill className="bg-brand-green text-on-brand">JCR Q1</Pill>
            <Pill className="bg-brand-amber text-foreground">
              中科院 1区 Top
            </Pill>
            <Pill className="bg-foreground text-on-brand">IF 18.8</Pill>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-16 border border-border bg-border">
            <Metric label="影响因子" value="18.8" highlight />
            <Metric label="H 指数" value="96" />
            <Metric label="累计发文" value="1,284" />
            <Metric label="平均初审" value="2.4 个月" />
          </div>

          <section className="shrink-0 rounded-16 border border-border bg-surface-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-14 font-medium text-foreground">
                近年趋势
              </span>
              <span className="rounded-pill bg-foreground px-2 py-1 text-12 font-medium text-on-dark">
                影响因子
              </span>
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={TREND}
                  margin={{ top: 16, right: 22, bottom: 0, left: 22 }}
                >
                  <XAxis
                    dataKey="year"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: "var(--text-12)",
                      fill: "var(--color-text-faint)",
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-brand-green)"
                    strokeWidth={2}
                    dot={{
                      r: 3,
                      fill: "var(--color-brand-green)",
                      strokeWidth: 0,
                    }}
                    isAnimationActive={false}
                    label={{
                      position: "top",
                      fontSize: "var(--text-12)",
                      fill: "var(--color-text-faint)",
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <p className="shrink-0 text-12 leading-paragraph text-muted-foreground">
            《Nature Machine Intelligence》是人工智能领域的高影响力学术期刊，
            也是中科院分区 Top 期刊。
          </p>

          <div
            className="absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-4"
            style={{ right: 10 }}
          >
            <Rail icon={Bookmark} label="收藏" />
            <Rail icon={Share2} label="分享" />
          </div>
        </article>

        <div className="pointer-events-none absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-pill bg-surface-card/80 px-3 py-1">
          <ChevronUp className="size-4 text-muted-foreground" />
          <span className="whitespace-nowrap text-12 text-muted-foreground">
            上滑 · 下一本期刊
          </span>
        </div>
        <div className="absolute inset-x-4 bottom-0 flex items-center gap-2 rounded-t-16 border border-b-0 border-border bg-surface-1/90 px-4 py-3">
          <JournalCover
            id={902}
            name="Journal of Machine Learning Research"
            size="tile"
            className="h-9 w-9 rounded-8"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-14 font-medium text-foreground">
              Journal of Machine Learning Research
            </p>
            <p className="truncate text-12 text-faint">
              计算机科学 · 影响因子 6.0
            </p>
          </div>
        </div>
      </div>

      <MobileNav />
    </div>
  );
}

function FeedHeader() {
  return (
    <header
      className="flex shrink-0 items-center justify-between bg-background px-4"
      style={{ height: 50 }}
    >
      <SlidersHorizontal className="size-5 text-muted-foreground" />
      <nav className="flex items-center gap-6">
        {["论文", "期刊", "情报"].map((label) => (
          <span key={label} className="flex flex-col items-center gap-1">
            <span
              className={
                label === "期刊"
                  ? "text-16 font-medium text-foreground"
                  : "text-14 text-faint"
              }
            >
              {label}
            </span>
            <span
              className={
                label === "期刊"
                  ? "h-0.5 w-5 rounded-pill bg-brand-red"
                  : "h-0.5 w-2"
              }
            />
          </span>
        ))}
      </nav>
      <Search className="size-5 text-muted-foreground" />
    </header>
  );
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`rounded-pill py-1 text-12 font-medium ${className}`}
      style={{ paddingInline: 10 }}
    >
      {children}
    </span>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="bg-surface-1 px-3"
      style={{ minHeight: 62, paddingBlock: 10 }}
    >
      <p className="text-12 text-faint">{label}</p>
      <p
        className={`mt-1 text-16 font-medium ${highlight ? "text-brand-green" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Rail({ icon: Icon, label }: { icon: typeof Bookmark; label: string }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="flex size-12 items-center justify-center rounded-pill border border-border-strong bg-surface-card text-subtle">
        <Icon className="size-5" />
      </span>
      <span className="text-12 text-faint">{label}</span>
    </span>
  );
}

function MobileNav() {
  const items = [
    [Compass, "浏览"],
    [ClawBrandIcon, "AI Claw"],
    [LayoutGrid, "功能"],
    [User, "我的"],
  ] as const;
  return (
    <footer className="grid h-16 shrink-0 grid-cols-4 border-t border-border bg-background px-2">
      {items.map(([Icon, label]) => (
        <span
          key={label}
          className={`relative flex flex-col items-center justify-center gap-1 ${label === "浏览" ? "text-foreground" : "text-faint"}`}
        >
          {label === "浏览" ? (
            <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
          ) : null}
          <Icon className="size-5" />
          <span className={`text-12 ${label === "浏览" ? "font-medium" : ""}`}>
            {label}
          </span>
        </span>
      ))}
    </footer>
  );
}
