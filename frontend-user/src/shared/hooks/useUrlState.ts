import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL search-params 当作 single source of truth。
 *
 * 用 useState 的形态包装,但写入会更新 URL,读取也从 URL 拿。
 * 好处:
 *   - 刷新不丢 filter/page
 *   - 链接可复制给同事("你看这页")
 *   - 浏览器返回有意义
 *   - 不需要 useEffect 同步两个状态源
 *
 * 用法:
 *   const [page, setPage] = useUrlState('page', '1', Number);
 *   const [q, setQ] = useUrlState('q', '');
 *
 * 第三个参数:string → T 的 parser(默认 string)。setter 会把 value 转回 string。
 * 默认值匹配时会从 URL 移除该 key,保持 URL 简洁。
 */
export function useUrlState(
  key: string,
  defaultValue: string,
): [string, (v: string) => void];

export function useUrlState<T>(
  key: string,
  defaultValue: T,
  parse: (raw: string) => T,
): [T, (v: T) => void];

export function useUrlState<T>(
  key: string,
  defaultValue: T,
  parse?: (raw: string) => T,
): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const parser = parse ?? ((s: string) => s as unknown as T);
  const value = raw == null ? defaultValue : parser(raw);

  const set = useCallback(
    (v: T) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const stringDefault = String(defaultValue);
          const stringV = String(v);
          if (stringV === stringDefault || v === ('' as unknown as T) || v == null) {
            next.delete(key);
          } else {
            next.set(key, stringV);
          }
          return next;
        },
        { replace: true } // 不污染浏览器历史 —— 每次输入都加一条历史就太吵
      );
    },
    [key, defaultValue, setParams]
  );

  return [value, set];
}
