import { create } from 'zustand';
import type { ShareTarget } from '@/shared/api/types';

interface ShareState {
  target: ShareTarget | null;
  /** 打开分享面板(论文 single / 期刊 journal / 文献集 collection 通用)。 */
  openShare: (target: ShareTarget) => void;
  closeShare: () => void;
}

/**
 * 全局分享面板开关 —— 移动端论文/期刊/文献集的「分享」按钮统一走这里:
 *   useShareSheet.getState().openShare({ kind: 'single', paper })
 *   useShareSheet.getState().openShare({ kind: 'journal', journal })
 * 由 MobileShell 挂一份 <ShareSheet>,任何卡片/详情触发即弹同一套「多方式分享」(海报/二维码/链接/口令),
 * 取代之前 feed/详情各自的 navigator.share 裸链分享(交互不一致)。
 */
export const useShareSheet = create<ShareState>((set) => ({
  target: null,
  openShare: (target) => set({ target }),
  closeShare: () => set({ target: null }),
}));
