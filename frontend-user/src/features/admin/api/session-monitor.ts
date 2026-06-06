import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';

/** 三个 agent 对话 feature(都落 agent_sessions);审稿是报告/记录,另走 peer-review 数据。 */
export type MonitorFeature = 'smart_search' | 'claw' | 'prism';

export interface AdminSession {
  agentSessionId: string;
  featureKey: string;
  userId: number;
  userEmail: string;
  username: string;
  ownerKind: string | null;
  ownerId: number | null;
  resetCount: number;
  createdAt: string;
  lastAccessedAt: string;
}

export interface AdminSessionListResponse {
  list: AdminSession[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminSessionListParams {
  feature: MonitorFeature;
  keyword?: string;
  userId?: number;
  page?: number;
  pageSize?: number;
}

/** 列某 feature 下用户的 agent 会话(管理端监控)。 */
export function useAdminSessions(params: AdminSessionListParams) {
  return useQuery({
    queryKey: ['admin', 'agent-sessions', params],
    queryFn: async () => {
      const r = await http.get<{ data: AdminSessionListResponse }>('/admin/agent-sessions', { params });
      return r.data.data;
    },
  });
}

/** agent transcript 原始条目 —— 前端用 shared replayHistoryAsTurns 折成会话渲染(同用户端)。 */
export interface TranscriptEntry {
  id: string;
  type: string;
  content: unknown;
  timestamp?: string;
  isSidechain?: boolean;
}

/** 拉某会话的完整 transcript(只读监控)。会话已清理时返回空数组。 */
export function useAdminTranscript(sessionId: string | null) {
  return useQuery({
    queryKey: ['admin', 'agent-sessions', 'transcript', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const r = await http.get<{ data: { messages: TranscriptEntry[] } }>(
        `/admin/agent-sessions/${sessionId}/messages`,
      );
      return r.data.data.messages ?? [];
    },
  });
}
