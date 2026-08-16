/**
 * 牛犀犀对话面板 —— 聚合站内各智能助手会话列表 + 按需拉历史预览。
 * 不经过 features/（shared 分层约束），直接复用 makeAgentSessionApi 端点形态。
 */

import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  makeAgentSessionApi,
  type AgentSessionItem,
} from '@/shared/api/agent-sessions';
import {
  replayHistoryAsTurns,
  type AgentHistoryEntry,
} from '@/shared/lib/agent-history';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import type { Turn } from '@/shared/types/chat';

export type RhinoChatFeature =
  | 'claw'
  | 'boltslides'
  | 'sci_draw'
  | 'smart-search';

export interface RhinoChatSession extends AgentSessionItem {
  feature: RhinoChatFeature;
}

export const RHINO_CHAT_FEATURE_META: Record<
  RhinoChatFeature,
  { label: string; hrefFor: (sessionId: string) => string }
> = {
  claw: { label: '智能助手', hrefFor: (id) => `/claw/${id}` },
  boltslides: { label: '制作 PPT', hrefFor: (id) => `/claw/${id}` },
  sci_draw: { label: '科研绘图', hrefFor: (id) => `/claw/${id}` },
  'smart-search': { label: '智能搜论文', hrefFor: () => '/search?mode=smart' },
};

export const clawSessions = makeAgentSessionApi({
  feature: 'claw',
  basePath: '/user/claw',
});
export const boltslidesSessions = makeAgentSessionApi({
  feature: 'boltslides',
  basePath: '/user/boltslides',
});
export const sciDrawSessions = makeAgentSessionApi({
  feature: 'sci_draw',
  basePath: '/user/sci_draw',
});
export const smartSearchSessions = makeAgentSessionApi({
  feature: 'smart-search',
  basePath: '/user/smart-search',
});

export function sessionApiFor(feature: RhinoChatFeature) {
  switch (feature) {
    case 'boltslides':
      return boltslidesSessions;
    case 'sci_draw':
      return sciDrawSessions;
    case 'smart-search':
      return smartSearchSessions;
    default:
      return clawSessions;
  }
}

function historyBasePath(feature: RhinoChatFeature): string {
  switch (feature) {
    case 'boltslides':
      return '/user/boltslides';
    case 'sci_draw':
      return '/user/sci_draw';
    case 'smart-search':
      return '/user/smart-search';
    default:
      return '/user/claw';
  }
}

interface HistoryResponse {
  sessionId: string;
  messages: AgentHistoryEntry[] | null;
}

function unwrap<T>(raw: { data?: T } & Partial<T>): T {
  return (raw.data as T) ?? (raw as unknown as T);
}

/** 合并 claw / PPT / 科研绘图 / 智能搜索 会话，按最近访问倒序 */
export function useRhinoChatSessions(): {
  items: RhinoChatSession[];
  isLoading: boolean;
  isError: boolean;
} {
  const clawQ = clawSessions.useSessions();
  const pptQ = boltslidesSessions.useSessions();
  const drawQ = sciDrawSessions.useSessions();
  const searchQ = smartSearchSessions.useSessions();

  const items = useMemo<RhinoChatSession[]>(() => {
    const rows: RhinoChatSession[] = [
      ...(clawQ.data ?? []).map((s) => ({ ...s, feature: 'claw' as const })),
      ...(pptQ.data ?? []).map((s) => ({ ...s, feature: 'boltslides' as const })),
      ...(drawQ.data ?? []).map((s) => ({ ...s, feature: 'sci_draw' as const })),
      ...(searchQ.data ?? []).map((s) => ({
        ...s,
        feature: 'smart-search' as const,
      })),
    ];
    return rows.sort((a, b) =>
      (b.lastAccessedAt || '').localeCompare(a.lastAccessedAt || ''),
    );
  }, [clawQ.data, pptQ.data, drawQ.data, searchQ.data]);

  return {
    items,
    isLoading:
      clawQ.isLoading || pptQ.isLoading || drawQ.isLoading || searchQ.isLoading,
    isError: !!(clawQ.error || pptQ.error || drawQ.error || searchQ.error),
  };
}

/** 选中会话后拉历史并折成 Turn[]，供右侧只读预览 */
export function useRhinoChatPreview(
  feature: RhinoChatFeature | null,
  sessionId: string | null,
): UseQueryResult<{ turns: Turn[]; sessionId: string }> {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['rhino-chat', 'preview', feature, sessionId],
    enabled: !!token && !!feature && !!sessionId,
    staleTime: 30_000,
    queryFn: async () => {
      const base = historyBasePath(feature!);
      const params = new URLSearchParams({
        session_id: sessionId!,
        limit: '12',
      });
      try {
        const { data } = await http.get<
          { data?: HistoryResponse } & Partial<HistoryResponse>
        >(`${base}/session/messages?${params}`);
        const payload = unwrap<HistoryResponse>(data);
        const messages = payload?.messages ?? [];
        return {
          sessionId: payload?.sessionId ?? sessionId!,
          turns: replayHistoryAsTurns(messages),
        };
      } catch (err) {
        throw toApiError(err);
      }
    },
  });
}
