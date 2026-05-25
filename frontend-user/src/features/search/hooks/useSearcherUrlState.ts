import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SearchFilters } from '../types';
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type PageSize,
} from '../components/SearcherPagination';

/**
 * 搜索器列的 URL 状态镜像 —— page / pageSize 直接走 ?p= / ?ps=,
 * 让 returnTo 拿到的 URL 完整还原翻页位置,详情页返回不丢上下文。
 *
 * 同时管理"filter 变化时回第 1 页"effect —— 该 effect 的依赖处理比较绕,
 * 在母组件里很容易写错(数组 dep + 首次挂载跳过),抽到 hook 里集中维护。
 *
 * **重要**:`useUrlFilters` 每次 URL 变化都返回新对象 + 新数组(decode 重做),
 * 哪怕内容相同。直接把 `filters.venues` 等数组放 dep 数组里,翻页改 `?p=2`
 * 也会触发本 effect → 清掉 `p`,造成"分页失灵"。把数组拼成字符串作 dep,
 * 数组内容真变才触发。
 */
export function useSearcherUrlState(filters: SearchFilters) {
  const [params, setParams] = useSearchParams();

  const pageSize = useMemo<PageSize>(() => {
    const raw = Number(params.get('ps'));
    return PAGE_SIZE_OPTIONS.includes(raw as PageSize)
      ? (raw as PageSize)
      : DEFAULT_PAGE_SIZE;
  }, [params]);
  const page = useMemo(() => {
    const raw = Number(params.get('p'));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  }, [params]);

  const setPage = useCallback(
    (p: number) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (p > 1) next.set('p', String(p));
          else next.delete('p');
          return next;
        },
        { replace: false }
      );
    },
    [setParams]
  );

  const setPageSize = useCallback(
    (size: PageSize) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (size !== DEFAULT_PAGE_SIZE) next.set('ps', String(size));
          else next.delete('ps');
          // 改 pageSize 一定回第 1 页(旧 offset 在新尺寸下意义已变)
          next.delete('p');
          return next;
        },
        { replace: false }
      );
    },
    [setParams]
  );

  // filters 变化时回第 1 页(避免新筛选条件 + 旧 offset 翻到空页)。
  // 数组转 string 后作 dep,避免每次 URL 变化都触发(`useUrlFilters` 返回新引用)。
  // 跳过首次挂载 —— 首次进 /search?q=xxx&p=3 时 filters 也"第一次"出现,
  // 但这不算"用户改了 filter",不应清掉 p。
  const venuesKey = filters.venues.join(',');
  const subjectsKey = filters.subjects.join(',');
  const typesKey = filters.publicationTypes.join(',');
  const filtersChangedOnceRef = useRef(false);
  useEffect(() => {
    if (!filtersChangedOnceRef.current) {
      filtersChangedOnceRef.current = true;
      return;
    }
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.has('p')) {
          next.delete('p');
          return next;
        }
        return prev;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters.source,
    filters.timeRange,
    filters.yearFrom,
    filters.yearTo,
    venuesKey,
    subjectsKey,
    typesKey,
    filters.openAccess,
    filters.minCitations,
    filters.sort,
  ]);

  return { params, setParams, page, setPage, pageSize, setPageSize };
}
