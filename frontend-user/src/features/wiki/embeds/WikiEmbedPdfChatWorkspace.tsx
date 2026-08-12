import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

/**
 * PDF Chat 工作区 · 纯样式 fixture。
 * 对齐 product-mock PdfChatPanel + PdfChatMockPage 的未开始对话覆盖层。
 */
export function WikiEmbedPdfChatWorkspace() {
  return (
    <div
      className="w-[min(100%,48rem)] overflow-hidden rounded-16 border border-border bg-surface-2"
      aria-hidden
      data-wiki-fixture="pdf-chat-workspace"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare className="size-4 shrink-0 text-brand-red" />
          <span className="truncate text-12 font-medium text-foreground">
            Attention Is All You Need
          </span>
          <span className="shrink-0 rounded-pill bg-brand-amber-soft px-2 py-1 text-12 font-medium text-brand-amber">
            工作区示意
          </span>
        </div>
        <div className="flex items-center gap-2 text-12 text-subtle">
          <ZoomOut className="size-4" />
          <span className="tabular-nums">100%</span>
          <ZoomIn className="size-4" />
          <span className="h-4 w-px bg-border" />
          <ChevronLeft className="size-4" />
          <span className="tabular-nums">1 / 12</span>
          <ChevronRight className="size-4" />
        </div>
      </header>

      <div className="relative p-6">
        <div className="mx-auto w-[min(100%,34rem)] border border-border bg-surface-card px-8 py-8 opacity-40">
          <h2 className="text-center font-display text-20 font-medium leading-display text-foreground">
            Attention Is All You Need
          </h2>
          <p className="mt-2 text-center text-12 text-faint">
            Ashish Vaswani, Noam Shazeer, Niki Parmar
          </p>
          <div className="mt-6 space-y-3 text-12 leading-paragraph text-subtle">
            <p className="font-medium text-foreground">Abstract</p>
            <p>
              We propose a new simple network architecture based solely on
              attention mechanisms, dispensing with recurrence entirely.
            </p>
            <div className="h-20 rounded-8 border border-border bg-surface-1" />
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-surface-card/65 p-6 backdrop-blur-2">
          <div className="max-w-sm rounded-12 border border-border bg-surface-card p-6 text-center">
            <MessageSquare className="mx-auto size-6 text-brand-red" />
            <p className="mt-3 text-14 leading-paragraph text-subtle">
              开始对话后将切到智能助手，并针对当前 PDF 发起一段独立会话。
            </p>
            <span
              className="mt-4 inline-flex h-9 items-center gap-2 rounded-pill bg-brand-red px-6 text-12 font-medium text-on-dark"
              data-wiki-spot="开始 PDF 对话"
            >
              <MessageSquare className="size-4" />
              开始 PDF 对话
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
