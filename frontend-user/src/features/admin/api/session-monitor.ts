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

/** 会话列表自动刷新间隔 —— 监控台是「盯着看会话有没有起来」的场景,
 *  而全局 refetchOnWindowFocus 是关的(query-config.ts),不轮询就只能 F5 整页。 */
const SESSION_POLL_MS = 30_000;

/** 列某 feature 下用户的 agent 会话(管理端监控)。 */
export function useAdminSessions(params: AdminSessionListParams) {
  return useQuery({
    queryKey: ['admin', 'agent-sessions', params],
    queryFn: async () => {
      // 分页参数统一 page_size(架构报告 M3);本地 TS 字段保留 pageSize,只在出网处映射。
      const { pageSize, ...rest } = params;
      const wire = { ...rest, ...(pageSize !== undefined ? { page_size: pageSize } : {}) };
      const r = await http.get<{ data: AdminSessionListResponse }>('/admin/agent-sessions', { params: wire });
      return r.data.data;
    },
    refetchInterval: SESSION_POLL_MS,
    // 页签切到后台时停止轮询(默认行为)—— 后台没人看,别白烧后端查询。
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

/**
 * 拉某会话的完整 transcript(只读监控)。会话已清理时返回**空数组**。
 *
 * 🔴 「空数组」与「请求失败」必须由调用方分开渲染:后端 500 / agent 容器挂 / jsonl 读不到时
 * 这里抛错、data 是 undefined,若调用方 `transcript ?? []` 直接喂给 AdminTranscriptView,
 * 管理员看到的会是一句肯定的业务结论「用户尚未对话」—— 那不是缺信息,是给了假信息。
 * 故本 hook 刻意不吞错误,调用方必须处理 isError。
 */
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
    // 刻意不设 refetchInterval:transcript 弹窗里正在读的长会话被定时整份换掉会打断阅读
    // (滚动位置 / 已展开的处理过程折叠都会跳),增量刷新交给 DialogHeader 上的手动刷新按钮。
  });
}
