import { create } from 'zustand';

/**
 * 智能搜索「当前活跃会话」的跨子树协调 store。
 *
 * 为什么要 store 而不是像 claw 那样用本地 useState:
 *   claw 是独立整页(ClawPage 一棵树里同时挂侧边栏 + 聊天 + 新对话按钮),useClawConversation
 *   的本地 activeSessionId 直接 prop 下发即可。而智能搜索是 SearchPage 下的**两个兄弟子树**——
 *   会话列表在 SearchSidebar(页面左栏),聊天在 SmartSearchPanel(SearcherColumn 内),新对话
 *   按钮在 SearcherColumn header。本地 state 无法跨这三处,故用一个极小的 zustand slice 协调。
 *
 * 生命周期:不持久化。SmartSearchPanel 卸载(= 离开 /search)时 reset(),下次进来 activeSessionId=null
 *   → 默认 hero 空态 + 底部会话历史。切会话 / 新对话 / 懒建都只改这里,panel 与 sidebar 都订阅它。
 *
 * busy 由 SmartSearchPanel 每轮同步进来 —— 供 header 的「新对话」按钮做 disabled(回答中不给切)。
 */
interface SmartSearchSessionState {
  /** 当前活跃会话 id;null = 空白「新对话」态(尚未建后端会话)。 */
  activeSessionId: string | null;
  /** 当前会话是否正在生成回答(panel 同步)。 */
  busy: boolean;
  /** 是否已进入对话态(有消息 / 选中历史会话 / 加载中)—— SearchPage 据此切换全宽 hero vs 窄列聊天。 */
  conversationActive: boolean;
  setActiveSessionId: (id: string | null) => void;
  setBusy: (b: boolean) => void;
  setConversationActive: (active: boolean) => void;
  /** panel 卸载时复位(离开 /search),避免陈旧 id 跨页面残留。 */
  reset: () => void;
}

export const useSmartSearchSessionStore = create<SmartSearchSessionState>((set) => ({
  activeSessionId: null,
  busy: false,
  conversationActive: false,
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setBusy: (b) => set({ busy: b }),
  setConversationActive: (active) => set({ conversationActive: active }),
  reset: () => set({ activeSessionId: null, busy: false, conversationActive: false }),
}));
