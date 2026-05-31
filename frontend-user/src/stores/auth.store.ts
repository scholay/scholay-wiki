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
      // 无论 persist blob 里残留什么(旧版本可能存过 token),token 永远以真源为准。
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<AuthState>),
        token: getAuthToken(),
      }),
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
      useAuthStore.setState({ token: e.newValue || null });
    }
  });
}
