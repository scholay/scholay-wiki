import { useEffect, useState } from 'react';

/**
 * 简洁的 matchMedia 封装。例:
 *   const isMobile = useMediaQuery('(max-width: 768px)')
 *
 * 首帧即取真值(惰性 init 读 matchMedia):本项目是纯客户端 SPA(createRoot,无 hydration),
 * 惰性初值不会造成 hydration 不一致;同时避免「首帧按 false 渲染桌面分支、挂载后才纠正」的一帧闪动
 * (如 SidebarLayout 移动抽屉在持久化 expanded=true 时会闪一帧 240px 宽侧栏)。typeof window 守卫兼顾测试/SSR。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent | MediaQueryList) =>
      setMatches('matches' in e ? e.matches : (e as MediaQueryList).matches);
    handler(mql);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}
