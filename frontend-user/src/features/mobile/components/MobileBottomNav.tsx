import { Link, useLocation } from 'react-router-dom';
import { m } from 'framer-motion';
import { Compass, LayoutGrid, User } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { SNAPPY_SPRING } from '@/shared/lib/motion';
import { ClawBrandIcon } from '@/shared/components/ClawBrandIcon';

interface NavItem {
  key: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  /** 命中前缀即高亮;null = 未上线(toast 预告) */
  to: string | null;
}

const ITEMS: NavItem[] = [
  {
    key: 'feed',
    label: '浏览',
    to: '/m/feed',
    icon: () => <Compass className="size-5.5" />,
  },
  {
    key: 'claw',
    label: 'AI Claw',
    to: '/m/claw',
    // Claw 品牌符号:矢量龙虾(替代设计稿的 🦞 emoji,跟随导航文字色)
    icon: () => <ClawBrandIcon className="size-5.5" />,
  },
  {
    key: 'tools',
    label: '功能',
    to: '/m/tools',
    icon: () => <LayoutGrid className="size-5.5" />,
  },
  {
    key: 'me',
    label: '我的',
    to: '/m/me',
    icon: () => <User className="size-5.5" />,
  },
];

/**
 * 移动端底部导航(.pen `TCB7G` Bottom Nav):浏览 / AI Claw / 功能 / 我的。
 * 「我的」是后续里程碑占位。
 */
export function MobileBottomNav() {
  const { pathname } = useLocation();

  return (
    /* 全面屏 home indicator 让位 — env(safe-area-inset-bottom) 需 index.html viewport-fit=cover */
    <nav className="flex h-16 shrink-0 border-t border-border bg-background px-2 pb-[env(safe-area-inset-bottom)]">
      {ITEMS.map((item) => {
        const active =
          (!!item.to && pathname.startsWith(item.to)) ||
          // 未登录的「我的」整页跳 /m/auth,Tab 高亮跟随
          (item.key === 'me' && pathname.startsWith('/m/auth'));
        const cls = cn(
          'relative flex flex-1 flex-col items-center justify-center gap-1 transition-transform active:scale-90',
          active ? 'text-foreground' : 'text-faint'
        );
        const body = (
          <>
            {/* 激活指示条 —— layoutId 让它在切 tab 时平滑滑动到新位置 */}
            {active && (
              <m.span
                layoutId="mobile-nav-indicator"
                transition={SNAPPY_SPRING}
                className="absolute top-0 h-0.5 w-8 rounded-pill bg-brand-red"
              />
            )}
            {item.icon(active)}
            <span className={cn('text-2xs', active && 'font-medium')}>
              {item.label}
            </span>
          </>
        );
        return item.to ? (
          <Link key={item.key} to={item.to} className={cls}>
            {body}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            onClick={() => toast.info('移动端即将上线,敬请期待')}
            className={cls}
          >
            {body}
          </button>
        );
      })}
    </nav>
  );
}
