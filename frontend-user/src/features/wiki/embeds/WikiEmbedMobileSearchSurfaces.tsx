import {
  BookmarkCheck,
  BookOpen,
  Check,
  Clock3,
  Quote,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  X,
} from "lucide-react";

const PAPER_RESULTS = [
  {
    author: "Ashish Vaswani 等 8 位作者",
    venue: "NeurIPS · 2017",
    title: "Attention Is All You Need",
    summary: "提出完全基于注意力机制的 Transformer 架构。",
    badges: ["被引 14.2 万", "开放获取"],
  },
  {
    author: "Jacob Devlin 等 4 位作者",
    venue: "NAACL · 2019",
    title: "BERT: Pre-training of Deep Bidirectional Transformers",
    summary: "通过双向上下文预训练改进多项自然语言理解任务。",
    badges: ["被引 10.8 万", "计算机科学"],
  },
] as const;

/** 移动悬浮搜索的论文结果态；对齐 MobileSearchOverlay + MobilePaperRow。 */
export function WikiEmbedMobileSearchPaperResults() {
  return (
    <div
      className="w-[min(100%,24rem)] overflow-hidden rounded-20 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="mobile-search-paper-results"
    >
      <header className="flex h-14 items-center gap-2 border-b border-border px-3">
        <X className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-pill border border-border bg-surface-1 px-3">
          <Search className="size-4 shrink-0 text-faint" />
          <span className="truncate text-14 text-foreground">
            transformer attention
          </span>
        </div>
        <span className="rounded-pill bg-brand-red px-3 py-2 text-12 font-medium text-on-brand">
          搜索
        </span>
      </header>

      <div className="flex items-center gap-2 overflow-hidden border-b border-border px-3 py-2 text-12">
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-border px-3 py-1 text-foreground">
          <SlidersHorizontal className="size-3" />
          筛选
          <span className="rounded-pill bg-brand-red px-2 py-1 text-on-brand">
            2
          </span>
        </span>
        <span className="shrink-0 rounded-pill bg-surface-2 px-3 py-1 text-muted-foreground">
          来源 · Graph
        </span>
        <span className="shrink-0 rounded-pill bg-surface-2 px-3 py-1 text-muted-foreground">
          排序 · 被引量
        </span>
      </div>

      <div>
        {PAPER_RESULTS.map((paper, index) => (
          <article
            key={paper.title}
            className="flex gap-3 border-b border-border px-4 py-4 last:border-b-0"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-brand-green text-14 font-medium text-on-brand">
              {index === 0 ? "A" : "B"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-12 font-medium text-foreground">
                {paper.author}
              </p>
              <p className="mt-1 truncate text-12 text-faint">{paper.venue}</p>
              <h3 className="mt-2 text-14 font-medium leading-sans text-foreground">
                {paper.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-12 leading-paragraph text-muted-foreground">
                {paper.summary}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {paper.badges.map((badge) => (
                  <span
                    key={badge}
                    className="rounded-pill bg-surface-2 px-2 py-1 text-12 text-subtle"
                  >
                    {badge}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between pr-2 text-12 text-foreground">
                <span className="inline-flex items-center gap-1">
                  <BookmarkCheck className="size-3" /> 收藏
                </span>
                <span className="inline-flex items-center gap-1">
                  <Share2 className="size-3" /> 分享
                </span>
                <span className="inline-flex items-center gap-1">
                  <Quote className="size-3" /> 引用
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="border-t border-border-soft px-4 py-3 text-center text-12 text-faint">
        没有更多了
      </p>
    </div>
  );
}

const FILTER_GROUPS = [
  {
    title: "数据源",
    options: ["Graph", "Discovery", "Medicine"],
    active: "Graph",
  },
  {
    title: "排序",
    options: ["相关度", "被引量", "最新发表"],
    active: "被引量",
  },
  {
    title: "时间范围",
    options: ["不限", "近 1 年", "近 3 年", "近 5 年"],
    active: "近 5 年",
  },
  {
    title: "最少引用",
    options: ["不限", "≥ 10", "≥ 50", "≥ 100"],
    active: "≥ 50",
  },
  {
    title: "学科",
    options: ["计算机科学", "医学", "生物学"],
    active: "计算机科学",
  },
  {
    title: "文献类型",
    options: ["期刊论文", "会议论文", "综述"],
    active: "会议论文",
  },
] as const;

/** 移动论文搜索的完整筛选底部抽屉。 */
export function WikiEmbedMobileSearchFilterSheet() {
  return (
    <div
      className="relative h-[42rem] w-[min(100%,24rem)] overflow-hidden rounded-20 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="mobile-search-filter-sheet"
    >
      <div className="flex h-14 items-center gap-2 border-b border-border bg-surface-card px-3 opacity-60">
        <X className="size-4 text-faint" />
        <span className="flex h-9 flex-1 items-center rounded-pill border border-border px-3 text-12 text-faint">
          搜索论文 / 关键词 / 作者
        </span>
        <span className="rounded-pill bg-brand-red px-3 py-2 text-12 text-on-brand">
          搜索
        </span>
      </div>
      <div className="absolute inset-0 bg-foreground/40" />

      <section className="absolute inset-x-0 bottom-0 flex max-h-[38rem] flex-col overflow-hidden rounded-t-20 bg-surface-card shadow-overlay">
        <div className="flex justify-center pb-1 pt-3">
          <span className="h-1 w-9 rounded-pill bg-border-strong" />
        </div>
        <div className="flex items-center border-b border-border-soft px-4 py-3">
          <h2 className="text-16 font-medium text-foreground">筛选</h2>
          <span className="ml-auto text-12 text-muted-foreground">重置</span>
          <X className="ml-4 size-5 text-muted-foreground" />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-2">
          {FILTER_GROUPS.map((group) => (
            <div
              key={group.title}
              className="border-t border-border-soft py-3 first:border-t-0"
            >
              <p className="mb-2 text-12 font-medium text-faint">
                {group.title}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.options.map((option) => (
                  <span
                    key={option}
                    className={
                      option === group.active
                        ? "rounded-pill border border-brand-red bg-brand-red px-3 py-2 text-12 text-on-brand"
                        : "rounded-pill border border-border px-3 py-2 text-12 text-muted-foreground"
                    }
                  >
                    {option}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border-soft py-3">
            <span className="text-12 font-medium text-foreground">
              仅开放获取
            </span>
            <span className="flex h-6 w-11 items-center justify-end rounded-pill bg-brand-red p-1">
              <span className="size-4 rounded-pill bg-surface-card" />
            </span>
          </div>
        </div>

        <div className="border-t border-border-soft p-3">
          <span className="flex h-11 items-center justify-center rounded-pill bg-brand-red text-12 font-medium text-on-brand">
            完成
          </span>
        </div>
      </section>
    </div>
  );
}

/** VerticalSwipeFeed 的加载、错误和真空态。 */
export function WikiEmbedMobileFeedStates() {
  return (
    <div
      className="grid w-[min(100%,56rem)] gap-4 md:grid-cols-3"
      aria-hidden
      data-wiki-fixture="mobile-feed-states"
    >
      <FeedState label="正在寻找内容" icon={<Search className="size-6" />}>
        <p>正在加载近期论文…</p>
        <span className="mt-3 inline-flex items-center gap-2 rounded-pill bg-surface-2 px-3 py-2 text-12 text-faint">
          <Clock3 className="size-3" /> 预取下一批
        </span>
      </FeedState>
      <FeedState label="加载失败" icon={<BookOpen className="size-6" />}>
        <p>论文加载失败，请稍后重试</p>
        <span className="mt-3 inline-flex items-center gap-2 rounded-pill border border-border px-4 py-2 text-12 text-foreground">
          <RotateCcw className="size-3" /> 重试
        </span>
      </FeedState>
      <FeedState label="暂时没有内容" icon={<Check className="size-6" />}>
        <p>暂时没有更多内容，换一批试试</p>
        <span className="mt-3 inline-flex items-center gap-2 rounded-pill border border-border px-4 py-2 text-12 text-foreground">
          <RotateCcw className="size-3" /> 换一批
        </span>
      </FeedState>
    </div>
  );
}

function FeedState({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-64 flex-col overflow-hidden rounded-20 border border-border bg-surface-card">
      <div className="border-b border-border-soft bg-surface-2 px-3 py-2 text-12 text-faint">
        {label}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-14 text-muted-foreground">
        <span className="mb-4 flex size-12 items-center justify-center rounded-pill bg-surface-2 text-subtle">
          {icon}
        </span>
        {children}
      </div>
    </section>
  );
}
