/**
 * 统一前端事件埋点 —— 同时打给 umami 自定义事件与 GA4 gtag 事件。
 *
 * 背景:umami / GA4 默认只**自动采集 PV**;功能级事件(搜索提交、审稿、写作、反馈…)需要主动埋。
 * 各 feature 在关键动作点调 `trackEvent('search_submit', { source })`,数据即同时进 umami 和 GA4。
 *
 * 约定:事件名用 snake_case 动词短语(search_submit / feedback_submit / review_submit);
 * data 只放**非 PII 的小标量**(数量、类型枚举、来源),不要放用户内容/邮箱。
 */
type UmamiGlobal = { track?: (name: string, data?: Record<string, unknown>) => void };
type GtagFn = (command: 'event', name: string, params?: Record<string, unknown>) => void;
type QueuedUmamiEvent = { name: string; data?: Record<string, unknown> };
type AnalyticsWindow = Window & {
  umami?: UmamiGlobal;
  gtag?: GtagFn;
  __scholayUmamiQueue?: QueuedUmamiEvent[];
  __flushScholayUmamiQueue?: () => void;
};

// Umami 在 window.load + idle 后才下载，而 FCP/TTFB 等 buffered Web Vital
// 会更早上报。只保留一个小型有界队列，既不让早期指标丢失，也避免
// 统计服务不可用时无限占用内存。
const MAX_QUEUED_UMAMI_EVENTS = 100;

function analyticsWindow(): AnalyticsWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as AnalyticsWindow);
}

function queueUmamiEvent(target: AnalyticsWindow, event: QueuedUmamiEvent): void {
  const queue = (target.__scholayUmamiQueue ||= []);
  if (queue.length >= MAX_QUEUED_UMAMI_EVENTS) queue.shift();
  queue.push(event);
}

/** 由 index.html 在 Umami tracker 脚本 onload 后调用。 */
export function flushQueuedUmamiEvents(): void {
  const target = analyticsWindow();
  const track = target?.umami?.track;
  const queue = target?.__scholayUmamiQueue;
  if (!target || !track || !queue?.length) return;

  while (queue.length > 0) {
    const event = queue[0];
    try {
      track(event.name, event.data);
      queue.shift();
    } catch {
      // 保留未发送事件；后续 tracker 恢复时仍可再次 flush。
      return;
    }
  }
}

const target = analyticsWindow();
if (target) target.__flushScholayUmamiQueue = flushQueuedUmamiEvents;

export function trackEvent(name: string, data?: Record<string, unknown>): void {
  const target = analyticsWindow();
  if (!target) return;

  const umamiEvent = { name, data };
  if (target.umami?.track) {
    try {
      target.umami.track(name, data);
    } catch {
      queueUmamiEvent(target, umamiEvent);
    }
  } else {
    queueUmamiEvent(target, umamiEvent);
  }
  try {
    target.gtag?.('event', name, data);
  } catch {
    /* 同上 */
  }
}
