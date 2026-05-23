import type { RouteObject } from 'react-router-dom';

/**
 * 我的文献集(`/library`) —— 论文 / 期刊 / 学者详情已迁出到 features/browser
 * (路由 `/browser/*`),这里只保留文件夹 + 论文列表。
 */
export const libraryRoutes: RouteObject[] = [
  {
    path: 'library',
    lazy: () =>
      import('./pages/LibraryPage').then((m) => ({ Component: m.LibraryPage })),
  },
];
