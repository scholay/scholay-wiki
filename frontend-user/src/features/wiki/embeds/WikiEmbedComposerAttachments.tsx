import { FileUp, Library, Plus, Search, X } from "lucide-react";

/**
 * Composer「+」菜单 + 引用文献弹窗 · 纯样式 fixture。
 * 对齐 product-mock ComposerPlusMenu + LibraryReferencePicker(空文献集态)。
 */
export function WikiEmbedComposerAttachments() {
  return (
    <div
      className="flex flex-col gap-6"
      aria-hidden
      data-wiki-fixture="composer-attachments"
    >
      <PlusMenuFixture />
      <LibraryPickerFixture />
    </div>
  );
}

function PlusMenuFixture() {
  return (
    <div className="flex w-[min(100%,24rem)] flex-col gap-2">
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

      <div className="flex h-12 items-center gap-2 rounded-16 border border-border-strong bg-surface-card pl-3 pr-2 shadow-raised">
        <span className="inline-flex size-8 items-center justify-center rounded-8 text-muted-foreground">
          <Plus className="size-4" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1 truncate text-14 text-faint">
          继续与智能搜索对话…
        </span>
      </div>
    </div>
  );
}

function LibraryPickerFixture() {
  return (
    <div className="w-[min(100%,40rem)] overflow-hidden rounded-12 border border-border bg-surface-card shadow-overlay">
      <div className="relative border-b border-border-soft px-4 py-3">
        <p className="pr-8 text-16 font-medium text-foreground">引用文献</p>
        <p className="mt-1 text-12 text-muted-foreground">
          从你的文献集选论文或整个文件夹,引用给智能助手(在线元数据 + 你上传的
          PDF 都会带上)。
        </p>
        <span className="absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-8 text-muted-foreground">
          <X className="size-4" />
        </span>
      </div>

      <div className="flex min-h-0 flex-col sm:flex-row">
        <div className="flex shrink-0 flex-col border-b border-border-soft sm:w-56 sm:border-b-0 sm:border-r">
          <p className="px-3 py-6 text-center text-12 text-faint">
            文献集还是空的
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative border-b border-border-soft p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <div className="flex h-8 items-center rounded-8 border border-border bg-surface-card pl-8 pr-3 text-12 text-faint">
              搜索本文件夹论文…
            </div>
          </div>
          <p className="px-3 py-8 text-center text-12 text-faint">
            选择文件夹查看论文
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border-soft px-4 py-2">
        <span className="text-12 text-faint">未选择</span>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 items-center rounded-8 border border-border bg-surface-card px-3 text-12 font-medium text-foreground">
            取消
          </span>
          <span className="inline-flex h-8 items-center rounded-8 bg-foreground/40 px-3 text-12 font-medium text-on-dark">
            引用
          </span>
        </div>
      </div>
    </div>
  );
}
