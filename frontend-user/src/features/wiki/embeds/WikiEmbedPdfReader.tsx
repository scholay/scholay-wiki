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
import { DISCOVERY_MOCK_THEME } from "./WikiEmbedJournalSearch";

/** 已载入 PDF 的单页阅读态：真实工具栏与脱敏演示论文首页。 */
export function WikiEmbedPdfReader() {
  return (
    <div
      className="flex h-[36rem] w-full max-w-4xl flex-col overflow-hidden bg-surface-2"
      style={DISCOVERY_MOCK_THEME}
      aria-hidden
      data-wiki-fixture="pdf-reader"
    >
      <div
        className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border-hairline bg-background px-4"
        data-wiki-spot="PDF 工具栏"
      >
        <div className="flex items-center gap-2 text-16">
          <ToolbarIcon icon={ChevronLeft} muted />
          <span className="min-w-14 text-center tabular-nums text-muted-foreground">
            1 / 15
          </span>
          <ToolbarIcon icon={ChevronRight} />
        </div>

        <div className="inline-flex items-center gap-1 rounded-4 bg-surface-2 p-1">
          <ModeIcon icon={File} active />
          <ModeIcon icon={Rows3} />
          <ModeIcon icon={Columns2} />
        </div>

        <div className="flex items-center gap-2 text-16">
          <ToolbarIcon icon={ZoomOut} />
          <span className="min-w-14 text-center text-muted-foreground">
            自适应
          </span>
          <ToolbarIcon icon={ZoomIn} />
          <ToolbarIcon icon={Maximize2} active />
        </div>
      </div>

      <div className="min-h-0 flex flex-1 justify-center overflow-hidden bg-surface-2 p-4">
        <img
          src="/wiki/assets/pdf-reader-sample-page.png"
          alt=""
          className="h-auto max-h-full w-auto max-w-full bg-surface-card object-contain shadow-raised"
        />
      </div>
    </div>
  );
}

function ToolbarIcon({
  icon: Icon,
  active = false,
  muted = false,
}: {
  icon: typeof ChevronLeft;
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <span
      className={
        active
          ? "inline-flex size-7 items-center justify-center rounded-4 bg-surface-2 text-foreground"
          : muted
            ? "inline-flex size-7 items-center justify-center rounded-4 text-faint opacity-40"
            : "inline-flex size-7 items-center justify-center rounded-4 text-subtle"
      }
    >
      <Icon className="size-4" />
    </span>
  );
}

function ModeIcon({
  icon: Icon,
  active = false,
}: {
  icon: typeof File;
  active?: boolean;
}) {
  return (
    <span
      className={
        active
          ? "inline-flex h-6 w-7 items-center justify-center rounded-4 bg-background text-foreground shadow-raised"
          : "inline-flex h-6 w-7 items-center justify-center rounded-4 text-subtle"
      }
    >
      <Icon className="size-4" />
    </span>
  );
}
