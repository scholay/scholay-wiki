import {
  Bookmark,
  Compass,
  LayoutGrid,
  Quote,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  User,
  X,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";
import { Switch } from "@/shared/ui/switch";

const PAPERS = [
  {
    initial: "W",
    authors: "Wang, Li 等 8 位作者",
    meta: "Nature Medicine · 2025",
    title: "Foundation models for generalist medical artificial intelligence",
    abstract:
      "研究比较了多任务医学基础模型在跨机构影像数据上的泛化表现，并报告独立外部验证结果。",
    cited: "1.2k",
    open: true,
  },
  {
    initial: "M",
    authors: "Moor, Banerjee 等 12 位作者",
    meta: "npj Digital Medicine · 2024",
    title: "Foundation models for medical imaging: a comprehensive survey",
    abstract:
      "综述归纳视觉、语言与多模态预训练路线，重点讨论数据偏移、临床验证和可复现评测。",
    cited: "386",
    open: false,
  },
] as const;

const SEARCH_FILTER_GROUPS = [
  {
    title: "数据源",
    options: ["综合", "Graph", "Discovery", "Medicine"],
    active: "Graph",
  },
  { title: "排序", options: ["相关度"], active: "相关度" },
  {
    title: "时间范围",
    options: ["不限", "近 1 年", "近 3 年", "近 5 年"],
    active: "近 3 年",
  },
  {
    title: "最少引用",
    options: ["不限", "≥ 10", "≥ 50", "≥ 100"],
    active: "≥ 10",
  },
  {
    title: "学科",
    options: ["生物", "计算机科学", "工程", "医学", "心理学"],
    active: "医学",
  },
  {
    title: "文献类型",
    options: ["期刊论文", "综述", "会议论文", "预印本"],
    active: "综述",
  },
] as const;

/** MobileSearchOverlay 的论文结果状态。 */
export function WikiEmbedMobileSearchPaperResults() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-search-paper-results"
    >
      <FrozenSearchSurface />
    </div>
  );
}

/** MobileSearchFilterSheet 在搜索结果上的完整展开态。 */
export function WikiEmbedMobileSearchFilterSheet() {
  return (
    <div
      className="relative w-[min(100%,24rem)] overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-search-filter-sheet"
    >
      <FrozenSearchSurface muted />
      <div className="absolute inset-0 bg-foreground/40" />
      <section className="absolute inset-x-0 bottom-0 flex max-h-[82%] flex-col rounded-t-16 bg-background shadow-overlay">
        <div
          className="flex shrink-0 justify-center pb-1"
          style={{ paddingTop: 10 }}
        >
          <span className="h-1 w-9 rounded-pill bg-border-strong" />
        </div>
        <header className="flex items-center justify-between border-b border-border-soft px-4 py-3">
          <span className="text-14 font-medium text-foreground">筛选</span>
          <div className="flex items-center gap-4">
            <span className="text-12 text-muted-foreground">重置</span>
            <X className="size-5 text-muted-foreground" />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-2">
          {SEARCH_FILTER_GROUPS.slice(0, 3).map((group) => (
            <FilterGroup key={group.title} {...group} />
          ))}
          <div className="flex items-center justify-between border-t border-border-soft py-3">
            <span className="text-12 font-medium text-foreground">
              仅开放获取
            </span>
            <Switch checked tabIndex={-1} />
          </div>
          {SEARCH_FILTER_GROUPS.slice(3).map((group) => (
            <FilterGroup key={group.title} {...group} />
          ))}
        </div>

        <div className="border-t border-border-soft px-3 pt-3 pb-4">
          <span className="flex w-full items-center justify-center rounded-pill bg-brand-red py-3 text-12 font-medium text-on-brand">
            完成
          </span>
        </div>
      </section>
    </div>
  );
}

/** VerticalSwipeFeed 的单一错误状态。 */
export function WikiEmbedMobileFeedStates() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-feed-states"
    >
      <FeedTopTabs />
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-surface-1 px-8 text-center">
        <p className="text-12 text-muted-foreground">
          论文加载失败,请检查网络后重试
        </p>
        <span
          className="flex items-center rounded-pill border border-border-button text-12 text-foreground"
          style={{ gap: 6, paddingBlock: 6, paddingInline: 16 }}
        >
          <RotateCcw className="size-4" />
          重试
        </span>
      </main>
      <StaticMobileNav active="feed" />
    </div>
  );
}

