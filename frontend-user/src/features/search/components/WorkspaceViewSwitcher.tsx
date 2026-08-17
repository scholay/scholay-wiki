import { Grid3x3, List } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type WorkspacePanelView = 'list' | 'matrix';

interface WorkspaceViewSwitcherProps {
  value: WorkspacePanelView;
  onChange: (view: WorkspacePanelView) => void;
  className?: string;
}

/** 工作区右栏视图切换 —— 默认「列表」;「矩阵分析」为可选视图之一。 */
export function WorkspaceViewSwitcher({
  value,
  onChange,
  className,
}: WorkspaceViewSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="工作区视图"
      className={cn(
        'inline-flex shrink-0 items-center rounded-sm border border-border p-0.5',
        className,
      )}
    >
      <button
        type="button"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-sm px-2.5 text-xs transition-colors',
          value === 'list'
            ? 'bg-surface-2 text-foreground'
            : 'text-subtle hover:bg-surface-1 hover:text-foreground',
        )}
      >
        <List className="size-3.5" />
        列表
      </button>
      <button
        type="button"
        aria-pressed={value === 'matrix'}
        onClick={() => onChange('matrix')}
        className={cn(
          'inline-flex h-7 items-center gap-1 rounded-sm px-2.5 text-xs transition-colors',
          value === 'matrix'
            ? 'bg-surface-2 text-foreground'
            : 'text-subtle hover:bg-surface-1 hover:text-foreground',
        )}
      >
        <Grid3x3 className="size-3.5" />
        矩阵分析
      </button>
    </div>
  );
}
