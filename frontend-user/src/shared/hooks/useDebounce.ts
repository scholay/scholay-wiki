import { useEffect, useState } from 'react';

/**
 * 通用 debounce — 搜索框输入、resize 监听通用。
 *   const debounced = useDebounce(input, 300)
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
