/**
 * Token 看板共用调色 —— 主图(分段堆叠柱)与维度拆分面板(分段横条)同一套颜色,
 * 全部走 design token CSS 变量 + 透明度变体,不引入 token 之外的颜色。
 */

export interface SegmentColor {
  color: string;
  opacity: number;
}

/** token 构成四段(语义固定):输入=浅绿 / 输出=深绿 / 缓存命中=琥珀 / 缓存创建=红。 */
export const COMPOSITION_SEGMENTS: Array<{
  key: 'input_tokens' | 'output_tokens' | 'cache_read_tokens' | 'cache_creation_tokens';
  label: string;
  fill: SegmentColor;
}> = [
  { key: 'input_tokens', label: '输入', fill: { color: 'var(--color-brand-green)', opacity: 0.45 } },
  { key: 'output_tokens', label: '输出', fill: { color: 'var(--color-brand-green)', opacity: 1 } },
  { key: 'cache_read_tokens', label: '缓存命中', fill: { color: 'var(--color-brand-amber)', opacity: 0.9 } },
  { key: 'cache_creation_tokens', label: '缓存创建', fill: { color: 'var(--color-brand-red)', opacity: 0.8 } },
];

/** 类别色板(模型 / 功能 等动态取值):3 个品牌色 × 实/半透明,循环取用。 */
export const CATEGORY_PALETTE: SegmentColor[] = [
  { color: 'var(--color-brand-green)', opacity: 1 },
  { color: 'var(--color-brand-amber)', opacity: 1 },
  { color: 'var(--color-brand-red)', opacity: 1 },
  { color: 'var(--color-brand-green)', opacity: 0.45 },
  { color: 'var(--color-brand-amber)', opacity: 0.45 },
  { color: 'var(--color-brand-red)', opacity: 0.45 },
];

/** 「其他」桶(超出 top-N 的长尾)固定用弱灰。 */
export const OTHER_FILL: SegmentColor = { color: 'var(--color-faint)', opacity: 0.35 };

export function categoryFill(i: number): SegmentColor {
  return CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
}

/** SegmentColor → 最终 CSS 颜色。半透明用 color-mix 现算, 让图例/Tooltip 色块与柱体一致。 */
export function fillColor(f: SegmentColor): string {
  if (f.opacity >= 1) return f.color;
  return `color-mix(in srgb, ${f.color} ${Math.round(f.opacity * 100)}%, transparent)`;
}
