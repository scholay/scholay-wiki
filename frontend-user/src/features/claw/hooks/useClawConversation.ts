/**
 * 智能助手(claw)会话 hook —— 桌面 ClawPage 与移动端 MobileClawPage 共用。
 *
 * 🔴 **实现在 [makeAgentConversationHook.ts](./makeAgentConversationHook.ts),不在这里。**
 * 本文件只提供 claw 这一份配置。改状态机行为请改工厂 —— 那里的注释是三个 feature 的唯一权威副本
 * (2026-08-05 之前这里是 867 行、与 boltslides/sci_draw 互为逐行副本,踩坑注释在复制中逐份衰减)。
 */
import { makeAgentConversationHook } from './makeAgentConversationHook';
import {
  markPendingInitialModel,
  useClawContext,
  useClawHistory,
  useClawSessions,
  useCreateClawSession,
} from '../api/session';
import { useClawSocket } from '../api/socket';
import { useClawArtifacts } from '../api/artifacts';

/* ⛔ 2026-08-07 删除 `clawSessionFileUrl`(以及 stat_lab / sci_draw / boltslides 三份同款)。
 *
 * 它们拼的是**老的** per-feature 取图代理 `/user/<feature>/session/file`,而附件耐久化(0112)
 * 之后正确的取回 URL 是统一端点 `/user/attachment/:uuid` + `?fb=<老代理>` 回落 ——
 * 那一份实现在 [makeAgentConversationHook.ts](./makeAgentConversationHook.ts) 的 `sessionFileUrl`,
 * 经 `shared/lib/agent-attachment.ts` 的 `attachmentUrl` 生成。
 *
 * 删而不是转发,三个理由:
 *   ① **零 import**(删除前全仓 grep 确认,只剩两处注释在提它)。hook 工厂化收敛后调用方就没了,
 *      而那句「MessageTurn 等处按具名 import 它」的注释是**假的** —— 保留一个说着假话的导出,
 *      比没有它更危险。
 *   ② 四份里有三份指向**后端从未注册过**的路由(stat_lab / sci_draw / boltslides 的
 *      `session/file` 只有前端在拼),照它用只能得到 404。
 *   ③ 转发壳仍是第二个 URL 生成点。少了 `?fb=` 就是「存量附件全裂」,带上 `?fb=` 就是把
 *      工厂里那段逻辑再抄一遍 —— 正是本仓库反复吃亏的「四份镜像漂移」形状。
 *      取回 URL 从此**只有一个生成点**。
 */

export const useClawConversation = makeAgentConversationHook({
  feature: 'claw',
  useSessions: useClawSessions,
  useHistory: useClawHistory,
  useContext: useClawContext,
  useCreateSession: useCreateClawSession,
  useSocket: useClawSocket,
  useArtifacts: useClawArtifacts,
  markPendingInitialModel,
});
