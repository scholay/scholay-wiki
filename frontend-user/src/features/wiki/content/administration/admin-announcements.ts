import type { WikiArticle } from "../../types";

export const AdminAnnouncementsArticle: WikiArticle = {
  slug: "admin-announcements",
  title: "公告管理",
  summary: "后台公告的排期、受众和状态模型，以及当前缺失的用户侧投递入口。",
  category: "administration",
  kind: "feature",
  status: "current",
  audience: ["管理员", "运营人员", "开发者"],
  aliases: ["站内公告", "维护公告", "Banner 公告"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/AnnouncementsPage.tsx",
    "frontend-user/src/features/admin/api/announcements.ts",
    "backend/internal/announcement/handler.go",
    "backend/internal/announcement/model.go",
    "backend/cmd/server/routes_admin.go",
  ],
  related: ["admin-messaging", "admin-system-code-snippets"],
  sections: [
    {
      id: "model",
      title: "公告模型",
      markdown: `公告页先列出已有记录及草稿、待生效、直播中或已过期状态；点击新建或编辑后，再设置形式、级别、受众、起止时间、是否可关闭、启用状态和优先级。下图依次展示公告列表和编辑器。

类型值为 banner、popup 或 maintenance_note，级别为 info、warning、danger 或 success，受众为 all、logged_in 或 paid；页面状态由排期和启用信息共同计算。`,
      embeds: [
        { id: "admin-announcements" },
        {
          id: "admin-announcement-editor",
          caption: "公告形式、受众、排期与发布状态编辑器",
        },
      ],
    },
    {
      id: "delivery-gap",
      title: "当前没有公开读取路由",
      markdown: `当前服务器只注册了后台公告 CRUD，没有注册 /api/v1/announcements/active 或其他面向公开页、登录用户的公告读取路由。维护中间件的白名单与注释提到该地址，但没有对应处理器挂载；因此保存受众、优先级和排期并不等于公告已经能在用户端送达。`,
    },
  ],
};
