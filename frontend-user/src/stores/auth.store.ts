import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from '@/shared/lib/auth-token';

/**
 * 持久化的用户态(只放 UI 用得到的最小字段)。
 * 业务详细信息走 useProfile() 服务端查询,这里不缓存完整 User。
 */
export interface StoredUser {
  id: number;
  email: string;
  username?: string;
  avatar?: string;
  role: 'user' | 'admin' | 'super_admin';
}

/** 是否管理员(admin / super_admin 都算)。loader/sidebar/页面共用入口。 */
export function isAdminRole(role?: StoredUser['role']): boolean {
  return role === 'admin' || role === 'super_admin';
}

/**
 * 全局**唯一**的「是否已登录」判断 —— 一律以 token 为准(user 仅作展示缓存,可能尚未拉到)。
 * 组件别再各写 `!!user` / `!!getAuthToken()` / `!!token`,统一用这个,杜绝多套谓词分叉。
 */
export function useIsAuthenticated(): boolean {
  return useAuthStore((s) => !!s.token);
}

interface AuthState {
  token: string | null;
  user: StoredUser | null;
  setSession: (token: string, user: StoredUser) => void;
  patchUser: (patch: Partial<StoredUser>) => void;
  clear: () => void;
}

/**
 * token 不再由 store 自己存 —— 真源是 `localStorage.auth_token`(见 shared/lib/auth-token.ts)。
 * 这里的 `token` 只是它的**镜像**:init 时读真源、跨 tab storage 事件跟随、setSession/clear 一起写。
 * 这样无论读 `useAuthStore.token` 还是 `getAuthToken()`,拿到的永远一致,杜绝多 tab / 轮换错位。
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: getAuthToken(),
      user: null,
      setSession: (token, user) => {
        setAuthToken(token);
        set({ token, user });
      },
      patchUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
      clear: () => {
        clearAuthToken();
        set({ token: null, user: null });
      },
    }),
    {
      name: 'scholay.auth',
      // 只持久化 user;token 不进 persist(它的真源是 localStorage.auth_token)。
      partialize: (s) => ({ user: s.user }),
      // token 永远以真源(localStorage.auth_token)为准。**关键**:token 与 user 同生同灭 ——
      // 真源已无 token(登出/失效/被清)时,persist blob 里残留的 user 一律丢弃。
      // 否则硬刷新后 rehydrate 出 token=null + user=旧值 → UI 按 !!user 仍显示"已登录"(幽灵登录态),
      // 且 /?login=required 因 user 非空而不弹登录框(就是这个 bug)。
      merge: (persisted, current) => {
        const token = getAuthToken();
        const p = persisted as Partial<AuthState>;
        return {
          ...current,
          ...p,
          token,
          user: token ? (p.user ?? null) : null,
        };
      },
      // 刷新后补 cookie(浏览器关闭会清 cookie 但 localStorage 还在),避免 iframe 突然 401。
      onRehydrateStorage: () => () => {
        const t = getAuthToken();
        if (t) setAuthToken(t);
      },
    }
  )
);

// 跨 tab 同步:别的 tab 登录/登出/轮换改了 localStorage.auth_token 时,storage 事件会在**本 tab**触发,
// 把镜像 token 跟上。否则本 tab 的 in-memory token 会 stale,而 localStorage 是新的 →
// 用 store.token 的请求(SSE/WS/PDF)401,用 localStorage 的 axios 却 200(就是审稿流式踩的坑)。
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'auth_token') {
      const t = e.newValue || null;
      // token 与 user **同生同灭**:别的 tab 清了 token(登出/吊销),本 tab 必须把 user 一起清,
      // 否则本 tab UI 仍按 user 判断显示"已登录"——这正是「退出登录后状态残留」的根因之一。
      useAuthStore.setState(t ? { token: t } : { token: null, user: null });
    }
  });
}
