import type { RouteObject } from 'react-router-dom';

/**
 * Auth feature 路由 —— 主要是各 OAuth provider 的前端 callback 中转页。
 *
 * 每个 provider 在后台 OAuth 平台配置的 redirect_uri 都指向这里 `/x/callback`,
 * 实际由 OAuthCallbackPage 通过 useParams 拿到 provider 名分发处理。
 *
 * 用 `:provider` 通配也可以,但显式列出来更清楚 + 路由匹配更稳。
 */
const providers = ['github', 'google', 'apple', 'orcid', 'microsoft', 'discourse'] as const;

export const authRoutes: RouteObject[] = [
  ...providers.map((p) => ({
    path: `${p}/callback`,
    lazy: () =>
      import('./pages/OAuthCallbackPage').then((m) => ({
        Component: m.OAuthCallbackPage,
      })),
  })),
  // 微信扫码 callback —— 跟其他 OAuth 不同,wxLogin self_redirect 把目标页加载在
  // iframe 里。本页检测 iframe 上下文,postMessage 给父窗口 (WeChatQRDialog) 让它
  // 按 mode (login / bind) 分发。独立打开本页也兜底了。
  {
    path: 'wechat/callback',
    lazy: () =>
      import('./pages/WeChatCallbackPage').then((m) => ({
        Component: m.WeChatCallbackPage,
      })),
  },
];
