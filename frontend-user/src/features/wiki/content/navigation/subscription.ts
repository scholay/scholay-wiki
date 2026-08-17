import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const subscriptionNavCategory: WikiNavCategoryMeta = {
  slug: "subscription",
  title: "会员订阅",
  shortTitle: "订阅",
  description: "查看订阅渠道、费用口径、活动边界和购买升级规则。",
  children: [
    {
      id: "subscription-channels",
      title: "订阅渠道",
      target: primary("membership-subscription-guide"),
      children: [
        {
          id: "subscription-alipay",
          title: "支付宝",
          target: jump("membership-subscription-guide"),
        },
        {
          id: "subscription-wechat",
          title: "微信",
          target: jump("membership-subscription-guide"),
        },
        {
          id: "subscription-unionpay",
          title: "云闪付（预留，未开放）",
          target: jump("membership-subscription-guide"),
        },
        {
          id: "subscription-claim",
          title: "领取",
          target: primary("gift-codes"),
        },
      ],
    },
    {
      id: "subscription-fees",
      title: "订阅费用",
      target: primary("subscription-lifecycle"),
      children: [
        {
          id: "subscription-official-pricing",
          title: "官方定价",
          target: jump("membership"),
        },
        {
          id: "subscription-events",
          title: "活动",
          target: primary("promotion-banner"),
        },
        {
          id: "subscription-limited-offer",
          title: "限时优惠（以当期活动为准）",
          target: jump("promotion-banner"),
        },
        {
          id: "subscription-invite-reward",
          title: "邀请奖励（不是订单优惠）",
          target: jump("invite-campaign"),
        },
      ],
    },
    {
      id: "subscription-pricing",
      title: "定价",
      target: primary("membership"),
      children: [
        {
          id: "subscription-pricing-free",
          title: "Free",
          target: jump("membership", "tiers"),
        },
        {
          id: "subscription-pricing-pro",
          title: "Pro",
          target: jump("membership", "tiers"),
        },
        {
          id: "subscription-pricing-max",
          title: "Max",
          target: jump("membership", "tiers"),
        },
      ],
    },
    {
      id: "subscription-orders",
      title: "支付与订单",
      target: primary("payment-orders"),
    },
  ],
};
