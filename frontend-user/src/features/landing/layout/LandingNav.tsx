import { Link, useLocation } from 'react-router-dom';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { useIsAuthenticated } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui';
import { InviteNavButton } from '@/shared/components/InviteNavButton';
import { LANDINGS, LANDING_ORDER } from '../data/landings';

/**
 * Landing 页专用顶栏 —— .pen 各 Landing 页顶部 72px nav:
 *   左:品牌 logo
 *   中:6 个功能链接 + 定价(当前所在页高亮)
 *   右:登录 + 免费注册
 *
 * 不复用 AppShell 的 sidebar(那是产品内的导航),宣传页用更轻的 marketing nav。
 */
export function LandingNav() {
  const { pathname } = useLocation();
  // 登录与否只看 token(useIsAuthenticated),不看 user(展示缓存,可能未填)。
  const authenticated = useIsAuthenticated();
  const openDialog = useAuthDialog((s) => s.openDialog);

  return (
    <header className="sticky top-0 z-nav h-[72px] bg-background/95 backdrop-blur border-b border-border-soft">
      <div className="mx-auto flex h-full max-w-7xl min-w-0 items-center gap-3 px-3 sm:gap-6 sm:px-6 lg:gap-10 lg:px-12">
        <Link to="/" aria-label="返回首页" className="flex items-center shrink-0">
          {/* 375/390px 保留冻结的标志图形，只收起横向字标，避免与三个 CTA 争抢宽度。 */}
          <BrandLogo size="md" variant="mark" className="sm:hidden" />
          <BrandLogo size="md" className="hidden sm:inline-flex" />
        </Link>

        <nav className="hidden md:flex items-center gap-6 flex-1 min-w-0">
          {LANDING_ORDER.map((k) => {
            const f = LANDINGS[k];
            const to = `/features/${f.slug}`;
            const active = pathname === to;
            return (
              <Link
                key={k}
                to={to}
                className={cn(
                  'text-12 whitespace-nowrap transition-colors',
                  active
                    ? 'text-foreground font-medium'
                    : 'text-subtle hover:text-foreground'
                )}
              >
                {f.name}
              </Link>
            );
          })}
          {/* 定价 —— 未登录动线入口(功能链接之后),与功能链接同样式/同高亮规则 */}
          <Link
            to="/pricing"
            className={cn(
              'text-12 whitespace-nowrap transition-colors',
              pathname === '/pricing'
                ? 'text-foreground font-medium'
                : 'text-subtle hover:text-foreground'
            )}
          >
            定价
          </Link>
        </nav>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <InviteNavButton collapseBelowSm />
          {authenticated ? (
            <Button asChild className="h-9 px-4 text-14">
              <Link to="/library">进入工作台</Link>
            </Button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openDialog('login')}
                className="text-14 text-subtle hover:text-foreground transition-colors px-3 h-9"
              >
                登录
              </button>
              <Button
                type="button"
                onClick={() => openDialog('register')}
                className="h-9 px-4 text-14"
              >
                免费注册
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
