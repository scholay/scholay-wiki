/**
 * 中文相对时间:刚刚 / N 分钟前 / N 小时前 / N 天前 / N 周前 / N 个月前 / N 年前。
 *
 * 设计稿(.pen 文献集卡片「3 天前更新 / 6 小时前更新 / 2 周前更新」)的口径,
 * 比 date-fns 的「大约…前」更克制。纯 TS、无依赖,可被任意 feature 复用。
 */
export function relativeTimeZh(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60_000) return '刚刚';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  if (d < 30) return `${Math.floor(d / 7)} 周前`;
  if (d < 365) return `${Math.floor(d / 30)} 个月前`;
  return `${Math.floor(d / 365)} 年前`;
}
