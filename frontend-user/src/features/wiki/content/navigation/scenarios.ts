import type { WikiNavCategoryMeta } from "../../types";
import { jump, primary } from "./targets";

export const scenariosNavCategory: WikiNavCategoryMeta = {
  slug: "scenarios",
  title: "常见场景",
  shortTitle: "场景",
  description: "按论文查询、分析、资源管理、期刊库查询和论文写作完成一项任务。",
  children: [
    {
      id: "scenarios-literature-query",
      title: "文献查询",
      children: [
        {
          id: "scenarios-traditional-search",
          title: "如何使用论文库搜索",
          target: primary("literature-search-guide"),
        },
        {
          id: "scenarios-smart-search",
          title: "如何使用智能搜论文",
          target: primary("smart-literature-search-guide"),
        },
        {
          id: "scenarios-staging-area",
          title: "用暂存区收集候选文献",
          target: primary("staging-area"),
        },
      ],
    },
    {
      id: "scenarios-literature-analysis",
      title: "文献分析",
      children: [
        {
          id: "scenarios-matrix-analysis",
          title: "矩阵分析",
          target: primary("matrix-analysis"),
        },
        {
          id: "scenarios-pdf-chat",
          title: "PDF Chat",
          target: primary("pdf-chat-guide"),
        },
        {
          id: "scenarios-literature-graph",
          title: "文献图谱",
          target: primary("literature-graph-status"),
        },
        {
          id: "scenarios-pdf-reader",
          title: "PDF 阅读器",
          target: primary("pdf-reader"),
        },
        {
          id: "scenarios-open-access-translation",
          title: "开放获取与论文翻译",
          target: primary("open-access-and-paper-translation"),
        },
      ],
    },
    {
      id: "scenarios-literature-management",
      title: "文献管理",
      children: [
        {
          id: "scenarios-favorite-paper",
          title: "将搜索到的文献收藏",
          target: primary("paper-favorites"),
        },
        {
          id: "scenarios-upload-paper",
          title: "上传自己本地的文献",
          target: primary("pdf-upload-resolve-and-relink"),
        },
      ],
    },
    {
      id: "scenarios-journal-query",
      title: "期刊库查询",
      children: [
        {
          id: "scenarios-search-journal",
          title: "如何使用期刊库搜索",
          target: jump("journal-search-page"),
        },
        {
          id: "scenarios-paper-journal",
          title: "查看一篇论文所关联的期刊",
          target: jump("paper-detail-and-actions"),
        },
        {
          id: "scenarios-latex-template",
          title: "LaTeX 模板",
          target: primary("journal-submission-resources"),
        },
      ],
    },
    {
      id: "scenarios-paper-writing",
      title: "论文写作",
      children: [
        {
          id: "scenarios-manuscript-publication",
          title: "稿件 vs 出版物",
          target: jump("manuscript-vs-publication"),
        },
        {
          id: "scenarios-writing-scholay",
          title: "Scholay 功能",
          children: [
            {
              id: "scenarios-writing-review",
              title: "智能审稿",
              target: jump("peer-review"),
              children: [
                {
                  id: "scenarios-review-paper-types",
                  title: "论文类型：期刊论文与毕业论文",
                  target: jump("peer-review-workflow-guide"),
                },
                {
                  id: "scenarios-review-process",
                  title: "审稿流程",
                  target: jump("peer-review-workflow-guide"),
                },
                {
                  id: "scenarios-review-dimensions",
                  title: "审稿维度",
                  target: jump("peer-review-dimensions-guide"),
                },
              ],
            },
            {
              id: "scenarios-writing-prism",
              title: "智能写作",
              target: jump("prism-writing-workflow"),
            },
          ],
        },
      ],
    },
  ],
};
