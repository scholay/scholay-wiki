/**
 * 数据分析(stat_lab)会话 hook。实现在 [makeAgentConversationHook.ts](./makeAgentConversationHook.ts)。
 * 本文件只提供 stat_lab 这一份配置 —— 见工厂文件头「加新 feature 的最小动作」。
 *
 * 📌 这是工厂化收敛之后加的**第一张卡**:收敛前它会是第四份 800+ 行的逐行副本,
 *    收敛后是下面这 30 行。那次收敛(2026-08-05)的成本就摊在这里。
 */
import { makeAgentConversationHook } from './makeAgentConversationHook';
import {
  markPendingInitialModel,
  useStatLabContext,
  useStatLabHistory,
  useStatLabSessions,
  useCreateStatLabSession,
} from '../api/stat-lab-session';
import { useStatLabSocket } from '../api/socket';
import { useStatLabArtifacts } from '../api/artifacts';

/* ⛔ 2026-08-07 删除 `statLabSessionFileUrl` —— 理由见
 * [useClawConversation.ts](./useClawConversation.ts) 同位置的整段说明。
 * 这一份尤其没有保留价值:它拼的 `/user/stat_lab/session/file` 后端**从未注册过**,
 * 调用它只能拿到 404(数据分析传图必裂的老根因之一)。 */

export const useStatLabConversation = makeAgentConversationHook({
  feature: 'stat_lab',
  useSessions: useStatLabSessions,
  useHistory: useStatLabHistory,
  useContext: useStatLabContext,
  useCreateSession: useCreateStatLabSession,
  useSocket: useStatLabSocket,
  useArtifacts: useStatLabArtifacts,
  markPendingInitialModel,
});
