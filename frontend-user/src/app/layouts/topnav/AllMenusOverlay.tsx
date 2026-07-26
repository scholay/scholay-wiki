import { useMemo, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRight, LayoutGrid, List } from 'lucide-react';
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from '@/shared/ui/hover-card';
import { useLocalStorage } from '@/shared/hooks';
import { cn } from '@/shared/lib/utils';
import { MENUS, groupMenusByCategory, findActiveMenuIndex, type Menu } from '@/app/menus';

/**
 * 全站功能菜单浮层 —— 对照 .pen `S72unz`。
 *
 * 交互:hover 顶部 grid 按钮触发,鼠标可平滑移到内容(Radix HoverCard 自动
 * 跨越 trigger ↔ content 的 gap)。**不是 modal**,不锁滚动、不抢 ESC。
 *
 * 双视图:
 *   - list:  3 个分类段,行 icon + 双行 + chevron / kbd
 *   - grid:  3 列卡片,icon + 中英文双行
 *
 * 视图切换:点击头部右上的 "网格视图 / 列表视图" 按钮。
 */
export function AllMenusOverlay({
  trigger,
}: {
  trigger: ReactNode;
}) {
  // 视图偏好持久化到 localStorage —— 用户上次选了 grid,下次再打开仍是 grid
  const [view, setView] = useLocalStorage<'list' | 'grid'>(
    'scholay.all-menus.view',
    'list'
  );
  const navigate = useNavigate();
  const location = useLocation();

  const activeIndex = findActiveMenuIndex(location.pathname);
  const groups = useMemo(() => groupMenusByCategory(), []);

  const handleSelect = (menu: Menu) => {
    navigate(menu.href);
  };

  return (
    <HoverCard openDelay={120} closeDelay={180}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent
        align="end"
        sideOffset={8}
        className="w-[420px] p-0 overflow-hidden border border-border shadow-overlay"
      >
        {/* 头部 */}
        <header className="h-12 flex items-center justify-between px-4 border-b border-border-soft">
          <div className="flex items-center gap-2.5">
            <LayoutGrid className="size-4 text-faint" />
            <span className="text-sm font-bold text-foreground">全站功能</span>
          </div>
          <button
            type="button"
            onClick={() => setView((v) => (v === 'list' ? 'grid' : 'list'))}
            className="inline-flex items-center gap-1.5 text-xs text-faint hover:text-foreground transition-colors"
          >
            {view === 'list' ? (
              <>
                <LayoutGrid className="size-3" />
                网格视图
              </>
            ) : (
              <>
                <List className="size-3" />
                列表视图
              </>
            )}
          </button>
        </header>

        {/* 主体 */}
        {view === 'list' ? (
          <ListView groups={groups} activeIndex={activeIndex} onSelect={handleSelect} />
        ) : (
          <GridView groups={groups} activeIndex={activeIndex} onSelect={handleSelect} />
        )}

      </HoverCardContent>
    </HoverCard>
  );
}

// ============================================================================
// 列表视图
// ============================================================================

function ListView({
  groups,
  activeIndex,
  onSelect,
}: {
  groups: ReturnType<typeof groupMenusByCategory>;
  activeIndex: number;
  onSelect: (m: Menu) => void;
}) {
  return (
    <div className="py-1.5">
      {groups.map((g, gi) => (
        <section key={g.category} className={cn(gi > 0 && 'border-t border-border-soft', 'py-1.5')}>
          <header className="h-7 flex items-center justify-between px-4">
            <span className="text-xs font-bold text-faint">{g.label}</span>
            <span className="text-xs text-faint">查看全部</span>
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
}: {
  menu: Menu;
  isActive: boolean;
  onSelect: () => void;
}) {
  const Icon = menu.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group w-full flex items-center gap-3 h-14 px-4 transition-colors text-left',
        isActive ? 'bg-surface-1' : 'hover:bg-surface-1'
      )}
    >
      {/* icon 容器:24×24 白底 + 1px 边 */}
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-8 bg-surface-card border border-border shrink-0">
        <Icon className="size-3.5 text-subtle" />
      </span>
      {/* 双行 文字 */}
      <div className="flex-1 min-w-0 flex flex-col">
        <span className="text-base font-bold text-foreground truncate inline-flex items-center gap-1.5">
          {menu.label}
          {menu.comingSoon && (
            <span className="inline-flex items-center h-3.5 px-1 rounded-pill bg-brand-amber text-background text-[9px] font-bold leading-none">
              即将推出
            </span>
          )}
        </span>
        <span className="text-xs text-faint truncate mt-px">
          {menu.englishName} · {menu.description}
        </span>
      </div>
      <ChevronRight className="size-3.5 text-faint shrink-0" />
    </button>
  );
}

// ============================================================================
// 网格视图
// ============================================================================

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
    <div className="px-4 py-3.5 space-y-3.5 max-h-[480px] overflow-y-auto">
      {groups.map((g) => (
        <section key={g.category}>
          <header className="h-7 flex items-center justify-between px-1">
            <span className="text-xs font-bold text-faint">{g.label}</span>
            <span className="text-xs text-faint">查看全部</span>
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
                    'relative flex flex-col items-center gap-2 py-3 px-2 rounded-12 transition-colors text-center',
                    isActive ? 'bg-surface-1' : 'hover:bg-surface-1'
                  )}
                >
                  {m.comingSoon && (
                    <span className="absolute top-1.5 right-1.5 inline-flex items-center h-3.5 px-1 rounded-pill bg-brand-amber text-background text-[9px] font-bold leading-none">
                      即将推出
                    </span>
                  )}
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-8 bg-surface-card border border-border">
                    <Icon className="size-4 text-subtle" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-foreground">{m.label}</span>
                    <span className="text-2xs text-faint mt-0.5">{m.englishName}</span>
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
