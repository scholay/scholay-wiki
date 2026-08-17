/** 窄轨角标:两位数封顶,超出显示 99+。 */
export function formatRailCount(count: number): string {
  if (count > 99) return '99+';
  return String(Math.max(0, Math.floor(count)));
}
