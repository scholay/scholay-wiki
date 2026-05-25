import { useMemo } from 'react';
import { useFavoriteCheck } from '../api/library';
import type { Paper } from '../api/papers';
import type { UpstreamSource } from '@/shared/api/types';

/**
 * 按 source 分组批量查"哪些已收藏",合并成单一 `{source}:{paperId}` Set。
 *
 * 后端 check 端点要求 source + paper_ids,三源分别查、合并;同源内一次请求
 * 拿完一整页,与 SearcherColumn 同模式。
 *
 * Rules of Hooks:固定 3 个 useFavoriteCheck(每个 source 一个),enabled
 * 由空数组自动 false,不会发空请求。返回的 Set 用 "{source}:{paperId}" 形式,
 * 避免跨源 id 冲突。
 */
export function useStagedFavorites(staged: Paper[]): ReadonlySet<string> {
  const idsBySource = useMemo(() => {
    const m: Record<UpstreamSource, string[]> = { stc: [], olx: [], pmd: [] };
    for (const p of staged) {
      const s = (p.source ?? 'stc') as UpstreamSource;
      m[s].push(p.paperId);
    }
    return m;
  }, [staged]);

  const favStcQ = useFavoriteCheck('stc', idsBySource.stc);
  const favOlxQ = useFavoriteCheck('olx', idsBySource.olx);
  const favPmdQ = useFavoriteCheck('pmd', idsBySource.pmd);

  return useMemo(() => {
    const s = new Set<string>();
    favStcQ.data?.forEach((id) => s.add(`stc:${id}`));
    favOlxQ.data?.forEach((id) => s.add(`olx:${id}`));
    favPmdQ.data?.forEach((id) => s.add(`pmd:${id}`));
    return s;
  }, [favStcQ.data, favOlxQ.data, favPmdQ.data]);
}
