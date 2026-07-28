import { useMemo, useState } from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Filter, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { SearchFilters } from '../types';
import { buildFilterChips } from './search-sidebar/chips-from-filters';
import { SearchFiltersPanel } from './SearchFiltersPanel';

interface SearchFiltersFloatingProps {
  filters: SearchFilters;
  onFiltersChange: (next: SearchFilters) => void;
}

/** 结果区悬浮筛选按钮 —— 点开为容器内 Popover 弹层 */
export function SearchFiltersFloating({
  filters,
  onFiltersChange,
}: SearchFiltersFloatingProps) {
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
          className={cn(
            'absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-pill border px-3.5 h-10 shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition-colors',
            open
              ? 'border-brand-red/40 bg-brand-red text-white'
              : 'border-border bg-background text-foreground hover:border-brand-red/30 hover:bg-surface-1',
          )}
        >
          <Filter className="size-4 shrink-0" strokeWidth={2.25} />
          <span className="text-xs font-bold">筛选</span>
          {activeCount > 0 && (
            <span
              className={cn(
                'inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-pill px-1 text-2xs font-bold tabular-nums',
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
          side="top"
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
              className="inline-flex size-7 items-center justify-center rounded-sm text-subtle hover:bg-surface-1 hover:text-foreground"
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
