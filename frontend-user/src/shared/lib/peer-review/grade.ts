/**
 * 维度评分等级 (A+ … D) → 3 档配色, 与审稿决议同一套色彩语言 (绿 / 橘 / 红):
 *   A 系 → 绿 (优秀)   B 系 → 橘 (中等)   C/D 系 → 红 (需改进)
 *
 * 给 ReviewerDetailPanel 的四维度评分环用。无数值分时, 环的填充长度按等级近似。
 */
export type GradeTier = 'good' | 'mid' | 'weak';

export function gradeTier(grade?: string | null): GradeTier {
  const g = (grade ?? '').trim().toUpperCase();
  if (g.startsWith('A')) return 'good';
  if (g.startsWith('B')) return 'mid';
  if (g.startsWith('C') || g.startsWith('D')) return 'weak';
  return 'mid';
}

const TEXT: Record<GradeTier, string> = {
  good: 'text-brand-green',
  mid: 'text-brand-amber',
  weak: 'text-brand-red',
};

/** 等级文字色 (环用 currentColor, 所以 wrapper 套这个 class 即可)。 */
export function gradeTextColor(grade?: string | null): string {
  return TEXT[gradeTier(grade)];
}

// 等级 → 环填充比例 (0-1)。没有逐维数值分, 用等级近似出环的视觉长度。
const FILL: Record<string, number> = {
  'A+': 1, A: 0.92, 'A-': 0.86,
  'B+': 0.8, B: 0.72, 'B-': 0.66,
  'C+': 0.58, C: 0.5, 'C-': 0.44,
  D: 0.3,
};

export function gradeFill(grade?: string | null): number {
  const g = (grade ?? '').trim().toUpperCase();
  return FILL[g] ?? 0.6;
}
