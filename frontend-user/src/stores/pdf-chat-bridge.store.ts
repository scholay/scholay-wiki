import { create } from 'zustand';
import type { Paper } from '@/shared/api/types';
import type { TurnReference } from '@/shared/types/chat';
import { useSmartSearchSessionStore } from '@/stores/smart-search-session.store';

export interface PdfChatBootstrap {
  paperId: string;
  paperTitle: string;
  /** 展示层短指令(用户气泡里显示的字);投递层会另拼引用块。 */
  openerText: string;
  /** 展示 + 回放共用的引用 chip(经 buildReferenceBlock 进入 user_message)。 */
  references: TurnReference[];
}

interface PdfChatBridgeState {
  /**
   * paperId → sessionId:本页生命周期内已为哪些论文开过 PDF 对话。
   * 不随切 tab 清空 —— 同一篇论文再进来显示「继续对话」,回到原会话而不是再建一个。
   */
  engagedSessions: Record<string, string>;
  /** 待 SmartSearchPanel 消费:新会话 + 发开场白 */
  pendingBootstrap: PdfChatBootstrap | null;
  requestSmartMode: (() => void) | null;
  registerSmartModeRequest: (fn: (() => void) | null) => void;
  /** 针对该论文开启全新 PDF 对话(左栏切 smart 模式 + 懒建新会话)。 */
  beginPdfChat: (paper: Paper) => void;
  /** 回到该论文此前的会话;没有记录时退化为 beginPdfChat。 */
  resumePdfChat: (paper: Paper) => void;
  /** SmartSearchPanel 建好会话后回填 paperId → sessionId 映射。 */
  recordEngagedSession: (paperId: string, sessionId: string) => void;
  consumeBootstrap: () => PdfChatBootstrap | null;
}

function buildPdfChatOpener(): string {
  return '请阅读引用的这篇 PDF：先概括核心贡献，再指出值得深入讨论的方法与实验部分。';
}

export const usePdfChatBridge = create<PdfChatBridgeState>((set, get) => ({
  engagedSessions: {},
  pendingBootstrap: null,
  requestSmartMode: null,

  registerSmartModeRequest: (fn) => set({ requestSmartMode: fn }),

  beginPdfChat: (paper) => {
    const title = paper.title?.trim() || '未命名论文';
    useSmartSearchSessionStore.getState().setActiveSessionId(null);
    get().requestSmartMode?.();
    set({
      pendingBootstrap: {
        paperId: paper.paperId,
        paperTitle: title,
        openerText: buildPdfChatOpener(),
        references: [{ kind: 'paper', title, hasPdf: true }],
      },
    });
  },

  resumePdfChat: (paper) => {
    const sessionId = get().engagedSessions[paper.paperId];
    if (!sessionId) {
      get().beginPdfChat(paper);
      return;
    }
    get().requestSmartMode?.();
    useSmartSearchSessionStore.getState().setActiveSessionId(sessionId);
  },

  recordEngagedSession: (paperId, sessionId) =>
    set((s) => ({
      engagedSessions: { ...s.engagedSessions, [paperId]: sessionId },
    })),

  consumeBootstrap: () => {
    const cur = get().pendingBootstrap;
    if (cur) set({ pendingBootstrap: null });
    return cur;
  },
}));
