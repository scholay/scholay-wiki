import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Paper } from '@/shared/api/types';

export function heightsEqual(
  a: Record<string, number>,
  b: Record<string, number>,
) {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => a[k] === b[k]);
}

/**
 * 文献集列表卡 ↔ 右侧矩阵行：量左侧 `[data-paper-row]` 真实高度，
 * 并双向同步两条滚动轴。
 */
export function useLibraryMatrixAlign(enabled: boolean, papers: Paper[]) {
  const listScrollRef = useRef<HTMLDivElement>(null);
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});

  const measureRows = useCallback(() => {
    const root = listScrollRef.current;
    if (!root) return;
    const next: Record<string, number> = {};
    root.querySelectorAll<HTMLElement>('[data-paper-row]').forEach((el) => {
      const id = el.dataset.paperRow;
      if (id) next[id] = el.offsetHeight;
    });
    setRowHeights((prev) => (heightsEqual(prev, next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    if (!enabled) return;
    const root = listScrollRef.current;
    if (!root) return;
    const ro = new ResizeObserver(measureRows);
    ro.observe(root);
    root.querySelectorAll('[data-paper-row]').forEach((el) => ro.observe(el));
    measureRows();
    return () => ro.disconnect();
  }, [enabled, measureRows, papers]);

  const syncFrom = useCallback(
    (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
      if (!from || !to || syncingRef.current) return;
      if (from.scrollTop === to.scrollTop) return;
      syncingRef.current = true;
      to.scrollTop = from.scrollTop;
      requestAnimationFrame(() => {
        syncingRef.current = false;
      });
    },
    [],
  );

  return { listScrollRef, matrixScrollRef, rowHeights, syncFrom };
}
