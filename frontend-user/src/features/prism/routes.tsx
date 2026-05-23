import type { RouteObject } from 'react-router-dom';

export const prismRoutes: RouteObject[] = [
  {
    path: 'prism/*',
    lazy: () =>
      import('./pages/PrismPage').then((m) => ({ Component: m.PrismPage })),
  },
];
