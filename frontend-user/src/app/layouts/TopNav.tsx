import { BrandSection } from './topnav/BrandSection';
import { RailLinks } from './topnav/RailLinks';
import { UserSection } from './topnav/UserSection';
import { useSidebar } from '@/stores/sidebar.store';

/**
 * 顶部导航 —— 左:开合 + Logo(+ 收起态 Rail);右:用户区。
 * 功能入口已迁到全站左轨,中段 carousel / 全站功能 chip 不再挂。
 */
export function TopNav() {
  const { rail, expanded, hasPanel, toggle } = useSidebar();
  const showRail = !expanded && rail.length > 0;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background px-6">
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <BrandSection onToggleSidebar={toggle} canToggle={hasPanel} />
        {showRail && (
          <>
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            <RailLinks />
          </>
        )}
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <UserSection />
      </div>
    </header>
  );
}
