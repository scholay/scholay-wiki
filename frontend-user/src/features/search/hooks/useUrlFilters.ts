import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { UpstreamSource } from '@/shared/api/types';
import {
  DEFAULT_FILTERS,
  type SearchFilters,
  type TimeRange,
} from '../types';

/**
 * 把 SearchFilters 落到 URL search params,而不是组件 useState。
 *
 * **核心动机**:筛选器与 `?q=` 一样属于"页面上下文",必须挺过路由跳转。
 * 之前 filters 用 `useState`,用户从 /search 进入论文详情再返回时 SearchPage
 * 整组件 unmount → state 丢 → 重新挂载用默认 filters,结果列表与离开前不一致。
 * URL-backed 后:`?q=...&src=olx&sub=biology&...` 进入 history,浏览器 back 完整
 * 还原。同时 URL 可分享。
 *
 * 编码策略(尽量短):
 *   - source        → `src=stc|olx|pmd`        (省略 if 'stc')
 *   - timeRange     → `tr=1y|3y|5y|custom`     (省略 if 'all')
 *   - yearFrom/yearTo → `yf=2020 yt=2024`       (仅 tr=custom)
 *   - venues        → `ven=NeurIPS,ICML`       (comma)
 *   - subjects      → `sub=biology,art`        (comma)
 *   - publicationTypes → `pt=conference,...`   (comma)
 *   - openAccess    → `oa=1`                   (省略 if false)
 *   - minCitations  → `mc=10`                  (省略 if 0/undef)
 *   - sort          → `s=citations|date`       (省略 if 'relevance')
 *
 * 任意字段写回 → setParams 触发组件重渲 → useUrlFilters 重新解析 → 与原本 useState 同款
 * 用法,SearchPage / SearchSidebar 不感知 URL 这层。
 */

const VALID_SOURCES: UpstreamSource[] = ['stc', 'olx', 'pmd'];
const VALID_TIME_RANGES: TimeRange[] = ['all', '1y', '3y', '5y', 'custom'];
// sort 跨源语义不统一(stc/pmd 是 enum,olx 是 field:dir),URL 层接受任意字符串,
// 由 pruneFiltersForSource 在切源时回落到合法默认值

function parseList(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePosInt(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function decode(sp: URLSearchParams): SearchFilters {
  const src = sp.get('src');
  const source = (VALID_SOURCES.includes(src as UpstreamSource)
    ? (src as UpstreamSource)
    : DEFAULT_FILTERS.source) as UpstreamSource;

  const tr = sp.get('tr');
  const timeRange = (VALID_TIME_RANGES.includes(tr as TimeRange)
    ? (tr as TimeRange)
    : DEFAULT_FILTERS.timeRange) as TimeRange;

  // sort:URL 层不预校验(三源候选不同),原样还原;切源时 pruneFiltersForSource 兜底
  const sortOrder = sp.get('s') ?? DEFAULT_FILTERS.sort;

  return {
    source,
    timeRange,
    yearFrom: timeRange === 'custom' ? parsePosInt(sp.get('yf')) : undefined,
    yearTo: timeRange === 'custom' ? parsePosInt(sp.get('yt')) : undefined,
    venues: parseList(sp.get('ven')),
    subjects: parseList(sp.get('sub')),
    publicationTypes: parseList(sp.get('pt')),
    openAccess: sp.get('oa') === '1',
    minCitations: parsePosInt(sp.get('mc')),
    sort: sortOrder,
  };
}

/** 把 filters 写回 URL —— 与默认值相同的字段直接 delete 让 URL 短一点 */
function encode(sp: URLSearchParams, f: SearchFilters): URLSearchParams {
  const next = new URLSearchParams(sp);
  const setOrDel = (key: string, val: string | undefined | null) => {
    if (val == null || val === '') next.delete(key);
    else next.set(key, val);
  };
  setOrDel('src', f.source === DEFAULT_FILTERS.source ? null : f.source);
  setOrDel('tr', f.timeRange === DEFAULT_FILTERS.timeRange ? null : f.timeRange);
  setOrDel(
    'yf',
    f.timeRange === 'custom' && f.yearFrom ? String(f.yearFrom) : null
  );
  setOrDel(
    'yt',
    f.timeRange === 'custom' && f.yearTo ? String(f.yearTo) : null
  );
  setOrDel('ven', f.venues.length ? f.venues.join(',') : null);
  setOrDel('sub', f.subjects.length ? f.subjects.join(',') : null);
  setOrDel(
    'pt',
    f.publicationTypes.length ? f.publicationTypes.join(',') : null
  );
  setOrDel('oa', f.openAccess ? '1' : null);
  setOrDel('mc', f.minCitations ? String(f.minCitations) : null);
  setOrDel('s', f.sort === DEFAULT_FILTERS.sort ? null : f.sort);
  return next;
}

export function useUrlFilters(): [SearchFilters, (next: SearchFilters) => void] {
  const [params, setParams] = useSearchParams();

  // useMemo 让 SearchSidebar 等 memo 化子组件不会因为 params 引用变就重渲
  // 仅在 *实际* 参数值变化时才返回新对象引用
  const filters = useMemo(() => decode(params), [params]);

  const setFilters = useCallback(
    (next: SearchFilters) => {
      setParams((prev) => encode(prev, next), { replace: false });
    },
    [setParams]
  );

  return [filters, setFilters];
}
