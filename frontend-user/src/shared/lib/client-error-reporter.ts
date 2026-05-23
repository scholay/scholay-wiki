/**
 * 客户端错误上报 —— 把浏览器侧的错误 POST 给后端,落到 docker logs。
 *
 * 触发渠道:
 *   1. window.onerror      —— 同步抛出的未捕获错误(initClientErrorReporter)
 *   2. unhandledrejection  —— Promise 未 catch 的错误(initClientErrorReporter)
 *   3. React ErrorBoundary —— componentDidCatch 走 reportClientError(...)
 *   4. 业务代码主动        —— reportClientError({source: 'manual', ...})
 *
 * 设计取舍:
 *   - 不依赖 React Query / axios:reporter 必须在 React 初始化前 / setSession 之前
 *     也能工作,所以走原生 fetch + sendBeacon 兜底(beforeunload 也能发出去)
 *   - 5 秒内去重:同一 message+stack 多次触发只发一次 —— 避免 React 嵌套 render
 *     的级联错误打爆日志
 *   - 不对失败做重试:reporter 本身就是错误上报,失败重试容易循环引爆
 */

const ENDPOINT = '/api/v1/log/client-error';
const DEDUPE_WINDOW_MS = 5_000;

const seen = new Map<string, number>();

export interface ClientErrorPayload {
  message: string;
  stack?: string;
  source?: 'window-error' | 'unhandled-rejection' | 'react-error-boundary' | 'manual';
  url?: string;
  app_version?: string;
}

/** 业务代码主动上报 / ErrorBoundary 走的入口 */
export function reportClientError(payload: ClientErrorPayload): void {
  const now = Date.now();
  const key = (payload.message || '') + '|' + (payload.stack ?? '').slice(0, 200);
  const last = seen.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return;
  seen.set(key, now);

  // 控制 seen 大小,只保留最近 100 条以防内存泄漏
  if (seen.size > 100) {
    const oldest = [...seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, 50);
    oldest.forEach(([k]) => seen.delete(k));
  }

  const body = JSON.stringify({
    message: (payload.message || 'unknown').slice(0, 512),
    stack: (payload.stack ?? '').slice(0, 6144),
    source: payload.source ?? 'manual',
    url: payload.url ?? window.location.href,
    user_agent: navigator.userAgent,
    app_version: payload.app_version ?? import.meta.env?.VITE_APP_VERSION ?? '',
  });

  // sendBeacon 在页面 unload 时仍能投递,优先用它;不支持则 fetch keepalive
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }
  } catch {
    // ignore, fallthrough to fetch
  }

  // **故意用裸 fetch 而非 shared/lib/http**:reporter 在 React / axios
  // 初始化之前就必须能跑,而且需要 `keepalive: true` 让请求在 beforeunload
  // 阶段仍能投递;axios 不支持 keepalive,所以这里是 CLAUDE.md §3.4
  // "不允许裸 fetch" 规则的**有意例外**,集中收口在本文件,不向外扩散。
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // reporter 失败就静默 —— 上报系统挂了不影响主应用
  });
}

/** 应用启动时挂全局监听 —— 在 main.tsx 顶部调用一次 */
export function initClientErrorReporter(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (e) => {
    const err = e.error as Error | undefined;
    reportClientError({
      source: 'window-error',
      message: err?.message ?? e.message ?? 'unknown error',
      stack: err?.stack,
      url: e.filename,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    reportClientError({
      source: 'unhandled-rejection',
      message,
      stack,
    });
  });
}
