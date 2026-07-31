import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, LayoutGrid, List } from 'lucide-react';
import { useLocalStorage } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import {
  MENUS,
  groupMenusByCategory,
  findActiveMenuIndex,
  type Menu,
} from '@/app/menus';

function filterGroups(query: string) {
  const q = query.trim().toLowerCase();
  const groups = groupMenusByCategory();
  if (!q) return groups;
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.englishName.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.items.length > 0);
}

export function navigateToMenu(
  navigate: ReturnType<typeof useNavigate>,
  menu: Menu,
) {
  if (menu.id === 'search') {
    navigate('/search', { state: { fresh: true } });
    return;
  }
  navigate(menu.href);
}

/**
 * 全站功能面板本体 —— 功能名悬停菜单等复用。
 * `query` 非空时按名称/英文/描述过滤。
 * `compact`：仅列表、单行一级标题。
 */
export function AllMenusPanel({
  query = '',
  onSelect,
  className,
  compact = false,
}: {
  query?: string;
  onSelect?: (menu: Menu) => void;
  className?: string;
  compact?: boolean;
}) {
  const [view, setView] = useLocalStorage<'list' | 'grid'>(
    'scholay.all-menus.view',
    'list',
  );
  const navigate = useNavigate();
  const location = useLocation();
  const activeIndex = findActiveMenuIndex(location.pathname);
  const groups = useMemo(() => filterGroups(query), [query]);
  const effectiveView = compact ? 'list' : view;

  const handleSelect = (menu: Menu) => {
    if (onSelect) onSelect(menu);
    else navigateToMenu(navigate, menu);
  };

  return (
    <div className={cn('overflow-hidden', className)}>
      {!compact && (
        <header className="flex h-12 items-center justify-between border-b border-border-soft px-4">
          <div className="flex items-center gap-2.5">
            <LayoutGrid className="size-4 text-faint" />
            <span className="text-sm font-bold text-foreground">全站功能</span>
          </div>
          <ViewModeSwitch value={view} onChange={setView} />
        </header>
      )}

      {groups.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-faint">
          没有匹配「{query.trim()}」的功能
        </div>
      ) : effectiveView === 'list' ? (
        <ListView
          groups={groups}
          activeIndex={activeIndex}
          onSelect={handleSelect}
          compact={compact}
        />
      ) : (
        <GridView
          groups={groups}
          activeIndex={activeIndex}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}

function ViewModeSwitch({
  value,
  onChange,
}: {
  value: 'list' | 'grid';
  onChange: (v: 'list' | 'grid') => void;
}) {
  return (
    <div
      role="group"
      aria-label="视图切换"
      className="inline-flex shrink-0 items-center rounded-md bg-surface-2 p-0.5"
    >
      <button
        type="button"
        aria-label="列表视图"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
        className={cn(
          'inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2 text-xs transition-colors',
          value === 'list'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-faint hover:text-foreground',
        )}
      >
        <List className="size-3.5" />
        列表
      </button>
      <button
        type="button"
        aria-label="网格视图"
        aria-pressed={value === 'grid'}
        onClick={() => onChange('grid')}
        className={cn(
          'inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2 text-xs transition-colors',
          value === 'grid'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-faint hover:text-foreground',
        )}
      >
        <LayoutGrid className="size-3.5" />
        网格
      </button>
    </div>
  );
}

function ListView({
  groups,
  activeIndex,
  onSelect,
  compact = false,
}: {
  groups: ReturnType<typeof groupMenusByCategory>;
  activeIndex: number;
  onSelect: (m: Menu) => void;
  compact?: boolean;
}) {
  return (
    <div className="max-h-[min(70vh,520px)] overflow-y-auto py-1.5">
      {groups.map((g, gi) => (
        <section
          key={g.category}
          className={cn(gi > 0 && 'border-t border-border-soft', 'py-1.5')}
        >
          <header className="flex h-7 items-center justify-between px-4">
            <span className="text-xs font-bold tracking-[0.06em] text-faint">
              {g.label}
            </span>
          </header>
          {g.items.map((m) => {
            const flatIdx = MENUS.findIndex((x) => x.id === m.id);
            const isActive = flatIdx === activeIndex;
            return (
              <ListItem
                key={m.id}
                menu={m}
                isActive={isActive}
                onSelect={() => onSelect(m)}
                compact={compact}
              />
            );
          })}
        </section>
      ))}
    </div>
  );
}

function ListItem({
  menu,
  isActive,
  onSelect,
  compact = false,
}: {
  menu: Menu;
  isActive: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  const Icon = menu.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 px-4 text-left transition-colors',
        compact ? 'h-10' : 'h-14',
        isActive ? 'bg-surface-1' : 'hover:bg-surface-1',
      )}
    >
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-border bg-background">
        <Icon className="size-3.5 text-subtle" />
      </span>
      {compact ? (
        <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm font-semibold text-foreground">
          {menu.label}
          {menu.comingSoon && (
            <span className="inline-flex h-3.5 shrink-0 items-center rounded-pill bg-brand-amber px-1 text-[9px] font-bold leading-none text-background">
              即将推出
            </span>
          )}
        </span>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="inline-flex items-center gap-1.5 truncate text-base font-bold text-foreground">
            {menu.label}
            {menu.comingSoon && (
              <span className="inline-flex h-3.5 items-center rounded-pill bg-brand-amber px-1 text-[9px] font-bold leading-none text-background">
                即将推出
              </span>
            )}
          </span>
          <span className="mt-px truncate text-xs text-faint">
            {menu.englishName} · {menu.description}
          </span>
        </div>
      )}
      <ChevronRight className="size-3.5 shrink-0 text-faint" />
    </button>
  );
}

function GridView({
  groups,
  activeIndex,
  onSelect,
}: {
  groups: ReturnType<typeof groupMenusByCategory>;
  activeIndex: number;
  onSelect: (m: Menu) => void;
}) {
  return (
    <div className="max-h-[min(70vh,520px)] space-y-3.5 overflow-y-auto px-4 py-3.5">
      {groups.map((g) => (
        <section key={g.category}>
          <header className="flex h-7 items-center px-1">
            <span className="text-xs font-bold tracking-[0.06em] text-faint">
              {g.label}
            </span>
          </header>
          <div className="grid grid-cols-3 gap-1.5">
            {g.items.map((m) => {
              const Icon = m.icon;
              const flatIdx = MENUS.findIndex((x) => x.id === m.id);
              const isActive = flatIdx === activeIndex;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect(m)}
                  className={cn(
                    'relative flex cursor-pointer flex-col items-center gap-2 rounded-md px-2 py-3 text-center transition-colors',
                    isActive ? 'bg-surface-1' : 'hover:bg-surface-1',
                  )}
                >
                  {m.comingSoon && (
                    <span className="absolute right-1.5 top-1.5 inline-flex h-3.5 items-center rounded-pill bg-brand-amber px-1 text-[9px] font-bold leading-none text-background">
                      即将推出
                    </span>
                  )}
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-sm border border-border bg-background">
                    <Icon className="size-4 text-subtle" />
                  </span>
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-bold text-foreground">
                      {m.label}
                    </span>
                    <span className="mt-0.5 text-2xs text-faint">
                      {m.englishName}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
