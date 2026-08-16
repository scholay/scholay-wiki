// 「经费不足提醒充值」的全局状态 —— 一次触发,两种形态:
//   · 屏上有对话宿主(claw / smart-search / prism 的输入区已挂 FundsReminderChatNotice)
//     → 在输入框上方吸附一张小卡片;
//   · 其余页面(检索结果 / 文献集 / 设置等,或对话页的空白新对话态)→ 弹全局弹窗
//     (FundsReminderDialog,挂在 providers 层)。
// 分流依据是「宿主注册数」而非路由白名单:对话页尚未展开任何会话时,输入区不在底部,
// 卡片无处可挂,此时弹窗反而是正确形态。
// 内容本身(标题/正文/按钮)按 会员档位 × 经费 × 刷新券 派生,见 FundsReminder。
import { create } from 'zustand';

interface FundsReminderState {
  /** 屏上已挂载的对话底部卡片宿主数(>0 = 当前是有进行中对话的页面)。 */
  hostCount: number;
  registerHost: () => void;
  unregisterHost: () => void;

  /** >0 = 对话底部提醒卡处于激活态(值为触发时间戳,可作 key)。 */
  chatNoticeAt: number;
  dialogOpen: boolean;

  /** 触发一次提醒:有对话宿主 → 消息体;否则 → 弹窗。 */
  trigger: () => void;
  dismissChatNotice: () => void;
  closeDialog: () => void;
}

export const useFundsReminderStore = create<FundsReminderState>()((set, get) => ({
  hostCount: 0,
  registerHost: () => set((s) => ({ hostCount: s.hostCount + 1 })),
  unregisterHost: () => set((s) => ({ hostCount: Math.max(0, s.hostCount - 1) })),

  chatNoticeAt: 0,
  dialogOpen: false,

  trigger: () => {
    if (get().hostCount > 0) set({ chatNoticeAt: Date.now(), dialogOpen: false });
    else set({ dialogOpen: true });
  },
  dismissChatNotice: () => set({ chatNoticeAt: 0 }),
  closeDialog: () => set({ dialogOpen: false }),
}));
