import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  File,
  Maximize2,
  Rows3,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

/**
 * PDF 阅读器 · 纯样式 fixture。
 * 对齐 product-mock PdfBrowserPane + PdfViewerToolbar + PdfViewerContent。
 */
export function WikiEmbedPdfReader() {
  return (
    <div
      className="w-[min(100%,48rem)] overflow-hidden rounded-16 border border-border bg-surface-2"
      aria-hidden
      data-wiki-fixture="pdf-reader"
    >
      <header className="border-b border-border bg-surface-card px-4 py-3">
        <p className="truncate text-14 font-medium text-foreground">
          Attention Is All You Need.pdf
        </p>
      </header>

      <div
        className="grid gap-2 border-b border-border bg-surface-card px-4 py-2 md:grid-cols-3 md:items-center"
        data-wiki-spot="PDF 工具栏"
      >
        <div className="flex items-center gap-2 text-12 text-subtle">
          <ToolbarIcon icon={ChevronLeft} />
          <span className="min-w-14 text-center tabular-nums">1 / 15</span>
          <ToolbarIcon icon={ChevronRight} />
        </div>

        <div className="flex items-center justify-center gap-1 rounded-8 bg-surface-2 p-1">
          <Mode icon={File} label="单页" active />
          <Mode icon={Rows3} label="连续" />
          <Mode icon={Columns2} label="双页" />
        </div>

        <div className="flex items-center justify-end gap-2 text-12 text-subtle">
          <ToolbarIcon icon={ZoomOut} />
          <span className="min-w-12 text-center">自适应</span>
          <ToolbarIcon icon={ZoomIn} />
          <ToolbarIcon icon={Maximize2} active />
        </div>
      </div>

      <div className="p-6">
        <div className="mx-auto w-[min(100%,34rem)] border border-border bg-surface-card px-8 py-8">
          <header className="border-b border-border-hairline pb-6 text-center">
            <h3 className="font-display text-20 font-medium leading-display text-foreground">
              Attention Is All You Need
            </h3>
            <p className="mt-2 text-12 text-subtle">
              Ashish Vaswani, Noam Shazeer, Niki Parmar, Jakob Uszkoreit
            </p>
            <p className="mt-1 text-12 text-faint">NeurIPS · 2017</p>
          </header>

          <section className="mt-6 space-y-3">
            <h4 className="text-12 font-medium text-foreground">Abstract</h4>
            <p className="text-12 leading-paragraph text-subtle">
              We propose a new simple network architecture, the Transformer,
              based solely on attention mechanisms, dispensing with recurrence
              and convolutions entirely.
            </p>
            <div className="grid grid-cols-3 items-center gap-3 rounded-8 border border-border bg-surface-1 p-4 text-center text-12">
              <span className="rounded-4 border border-border bg-surface-card px-2 py-2">
                Input
              </span>
              <span className="rounded-4 bg-brand-red-soft px-2 py-2 text-brand-red">
                Transformer
              </span>
              <span className="rounded-4 border border-border bg-surface-card px-2 py-2">
                Output
              </span>
            </div>
          </section>

          <footer className="mt-6 border-t border-border-hairline pt-3 text-center text-12 text-faint">
            Page 1 of 15
          </footer>
        </div>
      </div>
    </div>
  );
}

function ToolbarIcon({
  icon: Icon,
  active = false,
}: {
  icon: typeof ChevronLeft;
  active?: boolean;
}) {
  return (
    <span
      className={
        active
          ? "inline-flex size-7 items-center justify-center rounded-8 bg-surface-2 text-foreground"
          : "inline-flex size-7 items-center justify-center rounded-8 text-subtle"
      }
    >
      <Icon className="size-4" />
    </span>
  );
}

function Mode({
  icon: Icon,
  label,
  active = false,
}: {
  icon: typeof File;
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={
        active
          ? "inline-flex h-7 items-center gap-1 rounded-4 bg-surface-card px-2 text-12 font-medium text-foreground"
          : "inline-flex h-7 items-center gap-1 rounded-4 px-2 text-12 text-faint"
      }
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
