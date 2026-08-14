import type { RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

/**
 * 我的文件夹(`/library`) —— 论文 / 期刊 / 学者详情已迁出到 features/browser
 * (路由 `/browser/*`),这里只保留文件夹 + 论文列表。
 */
export const libraryRoutes: RouteObject[] = [
  {
    path: 'library',
    element: lazyRoute(() => import('./pages/LibraryPage'), 'LibraryPage'),
  },
];

/**
 * 分享接收页(/s/:token)—— 公开、免登录、PC/移动端通用,独立顶层路由(不挂 AppShell/MobileShell)。
 * 由 app/router.tsx 以绝对路径 + errorElement 挂载。
 */
export const shareReceiveRoutes: RouteObject[] = [
  {
    path: 's/:token',
    element: lazyRoute(() => import('./pages/SharedReceivePage'), 'SharedReceivePage', {
      full: true,
    }),
  },
];

/**
 * 移动版文件夹 —— 挂在 /m/* (MobileShell) 下,由 app/router.tsx 组装。
 *   /m/library            我的收藏(文件夹列表 + 分享)
 *   /m/library/:folderId  文件夹详情(论文列表 + 单篇/整本分享)
 */
export const libraryMobileRoutes: RouteObject[] = [
  {
    path: 'library',
    element: lazyRoute(() => import('./pages/mobile/MobileLibraryPage'), 'MobileLibraryPage'),
  },
  {
    path: 'library/:folderId',
    element: lazyRoute(() => import('./pages/mobile/MobileFolderPage'), 'MobileFolderPage'),
  },
];
