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

/**
 * 批量改 URL search-params —— **一次** setSearchParams 合并多个 key 的写入。
 *
 * 为什么需要它:react-router v7 的 setSearchParams(无论传函数式 updater 还是对象)
 * 都基于「当前 render 闭包里的 searchParams」计算下一个 URL,然后立刻 navigate。
 * 同一个同步事件里连续调用多个 useUrlState 的 setter(尤其是不同 key)不会 re-render,
 * 于是每个 setter 都从同一个「旧」base 计算、各自 navigate,最后一次覆盖前面所有次 ——
 * 表现为「重置/切预设/联动清空」只有最后一个 key 生效。
 *
 * 用 patch 把多 key 写入压成一次 navigate 即可避免互相覆盖:
 *   const patch = usePatchUrlState();
 *   patch({ days: '7', start: null, end: null }); // 一次写三个 key
 *
 * 约定:value 为 null / '' → 删除该 key(回退默认);undefined → **不动**该 key
 * (联动写入时「只清对方、不碰自己」用 undefined);其它值 String() 后写入。
 */
export function usePatchUrlState(): (patch: Record<string, string | number | null | undefined>) => void {
  const [, setParams] = useSearchParams();
  return useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) continue; // 不动这个 key
            const s = v === null ? '' : String(v);
            if (s === '') next.delete(k);
            else next.set(k, s);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setParams]
  );
}
