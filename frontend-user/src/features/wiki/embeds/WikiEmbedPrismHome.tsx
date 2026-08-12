import {
  ChevronRight,
  Clock3,
  FilePlus2,
  FileText,
  FolderOpen,
  Plus,
} from "lucide-react";

const PROJECTS = [
  { title: "扩散模型医学影像综述", meta: "刚刚编辑", active: true },
  { title: "Mamba 长序列实验", meta: "昨天", active: false },
  { title: "未命名项目", meta: "7 月 28 日", active: false },
] as const;

/** Prism 项目首页 · 纯样式 fixture，对齐 product-mock PrismHome。 */
export function WikiEmbedPrismHome() {
  return (
    <div
      className="w-[min(100%,46rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="prism-home"
    >
      <div className="grid min-h-72 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-border-soft bg-surface-1 p-3 sm:block">
          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <div className="flex items-center gap-2 text-12 font-medium text-foreground">
              <FolderOpen className="size-3.5 text-brand-red" />
              我的项目
            </div>
            <span className="tabular-nums text-12 text-faint">3</span>
          </div>
          <div className="mt-2 space-y-1">
            {PROJECTS.map((project) => (
              <div
                key={project.title}
                className={
                  project.active
                    ? "rounded-8 bg-surface-card px-3 py-2 shadow-raised"
                    : "rounded-8 px-3 py-2"
                }
              >
                <p className="truncate text-12 font-medium text-foreground">
                  {project.title}
                </p>
                <p className="mt-1 flex items-center gap-1 text-12 text-faint">
                  <Clock3 className="size-3" />
                  {project.meta}
                </p>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex flex-col justify-center px-4 py-8 sm:px-8">
          <div className="mx-auto w-full max-w-md">
            <div className="inline-flex size-10 items-center justify-center rounded-12 bg-danger-soft text-brand-red">
              <FileText className="size-5" />
            </div>
            <h2 className="mt-4 font-serif text-20 font-medium text-foreground">
              开始一篇学术文稿
            </h2>
            <p className="mt-2 text-12 leading-paragraph text-subtle">
              从结构化文档开始，使用 AI 对话起草、修订，并编译为 PDF。
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-12 border border-brand-red/30 bg-danger-soft p-4">
                <span className="inline-flex size-8 items-center justify-center rounded-8 bg-surface-card text-brand-red">
                  <Plus className="size-4" />
                </span>
                <p className="mt-3 text-14 font-medium text-foreground">
                  新建项目
                </p>
                <p className="mt-1 text-12 text-subtle">项目名可稍后补充</p>
              </div>
              <div className="rounded-12 border border-border bg-surface-card p-4">
                <span className="inline-flex size-8 items-center justify-center rounded-8 bg-surface-1 text-subtle">
                  <FilePlus2 className="size-4" />
                </span>
                <p className="mt-3 text-14 font-medium text-foreground">
                  打开最近项目
                </p>
                <p className="mt-1 truncate text-12 text-subtle">
                  扩散模型医学影像综述
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-8 border border-border-soft px-3 py-2 text-12 text-faint">
              <FileText className="size-3.5" />
              旧版 LaTeX 项目进入兼容查看，不会挂载空编辑器。
              <ChevronRight className="ml-auto size-3.5" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
