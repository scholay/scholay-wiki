import {
  SUBJECT_OPTIONS,
  TYPE_OPTIONS,
  sourceSupports,
  subjectsForSource,
  typesForSource,
  type SearchFilters,
} from '../../types';
import { timeRangeLabel } from './primitives';

export interface FilterChip {
  key: string;
  label: string;
  remove: () => void;
}

/**
 * 从 filters 派生当前"活跃"chip 列表 —— 供顶部 chip 条渲染。
 * `patch` / `toggleInList` 由 SearchSidebar 注入(SearchFilters 是 prop-driven)。
 *
 * 注:`prune` 已剪过无效项,但本函数对 chips 显隐再做一道 source 兼容守门
 * (subjects / types / openAccess / minCitations 不被当前源支持就跳过),
 * 是 defensive 二保。
 */
export function buildFilterChips({
  filters,
  patch,
  toggleInList,
}: {
  filters: SearchFilters;
  patch: <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) => void;
  toggleInList: (
    k: 'venues' | 'subjects' | 'publicationTypes',
    id: string
  ) => void;
}): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.timeRange !== 'all') {
    chips.push({
      key: 'time',
      label: timeRangeLabel(filters.timeRange),
      remove: () => patch('timeRange', 'all'),
    });
  }

  for (const v of filters.venues) {
    chips.push({
      key: `v-${v}`,
      label: v,
      remove: () => toggleInList('venues', v),
    });
  }

  if (subjectsForSource(filters.source).length > 0) {
    for (const s of filters.subjects) {
      chips.push({
        key: `s-${s}`,
        label: SUBJECT_OPTIONS.find((o) => o.value === s)?.label ?? s,
        remove: () => toggleInList('subjects', s),
      });
    }
  }

  if (typesForSource(filters.source).length > 0) {
    for (const t of filters.publicationTypes) {
      chips.push({
        key: `t-${t}`,
        label: TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t,
        remove: () => toggleInList('publicationTypes', t),
      });
    }
  }

  if (sourceSupports(filters.source, 'openAccess') && filters.openAccess) {
    chips.push({
      key: 'oa',
      label: '开放获取',
      remove: () => patch('openAccess', false),
    });
  }

  if (
    sourceSupports(filters.source, 'minCitations') &&
    filters.minCitations != null &&
    filters.minCitations > 0
  ) {
    chips.push({
      key: 'cite',
      label: `≥ ${filters.minCitations} 引用`,
      remove: () => patch('minCitations', undefined),
    });
  }

  return chips;
}
