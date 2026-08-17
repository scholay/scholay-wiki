import type { WikiArticle } from "../../types";

export const AdminAnalysisDimensionsArticle: WikiArticle = {
  slug: "admin-analysis-dimensions",
  title: "矩阵分析维度",
  summary: "维护论文矩阵分析所用的系统维度名称、描述、排序和启用状态。",
  category: "administration",
  kind: "entity",
  status: "current",
  audience: ["AI 产品运营", "管理员", "开发者"],
  aliases: ["Dimensions", "分析维度", "矩阵维度"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/DimensionsPage.tsx",
    "frontend-user/src/features/admin/api/dimensions.ts",
    "backend/internal/ai/model.go",
    "backend/internal/ai/service_dimension.go",
    "backend/internal/ai/handler.go",
  ],
  related: ["matrix-analysis", "admin-model-bindings"],
  sections: [
    {
      id: "records",
      title: "系统维度",
      markdown: `矩阵维度页列出系统维度及排序、描述和启用状态；打开编辑器后，可以修改名称、AI 指示、排序和启用状态。下图依次展示维度列表和编辑器。

维度来自动态 API，不能把页面注释中的固定数量当作产品契约。系统维度使用 user_id = -1；名称和描述不超过 100 字符，key 锁定，用户自定义维度仍属于另一层数据。`,
      embeds: [
        { id: "admin-analysis-dimensions" },
        {
          id: "admin-dimension-editor",
          caption: "维度名称、AI 指示、排序与启用状态编辑器",
        },
      ],
    },
    {
      id: "prompt-impact",
      title: "对模型提示的影响",
      markdown: `维度描述会直接拼入分析提示，停用会影响所有后续矩阵分析调用，因此文案修改属于模型行为变更。若系统维度列表为空，更可能是迁移或配置异常，不应把空列表当成产品默认状态。`,
      blocks: [
        { type: "markdown" },
        {
          type: "tip",
          tip: {
            text: "修改维度描述就是修改模型行为。发布前应用一组固定论文做回归对比，并记录修改人、目的和预期变化。",
          },
        },
        {
          type: "article-link",
          card: {
            articleSlug: "matrix-analysis",
            sectionId: "model",
            title: "查看用户真正填写的维度描述",
            description:
              "对照矩阵中的可复制维度示例，检查后台文案是否可核对、可复用且不诱导模型补造信息。",
            icon: "sparkles",
          },
        },
      ],
    },
  ],
};
