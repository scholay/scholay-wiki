// agent 多会话 CRUD 的 react-query hooks 工厂 —— claw / smart-search 共用。
//
// mirrors backend/internal/agentbridge/bridge.go SessionListItem
//        + internal/agentbridge/http_handler.go 多会话端点 (ListSessions/CreateNewSession/
//          RenameSession/DeleteSession/ActivateSession)
//
// 两个 feature 的会话 CRUD 只差两点:(1) 端点基址 /user/claw vs /user/smart-search,
// (2) queryKey 根 ['claw'] vs ['smart-search']。makeAgentSessionApi 把这两点参数化,产出 5 个
// react-query hook,供各 feature 的 api/*.ts 起别名再导出(与 shared/api/agent-attach 同型:
// 端点参数化、feature 只做薄封装、调用方零改动)。
//
// history / context / ws-ticket 不在这里 —— 它们各带 feature 专属的历史回放类型与 ?session_id=
// 拼装,留在各 feature 的 api/*.ts。

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';

/** 单条 session 元数据 —— 跟 backend agentbridge.SessionListItem 对齐。 */
export interface AgentSessionItem {
  sessionId: string;
  /** agent 端自管的标题(首条消息后自动生成,或用户改名)。 */
  title: string;
  /** 该会话总消息数(含 user/assistant/tool_use/tool_result)。 */
  messageCount: number;
  /** backend DB 的 last_accessed_at,列表按此 DESC 排。 */
  lastAccessedAt: string;
  createdAt: string;
  agentCreatedAt?: string;
  agentModifiedAt?: string;
}

export interface AgentSessionEnvelope {
  sessionId: string;
}

interface ListSessionsResponse {
  items: AgentSessionItem[];
  total: number;
}

function unwrap<T>(raw: { data?: T } & Partial<T>): T {
  return (raw.data as T) ?? (raw as unknown as T);
}

export interface AgentSessionApiConfig {
  /** queryKey 根 + 失效前缀,如 'claw' / 'smart-search'。**必须**与该 feature 的 history/context queryKey 根一致,否则 create/delete/activate 的 [feature] 顶级失效刷不到历史。 */
  feature: string;
  /** 端点基址,如 '/user/claw' / '/user/smart-search'。 */
  basePath: string;
}

/** makeAgentSessionApi 产出的 5 个 hook。 */
export interface AgentSessionApi {
  /** 列出当前用户在本 feature 的全部会话(last_accessed_at DESC)。 */
  useSessions: () => UseQueryResult<AgentSessionItem[]>;
  /** 「新对话」—— 新建会话,不删任何已有会话(与 reset 的「删旧+建新」语义不同)。 */
  useCreateSession: () => UseMutationResult<AgentSessionEnvelope, Error, void>;
  /** 重命名某会话(透传 agent + touch last_accessed_at)。 */
  useRenameSession: () => UseMutationResult<void, Error, { sessionId: string; title: string }>;
  /** 删除某会话(agent jsonl + DB mapping)。 */
  useDeleteSession: () => UseMutationResult<void, Error, string>;
  /** 「切换到这个会话」—— 把 last_accessed_at 设为 NOW(),sessionId 变化 → WS 自动重连。 */
  useActivateSession: () => UseMutationResult<void, Error, string>;
}

/**
 * 构造某 feature 的多会话 API。在各 feature 的 api/*.ts **模块作用域**调用一次,
 * 返回的 hook 引用稳定(满足 React hooks 规则),再起 feature 命名的别名导出。
 */
export function makeAgentSessionApi({ feature, basePath }: AgentSessionApiConfig): AgentSessionApi {
  const useSessions = (): UseQueryResult<AgentSessionItem[]> => {
    const token = useAuthStore((s) => s.token);
    return useQuery<AgentSessionItem[]>({
      queryKey: [feature, 'sessions'],
      enabled: !!token,
      staleTime: 30 * 1000,
      // 每次重挂载无条件重拉 —— 修「最新会话从列表消失、要退登才出现」:列表缓存可能被定格成
      // 「创建该会话之前的旧快照」并在 30s staleTime 窗内标记 fresh,仅靠 staleTime 的重挂载不会
      // 重拉(refetchOnMount 默认只在 stale 时刷)。加这行让任意重挂载强制核对,根除卡死。
      refetchOnMount: 'always',
      queryFn: async () => {
        try {
          const { data } = await http.get<
            { data?: ListSessionsResponse } & Partial<ListSessionsResponse>
          >(`${basePath}/sessions`);
          const payload = unwrap<ListSessionsResponse>(data);
          return payload?.items ?? [];
        } catch (err) {
          throw toApiError(err);
        }
      },
    });
  };

  const useCreateSession = (): UseMutationResult<AgentSessionEnvelope, Error, void> => {
    const qc = useQueryClient();
    return useMutation<AgentSessionEnvelope, Error, void>({
      mutationFn: async () => {
        try {
          const { data } = await http.post<
            { data?: AgentSessionEnvelope } & Partial<AgentSessionEnvelope>
          >(`${basePath}/sessions`, {});
          const payload = unwrap<AgentSessionEnvelope>(data);
          if (!payload?.sessionId) throw new Error('后端未返回 sessionId');
          return payload;
        } catch (err) {
          throw toApiError(err);
        }
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: [feature] });
      },
    });
  };

  const useRenameSession = (): UseMutationResult<void, Error, { sessionId: string; title: string }> => {
    const qc = useQueryClient();
    return useMutation<void, Error, { sessionId: string; title: string }>({
      mutationFn: async ({ sessionId, title }) => {
        try {
          await http.patch(`${basePath}/sessions/${sessionId}`, { title });
        } catch (err) {
          throw toApiError(err);
        }
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: [feature, 'sessions'] });
      },
    });
  };

  const useDeleteSession = (): UseMutationResult<void, Error, string> => {
    const qc = useQueryClient();
    return useMutation<void, Error, string>({
      mutationFn: async (sessionId) => {
        try {
          await http.delete(`${basePath}/sessions/${sessionId}`);
        } catch (err) {
          throw toApiError(err);
        }
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: [feature] });
      },
    });
  };

  const useActivateSession = (): UseMutationResult<void, Error, string> => {
    const qc = useQueryClient();
    return useMutation<void, Error, string>({
      mutationFn: async (sessionId) => {
        try {
          await http.post(`${basePath}/sessions/${sessionId}/activate`, {});
        } catch (err) {
          throw toApiError(err);
        }
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: [feature] });
      },
    });
  };

  return { useSessions, useCreateSession, useRenameSession, useDeleteSession, useActivateSession };
}
