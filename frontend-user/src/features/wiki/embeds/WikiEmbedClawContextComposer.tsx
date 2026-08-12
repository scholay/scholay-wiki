import {
  ArrowUp,
  FileText,
  FileUp,
  FolderOpen,
  Library,
  Plus,
  Puzzle,
  X,
} from "lucide-react";
import type { CSSProperties } from "react";

const CONTEXT_COMPOSER_MOCK_THEME = {
  "--wiki-mock-space-2-5": "0.625rem",
} as CSSProperties;

/**
 * Claw 输入上下文 · 纯样式 fixture。
 * 冻结 product-mock/current 的 ComposerPlusMenu 打开态：菜单、已上传文件、
 * 文献引用和 Skill 都属于同一个待发送输入框，不混入失败附件等另一状态。
 */
export function WikiEmbedClawContextComposer() {
  return (
    <div
      className="flex w-[min(100%,42rem)] flex-col items-start gap-2"
      style={CONTEXT_COMPOSER_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="claw-context-composer"
    >
      <div className="w-52 overflow-hidden rounded-8 border border-border bg-popover p-1 shadow-overlay">
        <MenuItem
          icon={FileUp}
          title="上传图片 / 文件"
          detail="也可直接粘贴或拖入输入框"
        />
        <MenuItem
          icon={FolderOpen}
          title="我的附件"
          detail="查看占用、删掉不再需要的文件"
        />
        <MenuItem
          icon={Library}
          title="引用文献"
          detail="把文件夹里的论文交给智能体阅读"
        />
      </div>

      <div className="relative flex w-full flex-col gap-2 rounded-16 border border-border-strong bg-surface-card p-[var(--wiki-mock-space-2-5)] shadow-raised">
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative flex h-14 w-48 shrink-0 items-center gap-2 rounded-8 border border-border bg-surface-1 px-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-4 bg-danger-soft">
              <FileText className="size-4 text-brand-red" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-12 font-medium text-foreground">
                methods.pdf
              </span>
              <span className="text-12 text-faint">PDF · 2.4 MB</span>
            </span>
            <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-pill bg-foreground text-on-dark">
              <X className="size-2.5" />
            </span>
          </span>

          <span className="inline-flex max-w-56 items-center gap-1 rounded-4 border border-brand-green/40 bg-brand-green/10 px-2 py-1 text-12 text-brand-green">
            <Library className="size-3 shrink-0" />
            <span className="truncate">医学影像研究</span>
            <span className="shrink-0 opacity-70">· 3篇</span>
            <X className="size-2.5 shrink-0" />
          </span>
        </div>

        <div className="min-h-12 px-1 py-1 text-14 leading-paragraph text-foreground">
          按 PRISMA 框架整理纳入标准与证据表。
        </div>

        <div className="flex items-center gap-1">
          <span className="inline-flex size-8 items-center justify-center rounded-8 bg-surface-2 text-foreground">
            <Plus className="size-4" />
          </span>
          <span className="inline-flex h-8 items-center gap-1 rounded-8 px-2 text-muted-foreground">
            <Puzzle className="size-4" />
            <span className="text-12 font-medium text-brand-green">2</span>
          </span>
          <span className="ml-auto rounded-8 px-2 py-1 text-12 text-subtle">
            GPT-5
          </span>
          <span className="text-12 tabular-nums text-faint">28%</span>
          <span className="inline-flex size-9 items-center justify-center rounded-8 bg-foreground text-on-dark">
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof FileUp;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-4 px-2 py-2">
      <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-col">
        <span className="text-12 text-foreground">{title}</span>
        <span className="text-12 leading-paragraph text-faint">{detail}</span>
      </span>
    </div>
  );
}
