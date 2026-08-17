import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

describe('route and overlay loading boundaries', () => {
  it('keeps the desktop shell and home page out of independent top-level routes', () => {
    const source = readSource('src/app/router.tsx');
    expect(source).not.toMatch(/^import .*AppShell/m);
    expect(source).not.toMatch(/^import .*HomePage/m);
    expect(source).toContain("import('./layouts/AppShell')");
    expect(source).toContain("import('@/features/home/HomePage')");
  });

  it('keeps global controllers eager while their heavy dialog UI is lazy', () => {
    const providers = readSource('src/app/providers.tsx');
    expect(providers).toContain('<QuotaNotifierGate />');
    expect(providers).toContain('<PromoModalGate />');
    expect(providers).toContain('<AttachmentManagerDialogGate />');
    expect(providers).not.toMatch(/^import .*\/QuotaNotifier['"]/m);
    expect(providers).not.toMatch(/^import .*\/PromoModal['"]/m);
    expect(providers).not.toMatch(/^import .*\/AttachmentManagerDialog['"]/m);
    // 这些 lazy gate 位于 RouterProvider 之外，分包失败不得拖垮整棵应用。
    expect(providers.match(/<ErrorBoundary fallback=\{\(\) => null\}>/g)).toHaveLength(4);
    expect(providers).toMatch(
      /<ErrorBoundary fallback=\{\(\) => null\}>\s*<CollectFolderPickerGate \/>\s*<\/ErrorBoundary>/,
    );

    for (const [path, dynamicImport] of [
      ['src/shared/components/QuotaNotifierGate.tsx', "import('./QuotaNotifier')"],
      ['src/shared/components/PromoModalGate.tsx', "import('./PromoModal')"],
      [
        'src/shared/components/AttachmentManagerDialogGate.tsx',
        "import('./AttachmentManagerDialog')",
      ],
    ] as const) {
      const source = readSource(path);
      expect(source).toContain(dynamicImport);
      expect(source).toContain('everOpened');
    }
  });

  it('shows a lightweight router bootstrap fallback and contains global lazy failures', () => {
    const app = readSource('src/app/App.tsx');
    expect(app).toContain('useSyncExternalStore');
    // 首次初始化占位改用共享 RouteFallback(shared/components/LazyRoute):
    // 同一个组件也是全站 element-lazy 路由的 Suspense 骨架,必须保持零依赖轻量。
    expect(app).toContain('!routerInitialized && <RouteFallback full />');
    const lazyRouteSource = readSource('src/shared/components/LazyRoute.tsx');
    expect(lazyRouteSource).toContain('export function RouteFallback');
    expect(lazyRouteSource).not.toMatch(/<(?:[A-Z][A-Za-z]+Icon|img)\b/);
    expect(app.match(/<ErrorBoundary fallback=\{\(\) => null\}>/g)).toHaveLength(3);
  });

  it('uses one global loading overlay and the app run clip', () => {
    const providers = readSource('src/app/providers.tsx');
    const lazyRouteSource = readSource('src/shared/components/LazyRoute.tsx');
    const loadingState = readSource('src/shared/components/LoadingState.tsx');
    const loader = readSource('src/shared/components/RhinoRunLoader.tsx');
    const overlay = readSource('src/shared/components/GlobalLoadingOverlay.tsx');

    expect(providers).toContain('<GlobalLoadingOverlay');
    expect(lazyRouteSource).toContain('usePageLoadingClaim');
    expect(lazyRouteSource).not.toContain('<RhinoRunLoader');
    expect(loadingState).toContain('usePageLoadingClaim');
    expect(loadingState).not.toContain('<RhinoRunLoader');
    expect(overlay).toContain('bg-foreground/40');
    expect(overlay).toContain('<RhinoRunLoader');
    expect(loader).toContain("RUN_CLIP = 'run-south-east'");
    expect(loader).toContain('rhinoFrameUrls(RUN_CLIP)');
    expect(loader).not.toContain('pet-run');
    expect(loader).not.toContain('orbit');
    expect(loader).not.toContain('run-across');
    expect(loader).toContain('rhino-run-loader__wheel');
    expect(loader).toContain('animate-rhino-wheel-progress');
  });

  it('closes responsive Radix menus instead of unmounting an open Root', () => {
    const nav = readSource('src/app/layouts/TopNav.tsx');
    const compact = readSource('src/app/layouts/topnav/CompactNavMenu.tsx');
    const user = readSource('src/app/layouts/topnav/UserSection.tsx');
    const activity = readSource('src/app/layouts/topnav/ActivityNavMenu.tsx');

    expect(nav).toContain('compactEverMounted');
    expect(nav).toContain('<CompactNavMenu active={!isWide} />');
    expect(compact).toContain('open={active && open}');
    expect(user).toContain('activityEverMounted');
    expect(user).toContain('<ActivityNavMenu active={wide}');
    expect(activity).toContain('open={active && items.length > 0 && open}');
  });

  it('loads mobile overlays and image export only after the matching user action', () => {
    const shell = readSource('src/features/mobile/layouts/MobileShell.tsx');
    for (const moduleName of [
      '@/shared/components/share/ShareSheet',
      '@/features/auth/components/MobileAuthSheet',
      '../components/MobileSearchOverlay',
    ]) {
      expect(shell).toContain(`import('${moduleName}')`);
      expect(shell).not.toMatch(
        new RegExp(`^import .*from ['"]${moduleName.replaceAll('/', '\\/')}['"]`, 'm'),
      );
    }

    const mobileAuth = readSource(
      'src/features/auth/components/MobileAuthSheet.tsx',
    );
    expect(mobileAuth).toContain("from './auth-titles'");
    expect(mobileAuth).not.toContain("from './AuthDialog'");

    const share = readSource('src/shared/components/share/ShareSheet.tsx');
    expect(share).toContain("await import('html-to-image')");
    expect(share).not.toMatch(/^import .*html-to-image/m);
  });

  it('scopes feed prefetching and admin drawers to their first relevant route/action', () => {
    const providers = readSource('src/app/providers.tsx');
    const mobileRoutes = readSource('src/features/mobile/routes.tsx');
    expect(providers).not.toContain('FeedPrefetcher');
    expect(mobileRoutes).toContain(
      "lazyRoute(() => import('./components/FeedPrefetcher'), 'FeedPrefetchLayout')",
    );

    const adminShell = readSource('src/features/admin/layouts/AdminShell.tsx');
    const detailProvider = readSource(
      'src/features/admin/components/AdminUserDetailProvider.tsx',
    );
    expect(adminShell).toContain("import('../components/AdminCommandPalette')");
    expect(adminShell).toContain('cmdkEverOpened');
    expect(detailProvider).toContain("import('./UserDetailDrawer')");
    expect(detailProvider).toContain('everOpened');
  });

  it('hydrates feed data before the first query fetch and budgets the parent lazy layout', () => {
    const feedApi = readSource('src/features/mobile/api/feed.ts');
    const journalApi = readSource('src/features/mobile/api/journal-feed.ts');
    const budgets = JSON.parse(readSource('bundle-budgets.json')) as {
      routeClosures: { mobileFeed: { sources: string[] } };
    };

    expect(feedApi).toContain("initialData: () => readFeedPages<Paper[], number>('papers', seed)");
    expect(journalApi).toContain(
      "initialData: () => readFeedPages<JournalListPage, number>('journals', seed)",
    );
    expect(budgets.routeClosures.mobileFeed.sources).toContain(
      'src/features/mobile/components/FeedPrefetcher.tsx',
    );
  });

  it('only defers code snippets explicitly marked non-critical', () => {
    const index = readSource('index.html');
    const fetchAt = index.indexOf("fetch('/api/v1/config/code-snippets')");
    const idleInjectAt = index.indexOf(
      'window.__afterCriticalLoad(function () { inject(deferred); })',
    );

    expect(fetchAt).toBeGreaterThan(0);
    expect(index).toContain('!!item.defer_until_idle === deferred');
    expect(idleInjectAt).toBeGreaterThan(fetchAt);
    expect(index.slice(fetchAt, idleInjectAt)).toContain('select(d.head, false)');
  });

  it('lets the Umami config cache revalidate and flushes metrics queued before tracker load', () => {
    const index = readSource('index.html');

    expect(index).toContain("fetch('/api/v1/public/umami-config')");
    expect(index).not.toMatch(
      /fetch\('\/api\/v1\/public\/umami-config',[^)]*force-cache/,
    );
    expect(index).toContain('s.onload = function ()');
    expect(index).toContain('window.__flushScholayUmamiQueue()');
  });
});
