import { useMemo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
 * 全站功能菜单浮层。
 *
 * (原注释写「对照 .pen `S72unz`」—— .pen 真源已于 2026-07 作废,现行真源是 Figma
 *  `JIv8fxQthMS37JLGHNOEbB`,见 docs/figma-design-spec-2026-07.md。)
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
  const location = useLocation();

  const activeIndex = findActiveMenuIndex(location.pathname);
  const groups = useMemo(() => groupMenusByCategory(), []);

  // 菜单项是真实 <Link href>(SEO 硬约束),导航由 Link 完成,不再 useNavigate

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
          <div className="flex items-center gap-2">
            <LayoutGrid className="size-4 text-faint" />
            <span className="text-12 font-medium text-foreground">全站功能</span>
          </div>
          <button
            type="button"
            onClick={() => setView((v) => (v === 'list' ? 'grid' : 'list'))}
            className="inline-flex items-center gap-2 text-12 text-faint hover:text-foreground transition-colors"
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
          <ListView groups={groups} activeIndex={activeIndex} />
        ) : (
          <GridView groups={groups} activeIndex={activeIndex} />
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
}: {
  groups: ReturnType<typeof groupMenusByCategory>;
  activeIndex: number;
}) {
  return (
    <div className="py-2">
      {groups.map((g, gi) => (
        <section key={g.category} className={cn(gi > 0 && 'border-t border-border-soft', 'py-2')}>
          <header className="h-7 flex items-center justify-between px-4">
            <span className="text-12 font-medium text-subtle">{g.label}</span>
            <span className="text-12 text-faint">查看全部</span>
          </header>
          {g.items.map((m) => {
            const flatIdx = MENUS.findIndex((x) => x.id === m.id);
            const isActive = flatIdx === activeIndex;
            return <ListItem key={m.id} menu={m} isActive={isActive} />;
          })}
        </section>
      ))}
    </div>
  );
}

function ListItem({
  menu,
  isActive,
}: {
  menu: Menu;
  isActive: boolean;
}) {
  const Icon = menu.icon;
  return (
    // 真实 <Link href>(SEO 硬约束);平点 = SPA 导航,无额外副作用
    <Link
      to={menu.href}
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
        <span className="text-14 font-medium text-foreground truncate inline-flex items-center gap-2">
          {menu.label}
        </span>
        <span className="text-12 text-faint truncate mt-px">
          {menu.englishName} · {menu.description}
        </span>
      </div>
      <ChevronRight className="size-3.5 text-faint shrink-0" />
    </Link>
  );
}

// ============================================================================
// 网格视图
// ============================================================================

function GridView({
  groups,
  activeIndex,
}: {
  groups: ReturnType<typeof groupMenusByCategory>;
  activeIndex: number;
}) {
  return (
    <div className="px-4 py-4 space-y-4 max-h-[480px] overflow-y-auto">
      {groups.map((g) => (
        <section key={g.category}>
          <header className="h-7 flex items-center justify-between px-1">
            <span className="text-12 font-medium text-subtle">{g.label}</span>
            <span className="text-12 text-faint">查看全部</span>
          </header>
          <div className="grid grid-cols-3 gap-2">
            {g.items.map((m) => {
              const Icon = m.icon;
              const flatIdx = MENUS.findIndex((x) => x.id === m.id);
              const isActive = flatIdx === activeIndex;
              return (
                // 真实 <Link href>(SEO 硬约束);平点 = SPA 导航,无额外副作用
                <Link
                  key={m.id}
                  to={m.href}
                  className={cn(
                    'relative flex flex-col items-center gap-2 py-3 px-2 rounded-12 transition-colors text-center',
                    isActive ? 'bg-surface-1' : 'hover:bg-surface-1'
                  )}
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-8 bg-surface-card border border-border">
                    <Icon className="size-4 text-subtle" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-14 font-medium text-foreground">{m.label}</span>
                    <span className="text-12 text-faint mt-1">{m.englishName}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
