import type { RouteObject } from 'react-router-dom';

export const clawRoutes: RouteObject[] = [
  {
    path: 'claw',
    lazy: () => import('./pages/ClawPage').then((m) => ({ Component: m.ClawPage })),
  },
];
