import { Navigate, type RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

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
    element: lazyRoute(() => import('./pages/FeaturesOverviewPage'), 'FeaturesOverviewPage', { full: true }),
  },
  {
    path: 'features/search',
    element: lazyRoute(() => import('./pages/SearchLandingPage'), 'SearchLandingPage', { full: true }),
  },
  {
    path: 'features/library',
    element: lazyRoute(() => import('./pages/LibraryLandingPage'), 'LibraryLandingPage', { full: true }),
  },
  {
    path: 'features/prism',
    element: lazyRoute(() => import('./pages/PrismLandingPage'), 'PrismLandingPage', { full: true }),
  },
  {
    path: 'features/claw',
    element: lazyRoute(() => import('./pages/ClawLandingPage'), 'ClawLandingPage', { full: true }),
  },
  {
    path: 'features/submit',
    element: lazyRoute(() => import('./pages/SubmitLandingPage'), 'SubmitLandingPage', { full: true }),
  },
  {
    path: 'features/peer-review',
    element: lazyRoute(() => import('./pages/PeerReviewLandingPage'), 'PeerReviewLandingPage', { full: true }),
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
    element: lazyRoute(() => import('./pages/PricingPage'), 'PricingPage', { full: true }),
  },
  // 邀请落地页 /i/:code —— 无 UI 中转(存码 + open 计数 + 立即回首页),
  // 不需要 LandingLayout;挂在 landing 是因为它同样「公开、不进 AppShell」。
  {
    path: 'i/:code',
    element: lazyRoute(() => import('./pages/InviteLandingPage'), 'InviteLandingPage', { full: true }),
  },
];
