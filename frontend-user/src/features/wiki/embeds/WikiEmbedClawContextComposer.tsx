import {
  ArrowUp,
  FileWarning,
  FileText,
  Library,
  Paperclip,
  Plus,
  Puzzle,
  X,
} from "lucide-react";

/**
 * Claw 输入上下文 · 纯样式 fixture。
 * 对齐 product-mock ChatComposer + ComposerPlusMenu + ComposerSkillsButton；
 * 附件、文库引用和 Skill 在发送前都以显式 chip 回显。
 */
export function WikiEmbedClawContextComposer() {
  return (
    <div
      className="w-[min(100%,42rem)] space-y-3"
      aria-hidden
      data-wiki-fixture="claw-context-composer"
    >
      <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-8 border border-border bg-popover p-1 shadow-overlay">
          <div className="flex items-start gap-2 rounded-4 px-2 py-2">
            <Paperclip className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-12 text-foreground">上传图片 / 文件</p>
              <p className="mt-1 text-12 text-faint">完成上传后才会发送</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-4 bg-surface-1 px-2 py-2">
            <Library className="mt-1 size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-12 text-foreground">引用文献集</p>
              <p className="mt-1 text-12 text-faint">加入有权限的结构化引用</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-16 border border-border-strong bg-surface-card shadow-raised">
          <div className="flex flex-wrap gap-2 border-b border-border-soft px-3 py-2">
            <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-surface-1 px-2 text-12 text-subtle">
              <FileText className="size-3.5" />
              methods.pdf
              <X className="size-3 text-faint" />
            </span>
            <span className="inline-flex h-7 items-center gap-1 rounded-8 bg-cat-blue-soft px-2 text-12 text-cat-blue">
              <Library className="size-3.5" />
              医学影像 · 3 篇
              <X className="size-3" />
            </span>
          </div>
          <div className="px-4 py-3 text-14 text-foreground">
            按 PRISMA 框架整理纳入标准与证据表。
          </div>
          <div className="flex items-center gap-1 px-2 pb-2">
            <span className="inline-flex size-8 items-center justify-center rounded-8 text-subtle">
              <Plus className="size-4" />
            </span>
            <span className="inline-flex h-8 items-center gap-1 rounded-8 bg-brand-green/10 px-2 text-12 text-brand-green">
              <Puzzle className="size-4" />
              Skill · 2/5
            </span>
            <span className="ml-auto rounded-8 px-2 py-1 text-12 text-subtle">
              GPT-5
            </span>
            <span className="text-12 tabular-nums text-faint">28%</span>
            <span className="inline-flex size-8 items-center justify-center rounded-8 bg-foreground text-on-dark">
              <ArrowUp className="size-4" />
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-8 border border-border-soft bg-surface-1 px-3 py-2">
        <div className="flex items-center gap-2">
          <Puzzle className="size-3.5 text-brand-green" />
          <p className="text-12 font-medium text-foreground">
            本会话启用的 Skill
          </p>
          <span className="ml-auto text-12 text-faint">
            方法指南，不扩展工具权限
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-pill border border-border bg-surface-card px-3 py-1 text-12 text-subtle">
            系统综述
          </span>
          <span className="rounded-pill border border-border bg-surface-card px-3 py-1 text-12 text-subtle">
            学术写作
          </span>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-8 border border-brand-amber/30 bg-warning-soft px-3 py-2 text-12 leading-paragraph text-subtle">
        <FileWarning className="mt-1 size-3.5 shrink-0 text-brand-amber" />
        <span>
          analysis.sav 未加入 · 专有统计格式请先转为 CSV 或
          XLSX；失败附件不会进入本轮上下文。
        </span>
      </div>
    </div>
  );
}
