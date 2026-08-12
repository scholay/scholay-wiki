import { FileText, FileUp, Library, Plus, X } from "lucide-react";

/**
 * Composer 已挂载附件并展开加号菜单的单一静态状态。
 * 对齐 Composer、ComposerPlusMenu 与 ComposerAttachmentRow。
 */
export function WikiEmbedComposerAttachments() {
  return (
    <div
      className="w-[min(100%,40rem)]"
      aria-hidden
      data-wiki-fixture="composer-attachments"
    >
      <PlusMenuFixture />
    </div>
  );
}

function PlusMenuFixture() {
  return (
    <div className="flex flex-col gap-2">
      <div className="w-52 overflow-hidden rounded-8 border border-border bg-popover p-1 text-popover-foreground shadow-overlay">
        <div className="flex items-start gap-2 rounded-4 px-2 py-2">
          <FileUp className="mt-1 size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col">
            <span className="text-14 text-foreground">上传图片 / 文件</span>
            <span className="text-12 text-faint">也可直接粘贴或拖入输入框</span>
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-4 px-2 py-2">
          <Library className="mt-1 size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-col">
            <span className="text-14 text-foreground">引用文献集</span>
            <span className="text-12 text-faint">
              把文献集里的论文交给智能体阅读
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-16 border border-border-strong bg-surface-card shadow-raised">
        <div className="px-2 pt-2">
          <div className="relative flex h-14 w-48 items-center gap-2 rounded-8 border border-border bg-surface-1 px-3">
            <span className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-pill bg-foreground text-on-dark shadow-raised">
              <X className="size-3" />
            </span>
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-8 bg-danger-soft">
              <FileText className="size-4 text-brand-red" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-12 font-medium text-foreground">
                experiment-data.csv
              </span>
              <span className="text-12 text-faint">CSV · 184KB</span>
            </span>
          </div>
        </div>

        <div className="flex h-12 items-center gap-3 pl-5 pr-2">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-8 text-muted-foreground">
            <Plus className="size-4" strokeWidth={2.2} />
          </span>
          <span className="min-w-0 flex-1 truncate text-16 text-faint">
            继续与智能搜索对话…
          </span>
        </div>
      </div>
    </div>
  );
}
