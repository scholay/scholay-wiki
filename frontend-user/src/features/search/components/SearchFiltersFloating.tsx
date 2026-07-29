import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/** 相对结果区右上角的默认 inset */
const DEFAULT_POS = { top: 16, right: 16 } as const;
const EDGE = 8;
const DRAG_THRESHOLD = 5;
const STORAGE_KEY = 'search.filtersFab.pos';

type FabPos = { top: number; right: number };

function readStoredPos(): FabPos {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_POS };
    const parsed = JSON.parse(raw) as Partial<FabPos>;
    if (
      typeof parsed.top === 'number' &&
      typeof parsed.right === 'number' &&
      Number.isFinite(parsed.top) &&
      Number.isFinite(parsed.right)
    ) {
      return { top: parsed.top, right: parsed.right };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_POS };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * 结果区悬浮筛选按钮 —— 叠在滚动层之上常显、不挡点击穿透;
 * 可拖拽挪位(位置记 sessionStorage),点开为 Popover 筛选面板。
 */
export function SearchFiltersFloating({
  filters,
  onFiltersChange,
}: SearchFiltersFloatingProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<FabPos>(readStoredPos);
  const [dragging, setDragging] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPos: FabPos;
    moved: boolean;
  } | null>(null);

  const activeCount = useMemo(() => {
    const chips = buildFilterChips({
      filters,
      patch: () => {},
      toggleInList: () => {},
    });
    return chips.length;
  }, [filters]);

  const clampPos = useCallback((next: FabPos): FabPos => {
    const shell = shellRef.current;
    const btn = btnRef.current;
    if (!shell || !btn) return next;
    const cr = shell.getBoundingClientRect();
    const bw = btn.offsetWidth;
    const bh = btn.offsetHeight;
    return {
      top: clamp(next.top, EDGE, Math.max(EDGE, cr.height - bh - EDGE)),
      right: clamp(next.right, EDGE, Math.max(EDGE, cr.width - bw - EDGE)),
    };
  }, []);

  // 容器尺寸变化时把按钮夹回可视区(拖拽后右栏变窄等)。
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setPos((p) => clampPos(p));
    });
    ro.observe(shell);
    return () => ro.disconnect();
  }, [clampPos]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    // 打开弹层时不抢拖拽,避免和面板交互打架。
    if (open) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPos: { ...pos },
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      d.moved = true;
      setDragging(true);
      // 拖起来时关掉可能误触的 focus 样式感
      e.currentTarget.blur();
    }
    if (!d.moved) return;
    // 右移 → right 减小;下移 → top 增大
    setPos(
      clampPos({
        top: d.startPos.top + dy,
        right: d.startPos.right - dx,
      }),
    );
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (d.moved) {
      suppressClickRef.current = true;
      setDragging(false);
      setPos((p) => {
        const next = clampPos(p);
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    }
  };

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
      return;
    }
    setOpen((v) => !v);
  };

  return (
    // 叠层铺满结果区:自身不接事件,只有按钮 pointer-events-auto —— 不挡列表滚动/点击。
    <div
      ref={shellRef}
      className="pointer-events-none absolute inset-0 z-20"
      aria-hidden={false}
    >
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Anchor asChild>
          <button
            ref={btnRef}
            type="button"
            aria-label="打开筛选器"
            aria-expanded={open}
            aria-haspopup="dialog"
            title="拖拽可移动位置"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onClick={onClick}
            style={{ top: pos.top, right: pos.right }}
            className={cn(
              'pointer-events-auto absolute inline-flex h-10 cursor-grab items-center gap-2 rounded-pill border px-3.5 shadow-[0_8px_24px_rgba(15,23,42,0.12)] transition-colors select-none touch-none',
              dragging && 'cursor-grabbing',
              open
                ? 'border-brand-red/40 bg-brand-red text-white'
                : 'border-border bg-background/95 text-foreground backdrop-blur-sm hover:border-brand-red/30 hover:bg-surface-1',
            )}
          >
            <Filter className="size-4 shrink-0" strokeWidth={2.25} />
            <span className="text-xs font-bold">筛选</span>
            {activeCount > 0 && (
              <span
                className={cn(
                  'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-pill px-1 text-2xs font-bold tabular-nums',
                  open ? 'bg-white/20 text-white' : 'bg-brand-red text-white',
                )}
              >
                {activeCount}
              </span>
            )}
          </button>
        </PopoverPrimitive.Anchor>

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
    </div>
  );
}
