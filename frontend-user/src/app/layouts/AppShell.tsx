import { Outlet } from 'react-router-dom';
import { TopNav } from './TopNav';
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

  return (
    <div className="flex h-full min-h-screen flex-col bg-background text-foreground">
      <TopNav />
      <main className="flex-1 min-h-0">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
