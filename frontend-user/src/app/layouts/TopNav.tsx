import { BrandSection } from './topnav/BrandSection';
import { RailLinks } from './topnav/RailLinks';
import { MenuCarousel } from './topnav/MenuCarousel';
import { UserSection } from './topnav/UserSection';
import { useSidebar } from '@/stores/sidebar.store';

/**
 * 顶部导航 — 三段式,中段菜单 carousel 几何居中:
 *
 *   [Logo ← Rail] │ [Home | ← chips →] │ [Bell User]
 */
export function TopNav() {
  const { rail, expanded } = useSidebar();
  const showRail = !expanded && rail.length > 0;

  return (
    <header className="sticky top-0 z-30 grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 border-b border-border bg-background px-6">
      {/* Left —— Brand + Rail */}
      <div className="flex min-w-0 items-center justify-self-start gap-2 overflow-hidden">
        <BrandSection />
        {showRail && (
          <>
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            <RailLinks />
          </>
        )}
      </div>

      {/* Center —— 左右步进横向菜单 */}
      <div className="flex items-center justify-self-center">
        <MenuCarousel />
      </div>

      {/* Right —— 用户区 */}
      <div className="flex min-w-0 items-center justify-self-end gap-3 overflow-hidden">
        <UserSection />
      </div>
    </header>
  );
}
