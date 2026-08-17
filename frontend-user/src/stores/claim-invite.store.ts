import { create } from 'zustand';

export type ClaimInviteScene = 'fill' | 'promote' | 'get';

interface ClaimInviteState {
  open: boolean;
  scene: ClaimInviteScene;
  openClaim: (scene?: ClaimInviteScene) => void;
  setScene: (scene: ClaimInviteScene) => void;
  closeClaim: () => void;
}

/** 顶栏邀请入口弹窗：填写 / 推广有好礼 / 获取邀请码 三种场景。 */
export const useClaimInvite = create<ClaimInviteState>((set) => ({
  open: false,
  scene: 'fill',
  openClaim: (scene = 'fill') => set({ open: true, scene }),
  setScene: (scene) => set({ scene }),
  closeClaim: () => set({ open: false }),
}));
