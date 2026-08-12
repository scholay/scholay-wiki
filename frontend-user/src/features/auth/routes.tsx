import type { RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

/**
 * Auth feature 路由 —— 主要是各 OAuth provider 的前端 callback 中转页。
 *
 * 每个 provider 在后台 OAuth 平台配置的 redirect_uri 都指向这里 `/x/callback`,
 * 实际由 OAuthCallbackPage 通过 useParams 拿到 provider 名分发处理。
 *
 * 用 `:provider` 通配也可以,但显式列出来更清楚 + 路由匹配更稳。
 */
const providers = ['github', 'google', 'apple', 'orcid', 'microsoft', 'discourse'] as const;

export const authRoutes: RouteObject[] = providers.map((p) => ({
  path: `${p}/callback`,
  element: lazyRoute(() => import('./pages/OAuthCallbackPage'), 'OAuthCallbackPage'),
}));

/**
 * 微信扫码 callback —— 跟其他 OAuth 不同,wxLogin `self_redirect` 把目标页加载在
 * **登录弹窗里那个 220×240 的 iframe** 中。本页检测 iframe 上下文,postMessage 给父窗口
 * (WeChatQRPanel)让它按 mode(login / bind)分发。独立打开本页也兜底了。
 *
 * 🔴 **必须挂在顶层裸渲染,不能进 AppShell**(app/router.tsx 单独 spread 这一条):
 * 挂进去就等于把整套 TopNav / 首页 chrome 渲进那个小 iframe —— 用户实测「扫完码弹窗里
 * 闪过首页」正是这么来的,还会在 iframe 里白连一条通知 WS、跑一遍暂存区同步。
 *
 * ⚠️ 同理**别顺手把上面那组 OAuth 回调也一起挪出去**(看着更"干净",但会踩雷):
 * 它们是整页跳转,回来时是**全新文档**,登录后重放/暂存区同步靠的是「AppShell 在场时
 * 见到 token 空→非空」这一跃迁 —— 挪出去后 AppShell 变成登录**之后**才挂载,
 * `useStagingSync`(localStorage 里的本地暂存区推云端)会被静默跳过。
 * 微信这条没有这个问题:它的 token 跃迁发生在**父窗口**,那边 AppShell 一直在。
 */
export const wechatCallbackRoutes: RouteObject[] = [
  {
    path: 'wechat/callback',
    element: lazyRoute(() => import('./pages/WeChatCallbackPage'), 'WeChatCallbackPage', {
      full: true,
    }),
  },
];

/**
 * 移动版整页登录/注册(/m/auth) —— 挂在 /m/* (MobileShell) 下,由 app/router.tsx
 * 组装。复用 AuthDialog 的全部表单组件,未登录访问 /m/me 会被重定向到这里。
 */
export const authMobileRoutes: RouteObject[] = [
  {
    path: 'auth',
    element: lazyRoute(() => import('./pages/mobile/MobileAuthPage'), 'MobileAuthPage'),
  },
];
