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
      {/* 标题即展开热区 —— 与 StagedRow 同构:折叠态下点标题就能还原,
          不必去瞄右侧那颗「还原」按钮。两者调用同一个 onUnfold,不存在行为分叉。 */}
      <button
        type="button"
        onClick={onUnfold}
        title="还原为完整卡"
        className="flex-1 min-w-0 cursor-pointer truncate text-left text-12 text-muted-foreground transition-colors hover:text-foreground"
      >
        {paper.title}
      </button>
      <span className="text-12 text-faint">已折叠</span>
      <button
        type="button"
        onClick={onUnfold}
        className="inline-flex items-center gap-1 h-6 px-2 rounded-8 border border-border-strong text-12 font-medium text-subtle hover:bg-surface-card"
      >
        <RotateCcw className="size-2.5" strokeWidth={2.5} />
        还原
      </button>
    </div>
  );
}
