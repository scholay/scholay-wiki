import { create } from 'zustand';
import type { Paper } from '@/shared/api/types';

/**
 * 「未登录触发动作 → 弹登录 → 登录成功后自动重放」的全局缓冲。
 *
 * 典型场景:用户在搜索结果点 "收藏",未登录 → 我们弹登录,登录完直接帮他把那篇
 * 论文加进文献集,不让用户再点一次。
 *
 * 当前支持的动作类型:
 *   - favorite: 把 paper 加到 folderId(或默认文件夹)
 *
 * 设计要点:
 *   - 只在内存,不持久化 —— 关页面就丢,避免用户多端登录时复活旧动作
 *   - consume() 一次性取出并清空,防止重复触发
 *   - 重放由 `useReplayPendingAction()` 在 AppShell 监听 token 跃迁完成
 */
export type PendingAction =
  | {
      type: 'favorite';
      paper: Paper;
      folderId?: number | null;
    }
  | {
      // 工作区 / 矩阵空态的 "从搜索器一键导入" CTA。未登录点击 → 弹登录 →
      // 登录成功后由 useReplayPendingAction 触发一次提示。当前的"一键导入"
      // 实际还是引导(toast),后续要真正批量入库时直接在 replay 里换实现即可。
      type: 'bulk-import-search';
    };

interface PendingActionState {
  pending: PendingAction | null;
  set: (action: PendingAction) => void;
  consume: () => PendingAction | null;
  clear: () => void;
}

export const usePendingAction = create<PendingActionState>((set, get) => ({
  pending: null,
  set: (action) => set({ pending: action }),
  consume: () => {
    const cur = get().pending;
    if (cur) set({ pending: null });
    return cur;
  },
  clear: () => set({ pending: null }),
}));
