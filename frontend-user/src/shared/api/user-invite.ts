import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/lib/http';
import { authSessionKey } from '@/shared/lib/auth-token';
import { useAuthStore } from '@/stores/auth.store';

/** GET /user/invite 的当前用户专属分享资料。 */
export interface UserInvite {
  code: string;
  /** 后端根据规范 SITE_URL 生成，前端不重新拼接。 */
  url: string;
  open_count: number;
  registered_count: number;
  created_at: string;
  /** 旧版兼容字段；活动规则只读 /invite/campaign。 */
  reward_per_invite: number;
  reward_total: number;
}

export const USER_INVITE_QUERY_KEY = ['settings', 'invite'] as const;

/**
 * 接口是 get-or-create 语义，因此全站弹窗只在“已登录且真正打开”时启用。
 */
export function useUserInvite(enabled = true) {
  const token = useAuthStore((state) => state.token);
  return useQuery({
    queryKey: [...USER_INVITE_QUERY_KEY, authSessionKey(token)],
    queryFn: async () =>
      (await http.get<{ data: UserInvite }>('/user/invite')).data.data,
    staleTime: 30_000,
    enabled: enabled && !!token,
  });
}
