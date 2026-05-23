import { useEffect, useState } from 'react';

/**
 * 简洁的 matchMedia 封装。例:
 *   const isMobile = useMediaQuery('(max-width: 768px)')
 *
 * SSR 安全:首次返回 false,挂载后立刻校正,避免 hydration 不一致。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

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
