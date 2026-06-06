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
import { getClawSessionModel } from './session';
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
      // 用户为这个 session 选过 model(localStorage)→ WS 打开后立刻 push 给 agent。
      // 必须:agent 的 set_runtime_config 不写盘,每次新 WS(含重连)都得重发,
      // 重连后"模型偏好不丢"也靠这一步。
      if (!sessionId) return;
      const preferredModel = getClawSessionModel(sessionId);
      if (preferredModel) {
        ws.send(
          JSON.stringify({
            type: 'set_runtime_config',
            providerId: null,
            modelId: preferredModel,
          } satisfies ClientMessage),
        );
      }
    },
  });
}
