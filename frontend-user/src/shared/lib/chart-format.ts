/**
 * 图表坐标轴数字紧凑格式化 —— 跨 admin 图表共用。
 *
 * 为什么需要:recharts 的 Y 轴刻度默认打完整千分位(1,234,567)。配合我们为了省白边用的
 * 小 / 负 `margin.left` + 固定 `YAxis width`,长数字会**溢出到 SVG 左边缘外被裁掉**
 * (表现为"纵坐标数字展示不全 / 叠起来看不到")。坐标轴只需要量级,把它压成 1.2k / 3.4M
 * 让标签始终窄(≤ ~5 字符),完整精确值留给 Tooltip。
 */

/** 数字 → 紧凑量级字符串:<1000 原样;否则 k / M / B,并去掉多余的 `.0`。负数、非有限值安全处理。 */
export function compactAxis(n: number): string {
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  const trim = (s: string) => s.replace(/\.0$/, '');
  if (abs < 1_000_000) return trim((n / 1_000).toFixed(1)) + 'k';
  if (abs < 1_000_000_000) return trim((n / 1_000_000).toFixed(1)) + 'M';
  return trim((n / 1_000_000_000).toFixed(1)) + 'B';
}

/** 金额坐标轴:¥ + 紧凑量级(¥1.2k / ¥3.4M)。 */
export function compactYuanAxis(n: number): string {
  return '¥' + compactAxis(n);
}
