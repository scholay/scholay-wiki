/**
 * 智能助手 WS 订阅 —— 薄封装,连接状态机收口在 shared/hooks/useAgentSocket。
 *
 * 本 feature 独有:
 *   - ticket 端点 /user/claw/session/ws-ticket(多会话:带 session_id 让 ticket 绑指定会话)
 *   - WS URL /user/claw/ws/:sessionId
 *   - onOpen 里 push per-session 模型偏好(agent set_runtime_config 不写盘,每次新 WS 都得重发)
 */

import { http } from '@/shared/lib/http';
import { useAgentSocket, type AgentWSTicket, type UseAgentSocket } from '@/shared/hooks/useAgentSocket';
import { takePendingInitialModel } from './session';
import type { ClientMessage, ServerMessage } from './types';

// fetchWSTicket — 多会话场景下 sessionId 是必填:前端已从 useClawSession 拿到 activeSessionId,
// 显式带给后端让 ticket 签给指定 session(而不是 latest active)。不传时退化为给 latest 签。
async function fetchWSTicket(sessionId?: string | null): Promise<AgentWSTicket> {
  const url = sessionId
    ? `/user/claw/session/ws-ticket?session_id=${encodeURIComponent(sessionId)}`
    : '/user/claw/session/ws-ticket';
  const { data } = await http.post<{ data?: AgentWSTicket } & Partial<AgentWSTicket>>(url, {});
  const payload = (data.data as AgentWSTicket | undefined) ?? (data as unknown as AgentWSTicket);
  if (!payload?.wsToken || !payload?.sessionId) throw new Error('未拿到 wsToken');
  return payload;
}

function buildWsUrl(sessionId: string, wsToken: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  return `${proto}//${host}${base}/user/claw/ws/${sessionId}?ws_token=${encodeURIComponent(wsToken)}`;
}

export type UseClawSocket = UseAgentSocket<ServerMessage, ClientMessage>;

export function useClawSocket(sessionId: string | null): UseClawSocket {
  return useAgentSocket<ServerMessage, ClientMessage>({
    connectionKey: sessionId,
    fetchTicket: () => fetchWSTicket(sessionId),
    buildWsUrl,
    displacedDefaultText: '此会话已在其他窗口打开',
    onOpen: (ws) => {
      // P2:per-session 模型真源在服务端(pinned_model,hub 建连自动下发),不再每次重发。
      // 唯一例外 = 新对话偏好的**一次性**下发:会话刚建成、服务端还没有 pin,把用户在
      // 新对话里选的模型发一帧(hub 校验落库),之后由服务端接管(取走即弃,不会重复)。
      const initialModel = takePendingInitialModel(sessionId);
      if (initialModel) {
        ws.send(
          JSON.stringify({
            type: 'set_runtime_config',
            providerId: null,
            modelId: initialModel,
          } satisfies ClientMessage),
        );
      }
    },
  });
}
