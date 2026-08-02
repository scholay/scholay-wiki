// 额度通知客户端状态:重置弹窗开关 + 关闭冷却 + 当周期已提醒阈值(过半/将尽,每级每周期只弹一次)。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** 弹窗关闭后的冷却窗口:期间再来同类 6010 只轻 toast 不重弹(免同一动作连环炸弹窗)。 */
export const QUOTA_DIALOG_SNOOZE_MS = 60_000;

interface QuotaState {
  resetOpen: boolean;
  /**
   * 最近一次关闭弹窗的时间戳(ms)。QuotaNotifier 据此实现 60s 冷却;PromoModal 据此在
   * 额度弹窗刚关掉时不叠加营销弹窗。刻意**不持久化**(冷却是会话内行为,跨刷新应重置)。
   */
  dismissedAt: number;
  openReset: () => void;
  closeReset: () => void;
  /** 当周期已提醒到的等级:0 未提醒 / 1 过半 / 2 将尽。warnDay = 周期锚(window_started_at)。 */
  warnDay: string;
  warnLevel: number;
  markWarn: (day: string, level: number) => void;
}

export const useQuotaStore = create<QuotaState>()(
  persist(
    (set) => ({
      resetOpen: false,
      dismissedAt: 0,
      openReset: () => set({ resetOpen: true }),
      closeReset: () => set({ resetOpen: false, dismissedAt: Date.now() }),
      warnDay: '',
      warnLevel: 0,
      markWarn: (warnDay, warnLevel) => set({ warnDay, warnLevel }),
    }),
    {
      // 只持久化阈值提醒去重(warnDay/warnLevel)—— 修「刷新一次页面,过半/将尽 toastr 重弹」。
      // key 带 scholay 前缀与版本号,避免与其他站点/未来结构变更撞车。
      name: 'scholay:quota-warn:v1',
      partialize: (s) => ({ warnDay: s.warnDay, warnLevel: s.warnLevel }),
    },
  ),
);
