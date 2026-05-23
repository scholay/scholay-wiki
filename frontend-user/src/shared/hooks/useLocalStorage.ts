import { useCallback, useEffect, useState } from 'react';

/**
 * 简洁 localStorage 持久化 hook(用于不进入 zustand 的临时面板状态)。
 * 跨标签同步通过 storage 事件;同标签内通过自定义 event。
 */
export function useLocalStorage<T>(
  key: string,
  initial: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const read = useCallback((): T => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  }, [key, initial]);

  const [value, setValue] = useState<T>(read);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = next instanceof Function ? next(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
          window.dispatchEvent(
            new CustomEvent('local-storage', { detail: { key } })
          );
        } catch {}
        return resolved;
      });
    },
    [key]
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue(read());
    };
    const onCustom = (e: Event) => {
      if ((e as CustomEvent).detail?.key === key) setValue(read());
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('local-storage', onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('local-storage', onCustom);
    };
  }, [key, read]);

  return [value, set];
}
