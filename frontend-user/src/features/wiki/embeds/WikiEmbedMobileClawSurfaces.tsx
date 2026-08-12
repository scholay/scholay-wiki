import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  FolderArchive,
  GripVertical,
  MoreVertical,
  PanelLeft,
  Paperclip,
  Pencil,
  Search,
  SendHorizontal,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import { ClawBrandIcon } from "@/shared/components/ClawBrandIcon";

const SESSION_GROUPS = [
  {
    label: "今天",
    sessions: [
      { title: "医学影像基础模型综述", active: true },
      { title: "单细胞分析方法比较", active: false },
    ],
  },
  {
    label: "昨天",
    sessions: [
      { title: "期刊投稿范围核对", active: false },
      { title: "Transformer 参考文献整理", active: false },
    ],
  },
] as const;

/** /m/claw 的历史会话左侧抽屉。 */
export function WikiEmbedMobileClawSessionDrawer() {
  return (
    <div
      className="grid w-[min(100%,48rem)] gap-4 md:grid-cols-[20rem_1fr]"
      aria-hidden
      data-wiki-fixture="mobile-claw-session-drawer"
    >
      <section className="overflow-hidden rounded-20 border border-border bg-surface-card shadow-overlay">
        <div className="flex justify-end px-3 pt-3">
          <X className="size-4 text-muted-foreground" />
        </div>
        <div className="px-2 pb-6">
          {SESSION_GROUPS.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="px-3 pb-1 pt-3 text-12 font-medium text-faint">
                {group.label}
              </p>
              {group.sessions.map((session) => (
                <div
                  key={session.title}
                  className={
                    session.active
                      ? "flex items-center gap-2 rounded-8 bg-surface-2 px-3 py-3"
                      : "flex items-center gap-2 rounded-8 px-3 py-3"
                  }
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={
                        session.active
                          ? "truncate text-14 font-medium text-foreground"
                          : "truncate text-14 text-subtle"
                      }
                    >
                      {session.title}
                    </span>
                    <span className="truncate text-12 text-faint">
                      {session.active
                        ? "18 条消息 · 刚刚访问"
                        : "8 条消息 · 2 小时前"}
                    </span>
                  </span>
                  <MoreVertical className="size-4 shrink-0 text-faint" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="self-start rounded-20 border border-border bg-surface-card p-4">
        <p className="text-12 font-medium text-faint">当前会话菜单</p>
        <div className="mt-3 overflow-hidden rounded-8 border border-border">
          <div className="flex items-center gap-2 border-b border-border-soft px-3 py-3 text-12 text-foreground">
            <Pencil className="size-4" /> 重命名
          </div>
          <div className="flex items-center gap-2 px-3 py-3 text-12 text-brand-red">
            <Trash2 className="size-4" /> 删除
          </div>
        </div>
        <p className="mt-3 text-12 leading-paragraph text-muted-foreground">
          删除当前会话后切到下一条；没有剩余会话时回到新对话。
        </p>
      </section>
    </div>
  );
}

/** 移动 Claw 的扩展区整屏预览 Sheet。 */
export function WikiEmbedMobileClawArtifactPreview() {
  return (
    <div
      className="relative h-[42rem] w-[min(100%,26rem)] overflow-hidden rounded-20 border border-border bg-surface-1"
      aria-hidden
      data-wiki-fixture="mobile-claw-artifact-preview"
    >
      <div className="flex h-full flex-col opacity-45">
        <div className="flex h-12 items-center justify-between px-3">
          <PanelLeft className="size-5" />
          <SquarePen className="size-5" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <ClawBrandIcon className="size-12 text-brand-green" />
        </div>
      </div>
      <div className="absolute inset-0 bg-foreground/40" />

      <section className="absolute inset-0 flex flex-col bg-surface-card shadow-overlay">
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
          <span className="inline-flex items-center gap-2 text-12 text-muted-foreground">
            <ArrowLeft className="size-4" /> 返回列表
          </span>
          <X className="size-4 text-faint" />
        </div>
        <header className="flex h-12 items-center gap-3 border-b border-border px-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-14 font-medium text-foreground">
              医学影像基础模型：进展与评测
            </p>
            <p className="truncate text-12 text-muted-foreground">
              医学影像基础模型综述.md
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-12 text-muted-foreground">
            <Download className="size-4" /> 下载
          </span>
        </header>

        <div className="min-h-0 flex-1 overflow-hidden px-6 py-6">
          <p className="font-serif text-24 font-medium text-foreground">
            医学影像基础模型：进展与评测
          </p>
          <p className="mt-2 text-12 text-faint">
            由 Claw 生成 · 请核对原始文献
          </p>
          <div className="mt-6 space-y-6">
            <ArtifactSection
              title="摘要"
              copy="本文梳理视觉基础模型在医学影像分类、分割和跨模态报告生成中的常见范式。"
            />
            <ArtifactSection
              title="关键发现"
              copy="跨中心泛化、标签偏差和外部验证仍是决定临床可用性的主要约束。"
            />
            <div className="rounded-8 border border-border bg-surface-1 p-4">
              <p className="text-12 font-medium text-foreground">引用线索</p>
              <p className="mt-2 text-12 leading-paragraph text-muted-foreground">
                [1] Foundation models for generalist medical artificial
                intelligence.
              </p>
              <p className="mt-1 text-12 leading-paragraph text-muted-foreground">
                [2] Segment Anything in Medical Images.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/** /m/claw/:sessionId 的消息历史与可继续输入状态。 */
export function WikiEmbedMobileClawActiveSession() {
  return (
    <div
      className="w-[min(100%,26rem)] overflow-hidden rounded-20 border border-border bg-surface-card"
      aria-hidden
      data-wiki-fixture="mobile-claw-active-session"
    >
      <div className="relative flex h-[42rem] flex-col">
        <div className="absolute inset-x-0 top-0 z-sticky flex items-center justify-between bg-gradient-to-b from-background via-background/85 to-transparent px-2 pb-6 pt-2">
          <span className="flex size-9 items-center justify-center rounded-pill bg-surface-card/80">
            <PanelLeft className="size-5 text-foreground" />
          </span>
          <div className="flex items-center gap-1">
            <span className="flex h-9 items-center gap-1 rounded-pill bg-surface-card/80 px-2 text-12 text-subtle">
              <FolderArchive className="size-5 text-brand-green" /> 1
            </span>
            <span className="flex size-9 items-center justify-center rounded-pill bg-surface-card/80">
              <SquarePen className="size-5 text-foreground" />
            </span>
          </div>
        </div>

        <main className="min-h-0 flex-1 space-y-6 overflow-hidden px-4 pb-4 pt-14">
          <div className="flex justify-center">
            <span className="inline-flex rounded-pill bg-surface-2 px-3 py-2 text-12 text-muted-foreground">
              加载更早的 12 轮对话
            </span>
          </div>

          <div className="ml-auto max-w-[82%] rounded-16 rounded-br-4 bg-foreground px-4 py-3 text-14 leading-paragraph text-on-dark">
            帮我找近三年医学影像基础模型的综述，并比较外部验证设计。
          </div>

          <div className="flex items-start gap-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-8 bg-surface-2">
              <ClawBrandIcon className="size-4 text-brand-green" />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <p className="text-14 leading-paragraph text-foreground">
                我先检索综述，再核对每篇文章是否包含跨机构或跨设备验证。
              </p>
              <div className="overflow-hidden rounded-8 border border-border bg-surface-1">
                <div className="flex items-center gap-2 border-b border-border-soft px-3 py-2 text-12 font-medium text-foreground">
                  <Search className="size-3 text-brand-green" /> 学术检索
                  <CheckCircle2 className="ml-auto size-3 text-brand-green" />
                </div>
                <div className="px-3 py-3 text-12 leading-paragraph text-muted-foreground">
                  已检索 34 篇候选，筛出 8 篇综述与 6 篇多中心评测。
                </div>
              </div>
              <div className="rounded-8 border border-brand-green/30 bg-brand-green-soft px-3 py-3">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-brand-green" />
                  <span className="min-w-0 flex-1 truncate text-12 font-medium text-foreground">
                    医学影像基础模型综述.md
                  </span>
                  <span className="text-12 text-brand-green">预览</span>
                </div>
              </div>
            </div>
          </div>
        </main>

        <div className="mx-3 mb-3 rounded-16 border border-border bg-surface-card p-3 shadow-overlay">
          <p className="text-12 text-faint">继续追问或补充要求…</p>
          <div className="mt-3 flex items-center gap-2">
            <Paperclip className="size-4 text-muted-foreground" />
            <span className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-3 py-2 text-12 text-subtle">
              <GripVertical className="size-3" /> 当前会话
            </span>
            <span className="ml-auto flex size-8 items-center justify-center rounded-pill bg-foreground text-on-dark">
              <SendHorizontal className="size-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArtifactSection({ title, copy }: { title: string; copy: string }) {
  return (
    <section>
      <h3 className="text-16 font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-14 leading-paragraph text-muted-foreground">
        {copy}
      </p>
    </section>
  );
}
