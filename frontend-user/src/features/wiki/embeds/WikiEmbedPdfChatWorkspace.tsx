import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { CSSProperties } from "react";

const PDF_CHAT_MOCK_THEME = {
  "--wiki-mock-space-5": "1.25rem",
} as CSSProperties;

/**
 * PDF Chat 工作区 · 纯样式 fixture。
 * 对齐 product-mock PdfChatPanel 中“PDF 可读、尚未开始对话”的单一桌面状态。
 */
export function WikiEmbedPdfChatWorkspace() {
  return (
    <div
      className="flex min-h-96 w-[min(100%,48rem)] flex-col overflow-hidden rounded-16 border border-border bg-surface-card"
      style={PDF_CHAT_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="pdf-chat-workspace"
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare
            className="size-4 shrink-0 text-brand-red"
            strokeWidth={2.5}
          />
          <span className="truncate text-12 font-medium text-foreground">
            Attention Is All You Need
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ToolbarIcon icon={ZoomOut} />
          <span className="w-10 text-center text-12 tabular-nums text-subtle">
            100%
          </span>
          <ToolbarIcon icon={ZoomIn} />
          <span className="mx-1 h-4 w-px bg-border" />
          <ToolbarIcon icon={ChevronLeft} />
          <span className="text-12 tabular-nums text-subtle">1 / 12</span>
          <ToolbarIcon icon={ChevronRight} />
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-surface-2 p-6">
        <div className="wiki-embed-pdf-paper mx-auto min-h-80 w-[min(100%,34rem)] border border-border bg-surface-card px-8 py-8 opacity-40 shadow-raised">
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
            <div className="h-20 border-y border-border-soft bg-surface-1" />
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-surface-card/65 p-6 backdrop-blur-2">
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <p className="text-14 leading-paragraph text-subtle">
              左侧可能仍在文献检索；开始对话后将自动切到
              <span className="font-medium text-foreground"> 智能助手 </span>
              并针对当前 PDF 发起新会话。
            </p>
            <span
              className="inline-flex h-10 items-center gap-2 rounded-pill bg-brand-red px-[var(--wiki-mock-space-5)] text-14 font-medium text-on-brand"
              data-wiki-spot="开始 PDF 对话"
            >
              <MessageSquare className="size-4" strokeWidth={2.5} />
              开始 PDF 对话
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolbarIcon({ icon: Icon }: { icon: typeof ZoomOut }) {
  return (
    <span className="inline-flex size-7 items-center justify-center rounded-4 text-subtle">
      <Icon className="size-3.5" />
    </span>
  );
}
