/** Prism 系统自动编译检查轮的稳定文本标记。 */
export const COMPILE_CHECK_PREFIX = '【系统 · 自动编译检查】';

/** 实时与历史回放共用：系统轮不显示成用户提问气泡。 */
export function isCompileCheckText(text: string | undefined | null): boolean {
  return !!text && text.startsWith(COMPILE_CHECK_PREFIX);
}
