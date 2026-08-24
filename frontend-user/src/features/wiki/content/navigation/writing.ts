import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const writingNavCategory: WikiNavCategoryMeta = {
  slug: "writing",
  title: "智能写作",
  shortTitle: "写作",
  description: "从智能写作工作区开始一次完整写作，并理解 LaTeX 工程和稿件状态。",
  children: [
    {
      id: "writing-introduction",
      title: "功能简介",
      target: primary("prism"),
    },
    {
      id: "writing-interface",
      title: "界面介绍",
      target: primary("prism-interface-guide"),
    },
    {
      id: "writing-complete-workflow",
      title: "怎样开始一次完整的智能写作",
      target: primary("prism-writing-workflow"),
    },
    {
      id: "writing-latex-project",
      title: "什么是 LaTeX 工程",
      target: primary("latex-project-guide"),
      children: [
        {
          id: "writing-prism-latex",
          title: "智能写作与 LaTeX",
          target: jump("latex-project-guide"),
        },
        {
          id: "writing-latex-benefits",
          title: "LaTeX 的好处",
          target: jump("latex-project-guide"),
        },
        {
          id: "writing-journal-latex-download",
          title: "期刊库搜索中的 LaTeX 下载",
          target: jump("journal-submission-resources"),
        },
      ],
    },
    {
      id: "writing-manuscript-publication",
      title: "稿件与出版物的区别",
      target: primary("manuscript-vs-publication"),
    },
    {
      id: "writing-supporting-tools",
      title: "写作配套工具",
      children: [
        {
          id: "writing-citation-generator",
          title: "引用生成器",
          target: primary("citation-generator"),
        },
        {
          id: "writing-citation-dialog",
          title: "引用弹窗与默认格式",
          target: primary("citation-dialog"),
        },
      ],
    },
  ],
};
