import { create } from 'zustand';
import type { Paper } from '@/shared/api/types';

/**
 * 搜索结果当前页可见论文 —— ephemeral store(不持久化,刷新清空)。
 *
 * 用途:让"工作区空态 CTA"("从搜索器一键导入")可以拿到当前页论文做批量暂存,
 * 而不必把 papers 一路 prop 钻穿 SearchPage → MatrixColumn / WelcomeBoard。
 *
 * 数据流:
 *   SearcherColumn 在 papers 变化时 setPapers(由它的 useSearchPapers 派生)
 *   EmptyImportButton 读 papers 即可。
 *   SearcherColumn 卸载 / 切到智能模式 → setPapers([]) 清空。
 */
interface State {
  papers: Paper[];
  setPapers: (papers: Paper[]) => void;
}

export const useSearchVisiblePapers = create<State>((set) => ({
  papers: [],
  setPapers: (papers) => set({ papers }),
}));
