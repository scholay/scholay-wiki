import { Clock3, FolderOpen, PenTool, Plus } from "lucide-react";
import { PRISM_MOCK_THEME } from "./WikiEmbedPrismSurfaces";

const PROJECTS = [
  { title: "扩散模型医学影像综述", meta: "刚刚编辑" },
  { title: "Mamba 长序列实验", meta: "昨天" },
  { title: "未命名项目", meta: "7 月 28 日" },
] as const;

/** PrismHome 已有项目但 activeProjectId=null 时的桌面首页。 */
export function WikiEmbedPrismHome() {
  return (
    <div
      className="flex h-[34rem] w-[min(100%,64rem)] overflow-hidden bg-background"
      style={PRISM_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="prism-home"
    >
      <aside className="hidden w-60 shrink-0 border-r border-border bg-background p-3 sm:block">
        <div className="flex items-center justify-between gap-2 px-2 py-2">
          <div className="flex items-center gap-2 text-12 font-medium text-foreground">
            <FolderOpen className="size-3.5 text-brand-red" />
            我的项目
          </div>
          <span className="tabular-nums text-12 text-faint">3</span>
        </div>
        <div className="mt-2 space-y-1">
          {PROJECTS.map((project) => (
            <div key={project.title} className="rounded-8 px-3 py-2">
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

      <main className="flex min-w-0 flex-1 flex-col items-center justify-center bg-background px-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-pill bg-brand-red/10">
          <PenTool className="size-7 text-brand-red" strokeWidth={2} />
        </div>
        <h1 className="mt-5 font-serif text-24 font-medium text-foreground">
          智能写作 · Scholay Prism
        </h1>
        <p className="mt-2 max-w-md text-14 leading-paragraph text-muted-foreground">
          科研级 LaTeX 写作工作区——实时编译预览、AI
          定点改写润色、文献库一键引用。
          从左侧选择一个项目继续，或新建一个开始。
        </p>
        <span className="mt-6 inline-flex h-9 items-center gap-2 rounded-8 bg-brand-red px-4 text-12 font-medium text-on-brand">
          <Plus className="size-3.5" />
          新建写作项目
        </span>
        <p className="mt-3 text-12 text-faint">已有 3 个项目，在左侧边栏查看</p>
      </main>
    </div>
  );
}
