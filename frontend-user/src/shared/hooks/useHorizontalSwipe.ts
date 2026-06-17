import { useRef, type TouchEvent } from 'react';

export interface HorizontalSwipeOptions {
  /** 手指向左滑(内容向左,通常 = 下一个) */
  onSwipeLeft?: () => void;
  /** 手指向右滑(内容向右,通常 = 上一个) */
  onSwipeRight?: () => void;
  /** 触发的最小水平位移(px),默认 60 */
  threshold?: number;
  /**
   * 仅当手指从屏幕左边缘 N px 内按下才识别(「边缘侧滑返回」用):
   * 避免与正文里的横向滚动区(表格 / 引用关系图)冲突。不传 = 整个区域都识别。
   */
  edgeStart?: number;
}

/**
 * 轻量水平滑动检测 —— **只读触点坐标**(被动:不 preventDefault、不抢指针捕获),
 * 因此能与纵向 embla feed 共存:竖向手势照常交给 embla,本 hook 仅在「明显横向」时回调。
 *
 * 用法:`const swipe = useHorizontalSwipe({...}); <div {...swipe}>…</div>`
 * 之所以自写而不用 framer-motion drag:drag 会做指针捕获,和纵向 embla 抢手势导致 feed 卡顿。
 */
export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  edgeStart,
}: HorizontalSwipeOptions) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      const t = e.touches[0];
      if (!t || (edgeStart != null && t.clientX > edgeStart)) {
        start.current = null;
        return;
      }
      start.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: TouchEvent<HTMLElement>) => {
      const s = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!s || !t) return;
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      // 位移不够大、或更偏竖向 → 不当作横滑(留给纵向 feed)
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
  };
}
