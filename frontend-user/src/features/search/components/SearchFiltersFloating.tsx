import { useMemo, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Filter, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { SearchFilters } from '../types';
import { buildFilterChips } from './search-sidebar/chips-from-filters';
import { SearchFiltersPanel } from './SearchFiltersPanel';

interface SearchFiltersButtonProps {
  filters: SearchFilters;
  onFiltersChange: (next: SearchFilters) => void;
  className?: string;
}

/**
 * 搜索栏内嵌筛选入口 —— 挂在 SearchAutocomplete 右侧,点开 Popover 面板。
 * (原悬浮可拖 FAB 已下线,位置随输入框走。)
 */
export function SearchFiltersButton({
  filters,
  onFiltersChange,
  className,
}: SearchFiltersButtonProps) {
  const [open, setOpen] = useState(false);

  const activeCount = useMemo(() => {
    const chips = buildFilterChips({
      filters,
      patch: () => {},
      toggleInList: () => {},
    });
    return chips.length;
  }, [filters]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="打开筛选器"
          aria-expanded={open}
          aria-haspopup="dialog"
          title="筛选"
          className={cn(
            'inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-2xs font-semibold transition-colors',
            open
              ? 'bg-brand-red text-white'
              : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
            className,
          )}
        >
          <Filter className="size-3.5 shrink-0" strokeWidth={2.25} />
          <span>筛选</span>
          {activeCount > 0 && (
            <span
              className={cn(
                'inline-flex h-4 min-w-4 items-center justify-center rounded-pill px-1 text-[10px] font-bold tabular-nums',
                open ? 'bg-white/20 text-white' : 'bg-brand-red text-white',
              )}
            >
              {activeCount}
            </span>
          )}
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          side="bottom"
          sideOffset={10}
          collisionPadding={16}
          className={cn(
            'z-50 w-[min(320px,calc(100vw-48px))] overflow-hidden rounded-lg border border-border bg-background',
            'shadow-[0_12px_40px_rgba(15,23,42,0.14)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex items-center justify-end border-b border-border px-2 py-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="关闭筛选器"
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-subtle hover:bg-surface-1 hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <SearchFiltersPanel
            filters={filters}
            onFiltersChange={onFiltersChange}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** @deprecated 使用 SearchFiltersButton;保留别名以免外部引用断裂。 */
export const SearchFiltersFloating = SearchFiltersButton;
