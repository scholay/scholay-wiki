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
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";
import { JournalCover } from "@/shared/components/JournalCover";

/** /m/feed/journals 代表态；对齐全出血期刊卡、操作栏与独有的下一刊预览。 */
export function WikiEmbedMobileJournalFeed() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden rounded-20 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="mobile-journal-feed"
    >
      <header className="flex h-12 items-center justify-between px-4">
        <SlidersHorizontal className="size-5 text-muted-foreground" />
        <nav className="flex items-center gap-6">
          <FeedTab label="论文" />
          <FeedTab label="期刊" active />
          <FeedTab label="情报" />
        </nav>
        <Search className="size-5 text-muted-foreground" />
      </header>

      <article className="relative flex h-[35rem] flex-col gap-4 overflow-hidden border-t border-border px-6 py-4 pr-16">
        <div className="flex shrink-0 items-center gap-3">
          <JournalCover
            id={901}
            name="Nature Machine Intelligence"
            size="tile"
          />
          <div className="min-w-0 flex-1">
            <h2 className="line-clamp-2 text-20 font-medium leading-display-tight text-foreground">
              Nature Machine Intelligence
            </h2>
            <p className="mt-1 truncate text-12 text-muted-foreground">
              计算机科学 · 人工智能
            </p>
            <p className="truncate text-12 text-faint">
              Springer Nature · United Kingdom
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-pill bg-brand-green px-3 py-1 text-12 font-medium text-on-dark">
            JCR Q1
          </span>
          <span className="rounded-pill bg-brand-amber px-3 py-1 text-12 font-medium text-on-dark">
            中科院 1区 Top
          </span>
          <span className="rounded-pill bg-foreground px-3 py-1 text-12 font-medium text-on-dark">
            IF 18.8
          </span>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-8 border border-border bg-border">
          <Metric label="影响因子" value="18.8" highlight />
          <Metric label="H 指数" value="96" />
          <Metric label="累计发文" value="1,284" />
          <Metric label="平均初审" value="2.4 个月" />
        </div>

        <div className="rounded-8 border border-border bg-surface-1 p-3">
          <div className="flex items-center justify-between text-12 text-faint">
            <span>年度趋势</span>
            <span>影响因子</span>
          </div>
          <div className="mt-4 flex h-20 items-end gap-2">
            {[36, 45, 52, 49, 68, 82, 74, 91].map((height, index) => (
              <span
                key={`${height}-${index}`}
                className="flex-1 rounded-t-4 bg-brand-green"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>

        <p className="text-12 leading-paragraph text-muted-foreground">
          《Nature Machine Intelligence》是人工智能领域的高影响力学术期刊，
          也是中科院分区 Top 期刊。
        </p>

        <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 flex-col items-center gap-4">
          <Rail icon={Bookmark} label="收藏" />
          <Rail icon={Share2} label="分享" />
        </div>

        <div className="absolute inset-x-4 bottom-0 flex items-center gap-2 rounded-t-16 border border-b-0 border-border bg-surface-1/90 px-4 py-3">
          <JournalCover
            id={902}
            name="Journal of Machine Learning Research"
            size="tile"
            className="h-9 w-9 rounded-4"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-12 font-medium text-foreground">
              Journal of Machine Learning Research
            </p>
            <p className="truncate text-12 text-faint">
              计算机科学 · 影响因子 6.0
            </p>
          </div>
          <ChevronUp className="size-4 text-faint" />
        </div>
      </article>

      <footer className="grid h-16 grid-cols-4 border-t border-border px-2">
        <MobileNav icon={Compass} label="浏览" active />
        <MobileNav icon={ClawBrandIcon} label="AI Claw" />
        <MobileNav icon={LayoutGrid} label="功能" />
        <MobileNav icon={User} label="我的" />
      </footer>
    </div>
  );
}

function FeedTab({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className={
          active ? "text-16 font-medium text-foreground" : "text-14 text-faint"
        }
      >
        {label}
      </span>
      <span
        className={
          active ? "h-0.5 w-5 rounded-pill bg-brand-red" : "h-0.5 w-1.5"
        }
      />
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
    <div className="min-h-16 bg-surface-1 px-3 py-3">
      <p className="text-12 text-faint">{label}</p>
      <p
        className={`mt-1 text-18 font-medium ${highlight ? "text-brand-green" : "text-foreground"}`}
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

function MobileNav({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof Compass;
  label: string;
  active?: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-1">
      {active ? (
        <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
      ) : null}
      <Icon className="size-5" />
      <span
        className={
          active ? "text-12 font-medium text-foreground" : "text-12 text-faint"
        }
      >
        {label}
      </span>
    </div>
  );
}
