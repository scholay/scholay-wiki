import type { RouteObject } from 'react-router-dom';

export const clawRoutes: RouteObject[] = [
  {
    path: 'claw',
    lazy: () => import('./pages/ClawPage').then((m) => ({ Component: m.ClawPage })),
  },
];

/**
 * 移动版智能助手 —— 挂在 /m/* (MobileShell) 下,由 app/router.tsx 组装。
 * 与桌面共用 useClawConversation 状态机,页面归本 feature,壳归 mobile。
 */
export const clawMobileRoutes: RouteObject[] = [
  {
    path: 'claw',
    lazy: () =>
      import('./pages/mobile/MobileClawPage').then((m) => ({
        Component: m.MobileClawPage,
      })),
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
    lazy: () =>
      import('./pages/mobile/MpDiagramPage').then((m) => ({
        Component: m.MpDiagramPage,
      })),
  },
];
