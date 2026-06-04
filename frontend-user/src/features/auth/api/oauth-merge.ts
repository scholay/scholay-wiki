import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { handleAuthSuccess } from './auth';
import type { AuthResponse } from '../types';

/**
 * OAuth 合并确认中间页 —— 见后端 `internal/user/handler_oauth_merge.go`。
 *
 * 触发路径:
 *   OAuth callback(GitHub/Google/...) → 后端发现 email 已存在 → 返回
 *   `{requires_merge: true, merge_token, provider, target_email}` →
 *   前端把 merge_token 存到 state 跳到本中间页 → 拿 GET /pending-merge 拉摘要 →
 *   用户二选一:确认合并(POST /confirm-merge)/ 新建独立账号(POST /cancel-merge)
 *
 * 【安全】POST /confirm-merge 是**受保护**接口(需 JWT):必须先以目标账号本人身份登录,
 * 后端校验当前登录用户 == 合并目标,只持有 merge_token 不足以合并。useConfirmOAuthMerge
 * 仅在 UI 确认用户已登录目标账号后才调用(见 OAuthMergeConfirmDialog),http 实例会自动
 * 带上 Authorization 头。cancel-merge / pending-merge 仍是公开接口(token 即凭据)。
 */

export interface PendingMergeInfo {
  provider: string;
  target_email: string;
  provider_email: string;
  provider_display?: string;
  provider_avatar_url?: string;
}

export function usePendingMerge(token: string | null) {
  return useQuery({
    queryKey: ['oauth-merge', token],
    enabled: !!token,
    queryFn: async () => {
      const { data } = await http.get<{ data: PendingMergeInfo }>(
        `/user/oauth/pending-merge?token=${encodeURIComponent(token!)}`
      );
      return data.data;
    },
    // 过期 / 已被消费后再查就是 404,不重试
    retry: false,
    staleTime: 0,
  });
}

export function useConfirmOAuthMerge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      try {
        const { data } = await http.post<{ data: AuthResponse }>(
          '/user/oauth/confirm-merge',
          { token }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (data) => handleAuthSuccess(qc, data),
  });
}

export function useCancelOAuthMerge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      try {
        const { data } = await http.post<{ data: AuthResponse }>(
          '/user/oauth/cancel-merge',
          { token }
        );
        return data.data;
      } catch (err) {
        throw toApiError(err);
      }
    },
    onSuccess: (data) => handleAuthSuccess(qc, data),
  });
}
