import { useEffect, useState } from 'react';

/**
 * 把非关键工作推迟到首次 page load 之后的浏览器空闲期。
 *
 * 用户主动操作必须由调用方自行作为更高优先级的闸门；这个 hook 只用于
 * analytics、通知预连接、次要榜单等不应与 LCP 资源竞争的工作。
 */
export function useAfterPageLoad(timeout = 1_000): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let idleHandle: number | null = null;
    let timerHandle: number | null = null;
    let cancelled = false;

    const markReady = () => {
      if (!cancelled) setReady(true);
    };
    const scheduleIdle = () => {
      if (typeof window.requestIdleCallback === 'function') {
        idleHandle = window.requestIdleCallback(markReady, { timeout });
      } else {
        timerHandle = window.setTimeout(markReady, Math.min(timeout, 250));
      }
    };

    if (document.readyState === 'complete') scheduleIdle();
    else window.addEventListener('load', scheduleIdle, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', scheduleIdle);
      if (idleHandle !== null) window.cancelIdleCallback(idleHandle);
      if (timerHandle !== null) window.clearTimeout(timerHandle);
    };
  }, [timeout]);

  return ready;
}
