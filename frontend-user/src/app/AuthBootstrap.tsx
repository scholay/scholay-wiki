import { useEffect } from 'react';
import { toast } from 'sonner';
import { useProfile } from '@/features/auth/api/profile';
import { BizCode } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';

/**
 * App 启动时:
 *   - 若 localStorage 有 token,自动拉一次 /user/profile 用最新字段刷新 auth.store.user
 *   - 401/403 已在 useProfile 内部清掉会话(避免脏 token 残留)
 *
 * 还监听全局 `auth-evicted` 事件 (shared/lib/http.ts 的 response interceptor 在
 * TokenRevoked / TokenExpired 时派发) — 拿到事件就清 store + 跳登录页 / 弹 banner。
 *
 * 挂在 ThemeBoundary 旁边,无 UI 输出。
 */
export function AuthBootstrap() {
  const { data } = useProfile();
  const patchUser = useAuthStore((s) => s.patchUser);
  const clear = useAuthStore((s) => s.clear);

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

  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ code?: number; message?: string }>).detail;
      // 已经清过的 store 调 clear 是幂等的; 这里再做一次保险, 防 axios interceptor
      // 只清 localStorage 没动 zustand 状态。
      clear();
      // 区分文案: TokenRevoked = 改密 / 封号; TokenExpired = 自然过期。
      if (detail?.code === BizCode.TokenRevoked) {
        toast.warning(detail.message || '登录已失效,请重新登录');
      } else if (detail?.code === BizCode.TokenExpired) {
        toast.info(detail.message || '登录已过期,请重新登录');
      } else {
        toast.info('请重新登录');
      }
    };
    window.addEventListener('auth-evicted', handler);
    return () => window.removeEventListener('auth-evicted', handler);
  }, [clear]);

  return null;
}
