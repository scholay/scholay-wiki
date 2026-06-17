import { useRef, useState, type TouchEvent } from 'react';

export interface PullToRefreshOptions {
  onRefresh: () => void | Promise<unknown>;
  /** 是否启用(加载中可传 false 暂禁) */
  enabled?: boolean;
  /** 触发刷新的下拉阈值(px),默认 70 */
  threshold?: number;
  /**
   * 判断「当前是否在顶部」—— 原生滚动容器默认用 currentTarget.scrollTop<=0;
   * embla 这类 transform 滚动需自定义(如 selectedScrollSnap()===0)。
   */
  atTop?: () => boolean;
}

/**
 * 下拉刷新 —— **被动触摸**(只读坐标、不 preventDefault / 不抢指针),与纵向 embla / 原生滚动共存。
 * 仅当起手在顶部 + 下拉超阈值才触发;过程返回 pull(阻尼后位移)+ refreshing 供渲染指示器。
 * 视觉上不强行位移内容(避免和 embla 回弹打架),用顶部指示器表达进度即可。
 */
export function usePullToRefresh({
  onRefresh,
  enabled = true,
  threshold = 70,
  atTop,
}: PullToRefreshOptions) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const handlers = {
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      if (!enabled || refreshing) {
        startY.current = null;
        return;
      }
      const top = atTop ? atTop() : e.currentTarget.scrollTop <= 0;
      startY.current = top ? (e.touches[0]?.clientY ?? null) : null;
    },
    onTouchMove: (e: TouchEvent<HTMLElement>) => {
      if (startY.current == null) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      setPull(dy <= 0 ? 0 : Math.min(dy * 0.5, threshold * 1.6));
    },
    onTouchEnd: () => {
      if (startY.current == null) {
        setPull(0);
        return;
      }
      const reached = pull >= threshold;
      startY.current = null;
      if (reached && !refreshing) {
        setRefreshing(true);
        setPull(threshold);
        Promise.resolve(onRefresh()).finally(() => {
          setRefreshing(false);
          setPull(0);
        });
      } else {
        setPull(0);
      }
    },
  };

  return { handlers, pull, refreshing };
}
