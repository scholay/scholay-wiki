import { createBrowserRouter, redirect } from 'react-router-dom';
import {
  desktopEquivalentPath,
  isPhoneDevice,
  mobileEquivalentPath,
} from '@/shared/lib/device';
import { RouteErrorBoundary } from '@/shared/components/RouteErrorBoundary';
import { adminRoutes } from '@/features/admin/routes';
import { searchRoutes } from '@/features/search/routes';
import { journalsRoutes } from '@/features/journals/routes';
import { libraryRoutes, libraryMobileRoutes, shareReceiveRoutes } from '@/features/library/routes';
import { browserRoutes } from '@/features/browser/routes';
import { toolsRoutes, toolsMobileRoutes } from '@/features/tools/routes';
import { citationRoutes } from '@/features/citation/routes';
import { peerReviewRoutes } from '@/features/peer-review/routes';
import { prismRoutes } from '@/features/prism/routes';
import { clawRoutes, clawMobileRoutes, clawEmbedRoutes } from '@/features/claw/routes';
import { skillsRoutes } from '@/features/skills/routes';
import { newsRoutes } from '@/features/news/routes';
import { landingRoutes } from '@/features/landing/routes';
import { helpRoutes } from '@/features/help/routes';
import { wikiRoutes } from '@/features/wiki/routes';
import { mobileRoutes } from '@/features/mobile/routes';
import {
  adminLegacyRedirectRoutes,
  legacyRedirectRoutes,
} from '@/features/legacy-redirects/routes';
import { authRoutes, authMobileRoutes, wechatCallbackRoutes } from '@/features/auth/routes';
import { settingsRoutes, settingsMobileRoutes } from '@/features/settings/routes';

