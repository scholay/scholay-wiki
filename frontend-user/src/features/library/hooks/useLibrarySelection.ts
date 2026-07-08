import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserLibraryPaper } from '@/shared/api/types';
import type { LibraryFolderFilter } from '../api/papers';

/**
 * 文献集列表的多选状态 —— 由 LibraryFolderView 持有,既给 LibraryPaperList 渲染行,
 * 也给外层 toolbar 决定是否切换成批量操作模式。
 *
 *   - Set<paperId> + anchor index 用于 shift+click 范围选
 *   - 切换 filter(文件夹)自动清空,避免 stale 选项跨文件夹
 *   - liveSelected:过滤掉已不在当前 papers 中的 stale id
 */
export interface LibrarySelectionApi {
  selected: Set<number>;
  someSelected: boolean;
  allSelected: boolean;
  selectedIds: number[];
  toggle: (paperId: number, idx: number, shift: boolean) => void;
  toggleAll: () => void;
  clear: () => void;
}

export function useLibrarySelection(
  papers: UserLibraryPaper[],
  filter: LibraryFolderFilter
): LibrarySelectionApi {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [anchorIdx, setAnchorIdx] = useState<number | null>(null);

  // 切 filter → 选区重置
  useEffect(() => {
    setSelected(new Set());
    setAnchorIdx(null);
  }, [filter]);

  // 翻页 / 搜索 → 当前页论文整体换了一批,shift 锚点必须重置:否则残留的旧页
  // index 会以新页行序套用,范围选与用户预期不符(选择本身是「仅当前页」语义,
  // liveSelected 已按新页过滤,这里只补齐 anchor)。用首行 id + 页长作页身份指纹,
  // 同页 refetch(enrichment 等)指纹不变,不误重置。
  const pageKey = papers.length ? `${papers[0].id}:${papers.length}` : '';
  useEffect(() => {
    setAnchorIdx(null);
  }, [pageKey]);

  // 过滤 stale id(论文已被删等)
  const liveSelected = useMemo(() => {
    if (selected.size === 0) return selected;
    const ids = new Set(papers.map((p) => p.id));
    const next = new Set<number>();
    for (const id of selected) if (ids.has(id)) next.add(id);
    return next;
  }, [selected, papers]);

  // selected 与 live 不一致时同步纠正
  useEffect(() => {
    if (liveSelected.size !== selected.size) setSelected(liveSelected);
  }, [liveSelected, selected.size]);

  const allSelected =
    papers.length > 0 && papers.every((p) => liveSelected.has(p.id));
  const someSelected = liveSelected.size > 0;

  const toggle = useCallback(
    (paperId: number, idx: number, shift: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (shift && anchorIdx != null) {
          const [lo, hi] =
            anchorIdx < idx ? [anchorIdx, idx] : [idx, anchorIdx];
          const willSelect = !next.has(paperId);
          for (let i = lo; i <= hi; i++) {
            const p = papers[i];
            if (!p) continue;
            if (willSelect) next.add(p.id);
            else next.delete(p.id);
          }
        } else {
          if (next.has(paperId)) next.delete(paperId);
          else next.add(paperId);
        }
        return next;
      });
      setAnchorIdx(idx);
    },
    [anchorIdx, papers]
  );

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(papers.map((p) => p.id)));
    setAnchorIdx(null);
  }, [allSelected, papers]);

  const clear = useCallback(() => {
    setSelected(new Set());
    setAnchorIdx(null);
  }, []);

  const selectedIds = useMemo(() => Array.from(liveSelected), [liveSelected]);

  return {
    selected: liveSelected,
    someSelected,
    allSelected,
    selectedIds,
    toggle,
    toggleAll,
    clear,
  };
}
