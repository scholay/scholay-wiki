import { NavLink } from 'react-router-dom';
import { MENUS, type Menu } from '@/app/menus';
import { cn } from '@/shared/lib/utils';

/**
 * 首页主区内的紧凑功能入口 —— 嵌在 HomeAgentHero 里,非独立区块。
 * 形态介于 TopNav carousel chip 与侧栏 rich card 之间:带边框的小卡片,单行可换行。
 */
export function HomeFeatureNav() {
  return (
    <nav
      aria-label="全站功能"
      className="mb-6 flex w-full flex-wrap items-center justify-center gap-2"
    >
      {MENUS.map((menu) => (
        <FeatureChip key={menu.id} menu={menu} />
      ))}
    </nav>
  );
}

function FeatureChip({ menu }: { menu: Menu }) {
  const Icon = menu.icon;

  return (
    <NavLink
      to={menu.href}
      title={menu.description}
      className={({ isActive }) =>
        cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors',
          'hover:border-border-button hover:bg-surface-1 hover:text-foreground',
          isActive
            ? 'border-foreground bg-foreground text-background'
            : 'border-border bg-background/90 text-subtle',
          menu.comingSoon && !isActive && 'text-muted-foreground',
        )
      }
    >
      <Icon className="size-3.5 shrink-0" strokeWidth={1.8} />
      <span className="whitespace-nowrap">{menu.label}</span>
      {menu.comingSoon && (
        <span className="ml-0.5 inline-block size-1.5 rounded-pill bg-brand-amber" aria-hidden />
      )}
    </NavLink>
  );
}
