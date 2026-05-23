import type { RouteObject } from 'react-router-dom';

export const journalsRoutes: RouteObject[] = [
  {
    path: 'journals/search',
    lazy: () =>
      import('./pages/JournalSearchPage').then((m) => ({
        Component: m.JournalSearchPage,
      })),
  },
];
