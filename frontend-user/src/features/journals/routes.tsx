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
];

/** 聚合页 slug —— 供 sitemap / 内链复用,避免硬编码漂移。 */
export const JOURNAL_COLLECTION_SLUGS = COLLECTION_SLUGS;
