import type { WikiArticle } from "../../types";

export const AdminBillingConfigurationArticle: WikiArticle = {
  slug: "admin-billing-configuration",
  title: "AI 计费配置",
  summary: "控制免费窗口、会员倍率、套餐价格和经费换算的全局计费规则。",
  category: "administration",
  kind: "rule",
  status: "current",
  audience: ["管理员", "财务运营", "AI 平台人员"],
  aliases: ["Billing Config", "计费倍率", "经费换算"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/BillingConfigPage.tsx",
    "frontend-user/src/features/admin/api/billing-config.ts",
    "backend/internal/vip/billing_model.go",
    "backend/internal/vip/config.go",
    "backend/internal/vip/billing_test.go",
  ],
  related: ["membership", "wallet-payg", "admin-token-cost"],
  sections: [
    {
      id: "switches",
      title: "计费开关与倍率",
      markdown: `AI 计费页集中展示总开关、免费窗口、Pro/Max 倍率、月年价格、充值汇率、经费到算力点换算和最低充值；修改后先核对差异摘要，再确认保存。下图展示的是各组配置已载入的代表状态。

enabled 为 false 时，AI 调用不计费，也不受这套计费限制。倍率小于等于零表示不限量，年度价格为零会隐藏年付选项。经费→重置次数换算率仍只读显示，用于历史迁移换算，不参与当前计费判断。`,
      embeds: [{ id: "admin-billing-configuration" }],
    },
    {
      id: "validation",
      title: "服务端约束",
      markdown: `启用后免费窗口必须大于零，经费到算力点换算必须为正；后端还要求按量付费严格贵于所有已配置套餐，防止价格倒挂。聚合配置缓存 30 秒，保存会主动失效缓存；前端以差异摘要和确认框降低误改风险。`,
    },
  ],
};
