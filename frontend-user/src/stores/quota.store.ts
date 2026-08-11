// 额度通知客户端状态:重置弹窗开关 + 关闭冷却 + 当周期已提醒阈值(过半/将尽,每级每周期只弹一次)
// + composer 额度条注册(对话位挂了条 → 全局 toast/弹窗让位) + 升级弹窗开关 + 最近一次耗尽载荷。
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QuotaPayload } from '@/shared/lib/quota-events';

/** 弹窗关闭后的冷却窗口:期间再来同类 6010 只轻 toast 不重弹(免同一动作连环炸弹窗)。 */
export const QUOTA_DIALOG_SNOOZE_MS = 60_000;

interface QuotaState {
  /**
   * 最近一次额度提示出现的时间戳(ms)。PromoModal 据此在额度提示刚出现时不叠加营销弹窗。
   * 刻意**不持久化**(冷却是会话内行为,跨刷新应重置)。
   * 🔴 2026-08-12:原「额度耗尽大弹窗」已删除(提示改为 composer 条 / 带按钮 toast),
   *    故 resetOpen/openReset/closeReset 一并移除;此字段改由耗尽信号本身打点。
   */
  dismissedAt: number;
  markQuotaNoticed: () => void;
  /** 当周期已提醒到的等级:0 未提醒 / 1 过半 / 2 将尽。warnDay = 周期锚(window_started_at)。 */
  warnDay: string;
  warnLevel: number;
  markWarn: (day: string, level: number) => void;

  /**
   * 升级会员弹窗(SubscribeDialog,渲染在 QuotaNotifier 内)的全局开关。
   * 2026-08:composer 额度条 / 耗尽 toast 的「升级会员」按钮都要能直接拉起它,
   * 故从 QuotaNotifier 的局部 state 上提到 store(与 resetOpen 同款模式)。
   */
  subscribeOpen: boolean;
  openSubscribe: () => void;
  closeSubscribe: () => void;

  /**
   * 非对话场景(矩阵分析/翻译/审稿)的耗尽 toast 按钮 → 就地拉起确认弹窗,
   * 与对话位额度条同一交互(而不是把用户丢去会员页自己找)。
   * 弹窗本体挂在 QuotaNotifier 宿主(providers 层,Router 之外)。
   */
  confirmResetOpen: boolean;
  confirmPaygOpen: boolean;
  openConfirmReset: () => void;
  closeConfirmReset: () => void;
  openConfirmPayg: () => void;
  closeConfirmPayg: () => void;

  /**
   * composer 额度条注册数(对话位:claw / smart-search / prism)。
   * >0 = 用户正处在有输入框的界面:「快用完」阈值 toast 与 6010 的全局提示都让位给
   * 输入框上方的额度条(同一信息不双发)。blocked 计数 = 有「被拦未发送」消息的条数。
   */
  stripCount: number;
  blockedStripCount: number;
  registerStrip: (blocked: boolean) => void;
  unregisterStrip: (blocked: boolean) => void;

  /**
   * 最近一次 6010/quota_exceeded 的结构化载荷(credit_autopay / credit_balance_positive 等,
   * 见 quota-events.QuotaPayload)。额度条按它出状态按钮;QUOTA_RECOVERED 时清空。
   * 不持久化:跨刷新以 overview 为准。
   */
  lastExceeded: { message?: string; quota?: QuotaPayload; at: number } | null;
  setExceeded: (message?: string, quota?: QuotaPayload) => void;
  clearExceeded: () => void;

  /** 「快用完」额度条的当周期关闭去重(与 warnDay 同口径,持久化)。 */
  stripWarnDismissDay: string;
  dismissStripWarn: (day: string) => void;
}

export const useQuotaStore = create<QuotaState>()(
  persist(
    (set) => ({
      dismissedAt: 0,
      markQuotaNoticed: () => set({ dismissedAt: Date.now() }),
      warnDay: '',
      warnLevel: 0,
      markWarn: (warnDay, warnLevel) => set({ warnDay, warnLevel }),

      subscribeOpen: false,
      openSubscribe: () => set({ subscribeOpen: true }),
      closeSubscribe: () => set({ subscribeOpen: false }),

      confirmResetOpen: false,
      confirmPaygOpen: false,
      openConfirmReset: () => set({ confirmResetOpen: true }),
      closeConfirmReset: () => set({ confirmResetOpen: false }),
      openConfirmPayg: () => set({ confirmPaygOpen: true }),
      closeConfirmPayg: () => set({ confirmPaygOpen: false }),

      stripCount: 0,
      blockedStripCount: 0,
      registerStrip: (blocked) =>
        set((s) => ({
          stripCount: s.stripCount + 1,
          blockedStripCount: s.blockedStripCount + (blocked ? 1 : 0),
        })),
      unregisterStrip: (blocked) =>
        set((s) => ({
          stripCount: Math.max(0, s.stripCount - 1),
          blockedStripCount: Math.max(0, s.blockedStripCount - (blocked ? 1 : 0)),
        })),

      lastExceeded: null,
      setExceeded: (message, quota) => set({ lastExceeded: { message, quota, at: Date.now() } }),
      clearExceeded: () => set({ lastExceeded: null }),

      stripWarnDismissDay: '',
      dismissStripWarn: (stripWarnDismissDay) => set({ stripWarnDismissDay }),
    }),
    {
      // 只持久化「每周期一次」类去重(阈值 toast 等级 + 额度条关闭)——
      // 修「刷新一次页面,提醒重弹」。key 带 scholay 前缀与版本号。
      name: 'scholay:quota-warn:v1',
      partialize: (s) => ({
        warnDay: s.warnDay,
        warnLevel: s.warnLevel,
        stripWarnDismissDay: s.stripWarnDismissDay,
      }),
    },
  ),
);
