import { useEffect } from 'react';
import { http } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';

/**
 * 只有这些浏览器原生输入才能证明「此刻有人在使用」。
 *
 * 刻意不监听 mousemove / scroll / focus / visibilitychange / pageshow，也不设心跳：
 * 它们可以由页面恢复、布局、脚本或单纯挂机产生，不能当作真实活跃。
 */
export const USER_ACTIVITY_EVENT_TYPES = [
  'pointerdown',
  'keydown',
  'wheel',
  'touchstart',
  'click',
  'input',
] as const;

export const USER_ACTIVITY_REPORT_THROTTLE_MS = 60_000;

export type UserActivityEvent = Pick<Event, 'isTrusted' | 'type'> & {
  repeat?: boolean;
};

interface ActivityEventTarget {
  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface ActivityDocument {
  readonly visibilityState: DocumentVisibilityState;
}

interface ActivityReporterOptions {
  target: ActivityEventTarget;
  document: ActivityDocument;
  report: () => Promise<unknown>;
  /** 防止事件产生后、异步上报前已经换号，把 A 的操作误记到 B。 */
  isSessionCurrent?: () => boolean;
  now?: () => number;
  throttleMs?: number;
}

const ACTIVITY_EVENT_SET = new Set<string>(USER_ACTIVITY_EVENT_TYPES);

/** 纯判定函数：不可见页面、脚本事件、按键长按 repeat 都不计活跃。 */
export function isGenuineUserActivity(
  event: UserActivityEvent,
  visibilityState: DocumentVisibilityState,
): boolean {
  if (visibilityState !== 'visible' || !event.isTrusted) return false;
  if (!ACTIVITY_EVENT_SET.has(event.type)) return false;
  return event.type !== 'keydown' || event.repeat !== true;
}

/**
 * 注册「真人输入 → 活跃上报」。返回值用于 React effect 卸载时完整清理。
 *
 * 节流只从上次成功响应后起算；失败不吞掉下一次真人事件。
 * 没有 trailing timer，所以挂机一小时也不会自己补发请求。
 */
export function registerUserActivityReporter({
  target,
  document: activityDocument,
  report,
  isSessionCurrent = () => true,
  now = Date.now,
  throttleMs = USER_ACTIVITY_REPORT_THROTTLE_MS,
}: ActivityReporterOptions): () => void {
  let inFlight = false;
  let disposed = false;
  let lastSuccessfulReportAt: number | null = null;

  const handleActivity: EventListener = (rawEvent) => {
    if (disposed || !isSessionCurrent()) return;
    const event = rawEvent as UserActivityEvent;
    if (!isGenuineUserActivity(event, activityDocument.visibilityState)) return;
    if (inFlight) return;

    const currentTime = now();
    if (lastSuccessfulReportAt !== null) {
      const elapsed = currentTime - lastSuccessfulReportAt;
      // 设备时钟回拨时 elapsed<0：此时不能沿用未来时间戳节流，
      // 否则会在时钟追上前长时间吞掉所有真人事件。
      if (elapsed >= 0 && elapsed < throttleMs) return;
    }

    inFlight = true;
    let didReport = false;
    void Promise.resolve()
      .then(() => {
        // 原生事件的后续业务 handler 可能在本 microtask 前登出/换号。
        // 必须再校验一次，否则 http interceptor 会给 A 的输入带上新会话 B。
        if (disposed || !isSessionCurrent()) return;
        didReport = true;
        return report();
      })
      .then(() => {
        if (didReport && !disposed && isSessionCurrent()) {
          lastSuccessfulReportAt = now();
        }
      })
      .catch(() => {
        // 活跃上报是旁路观测，断网/服务端失败不应打断用户操作。
      })
      .finally(() => {
        inFlight = false;
      });
  };

  for (const type of USER_ACTIVITY_EVENT_TYPES) {
    // capture 避免业务子节点 stopPropagation 让全局探针漏记真实输入。
    target.addEventListener(type, handleActivity, {
      capture: true,
      passive: true,
    });
  }

  return () => {
    disposed = true;
    for (const type of USER_ACTIVITY_EVENT_TYPES) {
      target.removeEventListener(type, handleActivity, { capture: true });
    }
  };
}

/** 单一上报接口，独立命名便于合同测试锁定路由。 */
export async function reportUserActivity(): Promise<void> {
  await http.post('/user/activity');
}

/**
 * 全局真人活跃探针。只在有 token 时挂监听，登出立即拆掉。
 * 接口由 http interceptor 在发送时读当前 token，避免 token 轮换后带旧值。
 */
export function UserActivityReporter() {
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (
      !token ||
      typeof window === 'undefined' ||
      typeof document === 'undefined'
    ) {
      return;
    }

    return registerUserActivityReporter({
      target: window,
      document,
      report: reportUserActivity,
      isSessionCurrent: () => useAuthStore.getState().token === token,
    });
  }, [token]);

  return null;
}
