import { create } from 'zustand';
import type { Paper } from '@/shared/api/types';
import { useSmartSearchSessionStore } from '@/stores/smart-search-session.store';

export interface PdfChatBootstrap {
  paperId: string;
  paperTitle: string;
  openerText: string;
}

interface PdfChatBridgeState {
  /** 已为哪篇论文进入 PDF 对话(蒙层消失) */
  engagedPaperId: string | null;
  /** 待 SmartSearchPanel 消费:新会话 + 发开场白 */
  pendingBootstrap: PdfChatBootstrap | null;
  requestSmartMode: (() => void) | null;
  registerSmartModeRequest: (fn: (() => void) | null) => void;
  beginPdfChat: (paper: Paper) => void;
  clearEngagement: () => void;
  consumeBootstrap: () => PdfChatBootstrap | null;
}

function buildPdfChatOpener(paper: Paper): string {
  const title = paper.title?.trim() || '这篇论文';
  return `我想针对当前 PDF 进行对话,请帮我阅读并分析：《${title}》。先概括核心贡献,并指出值得深入讨论的方法与实验部分。`;
}

export const usePdfChatBridge = create<PdfChatBridgeState>((set, get) => ({
  engagedPaperId: null,
  pendingBootstrap: null,
  requestSmartMode: null,

  registerSmartModeRequest: (fn) => set({ requestSmartMode: fn }),

  beginPdfChat: (paper) => {
    useSmartSearchSessionStore.getState().setActiveSessionId(null);
    get().requestSmartMode?.();
    set({
      engagedPaperId: paper.paperId,
      pendingBootstrap: {
        paperId: paper.paperId,
        paperTitle: paper.title ?? '',
        openerText: buildPdfChatOpener(paper),
      },
    });
  },

  clearEngagement: () =>
    set({ engagedPaperId: null, pendingBootstrap: null }),

  consumeBootstrap: () => {
    const cur = get().pendingBootstrap;
    if (cur) set({ pendingBootstrap: null });
    return cur;
  },
}));
