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
