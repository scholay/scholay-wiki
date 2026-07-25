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
  role: 'user' | 'operations' | 'admin' | 'super_admin';
  /** 后端 /user/profile 下发的权限点(admin.PermissionsForRole)。后台菜单/按钮据此过滤;
   *  可能尚未拉到(登录响应不含)→ 消费方按角色兜底(见 features/admin/permissions.ts)。 */
  permissions?: string[];
}

/** 是否「完全管理员」(admin / super_admin;不含运营)。用于需要区分完整管理员的场景。 */
export function isAdminRole(role?: StoredUser['role']): boolean {
  return role === 'admin' || role === 'super_admin';
}

/**
 * 是否可以进入 /admin 后台外壳(完整管理员 **或** 运营)。
 * 与后端 admin.CanAccessAdmin 对齐 —— adminGuard / 后台入口按钮共用此谓词。
 * 具体每个菜单/按钮能不能用,由后端下发的 permissions 决定(见 features/admin/permissions.ts)。
 */
export function canAccessAdmin(role?: StoredUser['role']): boolean {
  return isAdminRole(role) || role === 'operations';
}

/**
 * 全局**唯一**的「是否已登录」判断 —— 一律以 token 为准(user 仅作展示缓存,可能尚未拉到)。
 * 组件别再各写 `!!user` / `!!getAuthToken()` / `!!token`,统一用这个,杜绝多套谓词分叉。
 */
export function useIsAuthenticated(): boolean {
  return useAuthStore((s) => !!s.token);
}

/**
 * 组件读取「鉴权展示态」的**唯一**入口 —— 凡是要在 UI 上分「登录 vs 未登录」并展示身份的地方都用它,
 * **不要再各自 `useAuthStore((s)=>s.user)` 然后拿 `!!user` 当登录判定**(user 是异步填的展示缓存,
 * 已登录但 profile 未到时它是 null → 会把已登录用户错显成「登录/注册」,正是「接口看得到自己历史、
 * 界面却显示未登录」那个 bug 的来源)。三态语义:
 *   - `authenticated`:是否已登录(= !!token,真源镜像)。**登录与否的分叉只看这个**。
 *   - `user`:展示身份(用户名/头像/邮箱),已登录但 profile 未到时为 null。
 *   - `profileLoading`:已登录但 user 尚未填 —— 这一态渲染「身份占位」,**绝不能回退成未登录 UI**。
 */
export function useAuthStatus(): {
  authenticated: boolean;
  user: StoredUser | null;
  profileLoading: boolean;
} {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  return { authenticated: !!token, user, profileLoading: !!token && !user };
}

interface AuthState {
  token: string | null;
  user: StoredUser | null;
  setSession: (token: string, user: StoredUser) => void;
  /** 整体覆盖 user(完整 StoredUser)。AuthBootstrap 用它把 useProfile 拉到的档案写进来。 */
  setUser: (user: StoredUser) => void;
  /** 局部合并 **已存在** 的 user(profile 编辑等)。user 为 null 时刻意不创建 —— 创建要走 setUser。 */
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
      setUser: (user) => set({ user }),
      // 局部合并:仅在 user 已存在时合 patch。**绝不能**用它来「填充」一个 null user ——
      // 历史 bug:AuthBootstrap 拿 useProfile 的档案走 patchUser,而 user 为 null 时这里
      // 原样返回 null → 档案被丢弃、user 永远填不上。结果:token 有效(各受保护接口照常
      // 返回该用户自己的历史),但 footer/topnav 按 !!user 显示「未登录」(幽灵未登录态)。
      // 填充 user 一律走 setUser(见 AuthBootstrap)。
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
