import type { RouteObject } from 'react-router-dom';

// 期刊聚合 SEO 落地页:静态 slug。每个对应 JournalCollectionPage 内 PRESETS 的预设筛选。
const COLLECTION_SLUGS = [
  'sci-q1',
  'cas-zone1',
  'ccf-a',
  'high-impact-factor',
] as const;

export const journalsRoutes: RouteObject[] = [
  {
    path: 'journals/search',
    lazy: () =>
      import('./pages/JournalSearchPage').then((m) => ({
        Component: m.JournalSearchPage,
      })),
  },
  ...COLLECTION_SLUGS.map((slug) => ({
    path: `journals/${slug}`,
    lazy: () =>
      import('./pages/JournalCollectionPage').then((m) => ({
        Component: m.JournalCollectionPage,
      })),
  })),
  // ── 期刊枢纽(发现层)—— 与后端 SSR 枢纽页同路径,路径式真分页(:page? 可选段)。
  //    路径模板与 hub-paths.ts 的 hubListPath 成对维护。
  {
    path: 'journals/browse',
    lazy: () =>
      import('./pages/JournalHubBrowsePage').then((m) => ({
        Component: m.JournalHubBrowsePage,
      })),
  },
  {
    path: 'journals/category/:slug/:page?',
    lazy: () =>
      import('./pages/JournalHubListPage').then((m) => ({
        Component: m.JournalHubCategoryPage,
      })),
  },
  {
    path: 'journals/country/:cc/:page?',
    lazy: () =>
      import('./pages/JournalHubListPage').then((m) => ({
        Component: m.JournalHubCountryPage,
      })),
  },
  {
    path: 'journals/warning',
    lazy: () =>
      import('./pages/JournalHubListPage').then((m) => ({
        Component: m.JournalHubWarningPage,
      })),
  },
  {
    path: 'journals/oa/:page?',
    lazy: () =>
      import('./pages/JournalHubListPage').then((m) => ({
        Component: m.JournalHubOaPage,
      })),
  },
];

/** 聚合页 slug —— 供 sitemap / 内链复用,避免硬编码漂移。 */
export const JOURNAL_COLLECTION_SLUGS = COLLECTION_SLUGS;
