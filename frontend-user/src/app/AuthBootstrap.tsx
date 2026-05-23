import { useEffect } from 'react';
import { useProfile } from '@/features/auth/api/profile';
import { useAuthStore } from '@/stores/auth.store';

/**
 * App 启动时:
 *   - 若 localStorage 有 token,自动拉一次 /user/profile 用最新字段刷新 auth.store.user
 *   - 401/403 已在 useProfile 内部清掉会话(避免脏 token 残留)
 *
 * 挂在 ThemeBoundary 旁边,无 UI 输出。
 */
export function AuthBootstrap() {
  const { data } = useProfile();
  const patchUser = useAuthStore((s) => s.patchUser);

  useEffect(() => {
    if (!data) return;
    patchUser({
      id: data.id,
      email: data.email ?? '',
      username: data.username ?? undefined,
      avatar: data.avatar_url ?? undefined,
      role: data.role,
    });
  }, [data, patchUser]);

  return null;
}
