/**
 * 文件夹内论文行的加入日期格式化 —— 同年只显示 `MM-DD`(省空间),**跨年显示完整
 * `YYYY-MM-DD`** 消除歧义(去年 07-08 与今年 07-08 不能长一样)。
 * 空串或非法日期返回空,调用方负责跳过渲染。
 */
export function formatAddedDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (yyyy !== new Date().getFullYear()) return `${yyyy}-${mm}-${dd}`;
  return `${mm}-${dd}`;
}

/** 完整日期 `YYYY-MM-DD` —— 供 hover title 用(无论是否同年都给全)。 */
export function formatAddedDateFull(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
