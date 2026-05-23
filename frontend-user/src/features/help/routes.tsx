import type { RouteObject } from 'react-router-dom';

/**
 * 帮助中心 + 静态/法律页 + 博客 + 资源 路由总入口。
 *
 * 路由与旧 frontend-user 完全保持一致(SEO 不丢):
 *   /help                  HelpCenterPage
 *   /about                 AboutPage
 *   /contact               ContactPage
 *   /feedback              FeedbackPage
 *   /privacy               PrivacyPage(后台维护内容)
 *   /terms                 TermsPage  (后台维护内容)
 *   /disclaimer            DisclaimerPage(静态)
 *   /blog                  BlogListPage
 *   /blog/:slug            BlogDetailPage(16 篇)
 *   /resources             ResourceListPage
 *   /resources/:slug       ResourceDetailPage(13 篇)
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
  {
    path: 'blog',
    lazy: () =>
      import('./pages/BlogListPage').then((m) => ({ Component: m.BlogListPage })),
  },
  {
    path: 'blog/:slug',
    lazy: () =>
      import('./pages/BlogDetailPage').then((m) => ({ Component: m.BlogDetailPage })),
  },
  {
    path: 'resources',
    lazy: () =>
      import('./pages/ResourceListPage').then((m) => ({ Component: m.ResourceListPage })),
  },
  {
    path: 'resources/:slug',
    lazy: () =>
      import('./pages/ResourceDetailPage').then((m) => ({ Component: m.ResourceDetailPage })),
  },
];
