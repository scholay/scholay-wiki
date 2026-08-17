import type { WikiArticle } from "../../types";

export const AdminMailSupportObservabilityArticle: WikiArticle = {
  slug: "admin-mail-support-observability",
  title: "邮件中心、客服配置与发送日志",
  summary: "统一说明客服邮箱收发、公开联系方式配置，以及邮件和短信投递日志。",
  category: "administration",
  kind: "architecture",
  status: "current",
  audience: ["客服", "管理员", "运维人员"],
  aliases: ["邮件中心", "客服中心配置", "邮件短信日志"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/MailCenterPage.tsx",
    "frontend-user/src/features/admin/pages/SupportCenterConfigPage.tsx",
    "frontend-user/src/features/admin/pages/EmailLogsPage.tsx",
    "backend/internal/supportcenter/service.go",
    "backend/internal/emaillog/handler.go",
  ],
  related: ["feedback-and-support", "admin-messaging", "admin-dashboard"],
  sections: [
    {
      id: "mailbox",
      title: "邮件中心",
      markdown: `进入邮件中心后，可以在客服邮箱工作台筛选来信、阅读正文并直接回复，也可以打开新建邮件弹窗主动发信。下方三张图依次展示邮件模块总览、收件箱工作台和新建邮件弹窗。

邮件中心通过 IMAP 拉取并轮询支持邮箱，通过 SMTP 回复或发信；富文本来信在沙箱中预览，避免直接执行 HTML。这里操作的是配置的客服邮箱，不是所有系统通知的统一重试队列。`,
      embeds: [
        { id: "admin-mail-support" },
        {
          id: "admin-mailbox-workspace",
          caption: "筛选、阅读与回复一体的客服邮箱工作台",
        },
        {
          id: "admin-mail-compose-dialog",
          caption: "管理员主动发送客服邮件的编辑弹窗",
        },
      ],
    },
    {
      id: "support-config",
      title: "客服公开配置",
      markdown: `客服配置页先概览公开联系方式和通道状态，再分别编辑邮箱说明、二维码、IMAP、SMTP 与飞书通知。下图依次展示配置总览和完整通道表单。保存后再执行连接测试；页面有未保存改动时，测试按钮会禁用，避免把旧凭据的成功误认为新凭据有效。

二维码只接受 data URL，最大 300 KiB。飞书配置还包含 Webhook、签名和事件开关。`,
      embeds: [
        { id: "admin-support-config" },
        {
          id: "admin-support-channel-config",
          caption: "公开联系方式、IMAP、SMTP 与飞书通知配置",
        },
      ],
    },
    {
      id: "delivery-logs",
      title: "邮件与短信日志",
      markdown: `进入发送日志后，先查看总数、成功与失败汇总，再在邮件和短信页签之间切换，并按分类、状态或关键词查找记录；失败行会保留原始错误。下图展示的是成功和失败结果并存的代表状态。

底层 email_logs 通过 channel 区分渠道。日志只能用于回看历史投递结果，不表示已经提供一键重发、死信队列或自动补偿。`,
      embeds: [{ id: "admin-delivery-logs" }],
    },
  ],
};
