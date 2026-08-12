import { isPhoneDevice } from '@/shared/lib/device';

/**
 * 高频路由 chunk 的空闲预热(router.tsx 的伴生模块,与它同属 app 路由装配层)。
 *
 * 路由已是 element 级懒加载(LazyRoute):导航即时提交、chunk 在页内异步补齐。
 * 预热进一步把「首次进入热门页面的骨架期」也消掉 —— window.load 后的浏览器空闲期
 * 顺序拉取高频目标的 chunk,真正点击时直接命中模块缓存,零等待零骨架。
 *
 * 约束:
 *   - 必须与 routes.tsx 里的 import 说明符一致(Vite 才会映射到同一 chunk);
 *   - 顺序 await 而非并发:预热是最低优先级,不允许挤占用户操作触发的请求;
 *   - saveData(省流模式)直接放弃;
 *   - 单次失败静默跳过 —— 真正导航时会重试,stale chunk 有 LazyRoute 自愈。
 */
const desktopWarmups: Array<() => Promise<unknown>> = [
  () => import('@/features/search/pages/SearchPage'),
  () => import('@/features/news/pages/NewsListPage'),
  () => import('@/features/news/pages/NewsDetailPage'),
  () => import('@/features/browser/pages/BrowserPage'),
  () => import('@/features/library/pages/LibraryPage'),
  () => import('@/features/claw/pages/ClawPage'),
  () => import('@/features/home/HomePage'),
  // 鉴权弹窗全家桶(zod + react-hook-form + turnstile):首次点「登录」不再空等 chunk
  () => import('@/features/auth'),
];

const mobileWarmups: Array<() => Promise<unknown>> = [
  () => import('@/features/mobile/pages/FeedPage'),
  () => import('@/features/mobile/pages/NewsPage'),
  () => import('@/features/auth'),
];

let started = false;

export function scheduleRouteWarmup(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  const kickoff = () => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => void runWarmup(), { timeout: 5_000 });
    } else {
      window.setTimeout(() => void runWarmup(), 1_500);
    }
  };

  if (document.readyState === 'complete') kickoff();
  else window.addEventListener('load', kickoff, { once: true });
}

async function runWarmup(): Promise<void> {
  const conn = (navigator as { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const list = isPhoneDevice() ? mobileWarmups : desktopWarmups;
  for (const load of list) {
    try {
      await load();
    } catch {
      // 预热失败无害:导航时会重新请求
    }
  }
}
