/**
 * 智能助手 / 制作PPT WS 订阅 —— 薄封装,连接状态机收口在 shared/hooks/useAgentSocket。
 *
 * feature 独有仅两处路径(ticket + ws url),故抽 makeAgentSocketHook(basePath) 工厂,
 * claw 与 boltslides 各取一份;协议(ClientMessage/ServerMessage)与一次性初始模型下发全共用。
 */

import { http } from '@/shared/lib/http';
import { useAgentSocket, type AgentWSTicket, type UseAgentSocket } from '@/shared/hooks/useAgentSocket';
import { takeFirstConnectTicket } from '@/shared/lib/agent-first-ticket';
import { takePendingInitialModel } from './session';
import type { ClientMessage, ServerMessage } from './types';

export type UseClawSocket = UseAgentSocket<ServerMessage, ClientMessage>;

/**
 * makeAgentSocketHook —— 按 feature 端点前缀造一份 WS 订阅 hook。
 * basePath 形如 '/user/claw' | '/user/boltslides';ticket=<base>/session/ws-ticket,ws=<base>/ws/:id。
 */
function makeAgentSocketHook(basePath: string, displacedDefaultText: string) {
  async function fetchWSTicket(sessionId?: string | null): Promise<AgentWSTicket> {
    // 首连快路径:建会话/切会话/GET session 的响应里已附带一张一次性 ticket
    //(agent-sessions 工厂与 useClawSession 入栈),命中直接用,省掉这次 POST 的 RTT;
    // 未命中/重连自动走标准 POST 取票。
    const stashed = takeFirstConnectTicket(basePath, sessionId);
    if (stashed) return stashed;
    const url = sessionId
      ? `${basePath}/session/ws-ticket?session_id=${encodeURIComponent(sessionId)}`
      : `${basePath}/session/ws-ticket`;
    const { data } = await http.post<{ data?: AgentWSTicket } & Partial<AgentWSTicket>>(url, {});
    const payload = (data.data as AgentWSTicket | undefined) ?? (data as unknown as AgentWSTicket);
    if (!payload?.wsToken || !payload?.sessionId) throw new Error('未拿到 wsToken');
    return payload;
  }

  function buildWsUrl(sessionId: string, wsToken: string): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1';
    return `${proto}//${host}${apiBase}${basePath}/ws/${sessionId}?ws_token=${encodeURIComponent(wsToken)}`;
  }

  return function useAgentFeatureSocket(sessionId: string | null): UseClawSocket {
    return useAgentSocket<ServerMessage, ClientMessage>({
      connectionKey: sessionId,
      fetchTicket: () => fetchWSTicket(sessionId),
      buildWsUrl,
      displacedDefaultText,
      onOpen: (ws) => {
        // per-session 模型真源在服务端(pinned_model);唯一例外 = 新对话偏好的一次性下发(取走即弃)。
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
  };
}

export const useClawSocket = makeAgentSocketHook('/user/claw', '此会话已在其他窗口打开');
export const useBoltslidesSocket = makeAgentSocketHook('/user/boltslides', '此演示稿已在其他窗口打开');
export const useSciDrawSocket = makeAgentSocketHook('/user/sci_draw', '此绘图会话已在其他窗口打开');
export const useStatLabSocket = makeAgentSocketHook('/user/stat_lab', '此分析会话已在其他窗口打开');
