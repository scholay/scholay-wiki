import type { RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

export const searchRoutes: RouteObject[] = [
  {
    path: 'search',
    element: lazyRoute(() => import('./pages/SearchPage'), 'SearchPage'),
  },
];
