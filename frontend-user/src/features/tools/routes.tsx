import type { RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

export const toolsRoutes: RouteObject[] = [
  {
    // 功能广场壳:侧栏挂一层,目录/详情走子路由的 <Outlet/>,跳转不重挂侧栏。
    path: 'tools',
    element: lazyRoute(() => import('./pages/ToolsLayout'), 'ToolsLayout'),
    children: [
      {
        index: true,
        element: lazyRoute(() => import('./pages/ToolsCatalogPage'), 'ToolsCatalogPage'),
      },
      {
        // 社区技能分段 —— 静态段,排在 :idOrSlug 之前避免被 param 吃(功能广场融合)。
        path: 'skills',
        element: lazyRoute(() => import('./pages/ToolsSkillsPage'), 'ToolsSkillsPage'),
      },
      {
        path: ':idOrSlug',
        element: lazyRoute(() => import('./pages/ToolDetailPage'), 'ToolDetailPage'),
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
    element: lazyRoute(() => import('./pages/mobile/MobileToolsHomePage'), 'MobileToolsHomePage'),
  },
  {
    // /m/tools/all = 功能广场列表(原 MobileToolsPage,改挂子路由)。静态段,排在 :idOrSlug 之前。
    path: 'tools/all',
    element: lazyRoute(() => import('./pages/mobile/MobileToolsPage'), 'MobileToolsPage'),
  },
  {
    // /m/tools/pc/:key = 纯 PC 能力的「建议电脑端使用」引导页(审稿/写作/矩阵)。
    path: 'tools/pc/:key',
    element: lazyRoute(() => import('./pages/mobile/MobilePcOnlyPage'), 'MobilePcOnlyPage'),
  },
  {
    path: 'tools/:idOrSlug',
    element: lazyRoute(() => import('./pages/mobile/MobileToolDetailPage'), 'MobileToolDetailPage'),
  },
];
