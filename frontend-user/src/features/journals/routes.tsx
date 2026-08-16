import { Navigate, type RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

// 期刊聚合 SEO 落地页:静态 slug。每个对应 JournalCollectionPage 内 PRESETS 的预设筛选。
const COLLECTION_SLUGS = [
  'sci-q1',
  'cas-zone1',
  'ccf-a',
  'high-impact-factor',
] as const;

// 4 个集合 slug 共用同一 element:集合页间互链保留实例(见 browser/routes.tsx 同注)
const journalCollectionPage = lazyRoute(
  () => import('./pages/JournalCollectionPage'),
  'JournalCollectionPage',
);

export const journalsRoutes: RouteObject[] = [
  {
    path: 'journals',
    element: lazyRoute(() => import('./pages/JournalHubPage'), 'JournalHubPage'),
  },
  {
    path: 'journals/search',
    element: lazyRoute(() => import('./pages/JournalSearchPage'), 'JournalSearchPage'),
  },
  {
    path: 'journals/select',
    element: <Navigate to="/search" replace />,
  },
  {
    path: 'journals/evaluate',
    element: <Navigate to="/search" replace />,
  },
  ...COLLECTION_SLUGS.map((slug) => ({
    path: `journals/${slug}`,
    element: journalCollectionPage,
  })),
  // ── 期刊枢纽(发现层)—— 与后端 SSR 枢纽页同路径,路径式真分页(:page? 可选段)。
  //    路径模板与 hub-paths.ts 的 hubListPath 成对维护。
  {
    path: 'journals/browse',
    element: lazyRoute(() => import('./pages/JournalHubBrowsePage'), 'JournalHubBrowsePage'),
  },
  {
    path: 'journals/category/:slug/:page?',
    element: lazyRoute(() => import('./pages/JournalHubListPage'), 'JournalHubCategoryPage'),
  },
  {
    path: 'journals/country/:cc/:page?',
    element: lazyRoute(() => import('./pages/JournalHubListPage'), 'JournalHubCountryPage'),
  },
  {
    path: 'journals/warning',
    element: lazyRoute(() => import('./pages/JournalHubListPage'), 'JournalHubWarningPage'),
  },
  {
    path: 'journals/oa/:page?',
    element: lazyRoute(() => import('./pages/JournalHubListPage'), 'JournalHubOaPage'),
  },
];

/** 聚合页 slug —— 供 sitemap / 内链复用,避免硬编码漂移。 */
export const JOURNAL_COLLECTION_SLUGS = COLLECTION_SLUGS;
