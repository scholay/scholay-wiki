import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { HomePage } from '@/features/home/HomePage';
import { NotFoundPage } from '@/features/home/NotFoundPage';
import { adminRoutes } from '@/features/admin/routes';
import { searchRoutes } from '@/features/search/routes';
import { journalsRoutes } from '@/features/journals/routes';
import { libraryRoutes } from '@/features/library/routes';
import { browserRoutes } from '@/features/browser/routes';
import { toolsRoutes } from '@/features/tools/routes';
import { peerReviewRoutes } from '@/features/peer-review/routes';
import { prismRoutes } from '@/features/prism/routes';
import { clawRoutes } from '@/features/claw/routes';
import { landingRoutes } from '@/features/landing/routes';
import { helpRoutes } from '@/features/help/routes';
import {
  adminLegacyRedirectRoutes,
  legacyRedirectRoutes,
} from '@/features/legacy-redirects/routes';
import { authRoutes } from '@/features/auth/routes';
import { settingsRoutes } from '@/features/settings/routes';

/**
 * 顶层路由 —— 仅做组装,不再写死任何 feature 的页面路径。
 *
 * 每个 feature 在自己的 `routes.tsx` 暴露 `xxxRoutes: RouteObject[]`,
 * 这里 spread 到 AppShell 的 children 即可。新增 feature 时:
 *   1. 在 features/<x>/ 加 `routes.tsx`,导出 `<x>Routes`
 *   2. 在本文件 import + spread 一次,不动其他文件
 *
 * **页面级 lazy 是默认** —— 仅 HomePage / NotFoundPage 保留即时加载:
 *   · HomePage:首屏入口,lazy 等于一次额外往返,得不偿失
 *   · NotFoundPage:errorElement 必须同步可用,否则路由初始化报警
 *
 * Admin 是独立 shell(adminRoutes 已自带 path 前缀 + loader 守卫),
 * 也只是 spread,不掺到 AppShell 里。
 */
export const router = createBrowserRouter([
  // ─── 旧 frontend-user 路径 → 新前端 redirect ───────────────────────
  // 必须排在所有真实路由之前(虽然 React Router v7 顺序无关,但放前面语义更清晰)。
  // 这些都是客户端 `<Navigate replace>`;真 HTTP 301 走 Nginx,见
  //   docs/nginx-legacy-redirects.conf
  ...adminLegacyRedirectRoutes.map((r) => ({ ...r, path: `/${r.path}` })),
  ...legacyRedirectRoutes.map((r) => ({ ...r, path: `/${r.path}` })),

  ...adminRoutes.map((r) => ({ ...r, path: `/${r.path}` })),
  // Landing 宣传页 —— **不挂 AppShell**,自带 LandingLayout(顶部 marketing nav + 大 footer)。
  // 挂到 AppShell 下会出现两层 TopNav。每条路径已是绝对 /features/<slug>,无需再前缀。
  ...landingRoutes.map((r) => ({ ...r, path: `/${r.path}` })),
  // 帮助中心 / 关于 / 联系 / 反馈 / 法律 / 博客 / 资源 —— 同样不挂 AppShell,
  // 自带 HelpLayout(顶部返回 + 面包屑 + Footer)。路径与旧 frontend-user 保持一致。
  ...helpRoutes.map((r) => ({ ...r, path: `/${r.path}` })),
  {
    path: '/',
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomePage /> },
      ...searchRoutes,
      ...journalsRoutes,
      ...libraryRoutes,
      ...browserRoutes,
      ...toolsRoutes,
      ...peerReviewRoutes,
      ...prismRoutes,
      ...clawRoutes,
      ...authRoutes,
      ...settingsRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
