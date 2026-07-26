import type { ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  File as FileIcon,
  Maximize2,
  Rows3,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import {
  MAX_SCALE,
  MIN_SCALE,
  ModeBtn,
  type PdfMode,
  iconBtnCls,
} from './internals';

interface PdfViewerToolbarProps {
  // 翻页
  safePage: number;
  numPages: number;
  onPrev: () => void;
  onNext: () => void;
  // 模式
  mode: PdfMode;
  onModeChange: (mode: PdfMode) => void;
  // 缩放;scale = null 表示 fit-width 自适应
  scale: number | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  /** 工具条最右侧的附加动作(如「下载 / 隐藏」);调用方按需传,不传则无。 */
  trailingActions?: ReactNode;
}

/**
 * PdfViewer 顶部工具栏 —— 左:翻页 / 中:模式切换 / 右:缩放。
 * 纯展示组件:没有任何状态,所有动作回调给父级。
 */
export function PdfViewerToolbar({
  safePage,
  numPages,
  onPrev,
  onNext,
  mode,
  onModeChange,
  scale,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  trailingActions,
}: PdfViewerToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-3 h-12 px-4 bg-surface-card border-b border-border-soft shrink-0">
      <div className="flex items-center gap-1.5 text-xs">
        <button
          type="button"
          onClick={onPrev}
          disabled={safePage <= 1}
          className={iconBtnCls}
          aria-label="上一页"
          title="上一页"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="tabular-nums text-muted-foreground min-w-[5em] text-center">
          {numPages > 0 ? `${safePage} / ${numPages}` : '— / —'}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={numPages === 0 || safePage >= numPages}
          className={iconBtnCls}
          aria-label="下一页"
          title="下一页"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* 模式切换 */}
      <div className="inline-flex items-center gap-0.5 rounded-sm bg-surface-2 p-0.5">
        <ModeBtn active={mode === 'single'} onClick={() => onModeChange('single')} label="单页">
          <FileIcon className="size-3.5" />
        </ModeBtn>
        <ModeBtn
          active={mode === 'continuous'}
          onClick={() => onModeChange('continuous')}
          label="连续滚动"
        >
          <Rows3 className="size-3.5" />
        </ModeBtn>
        <ModeBtn active={mode === 'two-up'} onClick={() => onModeChange('two-up')} label="双页并排">
          <Columns2 className="size-3.5" />
        </ModeBtn>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={(scale ?? 1) <= MIN_SCALE}
          className={iconBtnCls}
          aria-label="缩小"
          title="缩小"
        >
          <ZoomOut className="size-4" />
        </button>
        <span className="tabular-nums text-muted-foreground min-w-[3.5em] text-center">
          {scale === null ? '自适应' : `${Math.round(scale * 100)}%`}
        </span>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={(scale ?? 1) >= MAX_SCALE}
          className={iconBtnCls}
          aria-label="放大"
          title="放大"
        >
          <ZoomIn className="size-4" />
        </button>
        <button
          type="button"
          onClick={onFitWidth}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors',
            scale === null
              ? 'bg-surface-2 text-foreground'
              : 'text-subtle hover:bg-surface-2 hover:text-foreground'
          )}
          aria-label="自适应宽度"
          title="自适应宽度"
        >
          <Maximize2 className="size-3.5" />
        </button>
        {trailingActions && (
          <>
            <span className="mx-0.5 h-4 w-px bg-border-separator" />
            {trailingActions}
          </>
        )}
      </div>
    </div>
  );
}
PdfViewerToolbar.displayName = 'PdfViewerToolbar';
