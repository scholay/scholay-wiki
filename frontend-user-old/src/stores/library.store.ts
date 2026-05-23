/**
 * ============================================================================
 * Library Store —— 全局缓存"哪些论文已收藏"
 * ----------------------------------------------------------------------------
 * 设计目标：
 *   - 搜索结果页/矩阵视图/论文详情等多个地方都要显示"已收藏"图标
 *   - 同一篇论文可能从两个源加入，状态按 (source, source_paper_id) 区分
 *   - 列表渲染时一批查（libraryAPI.check），后续单点 add/remove 同步更新
 * ============================================================================
 */
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  libraryAPI,
  type LibrarySource,
  type LibraryPaper,
  type AddLibraryPayload,
} from '../services/library.api';

const cacheKey = (source: LibrarySource, paperId: string) => `${source}:${paperId}`;

interface LibraryState {
  /** (source:paperId) → 是否已收藏 */
  saved: Record<string, boolean>;
  /** 正在写入的 key —— 用于 UI 上的 loading 状态 */
  pending: Record<string, boolean>;
  /** 库总数（用于抽屉里的 "默认收藏 · N 篇" 角标） */
  totalCount: number | null;

  setSavedBulk: (source: LibrarySource, map: Record<string, boolean>) => void;
  hasSaved: (source: LibrarySource, paperId: string) => boolean;
  isPending: (source: LibrarySource, paperId: string) => boolean;

  add: (source: LibrarySource, paperId: string, payload: AddLibraryPayload) => Promise<boolean>;
  remove: (source: LibrarySource, paperId: string) => Promise<boolean>;

  refreshTotal: () => Promise<void>;
  fetchPage: (source?: LibrarySource, page?: number, pageSize?: number) => Promise<{ items: LibraryPaper[]; total: number }>;
  checkBatch: (source: LibrarySource, paperIds: string[]) => Promise<void>;

  /** 登出时清空 */
  reset: () => void;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  saved: {},
  pending: {},
  totalCount: null,

  hasSaved: (source, paperId) => !!get().saved[cacheKey(source, paperId)],
  isPending: (source, paperId) => !!get().pending[cacheKey(source, paperId)],

  setSavedBulk: (source, map) => {
    set((s) => {
      const next = { ...s.saved };
      for (const [pid, ok] of Object.entries(map)) {
        next[cacheKey(source, pid)] = !!ok;
      }
      return { saved: next };
    });
  },

  add: async (source, paperId, payload) => {
    const key = cacheKey(source, paperId);
    if (get().pending[key]) return false;
    set((s) => ({ pending: { ...s.pending, [key]: true } }));
    try {
      const res = await libraryAPI.add(payload);
      const ok = res.data?.code === 0;
      if (ok) {
        set((s) => ({
          saved: { ...s.saved, [key]: true },
          totalCount: s.totalCount === null ? null : s.totalCount + 1,
        }));
      }
      return ok;
    } catch {
      return false;
    } finally {
      set((s) => {
        const next = { ...s.pending };
        delete next[key];
        return { pending: next };
      });
    }
  },

  remove: async (source, paperId) => {
    const key = cacheKey(source, paperId);
    if (get().pending[key]) return false;
    set((s) => ({ pending: { ...s.pending, [key]: true } }));
    try {
      const res = await libraryAPI.remove(source, paperId);
      const ok = res.data?.code === 0;
      if (ok) {
        set((s) => ({
          saved: { ...s.saved, [key]: false },
          totalCount: s.totalCount === null ? null : Math.max(0, s.totalCount - 1),
        }));
      }
      return ok;
    } catch {
      return false;
    } finally {
      set((s) => {
        const next = { ...s.pending };
        delete next[key];
        return { pending: next };
      });
    }
  },

  refreshTotal: async () => {
    try {
      // 只取第 1 页 1 条，目的拿 total
      const res = await libraryAPI.list({ page: 1, page_size: 1 });
      if (res.data?.code === 0) {
        set({ totalCount: res.data.data.total });
      }
    } catch {
      // 忽略
    }
  },

  fetchPage: async (source, page = 1, pageSize = 50) => {
    const res = await libraryAPI.list({ source, page, page_size: pageSize });
    if (res.data?.code !== 0) return { items: [], total: 0 };
    const { items, total } = res.data.data;
    // 顺便回填 saved cache
    if (source) {
      const map: Record<string, boolean> = {};
      items.forEach((p) => { map[p.source_paper_id] = true; });
      get().setSavedBulk(source, map);
    } else {
      // 混源场景下分别写入
      const bySource: Record<string, Record<string, boolean>> = {};
      items.forEach((p) => {
        bySource[p.source] ||= {};
        bySource[p.source][p.source_paper_id] = true;
      });
      Object.entries(bySource).forEach(([src, map]) =>
        get().setSavedBulk(src as LibrarySource, map),
      );
    }
    set({ totalCount: total });
    return { items, total };
  },

  checkBatch: async (source, paperIds) => {
    const need = paperIds.filter((id) => get().saved[cacheKey(source, id)] === undefined);
    if (need.length === 0) return;
    try {
      const res = await libraryAPI.check(source, need);
      if (res.data?.code === 0) {
        get().setSavedBulk(source, res.data.data.saved);
      }
    } catch {
      // 忽略
    }
  },

  reset: () => set({ saved: {}, pending: {}, totalCount: null }),
}));

export const useLibrary = () =>
  useLibraryStore(
    useShallow((s) => ({
      saved: s.saved,
      pending: s.pending,
      totalCount: s.totalCount,
      hasSaved: s.hasSaved,
      isPending: s.isPending,
      add: s.add,
      remove: s.remove,
      checkBatch: s.checkBatch,
      refreshTotal: s.refreshTotal,
      fetchPage: s.fetchPage,
      reset: s.reset,
    })),
  );
