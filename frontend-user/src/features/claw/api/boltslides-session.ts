/**
 * 制作PPT (boltslides) — session / history / context / models 的 react-query hooks。
 * 与 claw 同型(见 ./session.ts),仅端点前缀 '/user/boltslides' + queryKey 根 'boltslides'。
 *
 * 复用:多会话 CRUD 走 shared makeAgentSessionApi 工厂;WS 见 ./socket.ts useBoltslidesSocket;
 * 产物见 ./artifacts.ts useBoltslidesArtifacts;协议类型(ClientMessage/ServerMessage/History/Context)
 * 与 claw 完全一致(同一 agentbridge),直接复用 ./types。
 *
 * localStorage 侧的一次性初始模型 / 未发送消息持久化按 **globally-unique sessionId** 键存,
 * claw 与 boltslides 天然不撞,故直接复用 ./session 的实现(不另起命名空间)。
 * 「新对话默认模型」偏好本 feature 独立(BOLTSLIDES_NEW_CONV_MODEL_KEY),与 claw 各记各的。
 */

import { keepPreviousData, useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { makeAgentSessionApi, type AgentSessionItem } from '@/shared/api/agent-sessions';
import { STALE_FRESH } from '@/shared/lib/query-config';
import { useAuthStore } from '@/stores/auth.store';
import { setPendingInitialModel, type ClawModelInfo } from './session';
import type { ClawContextSnapshot, ClawHistoryEntry } from './types';

// 未发送消息 / 一次性初始模型取用 按 sessionId 键存,claw/boltslides 不撞 → 直接复用。
export {
  takePendingInitialModel,
  getBlockedMessage,
  setBlockedMessage,
  clearBlockedMessage,
  type BlockedMessage,
} from './session';

/** 会话创建/adopt 时:若有 boltslides 自己的「新对话默认模型」偏好,登记为一次性初始模型
 *  (写入 session.ts 的共享 pendingInitialModel map;socket onOpen 由 takePendingInitialModel 取走)。 */
export function markPendingInitialModel(sessionId: string) {
  const pref = getBoltslidesNewConversationModel();
  if (pref) setPendingInitialModel(sessionId, pref);
}

const BASE = '/user/boltslides';

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

export function useBoltslidesHistory(
  sessionId: string | null | undefined,
  limitTurns?: number,
): UseQueryResult<HistoryResponse> {
  const token = useAuthStore((s) => s.token);
  return useQuery<HistoryResponse>({
    queryKey: ['boltslides', 'history', sessionId, limitTurns ?? 0],
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

export function useBoltslidesContext(
  sessionId: string | null | undefined,
): UseQueryResult<ClawContextSnapshot> {
  const token = useAuthStore((s) => s.token);
  return useQuery<ClawContextSnapshot>({
    queryKey: ['boltslides', 'context', sessionId],
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

export type BoltslidesSessionItem = AgentSessionItem;

const boltslidesSessionApi = makeAgentSessionApi({ feature: 'boltslides', basePath: BASE });

export const boltslidesSessions = boltslidesSessionApi;
export const useBoltslidesSessions = boltslidesSessionApi.useSessions;
export const useCreateBoltslidesSession = boltslidesSessionApi.useCreateSession;
export const useRenameBoltslidesSession = boltslidesSessionApi.useRenameSession;
export const useDeleteBoltslidesSession = boltslidesSessionApi.useDeleteSession;
export const useActivateBoltslidesSession = boltslidesSessionApi.useActivateSession;

// ─── 模型列表 ────────────────────────────────────────────────────────────

interface ListModelsResponse {
  models: ClawModelInfo[];
  total: number;
}

export function useBoltslidesModels(): UseQueryResult<ClawModelInfo[]> {
  const token = useAuthStore((s) => s.token);
  return useQuery<ClawModelInfo[]>({
    queryKey: ['boltslides', 'models'],
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

// ─── 导出 PPTX(单文件 HTML deck → 图片版 .pptx) ──────────────────────────────

export type DeckExportFormat = 'pptx' | 'pptx-native' | 'pdf';

interface ExportDeckResult {
  slides: number;
  filename: string;
  format: DeckExportFormat;
}

/**
 * 把某演示稿产物(path=out/<name>.html)导出成 pptx(图片版/可编辑版)或 pdf。
 * **一次性导出**:后端把文件字节直接流回,这里触发浏览器下载,**不留存、不进产物列表**
 * (成果只有单文件 HTML deck)。逐张 chromium 渲染,较慢(6min 超时)。
 */
export function useExportBoltslidesDeck() {
  return useMutation<ExportDeckResult, Error, { sessionId: string; path: string; format: DeckExportFormat }>({
    mutationFn: async ({ sessionId, path, format }) => {
      try {
        const resp = await http.post(
          `${BASE}/session/export-pptx`,
          { session_id: sessionId, path, format },
          { timeout: 6 * 60 * 1000, responseType: 'blob' },
        );
        // 从 Content-Disposition 取文件名,触发浏览器下载。
        const cd = String(resp.headers['content-disposition'] || '');
        const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
        const filename = m ? decodeURIComponent(m[1]) : `deck.${format === 'pdf' ? 'pdf' : 'pptx'}`;
        const blobUrl = URL.createObjectURL(resp.data as Blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        return { slides: Number(resp.headers['x-deck-slides']) || 0, filename, format };
      } catch (err) {
        // blob 模式下错误体也是 Blob → 读出来解析 message。
        const e = err as { response?: { data?: unknown } };
        if (e?.response?.data instanceof Blob) {
          try {
            const j = JSON.parse(await e.response.data.text());
            throw new Error(j.message || j.error || '导出失败,请稍后重试');
          } catch (parsed) {
            if (parsed instanceof Error && parsed.message !== 'Unexpected end of JSON input') throw parsed;
          }
        }
        throw toApiError(err);
      }
    },
  });
}

// ─── 「新对话默认模型」偏好(本 feature 独立命名空间) ───────────────────────

const NEW_CONV_MODEL_KEY = 'scholay:boltslides:new-conversation-model';

export function getBoltslidesNewConversationModel(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    return localStorage.getItem(NEW_CONV_MODEL_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function setBoltslidesNewConversationModel(modelId: string | null) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (!modelId) localStorage.removeItem(NEW_CONV_MODEL_KEY);
    else localStorage.setItem(NEW_CONV_MODEL_KEY, modelId);
  } catch {
    /* 隐私模式 / 满了 → 忽略 */
  }
}
