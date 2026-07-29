import { Minimize2, RotateCcw } from 'lucide-react';
import { Checkbox } from '@/shared/ui/checkbox';
import type { Paper } from '@/shared/api/types';

/**
 * 未暂存折叠行 —— 勾选只进暂存(行变绿 StagedRow,仍折叠);「还原」只展开卡。
 */
export function CollapsedRow({
  paper,
  onUnfold,
  onStage,
  hideStage,
}: {
  paper: Paper;
  onUnfold: () => void;
  onStage?: () => void;
  hideStage?: boolean;
}) {
  return (
    <div
      data-paper-id={paper.paperId}
      className="flex items-center gap-2.5 h-10 px-3.5 bg-surface-1 border-b border-border-soft"
    >
      {!hideStage && onStage && (
        <Checkbox
          checked={false}
          onCheckedChange={(v) => {
            if (v === true) onStage();
          }}
          aria-label="加入暂存区"
          title="勾选以加入暂存区(保持折叠)"
          className="shrink-0"
        />
      )}
      {hideStage && (
        <Minimize2
          className="size-2.5 shrink-0 text-muted-foreground"
          strokeWidth={2.5}
        />
      )}
      <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">
        {paper.title}
      </span>
      <span className="text-xs text-faint shrink-0">已折叠</span>
      <button
        type="button"
        onClick={onUnfold}
        className="inline-flex items-center gap-1 h-6 px-2 rounded-sm border border-border-strong text-2xs font-bold text-subtle hover:bg-background shrink-0"
      >
        <RotateCcw className="size-2.5" strokeWidth={2.5} />
        还原
      </button>
    </div>
  );
}
