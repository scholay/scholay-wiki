/**
 * 统一前端事件埋点 —— 同时打给 umami 自定义事件与 GA4 gtag 事件;脚本未加载则静默无副作用。
 *
 * 背景:umami / GA4 默认只**自动采集 PV**;功能级事件(搜索提交、审稿、写作、反馈…)需要主动埋。
 * 各 feature 在关键动作点调 `trackEvent('search_submit', { source })`,数据即同时进 umami 和 GA4。
 *
 * 约定:事件名用 snake_case 动词短语(search_submit / feedback_submit / review_submit);
 * data 只放**非 PII 的小标量**(数量、类型枚举、来源),不要放用户内容/邮箱。
 */
type UmamiGlobal = { track?: (name: string, data?: Record<string, unknown>) => void };
type GtagFn = (command: 'event', name: string, params?: Record<string, unknown>) => void;

export function trackEvent(name: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    (window as unknown as { umami?: UmamiGlobal }).umami?.track?.(name, data);
  } catch {
    /* 监控不可用不应影响主流程 */
  }
  try {
    (window as unknown as { gtag?: GtagFn }).gtag?.('event', name, data);
  } catch {
    /* 同上 */
  }
}
