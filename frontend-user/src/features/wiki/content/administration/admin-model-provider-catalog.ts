import type { WikiArticle } from "../../types";

export const AdminModelProviderCatalogArticle: WikiArticle = {
  slug: "admin-model-provider-catalog",
  title: "AI Provider 与模型目录",
  summary: "维护兼容上游提供商、模型能力、价格和用户可选策略。",
  category: "administration",
  kind: "architecture",
  status: "current",
  audience: ["AI 平台人员", "管理员", "开发者"],
  aliases: ["Model Catalog", "AI 上游", "模型供应商"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/AiUpstreamPage.tsx",
    "frontend-user/src/features/admin/pages/ModelCatalogPage.tsx",
    "frontend-user/src/features/admin/components/ProviderSection.tsx",
    "frontend-user/src/features/admin/components/ModelFormDialog.tsx",
    "backend/internal/modelcatalog/provider.go",
    "backend/internal/modelcatalog/service.go",
  ],
  related: [
    "agent-runtime",
    "ai-models-and-runtime-config",
    "admin-model-bindings",
    "admin-token-cost",
  ],
  sections: [
    {
      id: "providers",
      title: "Provider",
      markdown: `模型目录先按 Provider 展示端点、推送状态、计价和所属模型；点击新建或编辑后，可以配置名称、API 端点、兼容格式与推送选项。下方三张图依次展示目录总览、单个 Provider 区块和编辑器。

系统预置 DeepSeek，并支持 Qwen、Kimi、智谱、豆包、MiniMax 和自定义 OpenAI 兼容上游。Provider 变更会向执行器推送，并显示 pending、success 或 failed；仍有关联模型时不能删除，页面也会提示孤儿模型。`,
      embeds: [
        { id: "admin-model-catalog" },
        {
          id: "admin-provider-sections",
          caption: "单个 Provider 的推送、计价与所属模型状态",
        },
        {
          id: "admin-provider-editor",
          caption: "模型端点、API 格式与推送配置编辑器",
        },
      ],
    },
    {
      id: "models",
      title: "模型目录与定价",
      markdown: `在 Provider 区块中打开模型编辑器，可以设置上下文长度、最大输入与输出、图片能力、速度定位、输入/输出/缓存读/缓存写四类价格、长输入分档、允许会员档位、启用状态、用户可选性和调用限制；下图展示的是模型参数与价格表单。

每个模型只能归属于一个 Provider。后端不允许四项价格全为零的模型同时设为 enabled 且 user_selectable，避免用户可选模型绕过成本核算。之后改价只影响新的使用；已经记下的历史消耗不会跟着改。`,
      embeds: [
        {
          id: "admin-model-editor",
          caption: "模型参数、四类单价与可见范围编辑器",
        },
      ],
    },
  ],
};
