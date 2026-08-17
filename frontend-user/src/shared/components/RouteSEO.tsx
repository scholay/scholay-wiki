/**
 * RouteSEO —— 给静态/列表页面注入 SEO 三件套 (title / description / keywords)
 * 以及 canonical link。后端 SSR 负责冷请求的初始 head；本组件负责
 * React 接管后及 SPA 内部导航的唯一 head，包括论文/作者/期刊详情。
 *
 * 实现:React 19 原生 hoist —— 在 component 内直接渲染 <title> / <meta>,
 * React 会把它们 portal 到文档 <head>, 与 react-helmet-async 等价但零依赖。
 *
 * canonical:
 *   - 不传 → 自动用【当前 origin】 + location.pathname (主流场景)
 *   - 传相对路径 (例如 `/search?q=foo`) → 拼当前 origin 前缀
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
import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * canonical 的 origin —— 恒等于**当前访问的 origin**。
 *
 * 🔴 这里以前是写死的 `https://www.scholay.com`,是个很隐蔽的坑:
 * 本组件在 useLayoutEffect 里会先**移除** SSR 生成的 canonical
 * (带 `data-seo-fallback="server"` 的那批,见 backend markSSRSEOHead),
 * 再注入自己拼的。于是任何非该域名的部署上,会跑 JS 的爬虫看到的每一页
 * canonical 都指向另一个站点 —— 本环境的内容被归因过去,而这恰恰是
 * duplicate content 最坏的形态。
 *
 * 用 location.origin 是**零配置**的正解:它天然跟随部署域名,不需要任何 env、
 * 不需要重新构建,也不会因为漏配而回落到别人的域名。
 * (SSR 侧的 canonical 由 backend 按 SEO_BASE_URL 生成,两边同源。)
 */
function siteOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

interface RouteSEOProps {
  title: string;
  description: string;
  keywords?: string;
  /** 不传则用当前 location.pathname; 传相对路径会自动拼当前 origin */
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

  // The backend writes crawlable route metadata into the original HTML. This
  // app intentionally uses createRoot (not hydration), so React 19 does not
  // claim those pre-existing head nodes when it hoists the tags below. Without
  // this hand-off every rendered page ends up with two titles/descriptions/
  // canonicals. Keep snapshots and restore them when this route component
  // unmounts so a route without its own metadata can still fall back safely.
  useLayoutEffect(() => {
    const fallbacks = Array.from(
      document.head.querySelectorAll<HTMLElement>('[data-seo-fallback]'),
    );
    const snapshots = fallbacks.map((node) => node.cloneNode(true) as HTMLElement);
    fallbacks.forEach((node) => node.remove());

    return () => {
      if (document.head.querySelector('[data-seo-fallback]')) return;
      snapshots.forEach((node) => document.head.appendChild(node));
    };
  }, []);

  return (
    <>
      <title data-route-seo="true">{title}</title>
      <meta data-route-seo="true" name="description" content={description} />
      {keywords && <meta data-route-seo="true" name="keywords" content={keywords} />}
      <link data-route-seo="true" rel="canonical" href={canonicalHref} />
      {noindex && <meta data-route-seo="true" name="robots" content="noindex, follow" />}
    </>
  );
}

function buildCanonical(input: string | undefined, pathname: string): string {
  const path = input ?? pathname;
  if (/^https?:\/\//i.test(path)) return path;
  return siteOrigin() + (path.startsWith('/') ? path : '/' + path);
}
