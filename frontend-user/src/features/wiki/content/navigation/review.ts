import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const reviewNavCategory: WikiNavCategoryMeta = {
  slug: "review",
  title: "智能审稿",
  shortTitle: "审稿",
  description: "按论文类型提交智能审稿，并阅读过程、结果和审稿维度。",
  children: [
    {
      id: "review-introduction",
      title: "功能简介",
      target: primary("peer-review"),
    },
    {
      id: "review-models",
      title: "模型选择",
      target: jump("ai-models-and-runtime-config", "runtime-config"),
    },
    {
      id: "review-purchasing-power",
      title: "大约能用多少次",
      target: jump("ai-models-and-runtime-config", "purchasing-power"),
    },
    {
      id: "review-interface",
      title: "界面介绍",
      children: [
        {
          id: "review-workflow-interface",
          title: "操作流程界面（期刊论文 / 毕业论文）",
          target: primary("peer-review-workflow-guide"),
        },
        {
          id: "review-results-interface",
          title: "审稿结果产物界面（录用 / 返修 / 拒稿）",
          target: primary("peer-review-results-guide"),
        },
        {
          id: "review-dimensions",
          title: "审稿维度",
          target: primary("peer-review-dimensions-guide"),
        },
        {
          id: "review-evaluation-method",
          title: "评价方式（原句 / 建议）",
          target: jump("peer-review-dimensions-guide"),
        },
        {
          id: "review-pagination",
          title: "审稿分页（初审 / 审稿人 / 终审）",
          target: jump("peer-review-results-guide"),
        },
      ],
    },
  ],
};
