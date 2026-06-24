import { create } from 'zustand';

/**
 * 限时领取会员推广弹窗 —— 跨组件客户端开关状态(顶部导航按钮 / 首屏自动 / 额度用尽 都要触发,
 * 弹窗本体挂在全局 providers)。服务端配置走 react-query(usePromoConfig),不进这里。
 *
 * trigger 仅用于区分来源(便于埋点/调试):
 *   - 'auto'   首屏自动弹(每日一次)
 *   - 'quota'  free 用户额度用尽
 *   - 'manual' 用户点顶部导航「限时领取会员」按钮
 */
export type PromoTrigger = 'auto' | 'quota' | 'manual';

interface PromoState {
  open: boolean;
  trigger: PromoTrigger | null;
  openPromo: (trigger: PromoTrigger) => void;
  closePromo: () => void;
}

export const usePromoStore = create<PromoState>((set) => ({
  open: false,
  trigger: null,
  openPromo: (trigger) => set({ open: true, trigger }),
  closePromo: () => set({ open: false, trigger: null }),
}));
