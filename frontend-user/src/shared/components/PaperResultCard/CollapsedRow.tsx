import { Minimize2, RotateCcw } from 'lucide-react';
import type { Paper } from '@/shared/api/types';

/**
 * 未暂存折叠行 — .pen `BEXqq`(浅灰底)
 *   "还原" = 展开成完整卡(取消主动折叠)
 */
export function CollapsedRow({
  paper,
  onUnfold,
}: {
  paper: Paper;
  onUnfold: () => void;
}) {
  return (
    <div className="flex items-center gap-2 h-10 px-3.5 bg-surface-1 border-b border-border-soft">
      <Minimize2 className="size-2.5 text-muted-foreground" strokeWidth={2.5} />
      <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">
        {paper.title}
      </span>
      <span className="text-xs text-faint">已折叠</span>
      <button
        type="button"
        onClick={onUnfold}
        className="inline-flex items-center gap-1 h-6 px-2 rounded-8 border border-border-strong text-2xs font-bold text-subtle hover:bg-surface-card"
      >
        <RotateCcw className="size-2.5" strokeWidth={2.5} />
        还原
      </button>
    </div>
  );
}
