import { create } from 'zustand';
import { DEFAULT_FILTERS, type SearchFilters } from '@/shared/lib/search-filters';

/** 搜索对象 —— 跟随触发时所在的 feed tab:论文 tab 搜论文,期刊 tab 搜期刊。 */
export type MobileSearchMode = 'papers' | 'journals';

interface MobileSearchState {
  open: boolean;
  /** 搜索对象(由打开时的 feed tab 决定)。 */
  mode: MobileSearchMode;
  /** 输入框文本(在 store 里以便跨「进详情→返回」保留)。 */
  input: string;
  /** 已提交的查询词(驱动结果)。 */
  query: string;
  /** 当前筛选(进 queryKey,跨返回保留以命中同一份缓存)。 */
  filters: SearchFilters;
  /** 进详情前存的结果列表滚动位置,返回时恢复。 */
  scrollTop: number;
  /** true = 从详情返回的「恢复」态:复原滚动 + 不自动弹键盘。 */
  resume: boolean;

  /** Feed 顶栏搜索 icon:全新打开(指定搜索对象 + 清空上次查询/滚动,弹键盘)。 */
  openSearch: (mode: MobileSearchMode) => void;
  /** 关闭浮层(X / 点蒙层)。 */
  closeSearch: () => void;
  /** 点结果进详情前:存滚动位置 + 标记 resume,**保持 open=true**,返回 feed 时浮层自动复原。 */
  suspendForDetail: (scrollTop: number) => void;

  setInput: (v: string) => void;
  setQuery: (v: string) => void;
  setFilters: (f: SearchFilters) => void;
}

/**
 * 移动端「悬浮搜索」状态 —— 状态放 store 而非组件,是因为搜索浮层(在 MobileShell /m/feed)
 * 与论文详情(在 AppShell /paper/*)分属两套 shell:点结果进详情会**整体卸载** MobileShell + 浮层,
 * 组件内 useState 会丢。放 store 后:进详情用 suspendForDetail 保留 open + 查询 + 滚动,
 * 返回 feed 时 MobileShell 重挂、浮层据 store 复原结果与滚动条位置(详情→返回 = 回到搜索结果原位)。
 */
export const useMobileSearchOverlay = create<MobileSearchState>((set) => ({
  open: false,
  mode: 'papers',
  input: '',
  query: '',
  filters: DEFAULT_FILTERS,
  scrollTop: 0,
  resume: false,

  openSearch: (mode) =>
    set({ open: true, mode, resume: false, input: '', query: '', scrollTop: 0, filters: DEFAULT_FILTERS }),
  closeSearch: () => set({ open: false }),
  suspendForDetail: (scrollTop) => set({ scrollTop, resume: true }),

  setInput: (v) => set({ input: v }),
  setQuery: (v) => set({ query: v }),
  setFilters: (f) => set({ filters: f }),
}));
