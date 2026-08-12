import { Navigate, redirect, type RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

/**
 * 账号设置 3 个子路由,统一挂在 /settings 下,共享 SettingsLayout(左侧 nav)。
 * 访客直接进 /settings → 重定向到 /settings/profile。
 *
 * 登录态守卫(loader):未登录访问 /settings/* → 直接 redirect 到首页 + 自动
 * 弹登录窗。比组件里 useEffect 检测后再 navigate 更早一步,避免页面闪现空白
 * + useProfile 报 401。
 *
 * 走 localStorage 读 token 而不是 useAuthStore.getState():loader 在 React 树外
 * 执行,store 的初始化时机不保证,localStorage 是同步可靠源。
 */
function ensureAuthed() {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('auth_token');
  if (!token) {
    // 把 "需要登录" 状态借助 hash 传给首页让它自动弹 AuthDialog(避免改 store API)
    return redirect('/?login=required');
  }
  return null;
}

export const settingsRoutes: RouteObject[] = [
  {
    path: 'settings',
    loader: ensureAuthed,
    element: lazyRoute(() => import('./pages/SettingsLayout'), 'SettingsLayout'),
    children: [
      { index: true, element: <Navigate to="profile" replace /> },
      {
        path: 'profile',
        element: lazyRoute(() => import('./pages/ProfilePage'), 'ProfilePage'),
      },
      {
        path: 'membership',
        element: lazyRoute(() => import('./pages/MembershipPage'), 'MembershipPage'),
      },
      {
        path: 'invite',
        element: lazyRoute(() => import('./pages/InvitePage'), 'InvitePage'),
      },
      {
        path: 'security',
        element: lazyRoute(() => import('./pages/SecurityPage'), 'SecurityPage'),
      },
      {
        path: 'connections',
        element: lazyRoute(() => import('./pages/ConnectionsPage'), 'ConnectionsPage'),
      },
    ],
  },
];

/**
 * 移动版「我的」体系 —— 挂在 /m/* (MobileShell) 下,由 app/router.tsx 组装。
 * 与 PC settings 共用全部数据 hooks(profile/membership/connections)。
 *
 * 刻意**不挂** ensureAuthed loader:移动端未登录进「我的」是常态入口
 * (展示登录/注册按钮),子页由 MeSubpageShell 原地弹登录,不跳走。
 */
export const settingsMobileRoutes: RouteObject[] = [
  {
    path: 'me',
    element: lazyRoute(() => import('./pages/mobile/MobileMePage'), 'MobileMePage'),
  },
  {
    path: 'me/profile',
    element: lazyRoute(() => import('./pages/mobile/MobileProfilePage'), 'MobileProfilePage'),
  },
  {
    path: 'me/security',
    element: lazyRoute(() => import('./pages/mobile/MobileSecurityPage'), 'MobileSecurityPage'),
  },
  {
    path: 'me/connections',
    element: lazyRoute(() => import('./pages/mobile/MobileConnectionsPage'), 'MobileConnectionsPage'),
  },
  {
    path: 'me/billing',
    element: lazyRoute(() => import('./pages/mobile/MobileBillingPage'), 'MobileBillingPage'),
  },
  {
    path: 'me/invite',
    element: lazyRoute(() => import('./pages/mobile/MobileInvitePage'), 'MobileInvitePage'),
  },
];
