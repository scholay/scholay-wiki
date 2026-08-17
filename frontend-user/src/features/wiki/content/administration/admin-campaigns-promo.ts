import type { WikiArticle } from "../../types";

export const AdminCampaignsPromoArticle: WikiArticle = {
  slug: "admin-campaigns-promo",
  title: "邀请活动与推广弹窗",
  summary: "管理邀请奖励规则与用户侧推广展示，两者共享运营页面但职责不同。",
  category: "administration",
  kind: "rule",
  status: "current",
  audience: ["运营人员", "管理员", "财务运营"],
  aliases: ["Activities", "邀请活动", "Promo 配置"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/ActivitiesPage.tsx",
    "frontend-user/src/features/admin/api/invite-campaign.ts",
    "frontend-user/src/features/admin/api/promo-config.ts",
    "backend/internal/invite/service.go",
    "backend/internal/invite/model.go",
    "backend/internal/promo/service.go",
  ],
  related: ["invite-campaign", "promotion-banner", "admin-invite-analytics"],
  sections: [
    {
      id: "invite-campaign",
      title: "邀请奖励规则",
      markdown: `活动管理页把邀请奖励与推广展示分成两个页签；在邀请页签中，可以设置总开关、双方注册礼、每日计奖人数、绑定时窗、首单返利与有效时窗，以及邀请码帮助链接。下图只展示具备相应权限时的“邀请有礼”页签。

邀请页签和保存 API 都要求 config.manage。两种注册礼单项上限为 10 亿经费；每日上限最高 100 万人，0 表示不限；绑定时窗与首单时窗分别为 1–3650 天，不能合成一个“有效期”；返利为 0–10000 基点；帮助链接必须是完整 HTTP(S) 地址且不超过 500 字符。启用时至少一种注册礼或首单返利非零，新关系会保存当时规则的快照。`,
      embeds: [{ id: "admin-campaigns-promo" }],
    },
    {
      id: "permissions",
      title: "页面可见不等于可编辑",
      markdown: `operations 具备 content.manage，因此可以从活动页面处理内容型推广，但没有 config.manage 时不能修改邀请财务规则。关闭活动会隐藏入口并停止新绑定；已经建立的关系仍按其快照处理，不能把关停理解为自动撤销已承诺奖励。`,
    },
    {
      id: "promo",
      title: "推广展示边界",
      markdown: `切到推广配置后，可以编辑启用状态、微信客服二维码、标题、副标题、福利点和按钮文案，并在同页预览用户弹窗；下图展示的是配置表单与预览同时可见的状态。用户端会按总开关显示“限时活动”入口，并可能在首屏或额度耗尽时弹出。

配置中没有目标地址字段，也没有 Promo 专属的领取、发权益或领取审计 API；扫码或点击本身不会自动发放会员或经费。二维码只接受 PNG、JPEG 或 WebP，解码后不超过 300 KiB。`,
      embeds: [
        {
          id: "admin-promo-config-preview",
          caption: "推广开关、文案与用户端弹窗预览",
        },
      ],
    },
  ],
};
