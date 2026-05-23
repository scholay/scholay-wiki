import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_JOURNAL_FILTERS,
  type JournalFilters,
} from '../types';

/**
 * 期刊筛选器持久化到 URL —— 与 features/search/hooks/useUrlFilters 同款心智:
 * 用户从 /journals/search 进入期刊详情再返回时,returnTo URL 自带筛选,
 * JournalSearchPage 重新挂载完整还原(否则 useState 默认值会清空筛选)。
 *
 * 编码 key(尽量短):
 *   fqbQuartile      → fqb=1|2|3|4
 *   jcrQuartile      → jcr=Q1|Q2|Q3|Q4
 *   minImpactFactor  → if=5|10|20|30
 *   ccfRank          → ccf=A|B|C
 *   publisher        → pub=<string>
 *
 * 默认值(undefined)直接 omit,URL 保持简洁。
 */

const FQB_VALUES = ['1', '2', '3', '4'] as const;
const JCR_VALUES = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const IF_VALUES = [5, 10, 20, 30] as const;
const CCF_VALUES = ['A', 'B', 'C'] as const;

type FqbQ = (typeof FQB_VALUES)[number];
type JcrQ = (typeof JCR_VALUES)[number];
type IfV = (typeof IF_VALUES)[number];
type CcfR = (typeof CCF_VALUES)[number];

function parseEnum<T extends string>(
  v: string | null,
  allowed: readonly T[]
): T | undefined {
  if (!v) return undefined;
  return (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
}

function parseIf(v: string | null): IfV | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return (IF_VALUES as readonly number[]).includes(n) ? (n as IfV) : undefined;
}

function decode(sp: URLSearchParams): JournalFilters {
  const publisher = sp.get('pub')?.trim();
  return {
    fqbQuartile: parseEnum<FqbQ>(sp.get('fqb'), FQB_VALUES),
    jcrQuartile: parseEnum<JcrQ>(sp.get('jcr'), JCR_VALUES),
    minImpactFactor: parseIf(sp.get('if')),
    ccfRank: parseEnum<CcfR>(sp.get('ccf'), CCF_VALUES),
    publisher: publisher || undefined,
  };
}

function encode(sp: URLSearchParams, f: JournalFilters): URLSearchParams {
  const next = new URLSearchParams(sp);
  const setOrDel = (key: string, val: string | undefined | null) => {
    if (val == null || val === '') next.delete(key);
    else next.set(key, val);
  };
  setOrDel('fqb', f.fqbQuartile);
  setOrDel('jcr', f.jcrQuartile);
  setOrDel('if', f.minImpactFactor != null ? String(f.minImpactFactor) : null);
  setOrDel('ccf', f.ccfRank);
  setOrDel('pub', f.publisher);
  return next;
}

export function useJournalUrlFilters(): [
  JournalFilters,
  (next: JournalFilters) => void,
] {
  const [params, setParams] = useSearchParams();

  // useMemo:仅在实际筛选字段变化时返回新对象引用,memo 化的子组件少重渲
  const filters = useMemo(() => decode(params), [params]);

  const setFilters = useCallback(
    (next: JournalFilters) => {
      // 筛选条件变 → 应该回到第 1 页(避免拿了第 N 页但条件已变成第 1 页范围)
      setParams((prev) => {
        const sp = encode(prev, next);
        sp.delete('page');
        return sp;
      });
    },
    [setParams]
  );

  // 保留 DEFAULT_JOURNAL_FILTERS 用于显式 reset(JournalSidebar 可能用到)
  void DEFAULT_JOURNAL_FILTERS;

  return [filters, setFilters];
}
