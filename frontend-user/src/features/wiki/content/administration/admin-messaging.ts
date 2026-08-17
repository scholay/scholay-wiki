import type { WikiArticle } from "../../types";

export const AdminMessagingArticle: WikiArticle = {
  slug: "admin-messaging",
  title: "站内消息管理",
  summary: "创建草稿并向全体、指定用户或套餐人群同步发送站内消息。",
  category: "administration",
  kind: "feature",
  status: "current",
  audience: ["运营人员", "管理员", "开发者"],
  aliases: ["站内信", "消息群发", "Message Broadcast"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/MessagesPage.tsx",
    "frontend-user/src/features/admin/api/messages.ts",
    "backend/internal/message/model.go",
    "backend/internal/message/repository.go",
    "backend/internal/message/service.go",
  ],
  related: ["admin-announcements", "admin-feedback-operations"],
  sections: [
    {
      id: "send",
      title: "草稿与发送",
      markdown: `站内消息页先列出草稿与已发送记录；新建时选择类别、收件范围、正文和链接，保存草稿后再进入发送确认。全体发送还需要输入 SEND。下方三张图依次展示消息列表、草稿编辑器和最终确认弹窗。

类别为 system、promotion 或 transaction，范围为 all、batch、single 或 by_plan。只有 draft 可以发送，single/batch 必须有收件人；发送会同步推进到不可逆状态。当前后台没有消息更新或删除路由。`,
      embeds: [
        { id: "admin-messaging" },
        {
          id: "admin-message-editor",
          caption: "消息目标、正文与链接的草稿编辑器",
        },
        {
          id: "admin-message-send-confirm",
          caption: "不可撤回发送前的目标复核与输入确认",
        },
      ],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "SEND 只确认发送动作。粘贴前必须再次核对收件范围、正文、链接和外部留存的目标用户清单；发送后不可撤回。",
          },
        },
      ],
    },
    {
      id: "legacy-plan",
      title: "by_plan 的遗留字段风险",
      markdown: `by_plan 的仓储查询仍使用历史 users.subscription_plan 字段，而当前会员真源是 users.vip_tier；按套餐发送可能匹配为空或选中错误人群。需要可靠定向时，应先用用户查询确认目标，再使用明确的用户 ID 列表。`,
    },
    {
      id: "audit-limit",
      title: "收件人审计限制",
      markdown: `消息列表响应不返回 target_user_ids，因此事后无法从列表精确还原 batch 的原始目标集合。发送前应在外部变更记录中保存筛选条件和用户 ID，不能仅依赖消息标题证明投递范围。`,
    },
  ],
};
