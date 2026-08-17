import type { WikiArticle } from "../../types";

export const AdminModelBindingsArticle: WikiArticle = {
  slug: "admin-model-bindings",
  title: "模型用途绑定",
  summary: "把封闭的系统与项目用途键映射到模型目录中的具体模型。",
  category: "administration",
  kind: "rule",
  status: "current",
  audience: ["AI 平台人员", "管理员", "开发者"],
  aliases: ["Model Binding", "项目模型", "Purpose Binding"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/ModelCatalogPage.tsx",
    "frontend-user/src/features/admin/api/model-catalog.ts",
    "backend/internal/modelcatalog/model.go",
    "backend/internal/modelcatalog/repository.go",
    "backend/internal/modelcatalog/service.go",
  ],
  related: ["admin-model-provider-catalog", "admin-analysis-dimensions"],
  sections: [
    {
      id: "purposes",
      title: "封闭用途集合",
      markdown: `模型用途页按固定 key 列出每个系统或产品用途及当前目标模型；选择一行后只能更换模型，不能改用途 key。下图展示的是多项用途已经完成绑定的状态。

当前共 10 个规范用途：system.main、system.fast、project.smart、project.claw、project.prism、project.peerreview.meta、project.peerreview.methodology、project.translate、project.analysis 和 project.wechat_oa。`,
      embeds: [{ id: "admin-model-bindings" }],
    },
    {
      id: "aliases",
      title: "别名与回退",
      markdown: `slides、draw、stat 归一到 claw；letter 归一到 peerreview.meta；scoring 和 chief 归一到 peerreview.methodology；planner 和 revision 归一到 prism，历史 free 覆盖已经退役。缺少专用绑定时回退 system.main；保存后会失效缓存并向执行器推送。`,
    },
  ],
};
