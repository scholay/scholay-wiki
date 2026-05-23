import { useEffect, useRef, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, LayoutGrid } from 'lucide-react';
import { MENUS, findActiveMenuIndex } from '@/app/menus';
import { AllMenusOverlay } from '@/app/layouts/topnav/AllMenusOverlay';
import { cn } from '@/shared/lib/utils';

/**
 * Sidebar 顶部导航条 —— **替代** 老的"返回首页 / 标题 / 搜索" 3 元素布局。
 *
 * 设计:
 *   - 水平排布所有 MENUS 项,只显示 icon(无文字)
 *   - 横向溢出可滚(挤压不到底栏 grid 按钮)
 *   - 当前路由匹配的 menu 显示**选中态**:暗色填充,圆角(对照 .pen `n0GFZR` home icon)
 *   - 末尾固定一个 grid 按钮,**复用顶部 carousel 的 AllMenusOverlay hover 弹层**
 *
 * 用 sticky 把 grid 按钮钉死在右侧,中间的 menu icons 在自己的 overflow-x-auto 容器里滚。
 */
export function SidebarHeaderNav({ extraEnd }: { extraEnd?: ReactNode }) {
  const location = useLocation();
  const activeIndex = findActiveMenuIndex(location.pathname);
  // 首页(`/`)是独立目的地,在 sidebar 顶端单独有一颗 Home 图标。
  // 用 pathname === '/' 直判,因为 MENUS 不再包含首页(避免与文献搜索混淆)。
  const onHome = location.pathname === '/';

  // 让选中的菜单滚到可见位置 —— 跨页跳转 / 横向溢出时自动归位,
  // block:'nearest' 防止外层 window 滚动,inline:'center' 让选中项居中视觉
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  useEffect(() => {
    const el = itemRefs.current[activeIndex];
    if (!el) return;
    el.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeIndex]);

  return (
    <header
      className={cn(
        'h-14 flex items-center gap-1 border-b border-border-soft shrink-0',
        // 给左/右各 8px 间距,与 px-3 老 header 视觉一致
        'pl-2 pr-1.5'
      )}
    >
      {/* 菜单图标列表 — 横向溢出可滚。
          第一颗永远是首页 Home,后面才是 MENUS 中的各 feature。 */}
      <nav
        className={cn(
          'flex items-center gap-0.5 flex-1 min-w-0',
          'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
        )}
        role="toolbar"
        aria-label="菜单导航"
      >
        <NavLink
          to="/"
          end
          title="首页"
          aria-label="首页"
          className={cn(
            'inline-flex items-center justify-center size-9 rounded-md shrink-0 transition-colors',
            onHome
              ? // 选中态:固定黑底白字,无 hover 变色 —— 与 / 页背景对比稳定
                'bg-foreground text-background cursor-default'
              : 'text-subtle hover:bg-surface-2 hover:text-foreground'
          )}
        >
          <Home className="size-4" strokeWidth={onHome ? 2.2 : 1.8} />
        </NavLink>

        {MENUS.map((menu, i) => {
          const Icon = menu.icon;
          // 与 carousel 一致:要求 menu.match(pathname) 真匹配才高亮。
          // 这样首页(`/`)上 MENUS 全部不高亮 —— Home 图标独占 active。
          const isActive = i === activeIndex && menu.match(location.pathname);
          return (
            <NavLink
              key={menu.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              to={menu.href}
              end
              title={
                menu.comingSoon ? `${menu.label} · 即将推出` : menu.label
              }
              aria-label={menu.label}
              className={cn(
                'relative inline-flex items-center justify-center size-9 rounded-md shrink-0 transition-colors',
                isActive
                  ? // 选中态:暗色填充(对照 .pen `A2sWI0` home icon —— #111 底 + 白图标),
                    // 不再 hover 改色 —— 选中已是最强对比,任何 hover 变化都会减弱辨识
                    'bg-foreground text-background cursor-default'
                  : 'text-subtle hover:bg-surface-2 hover:text-foreground'
              )}
            >
              <Icon className="size-4" strokeWidth={isActive ? 2.2 : 1.8} />
              {/* 即将推出 —— sidebar 紧凑空间不放文字,只用 amber 角点示意 */}
              {menu.comingSoon && (
                <span
                  aria-hidden="true"
                  className="absolute top-1 right-1 inline-block size-1.5 rounded-pill bg-brand-amber"
                />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* 末尾 grid 按钮 + 可选 extra — 不参与 scroll,sticky 在右 */}
      <div className="flex items-center gap-1 shrink-0 pl-1 border-l border-border-soft">
        {extraEnd}
        <AllMenusOverlay
          trigger={
            <button
              type="button"
              aria-label="全站功能"
              className={cn(
                'inline-flex items-center justify-center size-9 rounded-md text-subtle shrink-0',
                'hover:bg-surface-2 hover:text-foreground transition-colors'
              )}
            >
              <LayoutGrid className="size-4" strokeWidth={1.8} />
            </button>
          }
        />
      </div>
    </header>
  );
}
