import type { WikiArticle } from "../../types";

export const AdminThirdPartyAccountPoolArticle: WikiArticle = {
  slug: "admin-third-party-account-pool",
  title: "第三方账号池",
  summary: "维护 AI model 与 Minicod 外部账号、健康状态和敏感凭据。",
  category: "administration",
  kind: "entity",
  status: "current",
  audience: ["管理员", "AI 平台人员", "安全人员"],
  aliases: ["Third Party Accounts", "AI 账号池", "Minicod 账号"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/ThirdPartyPage.tsx",
    "frontend-user/src/features/admin/api/third-party.ts",
    "backend/internal/thirdparty/model.go",
    "backend/internal/thirdparty/repository.go",
    "backend/internal/thirdparty/service.go",
  ],
  related: ["admin-model-provider-catalog", "admin-dashboard"],
  sections: [
    {
      id: "routing",
      title: "账号选择与健康",
      markdown: `第三方账号池会列出 AI model 和 Minicod 账号的状态、优先级、成功数、失败数与延迟，并提供测试、重置、编辑或删除动作；下图展示的是多账号及健康状态并存的列表。

选择账号时，优先级数值越小越先使用，同优先级再参考使用次数。账号池与模型 Provider、用途绑定属于不同配置层，排障时不要混为一项。`,
      embeds: [{ id: "admin-third-party-accounts" }],
    },
    {
      id: "secrets",
      title: "敏感信息显示",
      markdown: `打开账号编辑器后，字段会按 AI model 或 Minicod 类型变化，敏感值默认保持掩码；只有主动选择显示敏感信息时才请求明文。下图展示的是凭据编辑状态。

关闭对话框后应立即恢复隐藏。一次显示可能返回该账号的完整相关密钥，屏幕共享、截图和浏览器日志都可能造成泄露。历史 AI model 账号仍存在，但新功能也可能使用模型目录与 Agent 执行器，排障前应先确认实际调用链。`,
      embeds: [
        {
          id: "admin-third-party-editor",
          caption: "按账号类型切换字段的敏感凭据编辑器",
        },
      ],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "显示明文密钥前先停止屏幕共享和录屏。查看后立即关闭编辑器；不要把凭据复制到工单、聊天记录或截图中。",
          },
        },
      ],
    },
  ],
};
