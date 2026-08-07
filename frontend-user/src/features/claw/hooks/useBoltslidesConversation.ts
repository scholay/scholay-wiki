/**
 * 制作PPT(boltslides)会话 hook。实现在 [makeAgentConversationHook.ts](./makeAgentConversationHook.ts)。
 * 本文件只提供 boltslides 这一份配置 —— 见工厂文件头「加新 feature 的最小动作」。
 */
import { makeAgentConversationHook } from './makeAgentConversationHook';
import {
  markPendingInitialModel,
  useBoltslidesContext,
  useBoltslidesHistory,
  useBoltslidesSessions,
  useCreateBoltslidesSession,
} from '../api/boltslides-session';
import { useBoltslidesSocket } from '../api/socket';
import { useBoltslidesArtifacts } from '../api/artifacts';

/* ⛔ 2026-08-07 删除 `boltslidesSessionFileUrl` —— 理由见
 * [useClawConversation.ts](./useClawConversation.ts) 同位置的整段说明。
 * (制作PPT 本就 `enableAttachments:false`,连上传入口都没有,这份导出从来无处可用。) */

export const useBoltslidesConversation = makeAgentConversationHook({
  feature: 'boltslides',
  useSessions: useBoltslidesSessions,
  useHistory: useBoltslidesHistory,
  useContext: useBoltslidesContext,
  useCreateSession: useCreateBoltslidesSession,
  useSocket: useBoltslidesSocket,
  useArtifacts: useBoltslidesArtifacts,
  markPendingInitialModel,
});
