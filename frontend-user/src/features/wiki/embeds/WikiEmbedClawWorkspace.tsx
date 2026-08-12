import {
  ChevronDown,
  Download,
  FileText,
  FolderClosed,
  History,
  Inbox,
  PanelRight,
  Pencil,
  SquarePen,
  Trash2,
} from "lucide-react";

const WORKSPACES = [
  { label: "暂存区", count: 3, icon: Inbox },
  { label: "我的文献", count: 18, icon: FolderClosed },
  { label: "项目资料", count: 6, icon: FolderClosed },
] as const;

/**
 * Claw 桌面工作区 · 纯样式 fixture。
 * 对齐 product-mock UnifiedSidebar + AgentSessionStrip + ConversationWorkspace
 * + ClawArtifactPanel；会话切换在主区会话条，左栏保留文献工作区。
 */
export function WikiEmbedClawWorkspace() {
  return (
    <div
      className="w-[min(100%,52rem)] overflow-hidden rounded-12 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="claw-workspace"
    >
      <div className="grid min-h-80 md:grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[10rem_minmax(0,1fr)_13rem]">
        <aside className="hidden border-r border-border-soft bg-surface-1 p-3 md:block">
          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <p className="text-12 font-medium text-foreground">工作区</p>
            <ChevronDown className="size-3 text-faint" />
          </div>
          <div className="mt-2 space-y-1">
            {WORKSPACES.map(({ label, count, icon: Icon }, index) => (
              <div
                key={label}
                className={
                  index === 0
                    ? "flex h-8 items-center gap-2 rounded-8 bg-danger-soft px-2 text-12 text-brand-red"
                    : "flex h-8 items-center gap-2 rounded-8 px-2 text-12 text-subtle"
                }
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="tabular-nums text-faint">{count}</span>
              </div>
            ))}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col bg-surface-card">
          <div className="border-b border-border-soft p-2">
            <div className="relative flex h-10 items-center rounded-12 border border-border bg-surface-card px-2 shadow-raised">
              <span className="inline-flex h-7 items-center gap-2 rounded-8 bg-surface-1 px-2 text-12 text-subtle">
                <History className="size-3.5" />
                <span className="font-medium tabular-nums text-foreground">
                  4
                </span>
              </span>
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-24 text-12 font-medium text-foreground">
                <span className="truncate">扩散模型综述</span>
              </span>
              <div className="ml-auto flex items-center gap-1">
                <span className="hidden size-7 items-center justify-center rounded-8 text-subtle sm:inline-flex">
                  <Pencil className="size-3.5" />
                </span>
                <span className="hidden size-7 items-center justify-center rounded-8 text-subtle sm:inline-flex">
                  <Trash2 className="size-3.5" />
                </span>
                <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-foreground px-2 text-12 font-medium text-on-dark">
                  <SquarePen className="size-3.5" />
                  新对话
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-3 p-4">
            <div className="ml-auto w-[min(100%,22rem)] rounded-16 rounded-tr-8 bg-foreground px-4 py-3 text-12 leading-paragraph text-on-dark">
              阅读这三篇论文，整理扩散模型用于医学影像重建的证据与局限。
            </div>
            <div className="w-[min(100%,24rem)] rounded-16 rounded-tl-8 border border-border bg-surface-card px-4 py-3 shadow-raised">
              <p className="text-12 leading-paragraph text-foreground">
                我会先核对引用资料，再按任务、数据集和评价指标整理一份可下载的研究备忘录。
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-8 bg-surface-1 px-3 py-2 text-12 text-subtle">
                <FileText className="size-3.5 text-brand-green" />
                <span className="min-w-0 flex-1 truncate">研究备忘录.md</span>
                <span className="text-brand-green">已生成</span>
              </div>
            </div>
          </div>

          <div className="border-t border-border-soft px-4 py-3">
            <div className="flex h-11 items-center rounded-16 border border-border-strong px-4 text-12 text-faint shadow-raised">
              继续补充研究问题或交付格式…
            </div>
          </div>
        </section>

        <aside className="hidden border-l border-border-soft bg-surface-1 lg:flex lg:flex-col">
          <div className="flex h-12 items-center gap-2 border-b border-border-soft px-3">
            <PanelRight className="size-3.5 text-faint" />
            <p className="text-12 font-medium text-foreground">扩展区 · 1</p>
          </div>
          <div className="p-3">
            <div className="rounded-8 border border-border bg-surface-card p-3">
              <div className="flex items-start gap-2">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-brand-green">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-12 font-medium text-foreground">
                    研究备忘录.md
                  </p>
                  <p className="mt-1 text-12 text-faint">刚刚生成 · 18 KB</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="inline-flex h-7 flex-1 items-center justify-center rounded-8 bg-foreground px-2 text-12 text-on-dark">
                  预览
                </span>
                <span className="inline-flex size-7 items-center justify-center rounded-8 border border-border text-subtle">
                  <Download className="size-3.5" />
                </span>
              </div>
            </div>
            <p className="mt-3 text-12 leading-paragraph text-faint">
              消息摘要与文件交付物分开保存；正式使用前请下载核对。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
