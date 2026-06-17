import { Outlet, useMatch } from 'react-router-dom';
import { TopNav } from './TopNav';
import { cn } from '@/shared/lib/utils';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useReplayPendingAction } from '@/shared/hooks';
import { useNotificationSocket } from '@/shared/hooks/useNotificationSocket';
import { useStagingSync } from '@/features/search/hooks/useStagingSync';

/**
 * 全局壳:顶部导航 + 主体。
 *
 * **注意**:不再全局渲染 `<Footer />`。
 * 只有首页(/)和宣传页才需要 footer,其余功能页(搜索、文献集、Prism 等)
 * 都是工作面 UI,加底栏只会挤占工作区。
 * 需要 footer 的页面自己 `import { Footer } from '@/shared/components/Footer'`
 * 在自己 JSX 末尾渲染。
 *
 * 主体外包 ErrorBoundary,任何路由级渲染异常被局部捕获,壳本身不挂。
 *
 * 全局登录后副作用统一挂这里:
 *   - useStagingSync:登录瞬间把本地暂存区批量推到云端
 *   - useReplayPendingAction:登录后重放"未登录时点的收藏"等动作
 */
export function AppShell() {
  useStagingSync();
  useReplayPendingAction();
  // 通知 WS —— 登录态自动连;接到 unread_count / notification 推送时
  // 立即同步进 react-query,顶栏铃铛红点 & 列表实时刷新。
  useNotificationSocket();

  // 论文/期刊/学者/PDF 详情是 SEO 落地页(同 canonical URL),移动端自带 MobileDetailHeader(返回+分享),
  // 不该再叠 PC 全局 TopNav。仅这些路由 + 仅移动宽度隐藏 TopNav(桌面 'contents' 透传、零变化),
  // 不重定向、不改 URL → 保住 canonical/SSR/SEO。其余路由 TopNav 行为完全不变。
  // ⚠️ Rules of Hooks:useMatch 是 hook,必须**无条件**逐个调用。
  // 之前写成 `useMatch(a) || useMatch(b) || ...` —— `||` 短路会让后面的 useMatch
  // 在前一个命中时**不被调用**,于是 hook 数量随路由变化(/journal 调 2 个、
  // /journals/search 调 4 个)。在详情页↔其它页之间跳转时 AppShell 复用同一实例、
  // 前后渲染 hook 数不一致 → React 抛「Rendered fewer hooks than expected」→ 整个路由树崩。
  // 全部先各自调用、再用普通布尔合并,hook 数恒定。
  const matchPaper = useMatch('/paper/*');
  const matchJournal = useMatch('/journal/*');
  const matchAuthor = useMatch('/author/*');
  const matchPdf = useMatch('/pdf/*');
  const isBrowserDetail = !!(matchPaper || matchJournal || matchAuthor || matchPdf);

  return (
    <div className="flex h-full min-h-screen flex-col bg-background text-foreground">
      <div className={cn('contents', isBrowserDetail && 'max-sm:hidden')}>
        <TopNav />
      </div>
      <main className="flex-1 min-h-0">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
