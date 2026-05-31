import { useCallback, useEffect, useRef } from 'react';
import type { PdfMode } from '../internals';

/**
 * 多页 (continuous / two-up) 模式下的滚动同步:
 *  - 提供 `registerPageWrap(n)` 给每页 DOM 注册 ref
 *  - 提供 `scrollToPage(n)` 程序主动滚到某页(翻页按钮 / 模式切换用)
 *  - 自动用 IntersectionObserver 同步用户滚动 → `onVisiblePageChange(n)`(只更新页号,不再回滚)
 *
 * 关键约定: 不在 page 变化时自动 scrollIntoView ——
 *   IO 更新 page → useEffect 触发 scroll → 形成反馈环 → 体感"被卡一下拉回顶部"。
 */
export function useMultiPageScroll(params: {
  mode: PdfMode;
  numPages: number;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  onVisiblePageChange: (page: number) => void;
}) {
  const { mode, numPages, scrollRoot, onVisiblePageChange } = params;

  const pageWrapRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const registerPageWrap = useCallback(
    (n: number) => (el: HTMLDivElement | null) => {
      if (el) pageWrapRefs.current.set(n, el);
      else pageWrapRefs.current.delete(n);
    },
    []
  );

  const scrollToPage = useCallback((n: number) => {
    const el = pageWrapRefs.current.get(n);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const resetRefs = useCallback(() => {
    pageWrapRefs.current.clear();
  }, []);

  // 多页模式: IntersectionObserver 同步"用户滚到了第几页" → 只更新 page 状态(展示用),
  // 不触发任何滚动操作 —— 用户的物理滚动是权威。
  useEffect(() => {
    if (mode === 'single' || numPages === 0) return;
    const root = scrollRoot.current;
    if (!root) return;
    const visible = new Set<number>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number(e.target.getAttribute('data-page-number'));
          if (!n) continue;
          if (e.isIntersecting) visible.add(n);
          else visible.delete(n);
        }
        if (visible.size === 0) return;
        const minVisible = Math.min(...visible);
        onVisiblePageChange(minVisible);
      },
      { root, threshold: 0.1 }
    );
    pageWrapRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [mode, numPages, scrollRoot, onVisiblePageChange]);

  return { registerPageWrap, scrollToPage, resetRefs };
}
