import type { JournalHubDimension } from './api/journal-hubs';

/**
 * 枢纽页路径 helpers —— href 单一真源(browse 页入口 / 列表分页 <Link> /
 * RouteSEO canonical 共用),路径式真分页:第 1 页不带页码段。
 *
 * 与 routes.tsx 注册的路由模板成对:
 *   /journals/browse
 *   /journals/category/:slug/:page?
 *   /journals/country/:cc/:page?
 *   /journals/warning
 *   /journals/oa/:page?
 */

export const HUB_BROWSE_PATH = '/journals/browse';

export function hubListPath(
  dimension: JournalHubDimension,
  key?: string,
  page = 1,
): string {
  const base =
    dimension === 'category'
      ? `/journals/category/${encodeURIComponent(key ?? '')}`
      : dimension === 'country'
        ? `/journals/country/${encodeURIComponent(key ?? '')}`
        : dimension === 'warning'
          ? '/journals/warning'
          : '/journals/oa';
  return page > 1 ? `${base}/${page}` : base;
}

/**
 * 国家/地区代码 → 中文名(浏览器内建 Intl.DisplayNames,零依赖)。
 * 解析失败 / 非二位代码时原样回退 —— 显示代码总好过显示 undefined。
 */
export function countryDisplayName(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return code;
  try {
    const name = new Intl.DisplayNames(['zh-Hans'], { type: 'region' }).of(cc);
    return name && name !== cc ? name : cc;
  } catch {
    return cc;
  }
}
