import { create } from 'zustand';
import type { ShareTarget } from './ShareSheet';

/**
 * 分享面板的打开状态(feature 内局部 store)——PC 端多个触发点(工具栏分享当前文件夹、
 * 论文行分享单篇)共用一个挂载在 LibraryPage 的 ShareSheet,避免逐层 prop drilling。
 * 移动端各页用本地 state 直接挂 ShareSheet,不依赖本 store。
 */
interface ShareSheetState {
  target: ShareTarget | null;
  openShare: (t: ShareTarget) => void;
  closeShare: () => void;
}

export const useShareSheetStore = create<ShareSheetState>((set) => ({
  target: null,
  openShare: (t) => set({ target: t }),
  closeShare: () => set({ target: null }),
}));
