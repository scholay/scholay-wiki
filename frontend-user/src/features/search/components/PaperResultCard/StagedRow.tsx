import { Check, ChevronDown, X } from 'lucide-react';
import type { Paper } from '../../api/papers';

/**
 * 已暂存折叠行 — .pen `Q6TEbO`(浅绿底,padding [8,14])
 *   ⌄  = 展开成完整卡(仍保留暂存)
 *   ×  = 取消暂存(变成灰色 CollapsedRow 等待还原)
 */
export function StagedRow({
  paper,
  onUnfold,
  onUnstage,
}: {
  paper: Paper;
  onUnfold: () => void;
  onUnstage: () => void;
}) {
  return (
    <div className="flex items-center gap-2 min-h-10 px-3.5 py-2 bg-brand-green/5 border-b border-brand-green/30">
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-pill bg-brand-green text-white shrink-0">
        <Check className="size-2.5" strokeWidth={3.5} />
      </span>
      <span className="flex-1 min-w-0 text-sm text-subtle line-clamp-2 leading-snug">
        {paper.title || '无标题'}
      </span>
      <span className="inline-flex items-center px-1.5 py-px rounded-sm bg-brand-green/10 text-brand-green text-2xs font-bold shrink-0">
        已暂存
      </span>
      <button
        type="button"
        onClick={onUnfold}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground shrink-0"
        aria-label="展开"
        title="展开为完整卡(仍保留在暂存区)"
      >
        <ChevronDown className="size-3 rotate-180" />
      </button>
      <button
        type="button"
        onClick={onUnstage}
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground shrink-0"
        aria-label="取消暂存"
        title="从暂存区移除"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
