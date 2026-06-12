import type { RouteObject } from 'react-router-dom';

export const toolsRoutes: RouteObject[] = [
  {
    // 功能广场壳:侧栏挂一层,目录/详情走子路由的 <Outlet/>,跳转不重挂侧栏。
    path: 'tools',
    lazy: () => import('./pages/ToolsLayout').then((m) => ({ Component: m.ToolsLayout })),
    children: [
      {
        index: true,
        lazy: () => import('./pages/ToolsCatalogPage').then((m) => ({ Component: m.ToolsCatalogPage })),
      },
      {
        path: ':idOrSlug',
        lazy: () => import('./pages/ToolDetailPage').then((m) => ({ Component: m.ToolDetailPage })),
      },
    ],
  },
];

/**
 * 移动版功能广场 —— 挂在 /m/* (MobileShell) 下,由 app/router.tsx 组装。
 * 页面归本 feature(直接用本 feature 的 api/components),路由壳归 mobile,
 * 这样既不跨 feature import,移动页也能复用全部数据层。
 */
export const toolsMobileRoutes: RouteObject[] = [
  {
    path: 'tools',
    lazy: () =>
      import('./pages/mobile/MobileToolsPage').then((m) => ({
        Component: m.MobileToolsPage,
      })),
  },
  {
    path: 'tools/:idOrSlug',
    lazy: () =>
      import('./pages/mobile/MobileToolDetailPage').then((m) => ({
        Component: m.MobileToolDetailPage,
      })),
  },
];
