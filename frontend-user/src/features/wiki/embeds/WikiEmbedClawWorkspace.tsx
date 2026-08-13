import {
  ArrowUp,
  ChevronDown,
  Download,
  FileText,
  FolderArchive,
  FolderClosed,
  History,
  Inbox,
  Pencil,
  Plus,
  Puzzle,
  SquarePen,
  Trash2,
} from "lucide-react";
import type { CSSProperties } from "react";

const WORKSPACE_MOCK_THEME = {
  "--wiki-mock-space-5": "1.25rem",
  "--wiki-mock-space-2-5": "0.625rem",
} as CSSProperties;

const WORKSPACES = [
  { label: "暂存区", count: 3, icon: Inbox },
  { label: "我的文献", count: 18, icon: FolderClosed },
  { label: "项目资料", count: 6, icon: FolderClosed },
] as const;

/**
 * Claw 桌面会话工作区 · 纯样式 fixture。
 * 视觉层级对齐 product-mock SearchSidebar + AgentSessionStrip + ConversationWorkspace，
 * 右侧采用 current 的“扩展区”口径；冻结已有会话且扩展区已打开的单一桌面状态。
 */
export function WikiEmbedClawWorkspace() {
  return (
    <div
      className="w-[min(100%,58rem)] overflow-hidden rounded-16 border border-border bg-surface-card"
      style={WORKSPACE_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="claw-workspace"
    >
      <div className="grid min-h-96 md:grid-cols-[11rem_minmax(0,1fr)] lg:grid-cols-[11rem_minmax(0,1fr)_14rem]">
        <WorkspaceSidebar />

        <section className="flex min-w-0 flex-col bg-surface-card">
          <div className="px-4 pb-2 pt-2">
            <SessionStrip />
          </div>

          <div className="relative min-h-0 flex-1 px-4 pb-24 pt-4">
            <div className="ml-auto w-[min(100%,22rem)] rounded-16 rounded-tr-4 bg-foreground px-4 py-3 text-12 leading-paragraph text-on-dark">
              阅读这三篇论文，整理扩散模型用于医学影像重建的证据与局限。
            </div>
            <div className="mt-[var(--wiki-mock-space-5)] w-[min(100%,25rem)] text-12 leading-paragraph text-foreground">
              <p>
                我会先核对引用资料，再按任务、数据集和评价指标整理一份研究备忘录。
              </p>
              <div className="mt-3 inline-flex h-7 items-center gap-2 rounded-pill border border-border-soft bg-surface-2 px-3 text-muted-foreground">
                <FileText className="size-3 text-brand-green" />
                研究备忘录已生成
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface-card via-surface-card/90 to-transparent px-4 pb-4 pt-12">
              <div
                className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-16 border border-border-strong bg-surface-card p-[var(--wiki-mock-space-2-5)] shadow-raised"
                data-wiki-spot="输入框"
              >
                <div className="px-1 py-1 text-12 text-faint">
                  继续补充研究问题或交付格式…
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-flex size-8 items-center justify-center rounded-8 text-muted-foreground">
                    <Plus className="size-4" />
                  </span>
                  <span className="inline-flex size-8 items-center justify-center rounded-8 text-muted-foreground">
                    <Puzzle className="size-4" />
                  </span>
                  <span className="ml-auto rounded-8 px-2 py-1 text-12 text-subtle">
                    GPT-5
                  </span>
                  <span className="inline-flex size-9 items-center justify-center rounded-8 bg-surface-2 text-faint">
                    <ArrowUp className="size-4" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <ArtifactPanel />
      </div>
    </div>
  );
}

function WorkspaceSidebar() {
  return (
    <aside
      className="hidden border-r border-border-soft bg-surface-1 md:block"
      data-wiki-spot="工作区"
    >
      <div className="flex h-12 items-center justify-between gap-2 border-b border-border-soft px-4">
        <p className="text-12 font-medium text-foreground">工作区</p>
        <ChevronDown className="size-3 text-faint" />
      </div>
      <div className="py-2">
        {WORKSPACES.map(({ label, count, icon: Icon }, index) => (
          <div
            key={label}
            className={
              index === 0
                ? "flex h-8 items-center gap-2 bg-surface-2 px-4 text-12 font-medium text-foreground"
                : "flex h-8 items-center gap-2 px-4 text-12 text-subtle"
            }
          >
            <Icon
              className={
                index === 0
                  ? "size-3.5 shrink-0 text-brand-red"
                  : "size-3.5 shrink-0 text-faint"
              }
            />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="tabular-nums text-faint">{count}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function SessionStrip() {
  return (
    <div
      className="relative flex h-10 items-center gap-1 rounded-12 border border-border bg-surface-card px-2 shadow-raised"
      data-wiki-spot="会话历史"
    >
      <span className="inline-flex h-7 items-center gap-2 rounded-8 bg-surface-2 px-2 text-12 text-subtle">
        <History className="size-3.5" />
        <span className="font-medium tabular-nums text-foreground">4</span>
      </span>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-28">
        <span className="truncate text-center text-14 font-medium text-foreground">
          扩散模型综述
        </span>
      </span>
      <div className="relative z-raised ml-auto flex items-center gap-1">
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
  );
}

function ArtifactPanel() {
  return (
    <aside
      className="hidden border-l border-border-soft bg-surface-1 lg:flex lg:flex-col"
      data-wiki-spot="扩展区"
    >
      <header className="flex h-9 items-center gap-2 border-b border-border px-3 text-14 font-medium text-foreground">
        <FolderArchive className="size-3.5 text-brand-green" />
        扩展区
        <span className="text-faint">· 1</span>
      </header>
      <div className="p-3">
        <div className="rounded-12 border border-border bg-surface-card p-3">
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
      </div>
    </aside>
  );
}
