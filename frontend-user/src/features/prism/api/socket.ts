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

// 多对话:带 ?session_id=<当前对话> 签发该对话的 ticket;省略则后端回落当前/新建首条(兼容单会话)。
async function fetchWSTicket(projectId: number, sessionId?: string): Promise<AgentWSTicket> {
  const q = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  const { data } = await http.post<{ data?: AgentWSTicket } & Partial<AgentWSTicket>>(
    `/user/prism/projects/${projectId}/ws-ticket${q}`,
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

// 多对话:connectionKey 含 sessionId —— 切对话(sessionId 变)→ 重新取该对话的 ticket 并重连,
// useAgentSocket 在 connectionKey 变时会清空 messages(旧对话流不残留)。sessionId 为空(存量单会话/
// 全新项目未选定对话)→ 后端 ws-ticket 回落「当前/新建」对话。nonce 保留:强制重连兜底(极少用)。
export function usePrismSocket(projectId: number | null, sessionId?: string, nonce = 0): UsePrismSocket {
  return useAgentSocket<PrismServerMessage, PrismClientMessage>({
    connectionKey: projectId ? `${projectId}:${sessionId ?? ''}:${nonce}` : null,
    fetchTicket: () => fetchWSTicket(projectId as number, sessionId || undefined),
    buildWsUrl,
    displacedDefaultText: '此项目已在其他窗口打开',
  });
}
