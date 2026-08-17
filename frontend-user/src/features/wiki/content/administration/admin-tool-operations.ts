import type { WikiArticle } from "../../types";

export const AdminToolOperationsArticle: WikiArticle = {
  slug: "admin-tool-operations",
  title: "工具目录、导入任务与 Webhook",
  summary: "功能工具的内容生命周期、批量导入任务和出站事件通知。",
  category: "administration",
  kind: "architecture",
  status: "current",
  audience: ["内容运营", "管理员", "开发者"],
  aliases: ["工具管理", "工具导入", "工具 Webhook"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/FeatureToolsPage.tsx",
    "frontend-user/src/features/admin/pages/FeatureToolImportPage.tsx",
    "frontend-user/src/features/admin/pages/FeatureToolJobsPage.tsx",
    "frontend-user/src/features/admin/pages/FeatureToolWebhooksPage.tsx",
    "backend/internal/featuretool/model.go",
    "backend/internal/featuretool/service.go",
    "backend/internal/featuretool/webhook.go",
  ],
  related: ["feature-tools", "admin-skill-moderation"],
  sections: [
    {
      id: "catalog",
      title: "工具内容生命周期",
      markdown: `进入工具管理后，可以按状态浏览目录并打开条目编辑器，修改内容、访问方式和 SEO 信息；下图依次展示工具列表和编辑弹窗。保存前应分别确认用户可见性与搜索收录设置。

工具状态为 draft、pending、published 或 archived。published 控制用户是否可见，seo_indexable 是另一项 SEO 审核结果；公开可见不等于已经允许搜索引擎收录。`,
      embeds: [
        { id: "admin-tool-operations" },
        {
          id: "admin-tool-editor",
          caption: "工具内容、访问方式与 SEO 信息编辑器",
        },
      ],
    },
    {
      id: "imports",
      title: "批量导入与任务",
      markdown: `批量导入时，先上传或粘贴 JSON/ZIP 并查看校验结果，确认后再创建异步任务；任务详情会显示进度、成功与失败数量以及逐条错误。下图依次展示导入入口和任务详情。

JSON 可以是顶层数组，也可以使用 items 或 tools 字段；ZIP 最多处理 5000 项。系统优先按 source_topic_id、其次按 slug 识别重复项。任务从 pending、running 推进到 succeeded、partial 或 failed，并保留逐项结果。`,
      embeds: [
        {
          id: "admin-tool-import",
          caption: "JSON 工具数据校验与异步导入入口",
        },
        {
          id: "admin-tool-import-job-detail",
          caption: "导入任务进度、结果统计与逐条错误",
        },
      ],
    },
    {
      id: "webhooks",
      title: "Webhook 投递边界",
      markdown: `Webhook 页面先列出订阅及最近投递；新建或编辑时填写地址、可选签名密钥和 created、updated、deleted 事件，再用测试功能检查响应。打开投递详情可以查看成功响应或失败原因。下方三张图依次展示订阅列表、编辑器和投递记录。

出站请求会限制 SSRF 风险。当前 Attempt 固定为 1，每次事件只派发一次，没有自动重试循环；失败后需要查看记录并人工重测。`,
      embeds: [
        {
          id: "admin-tool-webhook-list",
          caption: "Webhook 订阅、状态与最近投递列表",
        },
        {
          id: "admin-tool-webhook-editor",
          caption: "地址、签名密钥与订阅事件编辑器",
        },
        {
          id: "admin-tool-webhook-deliveries",
          caption: "成功响应、失败原因与重试记录",
        },
      ],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "当前投递失败不会自动重试。上线前应在接收端完成幂等处理，并把失败监控与人工重测纳入运行流程。",
          },
        },
      ],
    },
  ],
};
