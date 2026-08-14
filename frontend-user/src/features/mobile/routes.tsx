import { Navigate, type RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

/**
 * 移动端路由 —— 全新设计逻辑的移动版,**不挂 AppShell**,自带 MobileShell
 * (底部 Tab 导航),与 landing / help 同模式挂顶层。
 *
 * 入口策略(已拍板):手机访问首页 / 自动分流进 /m/feed(见 app/router.tsx
 * 首页 loader + shared/lib/device.ts),深链接不动;pad 一律 PC。
 *
 * 组装方式:本文件只导出 mobile feature 自己的子路由(feed 等);
 * 其他业务域的移动页(功能广场 /m/tools、智能助手 /m/claw)由各自 feature
 * 导出 *MobileRoutes,在 app/router.tsx 拼进同一个 MobileShell —— 页面归业务域,
 * 壳归 mobile,不跨 feature import。
 */
export const mobileRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="/m/feed" replace /> },
  {
    path: 'feed',
    element: lazyRoute(() => import('./components/FeedPrefetcher'), 'FeedPrefetchLayout'),
    children: [
      {
        index: true,
        element: lazyRoute(() => import('./pages/FeedPage'), 'FeedPage'),
      },
      {
        path: 'journals',
        element: lazyRoute(() => import('./pages/JournalFeedPage'), 'JournalFeedPage'),
      },
      {
        path: 'news',
        element: lazyRoute(() => import('./pages/NewsPage'), 'NewsPage'),
      },
    ],
  },
  {
    // 旧的独立搜索页已被「悬浮搜索浮层」(MobileSearchOverlay)取代;保留路径做重定向,
    // 兼容历史书签 /m/search,避免 404。
    path: 'search',
    element: <Navigate to="/m/feed" replace />,
  },
];
