import type { RouteObject } from 'react-router-dom';
import { lazyRoute } from '@/shared/components/LazyRoute';

// /claw ↔ /claw/:sessionId 共用同一 element:切会话保留实例(见 browser/routes.tsx 同注)
const clawPage = lazyRoute(() => import('./pages/ClawPage'), 'ClawPage');

export const clawRoutes: RouteObject[] = [
  {
    path: 'claw',
    element: clawPage,
  },
  {
    // 会话路由:/claw/:sessionId —— 深链/刷新到某会话(ClawPage 解析 feature + 判归属)。
    path: 'claw/:sessionId',
    element: clawPage,
  },
];

/**
 * 移动版智能助手 —— 挂在 /m/* (MobileShell) 下,由 app/router.tsx 组装。
 * 与桌面共用 useClawConversation 状态机,页面归本 feature,壳归 mobile。
 */
const mobileClawPage = lazyRoute(() => import('./pages/mobile/MobileClawPage'), 'MobileClawPage');

export const clawMobileRoutes: RouteObject[] = [
  {
    path: 'claw',
    element: mobileClawPage,
  },
  {
    // /m/claw/:sessionId —— 移动端会话路由(claw-only,同 ClawPage 语义:进入即新对话,切会话带 id)。
    path: 'claw/:sessionId',
    element: mobileClawPage,
  },
];

/**
 * 小程序 web-view 内嵌页(/mp/*)—— 公开、免登录、不挂任何 Shell(小程序导航栏承担壳),
 * 与 /s/:token 分享接收页同模式,由 app/router.tsx 顶层组装。
 * 用途:小程序聊天里的 mermaid 图表卡 → web-view 打开本页渲染真图。
 */
export const clawEmbedRoutes: RouteObject[] = [
  {
    path: 'mp/diagram',
    element: lazyRoute(() => import('./pages/mobile/MpDiagramPage'), 'MpDiagramPage', {
      full: true,
    }),
  },
];
