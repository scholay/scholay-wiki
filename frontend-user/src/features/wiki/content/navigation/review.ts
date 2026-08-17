import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const reviewNavCategory: WikiNavCategoryMeta = {
  slug: "review",
  title: "智能审稿",
  shortTitle: "审稿",
  description: "按论文类型完成 AI 评审，并正确理解过程、结果、维度和分页。",
  children: [
    {
      id: "review-introduction",
      title: "功能简介",
      target: primary("peer-review"),
    },
    {
      id: "review-interface",
      title: "界面介绍",
      children: [
        {
          id: "review-workflow-interface",
          title: "操作流程界面",
          target: primary("peer-review-workflow-guide"),
          children: [
            {
              id: "review-journal-paper-flow",
              title: "期刊论文审稿流程",
              target: jump("peer-review-workflow-guide"),
            },
            {
              id: "review-thesis-flow",
              title: "毕业论文审稿流程",
              target: jump("peer-review-workflow-guide"),
            },
          ],
        },
        {
          id: "review-results-interface",
          title: "审稿结果产物界面",
          target: primary("peer-review-results-guide"),
          children: [
            {
              id: "review-result-accept",
              title: "录用",
              target: jump("peer-review-results-guide"),
            },
            {
              id: "review-result-revise",
              title: "返修",
              target: jump("peer-review-results-guide"),
            },
            {
              id: "review-result-reject",
              title: "拒稿",
              target: jump("peer-review-results-guide"),
            },
          ],
        },
        {
          id: "review-dimensions",
          title: "审稿维度",
          target: primary("peer-review-dimensions-guide"),
        },
        {
          id: "review-evaluation-method",
          title: "评价方式",
          target: jump("peer-review-dimensions-guide"),
          children: [
            {
              id: "review-evaluation-original",
              title: "原句",
              target: jump("peer-review-dimensions-guide"),
            },
            {
              id: "review-evaluation-advice",
              title: "建议",
              target: jump("peer-review-dimensions-guide"),
            },
          ],
        },
        {
          id: "review-pagination",
          title: "审稿分页",
          target: jump("peer-review-results-guide"),
          children: [
            {
              id: "review-pagination-initial",
              title: "初审",
              target: jump("peer-review-results-guide"),
            },
            {
              id: "review-pagination-reviewers",
              title: "审稿人",
              target: jump("peer-review-results-guide"),
            },
            {
              id: "review-pagination-final",
              title: "终审",
              target: jump("peer-review-results-guide"),
            },
          ],
        },
      ],
    },
  ],
};