function FrozenSearchSurface({ muted = false }: { muted?: boolean }) {
  return (
    <div className={`flex h-full flex-col ${muted ? "opacity-50" : ""}`}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        <X className="size-5 shrink-0 text-muted-foreground" />
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-pill border border-border bg-surface-1 px-3">
          <Search className="size-4 shrink-0 text-faint" />
          <span className="min-w-0 flex-1 truncate text-14 text-foreground">
            医学影像基础模型
          </span>
          <X className="size-4 shrink-0 text-faint" />
        </div>
        <span
          className="shrink-0 rounded-pill bg-brand-red text-12 font-medium text-on-brand"
          style={{ paddingBlock: 6, paddingInline: 14 }}
        >
          搜索
        </span>
      </header>

      <div className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-background px-3 py-2">
        <span
          className="inline-flex shrink-0 items-center rounded-pill border border-border text-12 text-foreground"
          style={{ gap: 4, paddingBlock: 4, paddingInline: 10 }}
        >
          <SlidersHorizontal className="size-4" />
          筛选
        </span>
        <span
          className="shrink-0 rounded-pill bg-surface-2 text-12 text-muted-foreground"
          style={{ paddingBlock: 4, paddingInline: 10 }}
        >
          来源 · Graph
        </span>
        <span
          className="shrink-0 rounded-pill bg-surface-2 text-12 text-muted-foreground"
          style={{ paddingBlock: 4, paddingInline: 10 }}
        >
          排序 · 相关度
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden bg-background">
        {PAPERS.map((paper) => (
          <FrozenPaperRow key={paper.title} {...paper} />
        ))}
        <div className="flex h-12 items-center justify-center text-12 text-faint">
          没有更多了
        </div>
      </div>
    </div>
  );
}

function FrozenPaperRow({
  initial,
  authors,
  meta,
  title,
  abstract,
  cited,
  open,
}: (typeof PAPERS)[number]) {
  return (
    <article
      className="flex gap-3 border-b border-border px-4"
      style={{ paddingBlock: 14 }}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-brand-green text-14 font-medium text-on-brand">
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-12 font-medium text-foreground">
          {authors}
        </p>
        <p className="truncate text-12 text-faint">{meta}</p>
        <h3
          className="line-clamp-3 text-16 font-medium text-foreground"
          style={{ marginTop: 6 }}
        >
          {title}
        </h3>
        <p className="mt-1 line-clamp-3 text-14 leading-paragraph text-muted-foreground">
          {abstract}
        </p>
        <div
          className="flex flex-wrap items-center"
          style={{ gap: 6, marginTop: 8 }}
        >
          <span
            className="rounded-pill bg-surface-2 text-12 font-medium text-muted-foreground"
            style={{ paddingBlock: 2, paddingInline: 8 }}
          >
            被引 {cited}
          </span>
          {open ? (
            <span
              className="rounded-pill bg-brand-green/10 text-12 font-medium text-brand-green"
              style={{ paddingBlock: 2, paddingInline: 8 }}
            >
              开放获取
            </span>
          ) : null}
        </div>
        <div
          className="flex items-center justify-between pr-2"
          style={{ marginTop: 10 }}
        >
          <PaperAction icon={Bookmark} label="收藏" />
          <PaperAction icon={Share2} label="分享" />
          <PaperAction icon={Quote} label="引用" />
        </div>
      </div>
    </article>
  );
}

function PaperAction({
  icon: Icon,
  label,
}: {
  icon: typeof Bookmark;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center text-14 font-medium text-foreground"
      style={{ gap: 6 }}
    >
      <Icon className="size-4" />
      {label}
    </span>
  );
}

function FilterGroup({
  title,
  options,
  active,
}: {
  title: string;
  options: readonly string[];
  active: string;
}) {
  return (
    <div className="border-t border-border-soft py-3 first:border-t-0">
      <p className="mb-2 text-12 font-medium text-faint">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <span
            key={option}
            className={`rounded-pill border text-12 ${option === active ? "border-brand-red bg-brand-red text-on-brand" : "border-border bg-background text-muted-foreground"}`}
            style={{ paddingBlock: 6, paddingInline: 12 }}
          >
            {option}
          </span>
        ))}
      </div>
    </div>
  );
}

function FeedTopTabs() {
  return (
    <header
      className="flex shrink-0 items-center justify-between bg-background px-4"
      style={{ height: 50 }}
    >
      <SlidersHorizontal className="size-5 text-muted-foreground" />
      <div className="flex items-center gap-6">
        {[
          ["论文", true],
          ["期刊", false],
          ["情报", false],
        ].map(([label, active]) => (
          <span
            key={String(label)}
            className="flex flex-col items-center gap-1"
          >
            <span
              className={
                active
                  ? "text-16 font-medium text-foreground"
                  : "text-14 text-faint"
              }
            >
              {label}
            </span>
            <span
              className={`h-0.5 rounded-pill ${active ? "w-5 bg-brand-red" : "w-2 bg-transparent"}`}
            />
          </span>
        ))}
      </div>
      <Search className="size-5 text-muted-foreground" />
    </header>
  );
}

function StaticMobileNav({ active }: { active: "feed" }) {
  const items = [
    [Compass, "浏览", "feed"],
    [ClawBrandIcon, "AI Claw", "claw"],
    [LayoutGrid, "功能", "tools"],
    [User, "我的", "me"],
  ] as const;

  return (
    <footer className="grid h-16 shrink-0 grid-cols-4 border-t border-border bg-background px-2">
      {items.map(([Icon, label, key]) => {
        const selected = key === active;
        return (
          <span
            key={key}
            className={`relative flex flex-col items-center justify-center gap-1 ${selected ? "text-foreground" : "text-faint"}`}
          >
            {selected ? (
              <span className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red" />
            ) : null}
            <Icon className="size-5" />
            <span className={`text-12 ${selected ? "font-medium" : ""}`}>
              {label}
            </span>
          </span>
        );
      })}
    </footer>
  );
}
