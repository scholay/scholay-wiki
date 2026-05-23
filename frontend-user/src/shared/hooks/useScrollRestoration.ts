import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 滚动位置恢复 —— 离开当前 URL 时存,回到同一 URL 时还原。
 *
 * 用法:
 *   const listRef = useRef<HTMLDivElement>(null);
 *   useScrollRestoration(listRef);
 *   return <div ref={listRef} className="overflow-auto">…</div>;
 *
 * 实现细节:
 *   - 键 = `location.pathname + location.search` —— 翻页 / 切排序 / 切搜索词
 *     都算不同 URL,各自记自己的滚动位;返回同一 URL(浏览器 back)才命中。
 *   - 用 sessionStorage(关闭浏览器即丢,不污染长期存储)
 *   - 监听容器 scroll(passive)+ 离开时 unmount cleanup 写入
 *     —— scroll 频次 throttle 到 rAF 一次,避免高频 setItem 阻塞主线程。
 *   - 进入时用 useLayoutEffect 在 DOM 提交前 scrollTop 一次,避免视觉闪烁。
 *     等首屏内容真正渲染好(useEffect 微任务后)再写一次兜底,
 *     防止 React 18 并发渲染时第一次 commit 时容器还是空的(无可滚位置)。
 *
 * 限制 / 注意:
 *   - 容器必须是固定高度 + overflow:auto 自身,不能是 body 滚
 *   - 列表内容渲染依赖异步数据时,sessionStorage 写的滚动位是 px 数值,
 *     若数据返回前容器高度变化会出现"先回顶再回去"的视觉抖动。
 *     这里在 useEffect 微任务里再写一次能覆盖大多数情况。
 */
export function useScrollRestoration(
  ref: RefObject<HTMLElement | null>,
  /** sessionStorage 命名空间,默认 `scrollpos`。多个独立列表共用时换 key 区分 */
  namespace: string = 'scrollpos'
) {
  const { pathname, search } = useLocation();
  const key = `${namespace}:${pathname}${search}`;

  // throttle 用,避免 scroll 高频写
  const rafIdRef = useRef<number | null>(null);
  const latestScrollRef = useRef<number>(0);

  // 进入页面 → 同步恢复滚动位置(DOM 提交前)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = sessionStorage.getItem(key);
    if (saved != null) {
      el.scrollTop = Number(saved);
    }
  }, [key, ref]);

  // 数据延后到达时再恢复一次 —— 异步列表场景兜底:
  // 列表组件挂载时 scrollHeight 还是 0(数据没回来),浏览器会把 scrollTop 钳到 0;
  // 数据到位后 scrollHeight 长起来,这时再尝试恢复一次。
  // 用 ResizeObserver 观察容器/内容尺寸变化,scrollHeight ≥ saved 时立刻定位 + 停止观察。
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const saved = sessionStorage.getItem(key);
    if (saved == null) return;
    const target = Number(saved);
    if (!Number.isFinite(target) || target <= 0) return;

    // 已经能放下 → 直接 scroll,不必上 observer
    if (el.scrollHeight >= target + el.clientHeight) {
      el.scrollTop = target;
      return;
    }

    let attempts = 0;
    const ro = new ResizeObserver(() => {
      // 内容长够了再恢复 —— 否则会被钳到 0,后面再也回不去
      if (el.scrollHeight >= target + el.clientHeight) {
        el.scrollTop = target;
        ro.disconnect();
        return;
      }
      // 最多观察 30 次(~500ms 上限),防止异常列表永远等不到
      attempts++;
      if (attempts > 30) ro.disconnect();
    });
    // 同时观察容器和直接子元素 —— 子元素增加 height 时 ResizeObserver 才回调
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [key, ref]);

  // 监听 scroll → rAF throttle → sessionStorage
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      latestScrollRef.current = el.scrollTop;
      if (rafIdRef.current != null) return;
      rafIdRef.current = requestAnimationFrame(() => {
        sessionStorage.setItem(key, String(latestScrollRef.current));
        rafIdRef.current = null;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      // 离开前最后一次兜底写入(最近一次 scroll 还没 flush 也补上)
      sessionStorage.setItem(key, String(latestScrollRef.current));
    };
  }, [key, ref]);
}
