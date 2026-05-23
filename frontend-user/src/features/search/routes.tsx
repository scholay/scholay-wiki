import type { RouteObject } from 'react-router-dom';

export const searchRoutes: RouteObject[] = [
  {
    path: 'search',
    lazy: () =>
      import('./pages/SearchPage').then((m) => ({ Component: m.SearchPage })),
  },
];
