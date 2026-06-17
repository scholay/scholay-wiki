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
    // /m/tools = 功能首页(站内功能 + 全网功能入口),设计稿 g2rFng。
    path: 'tools',
    lazy: () =>
      import('./pages/mobile/MobileToolsHomePage').then((m) => ({
        Component: m.MobileToolsHomePage,
      })),
  },
  {
    // /m/tools/all = 功能广场列表(原 MobileToolsPage,改挂子路由)。静态段,排在 :idOrSlug 之前。
    path: 'tools/all',
    lazy: () =>
      import('./pages/mobile/MobileToolsPage').then((m) => ({
        Component: m.MobileToolsPage,
      })),
  },
  {
    // /m/tools/pc/:key = 纯 PC 能力的「建议电脑端使用」引导页(审稿/写作/矩阵)。
    path: 'tools/pc/:key',
    lazy: () =>
      import('./pages/mobile/MobilePcOnlyPage').then((m) => ({
        Component: m.MobilePcOnlyPage,
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
