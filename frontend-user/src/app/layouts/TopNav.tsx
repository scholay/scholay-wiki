import { useLocation } from 'react-router-dom';
import { BrandSection } from './topnav/BrandSection';
import { RailLinks } from './topnav/RailLinks';
import { MenuCarousel } from './topnav/MenuCarousel';
import { UserSection } from './topnav/UserSection';
import { useSidebar } from '@/stores/sidebar.store';
import { cn } from '@/shared/lib/utils';

/**
 * 顶部导航 — 三段式,Carousel **几何居中**(不被左侧 Rail 挤压),对照 .pen `bT0Dp`。
 *
 *   ┌──────────────────────────────────────────────────────────────────────────┐
 *   │ [☰] [Logo]  [Rail chips→ overflow scroll] │ [<][prev][active][next][>] [#] │ [Bell][User] │
 *   │ ←──── Left col (1fr, min-w-0) ────→       ←─── Center col (auto) ───→     ←─Right col 1fr─→
 *   └──────────────────────────────────────────────────────────────────────────┘
 *
 *  布局原理(关键!):
 *   - 用 CSS Grid `[minmax(0,1fr) auto minmax(0,1fr)]`,左右两列等分剩余空间,
 *     中间列 auto width = 内容宽度自适应。这样 carousel 永远停在视口几何中心。
 *   - Left col 加 `min-w-0` + 内部 Rail 走 `overflow-x-auto`,
 *     rail 多到挤不下 → 在自己列里横滚,不会推动 center 偏移。
 *   - Right col 同样 `min-w-0`,但通常 user 部分宽度可控,几乎不溢出。
 *   - Carousel viewport 用响应式 max-w:窄屏 260px(3 chips)/ 宽屏 420px(5 chips),
 *     让窄屏自动把空间让给左右。
 */
export function TopNav() {
  const { pathname } = useLocation();
  const isHome = pathname === '/';
  const { rail, expanded, hasPanel, toggle } = useSidebar();
  const showRail = !expanded && rail.length > 0;

  return (
    <header
      className={cn(
        'h-16 grid items-center gap-3 px-6 border-b border-border bg-background sticky top-0 z-30',
        isHome
          ? 'grid-cols-[minmax(0,1fr)_auto]'
          : 'grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]',
      )}
    >
      {/* Left col —— Brand + Rail(rail 内部自行 overflow scroll) */}
      <div className="min-w-0 flex items-center gap-2 justify-self-start overflow-hidden">
        <BrandSection onToggleSidebar={toggle} canToggle={hasPanel} />
        {showRail && (
          <>
            <span aria-hidden className="h-5 w-px bg-border shrink-0" />
            <RailLinks />
          </>
        )}
      </div>

      {/* Center col —— 首页改为主区大卡片导航,顶栏不再展示 carousel */}
      {!isHome && (
        <div className="flex items-center justify-self-center">
          <MenuCarousel />
        </div>
      )}

      {/* Right col —— User actions */}
      <div
        className="min-w-0 flex items-center justify-self-end overflow-hidden"
      >
        <UserSection />
      </div>
    </header>
  );
}
