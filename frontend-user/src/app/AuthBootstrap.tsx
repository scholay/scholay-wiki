import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useProfile } from '@/features/auth/api/profile';
import { BizCode } from '@/shared/lib/http';
import {
  readInvitationCodeFromUrl,
  stripInvitationParamsFromUrl,
} from '@/shared/lib/auth-invitation';
import { useAuthStore } from '@/stores/auth.store';
import { useAuthDialog } from '@/stores/auth-dialog.store';
import { useInviteEntry } from '@/stores/invite-entry.store';

/**
 * App 启动时:
 *   - 若 localStorage 有 token,自动拉一次 /user/profile 用最新字段刷新 auth.store.user
 *   - 401/403 已在 useProfile 内部清掉会话(避免脏 token 残留)
 *   - 若 URL 带 ?invite= / ?invitation_code=,校验后锁定邀请码并打开注册弹窗
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
  const qc = useQueryClient();

  // 跨 tab 换号/登出的缓存隔离(auth.store 的 storage 监听在 token 换值时广播):
  // 本 tab 的私有查询缓存(library/messages/quota…,queryKey 大多不含用户身份)在
  // staleTime 窗口内会把上一账号的数据原样展示给新账号 —— 整体清空,让当前账号重新拉。
  useEffect(() => {
    const handler = () => qc.clear();
    window.addEventListener('auth-token-swapped', handler);
    return () => window.removeEventListener('auth-token-swapped', handler);
  }, [qc]);

  // /admin 会话失效走整页跳转,sonner toast 是内存态、随跳转销毁 —— 由 handler 把提示
  // 写进 sessionStorage,这里(新页面挂载后)补弹并清除,管理员不再「莫名被踢回首页」。
  // ⚠️ 必须 setTimeout 推迟到宏任务:AuthBootstrap 是 {children} 首子,它的挂载 effect
  // 先于 ToastHost 里 sonner Toaster 的订阅 effect 执行,而 sonner 不回放订阅前的 toast ——
  // 同步补弹会被静默丢弃(2026-08-12 对抗审查确认)。所有 effect 在同一次 commit 内 flush,
  // 宏任务时 Toaster 必已订阅。
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem('scholay:evict-notice');
      if (raw) sessionStorage.removeItem('scholay:evict-notice');
    } catch {
      /* sessionStorage 不可用(隐私模式)时静默放弃,提示不是关键路径 */
    }
    if (!raw) return;
    let message = raw;
    let kind: 'info' | 'warning' = 'info';
    try {
      const parsed = JSON.parse(raw) as { message?: string; kind?: string };
      if (parsed && typeof parsed.message === 'string') {
        message = parsed.message;
        if (parsed.kind === 'warning') kind = 'warning';
      }
    } catch {
      /* 旧格式(裸字符串)按 info 弹 */
    }
    const timer = window.setTimeout(() => {
      if (kind === 'warning') toast.warning(message);
      else toast.info(message);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // 邀请链接落地:?invite=CODE 或 ?invitation_code=CODE
  useEffect(() => {
    const code = readInvitationCodeFromUrl();
    if (!code) return;
    stripInvitationParamsFromUrl();
    const result = useAuthDialog.getState().applyInvitationFromLink(code);
    if (!result.ok) {
      toast.error(result.message || '邀请码无效或已失效');
      return;
    }
    // 已登录用户不必弹注册;未登录则直接进入注册(锁定态邀请码已就绪)
    if (!useAuthStore.getState().token) {
      useAuthDialog.getState().openDialog('register');
    } else {
      toast.success('邀请码已就绪');
    }
  }, []);

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
      const message =
        detail?.code === BizCode.TokenRevoked
          ? detail.message || '登录已失效,请重新登录'
          : detail?.code === BizCode.TokenExpired
            ? detail.message || '登录已过期,请重新登录'
            : detail?.message || '请重新登录';
      if (detail?.code === BizCode.TokenRevoked) toast.warning(message);
      else toast.info(message);
      if (typeof window === 'undefined') return;
      if (window.location.pathname.startsWith('/admin')) {
        // 整页跳转会销毁刚弹的 toast —— 写 sessionStorage(带级别),新页面由上面的挂载 effect 补弹。
        try {
          sessionStorage.setItem(
            'scholay:evict-notice',
            JSON.stringify({
              message,
              kind: detail?.code === BizCode.TokenRevoked ? 'warning' : 'info',
            })
          );
        } catch {
          /* ignore */
        }
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
