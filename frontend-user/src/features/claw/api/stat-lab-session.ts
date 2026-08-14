/**
 * 数据分析 (stat_lab) — session / history / context / models 的 react-query hooks。
 * 与 claw/boltslides 同型(见 ./session.ts),仅端点前缀 '/user/stat_lab' + queryKey 根 'stat_lab'。
 *
 * 复用:多会话 CRUD 走 shared makeAgentSessionApi 工厂;WS 见 ./socket.ts useStatLabSocket;
 * 产物见 ./artifacts.ts useStatLabArtifacts;协议类型(ClientMessage/ServerMessage/History/Context)
 * 与 claw 完全一致(同一 agentbridge),直接复用 ./types。
 *
 * localStorage 侧的一次性初始模型 / 未发送消息持久化按 **globally-unique sessionId** 键存,
 * claw / boltslides / stat_lab 天然不撞,故直接复用 ./session 的实现(不另起命名空间)。
 * 「新对话默认模型」偏好本 feature 独立(STAT_LAB_NEW_CONV_MODEL_KEY),各记各的。
 */

import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { makeAgentSessionApi, type AgentSessionItem } from '@/shared/api/agent-sessions';
import { STALE_FRESH } from '@/shared/lib/query-config';
import { useAuthStore } from '@/stores/auth.store';
import { setPendingInitialModel, type ClawModelInfo } from './session';
import type { ClawContextSnapshot, ClawHistoryEntry } from './types';

// 未发送消息 / 一次性初始模型取用 按 sessionId 键存,claw/boltslides/stat_lab 不撞 → 直接复用。
export {
  takePendingInitialModel,
  getBlockedMessage,
  setBlockedMessage,
  clearBlockedMessage,
  type BlockedMessage,
} from './session';

/** 会话创建/adopt 时:若有 stat_lab 自己的「新对话默认模型」偏好,登记为一次性初始模型
 *  (写入 session.ts 的共享 pendingInitialModel map;socket onOpen 由 takePendingInitialModel 取走)。 */
export function markPendingInitialModel(sessionId: string) {
  const pref = getStatLabNewConversationModel();
  if (pref) setPendingInitialModel(sessionId, pref);
}

const BASE = '/user/stat_lab';

function unwrap<T>(raw: { data?: T } & Partial<T>): T {
  return (raw.data as T) ?? (raw as unknown as T);
}

// ─── history ────────────────────────────────────────────────────────────

interface HistoryResponse {
  sessionId: string;
  messages: ClawHistoryEntry[] | null;
  totalTurns?: number;
  hasMore?: boolean;
}

export function useStatLabHistory(
  sessionId: string | null | undefined,
  limitTurns?: number,
): UseQueryResult<HistoryResponse> {
  const token = useAuthStore((s) => s.token);
  return useQuery<HistoryResponse>({
    queryKey: ['stat_lab', 'history', sessionId, limitTurns ?? 0],
    enabled: !!token && !!sessionId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      try {
        const params = new URLSearchParams();
        if (sessionId) params.set('session_id', sessionId);
        if (limitTurns && limitTurns > 0) params.set('limit', String(limitTurns));
        const qs = params.toString();
        const url = `${BASE}/session/messages${qs ? `?${qs}` : ''}`;
        const { data } = await http.get<{ data?: HistoryResponse } & Partial<HistoryResponse>>(url);
        const payload = unwrap<HistoryResponse>(data);
        return {
          sessionId: payload?.sessionId ?? sessionId ?? '',
          messages: payload?.messages ?? [],
          totalTurns: payload?.totalTurns ?? 0,
          hasMore: payload?.hasMore ?? false,
        };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ─── context (token 水位) ───────────────────────────────────────────────

export function useStatLabContext(
  sessionId: string | null | undefined,
): UseQueryResult<ClawContextSnapshot> {
  const token = useAuthStore((s) => s.token);
  return useQuery<ClawContextSnapshot>({
    queryKey: ['stat_lab', 'context', sessionId],
    enabled: !!token && !!sessionId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      try {
        const url = sessionId
          ? `${BASE}/session/context?session_id=${encodeURIComponent(sessionId)}`
          : `${BASE}/session/context`;
        const { data } = await http.get<{ data?: ClawContextSnapshot } & Partial<ClawContextSnapshot>>(url);
        const payload = unwrap<ClawContextSnapshot>(data);
        return {
          sessionId: payload?.sessionId ?? sessionId ?? '',
          totalTokens: payload?.totalTokens ?? 0,
          maxTokens: payload?.maxTokens ?? 0,
          percentage: payload?.percentage ?? 0,
          model: payload?.model ?? '',
        };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ─── 多会话 API(shared 工厂) ────────────────────────────────────────────

export type StatLabSessionItem = AgentSessionItem;

const statLabSessionApi = makeAgentSessionApi({ feature: 'stat_lab', basePath: BASE });

export const statLabSessions = statLabSessionApi;
export const useStatLabSessions = statLabSessionApi.useSessions;
export const useCreateStatLabSession = statLabSessionApi.useCreateSession;
export const useRenameStatLabSession = statLabSessionApi.useRenameSession;
export const useDeleteStatLabSession = statLabSessionApi.useDeleteSession;
export const useActivateStatLabSession = statLabSessionApi.useActivateSession;

// ─── 模型列表 ────────────────────────────────────────────────────────────

interface ListModelsResponse {
  models: ClawModelInfo[];
  total: number;
}

export function useStatLabModels(): UseQueryResult<ClawModelInfo[]> {
  const token = useAuthStore((s) => s.token);
  return useQuery<ClawModelInfo[]>({
    queryKey: ['stat_lab', 'models'],
    enabled: !!token,
    staleTime: STALE_FRESH,
    queryFn: async () => {
      try {
        const { data } = await http.get<{ data?: ListModelsResponse } & Partial<ListModelsResponse>>(
          `${BASE}/models`,
        );
        const payload = unwrap<ListModelsResponse>(data);
        return payload?.models ?? [];
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}

// ─── 「新对话默认模型」偏好(本 feature 独立命名空间) ───────────────────────

const NEW_CONV_MODEL_KEY = 'scholay:stat_lab:new-conversation-model';

export function getStatLabNewConversationModel(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    return localStorage.getItem(NEW_CONV_MODEL_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function setStatLabNewConversationModel(modelId: string | null) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!modelId) localStorage.removeItem(NEW_CONV_MODEL_KEY);
    else localStorage.setItem(NEW_CONV_MODEL_KEY, modelId);
  } catch {
    /* 隐私模式 / 满了 → 忽略 */
  }
}
