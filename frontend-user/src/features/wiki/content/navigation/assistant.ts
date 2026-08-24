import type { WikiNavCategoryMeta } from "../../types";
import { primary } from "./targets";

export const assistantNavCategory: WikiNavCategoryMeta = {
  slug: "assistant",
  title: "智能助手",
  shortTitle: "助手",
  description: "了解智能助手的定位、界面、会话、附件、社区技能和适用边界。",
  children: [
    {
      id: "assistant-introduction",
      title: "功能简介",
      target: primary("claw"),
    },
    {
      id: "assistant-interface",
      title: "界面介绍",
      target: primary("claw-interface-guide"),
      children: [
        {
          id: "assistant-sessions",
          title: "会话与历史",
          target: primary("claw-sessions"),
        },
        {
          id: "assistant-attachments",
          title: "附件、文库引用与社区技能",
          target: primary("claw-attachments-and-references"),
        },
        {
          id: "assistant-community-skills",
          title: "社区技能",
          target: primary("community-skills"),
        },
        {
          id: "assistant-stream-states",
          title: "卡住与发不出去",
          target: primary("claw-stream-tool-states"),
        },
      ],
    },
    {
      id: "assistant-vs-smart-search",
      title: "智能助手 vs 智能搜论文",
      target: primary("search-entry-comparison"),
    },
  ],
};
