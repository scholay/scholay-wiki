import { Navigate, type RouteObject } from 'react-router-dom';

/**
 * Skills 市场(用户上传/分享 skill + claw 动态加载)。
 *   /skills            → 重定向到 /tools/skills(浏览页统一收口到科研能力广场·社区技能段;旧 SkillsMarketPage 已下线)
 *   /skills/mine       我的 Skills(上传/发布/删除)
 *   /skills/new        新建 Skill 向导
 *   /skills/:idOrSlug  详情 + SKILL.md 预览 + 安装/举报(也是分享短链落地页,不可下线)
 * 页面级 lazy(默认)。/skills/mine、/skills/new 放在 :idOrSlug 之前,避免被 param 吃掉。
 */
export const skillsRoutes: RouteObject[] = [
  {
    // 浏览列表统一走 /tools/skills;裸 /skills 重定向过去(保旧书签/外链不 404)。
    path: 'skills',
    element: <Navigate to="/tools/skills" replace />,
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