/**
 * 顶层路由 —— 仅做组装,不再写死任何 feature 的页面路径。
 *
 * 每个 feature 在自己的 `routes.tsx` 暴露 `xxxRoutes: RouteObject[]`,
 * 这里 spread 到 AppShell 的 children 即可。新增 feature 时:
 *   1. 在 features/<x>/ 加 `routes.tsx`,导出 `<x>Routes`
 *   2. 在本文件 import + spread 一次,不动其他文件
 *
 * **页面级 lazy 是默认** —— AppShell / HomePage / NotFoundPage 也走 route lazy:
 *   · 让 /m、/admin、landing、help 等独立壳不再静态下载桌面壳与首页闭包;
 *   · route lazy 在导航提交前解析,仍由 RouteErrorBoundary 承接 stale chunk。
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

  // adminRoutes 是顶层路由,本身不属于 AppShell 的子树 —— 必须在这里挂
  // errorElement, 否则 stale chunk / lazy import 抛错时会撞 react-router 的
  // "Hey developer 👋" 默认开发者面板(而不是友好的"正在更新到最新版本")。
  ...adminRoutes.map((r) => ({
    ...r,
    path: `/${r.path}`,
    errorElement: <RouteErrorBoundary />,
  })),
  // Landing 宣传页 —— **不挂 AppShell**,自带 LandingLayout(顶部 marketing nav + 大 footer)。
  // 挂到 AppShell 下会出现两层 TopNav。每条路径已是绝对 /features/<slug>,无需再前缀。
  // errorElement 同 admin 的理由 —— 顶层路由必须自带, 否则 stale chunk 撞 react-router 默认开发者面板。
  ...landingRoutes.map((r) => ({
    ...r,
    path: `/${r.path}`,
    errorElement: <RouteErrorBoundary />,
  })),
  // 帮助中心 / 关于 / 联系 / 反馈 / 法律 / 博客 / 资源 —— 同样不挂 AppShell,
  // 自带 HelpLayout(顶部返回 + 面包屑 + Footer)。路径与旧 frontend-user 保持一致。
  ...helpRoutes.map((r) => ({
    ...r,
    path: `/${r.path}`,
    errorElement: <RouteErrorBoundary />,
  })),
  // Scholay Wiki —— 公开、免登录、自带知识导航壳。与帮助中心分开，
  // 因为 Wiki 的分类 / 词条 / 来源索引是独立的多层信息架构。
  ...wikiRoutes.map((r) => ({
    ...r,
    path: `/${r.path}`,
    errorElement: <RouteErrorBoundary />,
  })),
  // 分享接收页 /s/:token —— 公开、免登录、PC/移动通用,不挂 AppShell/MobileShell。
  ...shareReceiveRoutes.map((r) => ({
    ...r,
    path: `/${r.path}`,
    errorElement: <RouteErrorBoundary />,
  })),
  // 小程序 web-view 内嵌页 /mp/* —— 公开、免登录、不挂 Shell(小程序导航栏承担壳)。
  ...clawEmbedRoutes.map((r) => ({
    ...r,
    path: `/${r.path}`,
    errorElement: <RouteErrorBoundary />,
  })),
  // 微信扫码 callback —— **不挂 AppShell**,裸渲染(自带整屏居中状态页)。
  // wxLogin `self_redirect` 让 /wechat/callback 在**登录弹窗里那个 220×240 的 iframe 内**加载:
  // 挂 AppShell 就等于把整套 TopNav / 首页 chrome 渲进登录弹窗(用户实测「扫完码弹窗里闪过首页」),
  // 还会在 iframe 里白连一条通知 WS、跑一遍暂存区同步。附带收益:不再经 '/' 的移动重定向 loader。
  // ⚠️ 其余 OAuth 回调**故意留在 AppShell 下**,理由见 features/auth/routes.tsx 的注释(挪出去会
  // 让 useStagingSync 错过 token 跃迁)。errorElement 同 admin/landing —— 顶层路由必须自带。
  ...wechatCallbackRoutes.map((r) => ({
    ...r,
    path: `/${r.path}`,
    errorElement: <RouteErrorBoundary />,
  })),
  // 移动端 /m/* —— 全新设计逻辑的移动版,**不挂 AppShell**,自带 MobileShell
  // (底部 Tab),与 landing / help 同模式。children 在这里组装:feed 归 mobile,
  // 功能广场/智能助手的移动页归各自业务域 feature(避免跨 feature import),
  // 详见 features/mobile/routes.tsx 顶部注释。
  {
    path: '/m',
    lazy: () =>
      import('@/features/mobile/layouts/MobileShell').then((m) => ({
        Component: m.MobileShell,
      })),
    errorElement: <RouteErrorBoundary />,
    // 反向闸:桌面 UA(含手机浏览器开「请求桌面版」把 UA 改成桌面)落在 /m/* → 自动回 PC 对等页。
    // 与 '/' 的正向闸对称,二者都被 isPhoneDevice() 门控:到了正确的壳就 return null,不会来回弹。
    loader: ({ request }) => {
      if (isPhoneDevice()) return null;
      const url = new URL(request.url);
      // search 一并传入:query 深链(?folder= 等)在两个方向都不能丢
      return redirect(desktopEquivalentPath(url.pathname, url.search));
    },
    children: [
      ...mobileRoutes,
      ...toolsMobileRoutes,
      ...clawMobileRoutes,
      ...libraryMobileRoutes,
      ...settingsMobileRoutes,
      ...authMobileRoutes,
    ],
  },
  {
    path: '/',
    lazy: () =>
      import('./layouts/AppShell').then((m) => ({
        Component: m.AppShell,
      })),
    errorElement: <RouteErrorBoundary />,
    // 正向闸:手机 UA 落在 PC 路由 → 进移动对等页(映射表 MOBILE_EQUIVALENTS)。
    //   - 有 /m 对等页才跳(/settings/*→/m/me、/tools/*→/m/tools/*、/library/*→/m/library/* 等)
    //   - 同 URL 响应式页(论文/期刊/学者/PDF 详情、landing、help/blog、分享页)无对等 → null = 留在原地(保 SEO + 分享深链)
    //   - 暂无移动版的纯 PC 页(/search · /prism · /peer-review)→ 先送 /m/feed
    // pad / 爬虫 / 桌面 UA 不跳。裁决逻辑收口在 shared/lib/device.ts;与 '/m' 的反向闸对称。
    // 挂在 AppShell 父级,所有桌面子路由(含客户端内部导航)都过这道闸。
    loader: ({ request }) => {
      if (!isPhoneDevice()) return null;
      const url = new URL(request.url);
      // search 一并传入:/library?folder=N → /m/library/N 特判 + 其余 query 原样保留
      const target = mobileEquivalentPath(url.pathname, url.search);
      return target ? redirect(target) : null;
    },
    children: [
      {
        index: true,
        lazy: () =>
          import('@/features/home/HomePage').then((m) => ({
            Component: m.HomePage,
          })),
      },
      ...searchRoutes,
      ...journalsRoutes,
      ...libraryRoutes,
      ...browserRoutes,
      ...toolsRoutes,
      ...citationRoutes,
      ...peerReviewRoutes,
      ...prismRoutes,
      ...clawRoutes,
      ...skillsRoutes,
      ...newsRoutes,
      ...authRoutes,
      ...settingsRoutes,
      {
        path: '*',
        lazy: () =>
          import('@/features/home/NotFoundPage').then((m) => ({
            Component: m.NotFoundPage,
          })),
      },
    ],
  },
]);
