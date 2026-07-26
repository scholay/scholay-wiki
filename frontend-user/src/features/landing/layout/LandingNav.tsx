import { Link, useLocation } from 'react-router-dom';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { useIsAuthenticated } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { cn } from '@/shared/lib/utils';
import { LANDINGS, LANDING_ORDER } from '../data/landings';

/**
 * Landing 页专用顶栏 —— .pen 各 Landing 页顶部 72px nav:
 *   左:品牌 logo
 *   中:6 个功能链接(当前所在功能高亮)
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
      <div className="max-w-7xl mx-auto h-full px-6 lg:px-12 flex items-center gap-10">
        <Link to="/" aria-label="返回首页" className="flex items-center shrink-0">
          <BrandLogo size="md" />
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
        </nav>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {authenticated ? (
            <Link
              to="/library"
              className="inline-flex items-center h-9 px-4 rounded-8 bg-foreground text-background text-14 font-medium hover:bg-foreground/85 transition-colors"
            >
              进入工作台
            </Link>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openDialog('login')}
                className="text-14 text-subtle hover:text-foreground transition-colors px-3 h-9"
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => openDialog('register')}
                className="inline-flex items-center h-9 px-4 rounded-8 bg-foreground text-background text-14 font-medium hover:bg-foreground/85 transition-colors"
              >
                免费注册
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
