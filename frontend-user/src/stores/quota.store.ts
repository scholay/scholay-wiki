// 额度通知客户端状态:重置弹窗开关 + 当日已提醒阈值(过半/将尽,每级每天只弹一次)。
import { create } from 'zustand';

interface QuotaState {
  resetOpen: boolean;
  openReset: () => void;
  closeReset: () => void;
  /** 当日已提醒到的等级:0 未提醒 / 1 过半 / 2 将尽。隔天按 warnDay 重置。 */
  warnDay: string;
  warnLevel: number;
  markWarn: (day: string, level: number) => void;
}

export const useQuotaStore = create<QuotaState>((set) => ({
  resetOpen: false,
  openReset: () => set({ resetOpen: true }),
  closeReset: () => set({ resetOpen: false }),
  warnDay: '',
  warnLevel: 0,
  markWarn: (warnDay, warnLevel) => set({ warnDay, warnLevel }),
}));
