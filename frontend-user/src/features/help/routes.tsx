import { Navigate, type RouteObject } from 'react-router-dom';

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
export const helpRoutes: RouteObject[] = [
  {
    path: 'help',
    lazy: () =>
      import('./pages/HelpCenterPage').then((m) => ({ Component: m.HelpCenterPage })),
  },
  {
    path: 'about',
    lazy: () =>
      import('./pages/AboutPage').then((m) => ({ Component: m.AboutPage })),
  },
  {
    path: 'contact',
    lazy: () =>
      import('./pages/ContactPage').then((m) => ({ Component: m.ContactPage })),
  },
  {
    path: 'feedback',
    lazy: () =>
      import('./pages/FeedbackPage').then((m) => ({ Component: m.FeedbackPage })),
  },
  {
    path: 'privacy',
    lazy: () =>
      import('./pages/PrivacyPage').then((m) => ({ Component: m.PrivacyPage })),
  },
  {
    path: 'terms',
    lazy: () =>
      import('./pages/TermsPage').then((m) => ({ Component: m.TermsPage })),
  },
  {
    path: 'disclaimer',
    lazy: () =>
      import('./pages/DisclaimerPage').then((m) => ({ Component: m.DisclaimerPage })),
  },
  // 学术资源中心 —— /resources 与 /blog 都进同一个 tab 化中心(SEO 两 URL 都保留)
  {
    path: 'resources',
    lazy: () =>
      import('./pages/ResourceCenterPage').then((m) => ({ Component: m.ResourceCenterPage })),
  },
  {
    path: 'blog',
    lazy: () =>
      import('./pages/ResourceCenterPage').then((m) => ({ Component: m.ResourceCenterPage })),
  },
  {
    path: 'blog/:slug',
    lazy: () =>
      import('./pages/BlogDetailPage').then((m) => ({ Component: m.BlogDetailPage })),
  },
  {
    path: 'resources/:slug',
    lazy: () =>
      import('./pages/ResourceDetailPage').then((m) => ({ Component: m.ResourceDetailPage })),
  },
  // 帮助中心 = 学术问答:/qa 裸列表重定向到 /help(详情 /qa/:slug 保持)
  {
    path: 'qa',
    element: <Navigate to="/help" replace />,
  },
  {
    path: 'qa/:slug',
    lazy: () =>
      import('./pages/QADetailPage').then((m) => ({ Component: m.QADetailPage })),
  },
];
