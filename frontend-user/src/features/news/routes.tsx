import type { RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

/**
 * 情报(学术新闻)路由 —— 挂 AppShell('/' children),与论文/期刊详情同模式
 * (同 URL 响应式、保 SEO):
 *   /news        NewsListPage   全部情报(排序 + 分区筛选)
 *   /news/:slug  NewsDetailPage 单条情报详情(SSR 注全文 + NewsArticle JSON-LD 由后端做)
 *
 * 正文单一真源在后端 internal/news(webhook 落库),前端只取数渲染。
 */
export const newsRoutes: RouteObject[] = [
  {
    path: 'news',
    element: lazyRoute(() => import('./pages/NewsListPage'), 'NewsListPage'),
  },
  {
    path: 'news/:slug',
    element: lazyRoute(() => import('./pages/NewsDetailPage'), 'NewsDetailPage'),
  },
];
