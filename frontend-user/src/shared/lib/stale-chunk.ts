/**
 * 发版后 stale-chunk 自愈共用工具。
 *
 * 浏览器持有旧 index.html → 旧 hash chunk 已 404 → 动态 import 抛错。
 * 两条触发链都走这里, 共享同一个 30 秒冷却时间戳:
 *   1) main.tsx 的 `vite:preloadError` 全局监听 (Vite 提供的事件, 通常最早触发)
 *   2) RouteErrorBoundary 内 `useRouteError` 拿到 chunk 错误后兜底
 *
 * 冷却的目的:同一会话里允许多次 reload(用户开页一周可能跨多次发版),
 * 但 30 秒内只允许触发一次,防止"reload 完还是失败"导致无限刷新。
 */
export const PRELOAD_RELOAD_KEY = 'scholay.preloadErrorReloadedAt';
export const PRELOAD_RELOAD_COOLDOWN_MS = 30_000;

/** 返回是否真的触发了 reload(被冷却拦截则返回 false)。 */
export function tryReloadForStaleChunk(): boolean {
  if (typeof window === 'undefined') return false;
  const last = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) || 0);
  if (Date.now() - last < PRELOAD_RELOAD_COOLDOWN_MS) {
    return false;
  }
  sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()));
  window.location.reload();
  return true;
}
