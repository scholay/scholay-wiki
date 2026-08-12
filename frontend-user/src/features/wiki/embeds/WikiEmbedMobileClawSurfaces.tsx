import {
  ArrowLeft,
  ArrowUp,
  ChevronRight,
  Compass,
  Download,
  Eye,
  FileText,
  FolderArchive,
  LayoutGrid,
  MoreVertical,
  PanelLeft,
  Plus,
  Puzzle,
  Sparkles,
  SquarePen,
  User,
  X,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";
import { ChatStyles, MarkdownRenderer } from "@/shared/components/chat";

const SESSION_GROUPS = [
  {
    label: "今天",
    sessions: [
      {
        title: "医学影像基础模型综述",
        meta: "18 条消息 · 最近访问 刚刚",
        active: true,
      },
      {
        title: "单细胞分析方法比较",
        meta: "8 条消息 · 最近访问 2 小时前",
        active: false,
      },
    ],
  },
  {
    label: "昨天",
    sessions: [
      {
        title: "期刊投稿范围核对",
        meta: "12 条消息 · 最近访问 昨天",
        active: false,
      },
      {
        title: "Transformer 参考文献整理",
        meta: "6 条消息 · 最近访问 昨天",
        active: false,
      },
    ],
  },
] as const;

const ARTIFACT_MARKDOWN = `# 医学影像基础模型：进展与评测

这份梳理聚焦近三年的医学影像基础模型，并区分内部验证与外部验证设计。

## 关键发现

- 多中心外部验证仍是判断临床泛化能力的关键证据。
- 设备、机构与人群分布偏移需要分别报告。
- 预训练规模不能替代独立测试集与前瞻性评估。

## 核对建议

优先回到原始论文确认数据来源、样本排除标准和统计区间。`;

/** /m/claw 的历史会话左侧抽屉。 */
export function WikiEmbedMobileClawSessionDrawer() {
  return (
    <div
      className="relative w-[min(100%,24rem)] overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-claw-session-drawer"
    >
      <FrozenClawUnderlay />
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" />
      <section className="absolute inset-y-0 left-0 flex w-80 max-w-[86%] flex-col border-r border-border bg-background shadow-overlay">
        <X className="absolute right-4 top-4 size-4 text-muted-foreground" />
        <div
          className="min-h-0 flex-1 overflow-hidden px-2 pb-6"
          style={{ paddingTop: 20 }}
        >
          {SESSION_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-3 pb-1 pt-3 text-12 font-medium text-faint">
                {group.label}
              </p>
              {group.sessions.map((session) => (
                <div
                  key={session.title}
                  className={`flex items-center gap-1 rounded-8 px-3 ${session.active ? "bg-surface-2" : ""}`}
                  style={{ paddingBlock: 10 }}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={`truncate text-14 ${session.active ? "font-medium text-foreground" : "text-subtle"}`}
                    >
                      {session.title}
                    </span>
                    <span className="truncate text-12 text-faint">
                      {session.meta}
                    </span>
                  </span>
                  <MoreVertical className="size-4 shrink-0 text-faint" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** 移动 Claw 扩展区中选中 Markdown 交付物后的整屏预览。 */
export function WikiEmbedMobileClawArtifactPreview() {
  return (
    <div
      className="relative flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background shadow-overlay"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-claw-artifact-preview"
    >
      <ChatStyles />
      <X className="absolute right-4 top-4 size-4 text-muted-foreground" />
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3">
        <span
          className="flex items-center text-12 text-muted-foreground"
          style={{ gap: 6 }}
        >
          <ArrowLeft className="size-4" />
          返回列表
        </span>
      </div>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 pr-10">
        <div className="min-w-0 flex-1">
          <p className="truncate text-14 font-medium text-foreground">
            医学影像基础模型：进展与评测
          </p>
          <p className="truncate text-12 text-muted-foreground">
            医学影像基础模型综述.md
          </p>
        </div>
        <span className="flex h-7 shrink-0 items-center gap-1 rounded-8 px-2 text-12 text-muted-foreground">
          <Download className="size-4" />
          下载
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
        <MarkdownRenderer text={ARTIFACT_MARKDOWN} />
      </div>
    </div>
  );
}

/** /m/claw/:sessionId 的完成轮、交付物与可继续输入状态。 */
export function WikiEmbedMobileClawActiveSession() {
  return (
    <div
      className="flex w-[min(100%,24rem)] flex-col overflow-hidden bg-background"
      style={{ height: 704 }}
      aria-hidden
      data-wiki-fixture="mobile-claw-active-session"
    >
      <div className="relative flex min-h-0 flex-1 flex-col bg-background">
        <ChatStyles />
        <ClawFloatingControls />

        <main
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pb-3 pt-14"
          style={{ paddingInline: 14 }}
        >
          <div className="flex justify-center">
            <span
              className="rounded-8 bg-surface-2 font-normal text-12 text-muted-foreground"
              style={{ paddingBlock: 8, paddingInline: 14 }}
            >
              加载更早的 12 轮对话
            </span>
          </div>

          <div
            className="ml-auto max-w-[80%] rounded-16 rounded-br-4 bg-foreground text-12 leading-paragraph text-on-brand"
            style={{ paddingBlock: 10, paddingInline: 14 }}
          >
            帮我找近三年医学影像基础模型的综述，并比较外部验证设计。
          </div>

          <section className="flex min-w-0 flex-col gap-3">
            <div className="min-w-0 rounded-12 border border-border-soft bg-surface-1/60">
              <div
                className="flex items-center text-12 text-muted-foreground"
                style={{ gap: 6, paddingBlock: 6, paddingInline: 10 }}
              >
                <Sparkles className="size-3 shrink-0 text-brand-green" />
                <span className="shrink-0 font-medium">处理过程 · 4 步</span>
                <ChevronRight className="ml-auto size-3 shrink-0" />
              </div>
            </div>

            <MarkdownRenderer
              text={
                "已整理近三年的代表性综述。比较时应优先核对独立机构、设备与人群三类外部验证，而不是只看预训练规模。"
              }
            />

            <div
              className="rounded-16 border border-brand-green/30 bg-brand-green/5"
              style={{ padding: 10 }}
            >
              <div
                className="mb-2 flex items-center text-12 font-medium text-brand-green"
                style={{ gap: 6, paddingInline: 2 }}
              >
                <Sparkles className="size-4" />
                生成的文件
              </div>
              <div
                className="flex items-center rounded-12 border border-border bg-background px-3 py-2"
                style={{ gap: 10 }}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-8 bg-brand-green/10">
                  <FileText className="size-4 text-brand-green" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-14 font-medium text-foreground">
                    医学影像基础模型：进展与评测
                  </p>
                  <p className="truncate text-12 text-muted-foreground">
                    医学影像基础模型综述.md
                  </p>
                </div>
                <span className="flex h-7 items-center gap-1 rounded-8 border border-border-button px-2 text-12 text-foreground">
                  <Eye className="size-4" /> 预览
                </span>
                <span className="flex size-7 items-center justify-center rounded-8 bg-brand-green text-on-brand">
                  <Download className="size-4" />
                </span>
              </div>
            </div>
          </section>
        </main>

        <FrozenComposer />
      </div>
      <StaticMobileNav active="claw" />
    </div>
  );
}

function FrozenClawUnderlay() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="relative min-h-0 flex-1">
        <ClawFloatingControls />
        <div className="flex h-full items-center justify-center text-faint">
          <Sparkles className="size-10 text-brand-green" />
        </div>
        <div className="absolute inset-x-0 bottom-0">
          <FrozenComposer />
        </div>
      </div>
      <StaticMobileNav active="claw" />
    </div>
  );
}

function ClawFloatingControls() {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-sticky flex items-center justify-between bg-gradient-to-b from-background via-background/85 to-transparent px-2 pt-2"
      style={{ paddingBottom: 20 }}
    >
      <span className="flex size-9 items-center justify-center rounded-pill text-foreground">
        <PanelLeft className="size-5" />
      </span>
      <div className="flex items-center gap-1">
        <span
          className="flex h-9 items-center rounded-pill text-foreground"
          style={{ gap: 4, paddingInline: 10 }}
        >
          <FolderArchive className="size-5 text-brand-green" />
          <span className="text-12 tabular-nums text-subtle">1</span>
        </span>
        <span className="flex size-9 items-center justify-center rounded-pill text-foreground">
          <SquarePen className="size-5" />
        </span>
      </div>
    </div>
  );
}

function FrozenComposer() {
  return (
    <div className="shrink-0 bg-background px-3 pb-3" style={{ paddingTop: 6 }}>
      <div
        className="relative flex flex-col gap-2 rounded-16 border border-border-strong bg-background"
        style={{ padding: 10 }}
      >
        <p className="truncate px-1 py-1 text-14 text-faint">
          问问智能助手 · Enter 发送 / Shift+Enter 换行 · 可直接粘贴/拖入图片文件
        </p>
        <div className="flex items-center gap-1">
          <span className="flex size-8 items-center justify-center rounded-8 text-muted-foreground">
            <Plus className="size-4" strokeWidth={2.2} />
          </span>
          <span className="flex h-8 items-center gap-1 rounded-8 px-2 text-muted-foreground">
            <Puzzle className="size-4" strokeWidth={2.2} />
          </span>
          <span className="flex-1" />
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-8 bg-surface-2 text-faint">
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </div>
  );
}

function StaticMobileNav({ active }: { active: "claw" }) {
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
