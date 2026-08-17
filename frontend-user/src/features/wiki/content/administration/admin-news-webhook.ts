import type { WikiArticle } from "../../types";

export const AdminNewsWebhookArticle: WikiArticle = {
  slug: "admin-news-webhook",
  title: "研究新闻 Webhook",
  summary: "接收上游新闻事件、验签去重并说明本地开关与重试能力的边界。",
  category: "administration",
  kind: "architecture",
  status: "current",
  audience: ["内容运营", "管理员", "开发者"],
  aliases: ["News Webhook", "新闻同步", "新闻回调"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/NewsWebhookConfigPage.tsx",
    "frontend-user/src/features/admin/api/news-webhook.ts",
    "backend/internal/news/handler.go",
    "backend/internal/news/repository.go",
    "backend/internal/news/service.go",
  ],
  related: ["research-news", "admin-system-code-snippets"],
  sections: [
    {
      id: "ingestion",
      title: "验签、去重与写入",
      markdown: `研究新闻 Webhook 页面会显示接收地址、共享密钥的掩码、展示开关和事件说明，管理员可以复制地址并按需显示密钥；下图展示的是配置已载入的状态。

接收器对原始请求体做 HMAC 校验，失败即拒绝。支持 created、updated、heat 事件；Redis 提供 24 小时投递锁，数据库保存 delivery 并执行 upsert，处理失败会释放锁。未知事件会被记录并返回 200，但不会更新内容。`,
      embeds: [{ id: "admin-news-webhook" }],
    },
    {
      id: "display-switch",
      title: "后台开关只控制展示",
      markdown: `后台 enabled 是新闻展示开关，不会停止 Webhook 入库。回调地址由 SITE_URL 派生，密钥默认掩码并可显式查看；关停页面展示不能替代撤销上游回调或轮换密钥。`,
    },
    {
      id: "retry-contract",
      title: "重试是上游契约",
      markdown: `页面列出的 1 分钟、5 分钟、30 分钟、2 小时、6 小时重试与最终死信，是要求上游遵守的投递契约；本仓库没有对应本地死信队列、自动重试调度或后台重放 API。不能据此宣称失败新闻会由 Scholay 自动补投。`,
      blocks: [
        { type: "markdown" },
        {
          type: "tip",
          tip: {
            text: "重试时间表是上游投递契约，不是 Scholay 本地自动补投能力。排障时应同时核对上游记录和本地 delivery 状态。",
          },
        },
      ],
    },
  ],
};
