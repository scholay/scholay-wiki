/**
 * 非负货币金额的输入中间态。
 *
 * - 空串是合法的编辑态，不强制回填 0；
 * - 自动移除多余前导 0（010 → 10）；
 * - 只接受一个小数点，拒绝负号、指数和其他字符；
 * - 超出小数位数时截断，避免界面金额与分值换算不一致。
 *
 * 返回 null 表示这次输入不合法，调用方应保留上一个草稿。
 */
export function normalizeMoneyDraft(
  raw: string,
  fractionDigits = 2,
): string | null {
  if (raw === '') return '';
  if (!/^\d*(?:\.\d*)?$/.test(raw)) return null;

  const hasDecimalPoint = raw.includes('.');
  const [rawInteger = '', rawFraction = ''] = raw.split('.');
  const integer = (rawInteger || '0').replace(/^0+(?=\d)/, '');

  if (!hasDecimalPoint) return integer;
  return `${integer}.${rawFraction.slice(0, Math.max(0, fractionDigits))}`;
}
