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
// 冷却时间戳【按当前路径分桶】的 key 前缀(见 tryReloadForStaleChunk 注释)。
export const PRELOAD_RELOAD_KEY = 'scholay.staleReload:';
export const PRELOAD_RELOAD_COOLDOWN_MS = 30_000;

/**
 * 判断一个错误是否「动态 import 旧 chunk 失败」(发版后 stale-chunk 的典型特征)。
 *
 * 报错文案各浏览器不一致 —— 这里尽量穷举,避免漏判(漏判会让本该自愈刷新的场景
 * 退化成报错/假 404):
 *   - Chrome/Edge: "Failed to fetch dynamically imported module: …"
 *   - Firefox:     "error loading dynamically imported module: …"
 *   - Safari:      "Importing a module script failed." / "module script failed"
 *   - webpack 系:  ChunkLoadError / "Loading chunk N failed" / "Loading CSS chunk … failed"
 *   - Vite preload: "Unable to preload CSS for …"
 */
export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  if ((err as { name?: string }).name === 'ChunkLoadError') return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|module script failed|dynamically imported module|loading chunk [\w-]+ failed|loading css chunk|unable to preload css|failed to load module script/i.test(
    msg
  );
}

/**
 * 返回是否真的触发了 reload(被冷却拦截则返回 false)。
 *
 * 冷却【按当前 pathname 分桶】,不是全局一个时间戳 —— 这很关键:
 *   - 全局冷却的坑:任意一次自愈刷新会把之后 30s 内**其它页面**的自愈也一并掐掉,
 *     用户在这窗口里换页撞到 stale chunk 就不会自动刷新、只能手动刷新(就是之前的现象)。
 *   - 分桶后语义正确:每个页面各自允许刷一次自愈;只有「**同一个页面**刚刷过、刷完还失败」
 *     才判定为「刷新治不好」→ 停手,避免对真正坏掉的页面无限刷新。
 */
export function tryReloadForStaleChunk(): boolean {
  if (typeof window === 'undefined') return false;
  const key = PRELOAD_RELOAD_KEY + window.location.pathname;
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last < PRELOAD_RELOAD_COOLDOWN_MS) {
    return false;
  }
  sessionStorage.setItem(key, String(Date.now()));
  window.location.reload();
  return true;
}
