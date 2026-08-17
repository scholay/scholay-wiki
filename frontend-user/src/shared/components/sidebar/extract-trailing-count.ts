import { isValidElement, type ReactNode } from 'react';

/**
 * 从 SidebarItem.trailing 抽出数字 —— 支持裸 number / 数字字符串 /
 * 带 `n` prop 的徽章组件(CountBadge、<Count n={…} />)。
 * 抽不出则窄轨不显示数字槽(只留图标)。
 */
export function extractTrailingCount(trailing: ReactNode): number | null {
  if (typeof trailing === 'number' && Number.isFinite(trailing)) {
    return trailing;
  }
  if (typeof trailing === 'string' && /^\d+$/.test(trailing)) {
    return Number(trailing);
  }
  if (isValidElement(trailing)) {
    const n = (trailing.props as { n?: unknown }).n;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return null;
}
