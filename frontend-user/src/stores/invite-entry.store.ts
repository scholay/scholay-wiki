import { create } from 'zustand';

interface InviteEntryState {
  open: boolean;
  openInvite: () => void;
  closeInvite: () => void;
}

/**
 * 全站“邀请有礼”入口的单一弹窗状态。
 * 弹窗内部根据当前登录态决定展示活动说明还是分享方式。
 */
export const useInviteEntry = create<InviteEntryState>((set) => ({
  open: false,
  openInvite: () => set({ open: true }),
  closeInvite: () => set({ open: false }),
}));
