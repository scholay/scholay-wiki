import type { WikiArticle } from "../../types";

export const AdminUserEntitlementGrantsArticle: WikiArticle = {
  slug: "admin-user-entitlement-grants",
  title: "管理员发放会员、科研经费与重置次数",
  summary: "对单个用户直接调整会员、钱包余额和 AI 重置次数的补偿工具。",
  category: "administration",
  kind: "feature",
  status: "current",
  audience: ["管理员", "客服", "财务运营"],
  aliases: ["人工发会员", "余额调整", "Reset Pass 发放"],
  sourcePaths: [
    "frontend-user/src/features/admin/components/UserGrantPanel.tsx",
    "frontend-user/src/features/admin/api/users.ts",
    "backend/internal/vip/admin_user_billing.go",
    "backend/internal/vip/service.go",
    "backend/internal/vip/wallet.go",
  ],
  related: ["membership", "wallet-payg", "gift-codes"],
  sections: [
    {
      id: "membership",
      title: "会员发放与撤销",
      markdown: `在用户详情的权益区域，可以分别发放会员、科研经费或重置次数；选择会员时，再设置 Pro/Max、按天/月/年计时和授予长度。下图依次展示权益概览和单用户发放面板。提交前请再次核对用户、权益种类与期限。

users.manage 单次最多发放 3650 天、120 月或 10 年，超过一年会增加二次确认。撤销会员只把档位恢复为 Free，不会同时清空科研经费或额度重置次数。`,
      embeds: [
        { id: "admin-entitlement-grants" },
        {
          id: "admin-user-grant-panel",
          caption: "会员、科研经费与重置次数的独立发放面板",
        },
      ],
    },
    {
      id: "credit",
      title: "科研经费调整",
      markdown: `科研经费（Credit）支持正向补发和负向扣减，每次调整都会写入不可变的 credit_transactions 记录；扣减后的余额最低为零。当前后台只支持永久科研经费，不提供在此处设置余额到期日的能力。`,
    },
    {
      id: "reset-pass",
      title: "额度重置次数",
      markdown: `额度重置次数（Reset Pass）用于补充可重置额度，前端单次最多发 1000 次，并可设置到期时间。三种权益彼此独立，客服补偿前应先查看用户现有档位、余额和有效期，避免重复发放。`,
    },
  ],
};
