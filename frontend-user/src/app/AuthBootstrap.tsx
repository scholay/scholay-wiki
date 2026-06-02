import { useEffect } from 'react';
import { toast } from 'sonner';
import { useProfile } from '@/features/auth/api/profile';
import { BizCode } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';

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

  // 全前端「认证丢失」的**单一消费点**(notifyAuthLost 派发 auth-evicted)。
  // 此前这里只弹 toast、不给任何登录入口 —— 正是"接口提示未登录但没有登录交互"的根因。
  // 现在统一收口: 清 store(token+user 幂等)→ 文案提示 → 引导登录:
  //   · 管理端整页(/admin)→ 硬跳回用户端首页(顺带把 SPA 重置成未登录态)
  //   · 用户端 → 原地弹登录框(登录成功后 useReplayPendingAction 会重放刚才被打断的操作)
  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ code?: number; message?: string }>).detail;
      clear();
      if (detail?.code === BizCode.TokenRevoked) {
        toast.warning(detail.message || '登录已失效,请重新登录');
      } else if (detail?.code === BizCode.TokenExpired) {
        toast.info(detail.message || '登录已过期,请重新登录');
      } else {
        toast.info(detail?.message || '请重新登录');
      }
      if (typeof window === 'undefined') return;
      if (window.location.pathname.startsWith('/admin')) {
        window.location.assign('/');
      } else {
        useAuthDialog.getState().openDialog('login');
      }
    };
    window.addEventListener('auth-evicted', handler);
    return () => window.removeEventListener('auth-evicted', handler);
  }, [clear]);

  return null;
}
