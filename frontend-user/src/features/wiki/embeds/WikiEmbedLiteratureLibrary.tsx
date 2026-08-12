import {
  Check,
  ChevronDown,
  FileText,
  Folder,
  Import,
  MoreHorizontal,
  Plus,
  Quote,
  Search,
  Share2,
} from "lucide-react";

const FOLDERS = [
  ["默认文件夹", "28"],
  ["LLM 综述", "12"],
  ["Agent 综述", "7"],
] as const;

const PAPERS = [
  {
    title: "Denoising Diffusion Probabilistic Models",
    meta: "Jonathan Ho 等 · NeurIPS · 2020",
    pdf: "PDF 已上传",
  },
  {
    title: "High-Resolution Image Synthesis with Latent Diffusion Models",
    meta: "Robin Rombach 等 · CVPR · 2022",
    pdf: "PDF 缺失",
  },
  {
    title: "Elucidating the Design Space of Diffusion-Based Generative Models",
    meta: "Tero Karras 等 · NeurIPS · 2022",
    pdf: "PDF 已上传",
  },
] as const;

/**
 * 个人文献集 · 纯样式 fixture。
 * 对齐 product-mock LibraryPage + LibrarySidebar + LibraryPaperList + LibraryPaperRow。
 */
export function WikiEmbedLiteratureLibrary() {
  return (
    <div
      className="w-[min(100%,48rem)] overflow-hidden rounded-16 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="literature-library"
    >
      <div className="grid md:grid-cols-[12rem_1fr]">
        <aside className="border-b border-border bg-surface-1 p-3 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-14 font-medium text-foreground">
              我的文件夹
            </span>
            <span className="inline-flex items-center gap-1 text-12 text-subtle">
              <Plus className="size-3" />
              新建
            </span>
          </div>
          <nav className="mt-2 space-y-1" data-wiki-spot="文献集文件夹">
            {FOLDERS.map(([label, count], index) => (
              <div
                key={label}
                className={
                  index === 0
                    ? "flex h-8 items-center gap-2 rounded-8 bg-surface-card px-2 text-12 font-medium text-foreground"
                    : "flex h-8 items-center gap-2 rounded-8 px-2 text-12 text-subtle"
                }
              >
                <Folder
                  className={
                    index === 0 ? "size-3 text-brand-red" : "size-3 text-faint"
                  }
                />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="tabular-nums text-faint">{count}</span>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 p-4">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="font-display text-20 font-medium text-foreground">
                默认文件夹
              </h2>
              <p className="mt-1 text-12 text-faint">28 篇论文 · PDF 16 / 28</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 items-center gap-2 rounded-8 border border-border px-3 text-12 text-subtle">
                <Search className="size-3" />
                搜索文献
              </span>
              <span className="inline-flex h-8 items-center gap-2 rounded-8 bg-foreground px-3 text-12 font-medium text-on-dark">
                <Import className="size-3" />
                导入
              </span>
              <span className="inline-flex size-8 items-center justify-center rounded-8 border border-border text-subtle">
                <Share2 className="size-3" />
              </span>
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-12">
            <span className="text-faint">本页 3 篇 · 按加入时间排序</span>
            <span className="inline-flex items-center gap-1 text-subtle">
              排序：加入时间
              <ChevronDown className="size-3" />
            </span>
          </div>

          <ul
            className="divide-y divide-border-hairline"
            data-wiki-spot="文献列表"
          >
            {PAPERS.map((paper, index) => (
              <li key={paper.title} className="flex gap-3 py-4">
                <span
                  className={
                    index === 0
                      ? "mt-1 flex size-4 shrink-0 items-center justify-center rounded-4 border border-brand-red bg-brand-red text-on-dark"
                      : "mt-1 size-4 shrink-0 rounded-4 border border-border"
                  }
                >
                  {index === 0 ? (
                    <Check className="size-3" strokeWidth={3} />
                  ) : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <FileText className="mt-1 size-3 shrink-0 text-faint" />
                    <h3 className="line-clamp-2 text-14 font-medium leading-sans text-foreground">
                      {paper.title}
                    </h3>
                  </div>
                  <p className="mt-1 text-12 text-muted-foreground">
                    {paper.meta}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-12">
                    <span
                      className={
                        paper.pdf === "PDF 已上传"
                          ? "rounded-4 bg-brand-green-soft px-2 py-1 font-medium text-brand-green"
                          : "rounded-4 bg-surface-2 px-2 py-1 text-faint"
                      }
                    >
                      {paper.pdf}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-4 border border-brand-amber/40 px-2 py-1 text-brand-amber">
                      <Quote className="size-3" />
                      引用
                    </span>
                    <MoreHorizontal className="ml-auto size-4 text-faint" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}
