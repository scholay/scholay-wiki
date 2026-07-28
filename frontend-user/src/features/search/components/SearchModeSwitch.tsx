import { cn } from '@/shared/lib/utils';
import type { SearchMode } from '../search-mode';

interface SearchModeSwitchProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  className?: string;
}

/** 文献检索 / 智能助手 模式切换 —— landing 与 hero 置于输入框下方;结果/对话态在顶栏。 */
export function SearchModeSwitch({
  mode,
  onModeChange,
  className,
}: SearchModeSwitchProps) {
  return (
    <div
      role="tablist"
      aria-label="搜索模式"
      className={cn(
        'flex h-9 w-full items-center rounded-pill bg-surface-2 p-1',
        className,
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'classic'}
        onClick={() => onModeChange('classic')}
        className={cn(
          'inline-flex h-7 flex-1 items-center justify-center rounded-pill text-xs font-bold transition-colors whitespace-nowrap',
          mode === 'classic'
            ? 'bg-brand-red text-white shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        文献检索
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'smart'}
        onClick={() => onModeChange('smart')}
        className={cn(
          'inline-flex h-7 flex-1 items-center justify-center rounded-pill text-xs font-bold transition-colors whitespace-nowrap',
          mode === 'smart'
            ? 'bg-brand-red text-white shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        智能助手
      </button>
    </div>
  );
}
