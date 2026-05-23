import { useParams, Navigate } from 'react-router-dom';

/**
 * `/search-results/:slug` → `/search?q=<slug>`
 *
 * 旧 frontend-user 把搜索结果以 SEO slug 形式发布(例:`/search-results/transformer`)。
 * 新前端用 `?q=`,需要把 slug 解码后透传到 q,保留搜索意图。
 */
export function SlugToSearchRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const q = slug ? decodeURIComponent(slug) : '';
  const target = q ? `/search?q=${encodeURIComponent(q)}` : '/search';
  return <Navigate to={target} replace />;
}
