import type { WikiArticle } from "../../types";

export const AdminTokenCostArticle: WikiArticle = {
  slug: "admin-token-cost",
  title: "算力用量统计",
  summary: "按功能、模型、提供商和用户核算 LLM 算力点、Token 与实际成本。",
  category: "administration",
  kind: "page",
  status: "current",
  audience: ["管理员", "财务运营", "AI 平台人员"],
  aliases: ["Token Usage", "LLM 成本", "算力点成本"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/TokenUsageStatsPage.tsx",
    "frontend-user/src/features/admin/api/token-usage.ts",
    "backend/internal/llmusage/models_admin.go",
    "backend/internal/llmusage/service_stats.go",
    "backend/internal/modelcatalog/service.go",
  ],
  related: [
    "ai-usage-quota",
    "admin-model-provider-catalog",
    "admin-billing-configuration",
  ],
  sections: [
    {
      id: "dimensions",
      title: "统计维度",
      markdown: `进入算力统计后，先按日期、功能、来源、模型、Provider、用户或匿名身份筛选，再查看核心指标与每日趋势；继续向下可以比较功能、模型、Provider 和用户占比，最后检查单次调用日志。下方四张图依次展示页面总览、筛选与趋势、维度拆分和调用明细。

数据来自 llm_token_usage，主口径是算力点，同时汇总输入/输出 Token、缓存读写、调用数、独立用户和未计价调用。维度顺序为模型、功能、来源、Provider、Top 用户，横条长度表示算力点占比。导出沿用当前筛选，最多 100000 条，并附 UTF-8 BOM 以便表格软件正确识别中文。`,
      embeds: [
        { id: "admin-token-cost" },
        {
          id: "admin-token-usage-filters-chart",
          caption: "算力筛选条件、核心指标与每日趋势",
        },
        {
          id: "admin-token-usage-dimensions",
          caption: "功能、模型、Provider 与用户维度拆分",
        },
        {
          id: "admin-token-usage-logs",
          caption: "单次调用的 Token、算力点与结果日志",
        },
      ],
    },
    {
      id: "pricing",
      title: "成本口径",
      markdown: `系统中 1 算力点 = 1000 微元 = ¥0.001，与用户额度扣减同源同单位。实际成本分别使用模型目录中的输入、输出、缓存读取和缓存写入价格计算；未计价调用不会折算为算力点，并从总算力点中排除。它表示成本未知，不表示模型免费或没有 Token 消耗。`,
    },
  ],
};
