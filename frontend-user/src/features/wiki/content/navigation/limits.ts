import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const limitsNavCategory: WikiNavCategoryMeta = {
  slug: "limits",
  title: "使用限额",
  shortTitle: "限额",
  description: "理解不同套餐的 AI 周期额度、重置和额度外科研经费。",
  children: [
    {
      id: "limits-by-plan",
      title: "不同套餐之间的限额",
      target: primary("ai-usage-quota"),
      children: [
        {
          id: "limits-free-pro-max",
          title: "Free · Pro · Max",
          target: jump("ai-usage-quota", "amounts"),
        },
      ],
    },
    {
      id: "limits-weekly",
      title: "周期额度",
      target: jump("ai-usage-quota", "window"),
    },
    {
      id: "limits-reset",
      title: "限额重置",
      target: primary("quota-block-and-recovery"),
    },
    {
      id: "limits-wallet",
      title: "额度外经费与按量付费",
      target: primary("wallet-payg"),
    },
  ],
};
