import { Navigate, type RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

/**
 * 帮助中心 + 静态/法律页 + 学术资源中心 路由总入口。
 *
 * IA(2026-06):
 *   /help                  HelpCenterPage —— 帮助中心 = 学术问答(QA 列表)
 *   /qa                    → 重定向到 /help(帮助中心承载 QA)
 *   /qa/:slug              QADetailPage —— QA 详情 URL 保持不变(SEO 不动)
 *   /resources             ResourceCenterPage(学术资源 tab)—— 博客+资源合并中心
 *   /blog                  ResourceCenterPage(产品博客 tab)—— 两 URL 都保留
 *   /resources/:slug       ResourceDetailPage / /blog/:slug BlogDetailPage(详情独立)
 *   /about /contact /feedback /privacy /terms /disclaimer  信息/法律页
 */
// /resources ↔ /blog 同实例互切(页内 tab 直接 navigate),必须共用 element
const resourceCenterPage = lazyRoute(
  () => import('./pages/ResourceCenterPage'),
  'ResourceCenterPage',
  { full: true },
);

export const helpRoutes: RouteObject[] = [
  {
    path: 'help',
    element: lazyRoute(() => import('./pages/HelpCenterPage'), 'HelpCenterPage', { full: true }),
  },
  {
    path: 'about',
    element: lazyRoute(() => import('./pages/AboutPage'), 'AboutPage', { full: true }),
  },
  {
    path: 'contact',
    element: lazyRoute(() => import('./pages/ContactPage'), 'ContactPage', { full: true }),
  },
  {
    path: 'feedback',
    element: lazyRoute(() => import('./pages/FeedbackPage'), 'FeedbackPage', { full: true }),
  },
  {
    path: 'privacy',
    element: lazyRoute(() => import('./pages/PrivacyPage'), 'PrivacyPage', { full: true }),
  },
  {
    path: 'terms',
    element: lazyRoute(() => import('./pages/TermsPage'), 'TermsPage', { full: true }),
  },
  {
    path: 'disclaimer',
    element: lazyRoute(() => import('./pages/DisclaimerPage'), 'DisclaimerPage', { full: true }),
  },
  // 学术资源中心 —— /resources 与 /blog 都进同一个 tab 化中心(SEO 两 URL 都保留)。
  // 共用同一 element:两 URL 靠页内 TabButton navigate 互切,各写各的会整页重挂(见 browser/routes.tsx 同注)。
  {
    path: 'resources',
    element: resourceCenterPage,
  },
  {
    path: 'blog',
    element: resourceCenterPage,
  },
  {
    path: 'blog/:slug',
    element: lazyRoute(() => import('./pages/BlogDetailPage'), 'BlogDetailPage', { full: true }),
  },
  {
    path: 'resources/:slug',
    element: lazyRoute(() => import('./pages/ResourceDetailPage'), 'ResourceDetailPage', { full: true }),
  },
  // 帮助中心 = 学术问答:/qa 裸列表重定向到 /help(详情 /qa/:slug 保持)
  {
    path: 'qa',
    element: <Navigate to="/help" replace />,
  },
  {
    path: 'qa/:slug',
    element: lazyRoute(() => import('./pages/QADetailPage'), 'QADetailPage', { full: true }),
  },
];
