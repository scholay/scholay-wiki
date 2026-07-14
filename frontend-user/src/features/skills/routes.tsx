import type { RouteObject } from 'react-router-dom';

/**
 * Skills 市场(用户上传/分享 skill + claw 动态加载)。
 *   /skills            市场浏览
 *   /skills/mine       我的 Skills(上传/发布/删除)
 *   /skills/:idOrSlug  详情 + SKILL.md 预览 + 安装/举报
 * 页面级 lazy(默认)。/skills/mine 放在 :idOrSlug 之前,避免被 param 吃掉。
 */
export const skillsRoutes: RouteObject[] = [
  {
    path: 'skills',
    lazy: () =>
      import('./pages/SkillsMarketPage').then((m) => ({
        Component: m.SkillsMarketPage,
      })),
  },
  {
    path: 'skills/mine',
    lazy: () =>
      import('./pages/MySkillsPage').then((m) => ({
        Component: m.MySkillsPage,
      })),
  },
  {
    path: 'skills/new',
    lazy: () =>
      import('./pages/SkillCreatePage').then((m) => ({
        Component: m.SkillCreatePage,
      })),
  },
  {
    path: 'skills/:idOrSlug',
    lazy: () =>
      import('./pages/SkillDetailPage').then((m) => ({
        Component: m.SkillDetailPage,
      })),
  },
];
