import type { WikiArticle } from "../../types";

export const AdminFeedbackOperationsArticle: WikiArticle = {
  slug: "admin-feedback-operations",
  title: "反馈处理",
  summary: "检索用户反馈、查看附件并通过邮件和站内通知回复。",
  category: "administration",
  kind: "feature",
  status: "current",
  audience: ["客服", "运营人员", "管理员"],
  aliases: ["反馈工单", "用户反馈", "反馈回复"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/FeedbackPage.tsx",
    "frontend-user/src/features/admin/api/feedback.ts",
    "backend/internal/feedback/model.go",
    "backend/internal/feedback/service.go",
    "backend/cmd/server/routes_admin.go",
  ],
  related: ["feedback-and-support", "admin-mail-support-observability"],
  sections: [
    {
      id: "workflow",
      title: "处理状态与详情",
      markdown: `反馈后台可以搜索和筛选记录；点击一条反馈后，在详情弹窗中查看正文、提交 IP、附件与当前状态，再选择处理、回复或关闭。下图依次展示反馈列表和详情/回复弹窗。

状态为 pending、processed、replied 或 closed。回复会发送邮件；反馈来自登录用户时，还会创建站内通知，并把记录推进为 replied。`,
      embeds: [
        { id: "admin-feedback" },
        {
          id: "admin-feedback-detail-dialog",
          caption: "反馈内容、附件、状态与回复详情",
        },
      ],
    },
    {
      id: "assignment-gap",
      title: "当前没有可用的指派入口",
      markdown: `仓储模型保留了 assignee 等字段和方法，但服务器没有注册管理员指派路由，前端也没有可执行的分派操作。因此现阶段不能把数据库中的指派字段当作完整工单队列，团队归属仍需使用外部流程协调。`,
    },
  ],
};
