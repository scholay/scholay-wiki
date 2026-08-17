import type { RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

export const prismRoutes: RouteObject[] = [
  {
    path: 'prism/*',
    element: lazyRoute(() => import('./pages/PrismPage'), 'PrismPage'),
  },
];
