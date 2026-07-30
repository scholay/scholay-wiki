import { Navigate, type RouteObject } from 'react-router-dom';

/**
 * Landing 页路由 —— 功能介绍页统一挂在 /features/<slug> 下。
 *
 * 不与产品路由冲突:产品页是 /search, /library, /prism, /claw, /peer-review;
 * 宣传页是 /features/search, /features/library, ...,语义清晰。
 *
 * 每个页面 lazy 单独成 chunk —— 宣传内容长(~1500-2000 行渲染),
 * 不希望首屏 main bundle 被 landing 撑大。
 *
 * 旧 frontend-user 兼容:
 *   - `/features` (overview)        ✓ 本次新增
 *   - `/features/latex-writer`      → 301 重定向到 `/features/prism`(同一 feature 改名)
 *   - `/pricing`                    ✓ 本次新增占位页
 */
export const landingRoutes: RouteObject[] = [
  {
    path: 'features',
    lazy: () =>
      import('./pages/FeaturesOverviewPage').then((m) => ({
        Component: m.FeaturesOverviewPage,
      })),
  },
  {
    path: 'features/search',
    lazy: () =>
      import('./pages/SearchLandingPage').then((m) => ({
        Component: m.SearchLandingPage,
      })),
  },
  {
    path: 'features/library',
    lazy: () =>
      import('./pages/LibraryLandingPage').then((m) => ({
        Component: m.LibraryLandingPage,
      })),
  },
  {
    path: 'features/prism',
    lazy: () =>
      import('./pages/PrismLandingPage').then((m) => ({
        Component: m.PrismLandingPage,
      })),
  },
  {
    path: 'features/claw',
    lazy: () =>
      import('./pages/ClawLandingPage').then((m) => ({
        Component: m.ClawLandingPage,
      })),
  },
  {
    path: 'features/submit',
    lazy: () =>
      import('./pages/SubmitLandingPage').then((m) => ({
        Component: m.SubmitLandingPage,
      })),
  },
  {
    path: 'features/peer-review',
    lazy: () =>
      import('./pages/PeerReviewLandingPage').then((m) => ({
        Component: m.PeerReviewLandingPage,
      })),
  },
  // 旧 SEO 链接 /features/latex-writer → 新统一为 /features/prism
  // 用 React Router 客户端 Navigate(replace=true)做软 301;若需要服务端
  // 真正 301 状态码,Nginx 层另外配置即可。
  {
    path: 'features/latex-writer',
    element: <Navigate to="/features/prism" replace />,
  },
  // 定价页 —— 旧 /pricing,本次以占位方案补全
  {
    path: 'pricing',
    lazy: () =>
      import('./pages/PricingPage').then((m) => ({
        Component: m.PricingPage,
      })),
  },
  // 邀请落地页 /i/:code —— 无 UI 中转(存码 + open 计数 + 立即回首页),
  // 不需要 LandingLayout;挂在 landing 是因为它同样「公开、不进 AppShell」。
  {
    path: 'i/:code',
    lazy: () =>
      import('./pages/InviteLandingPage').then((m) => ({
        Component: m.InviteLandingPage,
      })),
  },
];
