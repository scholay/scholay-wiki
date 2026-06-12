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
