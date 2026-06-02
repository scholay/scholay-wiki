import { useQuery } from '@tanstack/react-query';
import { http, toApiError } from '@/shared/lib/http';
import { STALE_FRESH } from '@/shared/lib/query-config';
import { useAuthStore } from '@/stores/auth.store';

/**
 * 当前登录用户档案 —— 跨 feature 资源(auth 拉、settings/header/任何地方读)。
 *
 * 之所以放 shared/api 而不在 features/auth:`User` + `useProfile` 是
 * settings、header、library、subscription 等多个 feature 都要读的公共身份信息,
 * 放 features/auth 会让所有读它的 feature 形成跨 feature 反向依赖(违反 §一)。
 *
 * App 启动时 AuthBootstrap 触发首次拉取;mutation 改了用户字段后 invalidate
 * `['auth','profile']` 即可全局刷新。
 */

/**
 * 对照 backend/internal/user/model.go。
 * TODO: 切到 openapi-typescript 生成的类型 — `npm run gen:api` 后从 schema.d.ts 导入。
 */
export interface User {
  id: number;
  username: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: 'user' | 'admin';
  status: number;
  email_verified: boolean;
  phone_verified: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
  updated_at: string;
}

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
        // 401/认证失效由 http 全局拦截器统一处理(notifyAuthLost → 清 store + 弹登录框),
        // 这里不再各自 clear,避免双重清理 / 双重弹框。只归一化错误抛出。
        throw toApiError(err);
      }
    },
    staleTime: STALE_FRESH,
    retry: false,
  });
}
