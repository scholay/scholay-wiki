import { create } from 'zustand';

/**
 * 「向社区求助补 PDF」的本地挂起态(mock:不落后端)。
 * 提交后同一篇论文的缺 PDF 面板显示「已发布求助 · 等待社区响应」,
 * 页面生命周期内持久 —— 用户切走再回来不会看到表单重置。
 */
interface PdfHelpRequestState {
  /** paperId → 求助记录 */
  requested: Record<string, { note: string; at: number }>;
  submit: (paperId: string, note: string) => void;
}

export const usePdfHelpRequest = create<PdfHelpRequestState>((set) => ({
  requested: {},
  submit: (paperId, note) =>
    set((s) => ({
      requested: {
        ...s.requested,
        [paperId]: { note: note.trim(), at: Date.now() },
      },
    })),
}));
