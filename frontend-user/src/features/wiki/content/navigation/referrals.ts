import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const referralsNavCategory: WikiNavCategoryMeta = {
  slug: "referrals",
  title: "邀请返利",
  shortTitle: "邀请",
  description: "理解邀请媒介、奖励归因，以及当前没有达人分级的事实边界。",
  children: [
    {
      id: "referrals-promoter-types",
      title: "达人类型",
      target: primary("invitation-rebate-guide"),
      children: [
        {
          id: "referrals-public-promoter",
          title: "全民推广（当前无独立类型）",
          target: jump("invitation-rebate-guide"),
        },
        {
          id: "referrals-creator-promoter",
          title: "达人推广（当前无独立类型）",
          target: jump("invitation-rebate-guide"),
        },
      ],
    },
    {
      id: "referrals-media",
      title: "邀请媒介",
      target: jump("invitation-rebate-guide"),
      children: [
        {
          id: "referrals-link",
          title: "邀请链接",
          target: jump("invitation-rebate-guide"),
        },
        {
          id: "referrals-qr",
          title: "邀请二维码",
          target: jump("invitation-rebate-guide"),
        },
        {
          id: "referrals-code",
          title: "邀请码",
          target: jump("invitation-rebate-guide"),
        },
      ],
    },
    {
      id: "referrals-mechanism",
      title: "返利机制",
      target: primary("invite-campaign"),
    },
  ],
};
