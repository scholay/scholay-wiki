import type { WikiArticle } from "../../types";

export const AdminAccessControlArticle: WikiArticle = {
  slug: "admin-access-control",
  title: "后台角色与权限",
  summary: "后台入口、三类管理角色与前后端权限校验的真实边界。",
  category: "administration",
  kind: "rule",
  status: "current",
  audience: ["管理员", "运维人员", "开发者"],
  aliases: ["后台权限", "RBAC", "管理角色"],
  sourcePaths: [
    "frontend-user/src/features/admin/routes.tsx",
    "frontend-user/src/features/admin/permissions.ts",
    "frontend-user/src/features/admin/nav.ts",
    "backend/internal/admin/model.go",
    "backend/cmd/server/routes_admin.go",
  ],
  related: ["admin-console", "admin-dashboard", "admin-user-lifecycle"],
  sections: [
    {
      id: "roles",
      title: "入口与角色",
      markdown: `登录后访问 \`/admin\`，后台会按你的角色显示可用菜单与操作；下图展示的是 operations、admin 和 super_admin 三类角色的权限矩阵。普通 user 不能进入后台外壳。

operations 拥有 analytics.view、content.manage、users.view；admin 再增加 users.manage、config.manage、finance.refund；super_admin 额外拥有 users.role.assign。`,
      embeds: [{ id: "admin-access-control" }],
    },
    {
      id: "enforcement",
      title: "权限如何生效",
      markdown: `侧栏和按钮会按权限隐藏，但多数子路由只复用后台入口守卫；直接输入地址仍可能加载页面外壳，随后由接口返回 403。真正的安全边界是后端路由上的 RequirePermission，前端隐藏控件不能替代服务端授权。`,
    },
  ],
};
