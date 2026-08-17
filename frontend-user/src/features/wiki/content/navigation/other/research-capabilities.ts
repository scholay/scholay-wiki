import type { WikiNavNode } from "../../../types";
import { primary } from "../targets";

export const researchCapabilitiesNode: WikiNavNode = {
  id: "other-research-capabilities",
  title: "扩展科研能力",
  children: [
    {
      id: "other-ai-research-workflows",
      title: "AI 科研工作流",
      target: primary("ai-research-workflows"),
    },
    {
      id: "other-data-analysis",
      title: "AI 数据分析",
      target: primary("research-data-analysis"),
    },
    {
      id: "other-figures-slides",
      title: "科研绘图与演示文稿",
      target: primary("research-figure-and-slides"),
    },
  ],
};
