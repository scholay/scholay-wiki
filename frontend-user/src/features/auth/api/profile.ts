import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import type { User } from '../types';

/**
 * 当前登录用户 — token 存在时自动拉取,失败(401/403)清掉会话。
 * App 启动时由 AuthBootstrap 触发,后续可用 invalidate 强制刷新。
 */
export function useProfile() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: ['auth', 'profile'],
    enabled: !!token,
    queryFn: async (): Promise<User> => {
      try {
        const { data } = await http.get<{ data: User }>('/user/profile');
        return data.data;
      } catch (err) {
        const apiErr = toApiError(err);
        if (apiErr.status === 401 || apiErr.status === 403) {
          useAuthStore.getState().clear();
        }
        throw apiErr;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}
