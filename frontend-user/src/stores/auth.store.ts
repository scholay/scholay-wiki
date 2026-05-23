import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
 * scholay_token cookie —— 给 iframe / 跨页签共享会话用,与后端 middleware.SessionCookieName
 * 字面量保持一致。axios 主流请求仍走 localStorage + Authorization header,
 * 这个 cookie 只解 iframe 拿不到 header 的场景(目前唯一消费方 = admin 嵌入的 umami)。
 *
 * SameSite=Strict —— umami iframe 在同站同源(同 host:port)下加载, Strict 完全够用,
 *   且避免被 CSRF (任意第三方站点都拿不到这个 cookie)。
 * 没有 HttpOnly —— 后端没法在 setSession 时直接 Set-Cookie (login 入口太多), 改在前端写;
 *   反正 token 在 localStorage 已经是 XSS 可读了, 不损失安全等级。
 */
const SESSION_COOKIE_NAME = 'scholay_token';
function writeSessionCookie(token: string) {
  if (typeof document === 'undefined') return;
  // Max-Age 24h —— 后端 JWT TTL 也差不多, 过期由 401 走重登流程清理
  document.cookie = `${SESSION_COOKIE_NAME}=${token}; path=/; max-age=86400; SameSite=Strict`;
}
function clearSessionCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0; SameSite=Strict`;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => {
        localStorage.setItem('auth_token', token);
        writeSessionCookie(token);
        set({ token, user });
      },
      patchUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),
      clear: () => {
        localStorage.removeItem('auth_token');
        clearSessionCookie();
        set({ token: null, user: null });
      },
    }),
    {
      name: 'scholay.auth',
      // persist 从 localStorage rehydrate 时, 把 cookie 也补上 ——
      // 用户刷新后 zustand 状态还在, 但 cookie 在浏览器关闭后被清掉,
      // 不补的话 iframe 进 umami 会突然 401。
      onRehydrateStorage: () => (state) => {
        if (state?.token) writeSessionCookie(state.token);
      },
    }
  )
);
