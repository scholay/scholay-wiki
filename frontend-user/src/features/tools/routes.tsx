import type { RouteObject } from 'react-router-dom';

export const toolsRoutes: RouteObject[] = [
  {
    path: 'tools/*',
    lazy: () =>
      import('./pages/ToolsPage').then((m) => ({ Component: m.ToolsPage })),
  },
];
