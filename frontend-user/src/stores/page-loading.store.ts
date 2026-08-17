import { useEffect } from 'react';
import { create } from 'zustand';

interface PageLoadingState {
  /** 同时在途的全站 loading 声明数。>0 时只画一层蒙层。 */
  count: number;
  claim: () => void;
  release: () => void;
}

/**
 * 全站 loading 蒙层的引用计数。
 * 各 LoadingState / RouteFallback 挂载时 claim、卸载时 release,
 * 避免局部刷新叠出多层牛犀犀。
 */
export const usePageLoading = create<PageLoadingState>((set) => ({
  count: 0,
  claim: () => set((s) => ({ count: s.count + 1 })),
  release: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));

/** 组件在场期间占一份全站 loading。 */
export function usePageLoadingClaim() {
  useEffect(() => {
    usePageLoading.getState().claim();
    return () => usePageLoading.getState().release();
  }, []);
}
