/**
 * 文献集行加入日期格式化 —— `MM-DD` 风格(同年默认,跨年不展示在卡上,
 * 跨年信息进 hover title)。空串或非法日期返回空,调用方负责跳过渲染。
 */
export function formatAddedDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}
