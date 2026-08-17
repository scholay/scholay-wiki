import type { WikiNavCategoryMeta } from "../../types";
import { primary } from "./targets";

export const roadmapNavCategory: WikiNavCategoryMeta = {
  slug: "roadmap",
  title: "开发计划",
  shortTitle: "计划",
  description: "区分已经发布、界面预告和尚未形成权威承诺的开发事项。",
  children: [
    {
      id: "roadmap-next-release",
      title: "下一期开发任务",
      target: primary("roadmap-status"),
    },
  ],
};
