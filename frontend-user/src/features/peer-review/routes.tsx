import type { RouteObject } from 'react-router-dom';

export const peerReviewRoutes: RouteObject[] = [
  {
    path: 'peer-review/*',
    lazy: () =>
      import('./pages/PeerReviewPage').then((m) => ({
        Component: m.PeerReviewPage,
      })),
  },
];
