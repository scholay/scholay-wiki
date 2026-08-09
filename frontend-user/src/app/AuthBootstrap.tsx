import { useEffect } from 'react';
import { toast } from 'sonner';
import { useProfile } from '@/features/auth/api/profile';
import { BizCode } from '@/shared/lib/http';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useInviteEntry } from '@/stores/invite-entry.store';

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
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);

  // useProfile 拉到档案后,**整体写入** user(setUser,不是 patchUser)。
  // 关键:token 有效但 user 为 null 的「幽灵未登录」场景(跨 tab 登录只同步了 token、
  // 或 persist blob 丢了 user)下,useProfile 是 enabled 的、能成功取回档案 —— 必须用
  // setUser 才能把它写进去。早先用 patchUser 时 user 为 null 会被原样丢弃,导致
  // 「接口能看到自己历史、但界面显示未登录」。token→user 由这里收口自愈。
  useEffect(() => {
    if (!data) return;
    setUser({
      id: data.id,
      email: data.email ?? '',
      username: data.username ?? undefined,
      avatar: data.avatar_url ?? undefined,
      role: data.role,
      permissions: data.permissions,
    });
  }, [data, setUser]);

  // 全前端「认证丢失」的**单一消费点**(notifyAuthLost 派发 auth-evicted)。
  // 此前这里只弹 toast、不给任何登录入口 —— 正是"接口提示未登录但没有登录交互"的根因。
  // 现在统一收口: 清 store(token+user 幂等)→ 文案提示 → 引导登录:
  //   · 管理端整页(/admin)→ 硬跳回用户端首页(顺带把 SPA 重置成未登录态)
  //   · 用户端 → 原地弹登录框(登录成功后 useReplayPendingAction 会重放刚才被打断的操作)
  useEffect(() => {
    const handler = (evt: Event) => {
      const detail = (evt as CustomEvent<{ code?: number; message?: string }>).detail;
      // 邀请弹窗内的私有请求也可能首先发现 401。在打开登录框前同步关掉它，
      // 避免两个 Radix modal 同时持有 body pointer lock。
      const inviteEntry = useInviteEntry.getState();
      if (inviteEntry.open) inviteEntry.closeInvite();
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
