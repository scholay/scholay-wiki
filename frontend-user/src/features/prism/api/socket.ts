/**
 * Prism (智能写作) agent-native 用户 WS 订阅 —— 薄封装,连接状态机收口在 shared/hooks/useAgentSocket。
 *
 * 本 feature 独有:
 *   - 按 projectId 取 ticket(POST /user/prism/projects/:id/ws-ticket),ticket 回带该项目的 sessionId
 *   - WS URL /user/prism/ws/:sessionId
 *   - 不带附件 / 不做 per-session 模型切换(无 onOpen)
 */

import { http } from '@/shared/lib/http';
import { useAgentSocket, type AgentWSTicket, type UseAgentSocket } from '@/shared/hooks/useAgentSocket';
import type { PrismClientMessage, PrismServerMessage } from './ws-types';

async function fetchWSTicket(projectId: number): Promise<AgentWSTicket> {
  const { data } = await http.post<{ data?: AgentWSTicket } & Partial<AgentWSTicket>>(
    `/user/prism/projects/${projectId}/ws-ticket`,
    {},
  );
  const payload = (data.data as AgentWSTicket | undefined) ?? (data as unknown as AgentWSTicket);
  if (!payload?.wsToken || !payload?.sessionId) throw new Error('未拿到 wsToken');
  return payload;
}

function buildWsUrl(sessionId: string, wsToken: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const base = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  return `${proto}//${host}${base}/user/prism/ws/${sessionId}?ws_token=${encodeURIComponent(wsToken)}`;
}

export type UsePrismSocket = UseAgentSocket<PrismServerMessage, PrismClientMessage>;

// nonce:重开会话(V3-4.6-1)后 +1 → connectionKey 变 → 重新取 ticket(ensureProjectSession 建新会话)
// 并重连;新会话的 seed 即含最新画像/记忆,旧对话史不再占上下文。
export function usePrismSocket(projectId: number | null, nonce = 0): UsePrismSocket {
  return useAgentSocket<PrismServerMessage, PrismClientMessage>({
    connectionKey: projectId ? `${projectId}:${nonce}` : null,
    fetchTicket: () => fetchWSTicket(projectId as number),
    buildWsUrl,
    displacedDefaultText: '此项目已在其他窗口打开',
  });
}
