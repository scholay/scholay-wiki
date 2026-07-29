import { BrandSection } from './topnav/BrandSection';
import { RailLinks } from './topnav/RailLinks';
import { MenuCarousel } from './topnav/MenuCarousel';
import { UserSection } from './topnav/UserSection';
import { useSidebar } from '@/stores/sidebar.store';

/**
 * 顶部导航 — 三段式,中段功能搜索几何居中(含首页)。
 *
 *   [Logo ←] │ [当前功能 | 🔍 搜索全站功能…] [Home] │ [Bell User]
 *
 * 侧栏开合由侧栏腰部按钮负责,顶栏不再挂 ☰。
 */
export function TopNav() {
  const { rail, expanded } = useSidebar();
  const showRail = !expanded && rail.length > 0;

  return (
    <header className="h-16 grid items-center gap-3 px-6 border-b border-border bg-background sticky top-0 z-30 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      {/* Left col —— Brand + Rail */}
      <div className="min-w-0 flex items-center gap-2 justify-self-start overflow-hidden">
        <BrandSection />
        {showRail && (
          <>
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            <RailLinks />
          </>
        )}
      </div>

      {/* Center col —— 功能搜索(首页与其它页一致) */}
      <div className="flex items-center justify-self-center">
        <MenuCarousel />
      </div>

      {/* Right col —— User actions */}
      <div className="min-w-0 flex items-center justify-self-end overflow-hidden">
        <UserSection />
      </div>
    </header>
  );
}
