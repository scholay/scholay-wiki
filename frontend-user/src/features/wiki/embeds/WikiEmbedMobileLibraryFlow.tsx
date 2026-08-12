import {
  BookmarkCheck,
  ChevronDown,
  ChevronLeft,
  Plus,
  Quote,
  Share2,
} from "lucide-react";

const FOLDERS = [
  ["LLM 综述", "12 篇 · 2 小时前更新", "green"],
  ["医学影像", "8 篇 · 昨天更新", "amber"],
  ["待读论文", "4 篇 · 3 天前更新", "green"],
] as const;

const PAPERS = [
  {
    initial: "A",
    authors: "Ashish Vaswani 等 8 位作者",
    meta: "NeurIPS · 2017",
    title: "Attention Is All You Need",
    abstract: "提出仅由注意力机制组成的 Transformer 架构。",
    badge: "被引 14.2万",
  },
  {
    initial: "T",
    authors: "Tom B. Brown 等 31 位作者",
    meta: "NeurIPS · 2020",
    title: "Language Models are Few-Shot Learners",
    abstract: "研究大规模语言模型在少样本任务中的表现。",
    badge: "开放获取",
  },
] as const;

/** /m/library 文件夹列表到 /m/library/:folderId 的两级移动信息架构。 */
export function WikiEmbedMobileLibraryFlow() {
  return (
    <div
      className="grid w-[min(100%,50rem)] gap-4 md:grid-cols-2"
      aria-hidden
      data-wiki-fixture="mobile-library-flow"
    >
      <section className="overflow-hidden rounded-20 border border-border bg-surface-1">
        <RouteLabel step="1" route="/m/library" label="文件夹列表" />
        <header className="flex h-14 items-center border-b border-border bg-surface-card px-1">
          <ChevronLeft className="mx-2 size-5 text-muted-foreground" />
        </header>
        <div className="px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-20 font-medium text-foreground">我的收藏</h2>
              <p className="mt-1 text-12 text-muted-foreground">
                按主题整理你收藏的文献
              </p>
            </div>
            <span className="inline-flex h-9 items-center gap-2 rounded-8 bg-brand-red px-4 text-14 font-medium text-on-dark">
              <Plus className="size-3.5" />
              新建
            </span>
          </div>

          <div className="mt-4 flex items-center justify-between text-12 text-muted-foreground">
            <span>共 3 个文献集</span>
            <span className="inline-flex items-center gap-1">
              最近更新 <ChevronDown className="size-3.5" />
            </span>
          </div>

          <ul className="mt-3 space-y-2" data-wiki-spot="移动文献集列表">
            {FOLDERS.map(([name, meta, accent]) => (
              <li
                key={name}
                className="flex items-center gap-3 rounded-12 border border-border bg-surface-card p-4"
              >
                <FolderCover accent={accent} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-14 font-medium text-foreground">
                    {name}
                  </p>
                  <p className="mt-2 truncate text-12 text-muted-foreground">
                    {meta}
                  </p>
                </div>
                <span className="flex size-8 items-center justify-center rounded-pill border border-border text-muted-foreground">
                  <Share2 className="size-3.5" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="overflow-hidden rounded-20 border border-border bg-surface-card">
        <RouteLabel step="2" route="/m/library/:folderId" label="文件夹详情" />
        <header className="flex h-14 items-center gap-2 border-b border-border px-3">
          <ChevronLeft className="size-5 text-muted-foreground" />
          <h2 className="min-w-0 flex-1 truncate text-14 font-medium text-foreground">
            LLM 综述
          </h2>
          <span className="inline-flex items-center gap-1 rounded-pill border border-border px-3 py-2 text-12 text-muted-foreground">
            <Share2 className="size-3.5" />
            分享整本
          </span>
        </header>
        <div data-wiki-spot="移动文件夹论文列表">
          {PAPERS.map((paper) => (
            <article
              key={paper.title}
              className="flex gap-3 border-b border-border px-4 py-4"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-brand-green text-14 font-medium text-on-dark">
                {paper.initial}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-12 font-medium text-foreground">
                  {paper.authors}
                </p>
                <p className="truncate text-12 text-faint">{paper.meta}</p>
                <h3 className="mt-2 line-clamp-3 text-14 font-medium leading-sans text-foreground">
                  {paper.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-12 leading-paragraph text-muted-foreground">
                  {paper.abstract}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-pill bg-surface-2 px-2 py-1 text-12 text-muted-foreground">
                    {paper.badge}
                  </span>
                  <span className="rounded-pill bg-brand-green-soft px-2 py-1 text-12 text-brand-green">
                    已收藏
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between pr-2 text-12 font-medium text-foreground">
                  <span className="inline-flex items-center gap-2">
                    <BookmarkCheck className="size-3.5" /> 收藏
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Share2 className="size-3.5" /> 分享
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Quote className="size-3.5" /> 引用
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function RouteLabel({
  step,
  route,
  label,
}: {
  step: string;
  route: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 text-12">
      <span className="flex size-5 items-center justify-center rounded-pill bg-foreground font-medium text-on-dark">
        {step}
      </span>
      <code className="text-subtle">{route}</code>
      <span className="ml-auto text-faint">{label}</span>
    </div>
  );
}

function FolderCover({ accent }: { accent: "green" | "amber" }) {
  return (
    <div className="relative h-18 w-18 shrink-0">
      <div className="absolute left-4 top-2 h-14 w-11 rounded-4 border border-border bg-surface-1" />
      <div className="absolute left-2 top-1 h-16 w-11 rounded-4 border border-border bg-surface-card" />
      <div className="absolute left-0 top-0 flex h-16 w-12 flex-col gap-1 rounded-4 border border-border-strong bg-surface-card p-2">
        <div
          className={`h-1 w-5 rounded-4 ${accent === "green" ? "bg-brand-green" : "bg-brand-amber"}`}
        />
        <div className="h-0.5 w-8 rounded-4 bg-border-strong" />
        <div className="h-0.5 w-7 rounded-4 bg-border-strong" />
        <div className="h-0.5 w-8 rounded-4 bg-border-strong" />
      </div>
    </div>
  );
}
