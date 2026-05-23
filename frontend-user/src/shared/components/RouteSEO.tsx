/**
 * RouteSEO —— 给静态/列表页面注入 SEO 三件套 (title / description / keywords)
 * 以及 canonical link。详情页(/paper /author /journal)的 SEO 由后端 SSR 在
 * index.html 替换 <title>/<meta>/<link rel=canonical> 完成, 走不到这个组件。
 *
 * 实现:React 19 原生 hoist —— 在 component 内直接渲染 <title> / <meta>,
 * React 会把它们 portal 到文档 <head>, 与 react-helmet-async 等价但零依赖。
 *
 * canonical:
 *   - 不传 → 自动用 SITE_URL + 当前 location.pathname (主流场景)
 *   - 传相对路径 (例如 `/search?q=foo`) → 拼 SITE_URL 前缀
 *   - 传绝对 URL (https://...) → 原样使用
 *
 * 用法:
 *   <RouteSEO
 *     title="定价方案 - Scholay | 全功能限时免费"
 *     description="..."
 *     keywords="Scholay定价,..."
 *   />
 *
 * 故意不重复 og:* / twitter:* —— index.html 已有静态兜底, 后续按需在这里扩字段。
 */
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://www.scholay.com';

interface RouteSEOProps {
  title: string;
  description: string;
  keywords?: string;
  /** 不传则用当前 location.pathname; 传相对路径会自动拼 SITE_URL */
  canonical?: string;
  /** 不希望被索引的页面 (settings / draft) 传 true */
  noindex?: boolean;
}

export function RouteSEO({
  title,
  description,
  keywords,
  canonical,
  noindex,
}: RouteSEOProps) {
  const location = useLocation();
  const canonicalHref = buildCanonical(canonical, location.pathname);

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={canonicalHref} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
    </>
  );
}

function buildCanonical(input: string | undefined, pathname: string): string {
  const path = input ?? pathname;
  if (/^https?:\/\//i.test(path)) return path;
  return SITE_URL + (path.startsWith('/') ? path : '/' + path);
}
