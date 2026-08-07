/**
 * 科研绘图(sci_draw)会话 hook。实现在 [makeAgentConversationHook.ts](./makeAgentConversationHook.ts)。
 * 本文件只提供 sci_draw 这一份配置 —— 见工厂文件头「加新 feature 的最小动作」。
 */
import { makeAgentConversationHook } from './makeAgentConversationHook';
import {
  markPendingInitialModel,
  useSciDrawContext,
  useSciDrawHistory,
  useSciDrawSessions,
  useCreateSciDrawSession,
} from '../api/sci-draw-session';
import { useSciDrawSocket } from '../api/socket';
import { useSciDrawArtifacts } from '../api/artifacts';

/* ⛔ 2026-08-07 删除 `sciDrawSessionFileUrl` —— 理由见
 * [useClawConversation.ts](./useClawConversation.ts) 同位置的整段说明
 * (零 import + 指向后端从未注册的路由 + 取回 URL 只应有一个生成点)。 */

export const useSciDrawConversation = makeAgentConversationHook({
  feature: 'sci_draw',
  useSessions: useSciDrawSessions,
  useHistory: useSciDrawHistory,
  useContext: useSciDrawContext,
  useCreateSession: useCreateSciDrawSession,
  useSocket: useSciDrawSocket,
  useArtifacts: useSciDrawArtifacts,
  markPendingInitialModel,
});
