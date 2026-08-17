import { ChevronDown } from 'lucide-react';
import { Checkbox } from '@/shared/ui/checkbox';
import type { Paper } from '@/shared/api/types';

/**
 * 已暂存且已折叠的行 —— 勾选管暂存,「展开」只管还原完整卡(仍保持暂存)。
 */
export function StagedRow({
  paper,
  onUnstage,
  onUnfold,
}: {
  paper: Paper;
  onUnstage: () => void;
  onUnfold: () => void;
}) {
  return (
    <div
      data-paper-id={paper.paperId}
      className="flex items-center gap-2.5 min-h-10 px-3.5 py-2 bg-brand-green/5 border-b border-brand-green/30"
    >
      <Checkbox
        checked
        onCheckedChange={(v) => {
          if (v === false) onUnstage();
        }}
        aria-label="取消暂存"
        title="取消勾选以移出暂存区"
        className="shrink-0"
      />
      <span className="flex-1 min-w-0 text-sm text-subtle line-clamp-2 leading-snug">
        {paper.title || '无标题'}
      </span>
      <button
        type="button"
        onClick={onUnfold}
        className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        aria-label="展开"
        title="展开为完整卡(仍保留在暂存区)"
      >
        <ChevronDown className="size-3 rotate-180" />
      </button>
    </div>
  );
}
