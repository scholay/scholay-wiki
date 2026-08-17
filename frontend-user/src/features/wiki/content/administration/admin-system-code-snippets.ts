import type { WikiArticle } from "../../types";

export const AdminSystemCodeSnippetsArticle: WikiArticle = {
  slug: "admin-system-code-snippets",
  title: "系统配置与代码片段",
  summary:
    "管理站点级认证、通知通道、统计标签，以及可注入页面的 HTML/JavaScript。",
  category: "administration",
  kind: "rule",
  status: "current",
  audience: ["管理员", "运维人员", "安全人员"],
  aliases: ["System Config", "Code Snippets", "全局脚本"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/SystemConfigPage.tsx",
    "frontend-user/src/features/admin/pages/CodeSnippetsPage.tsx",
    "frontend-user/src/features/admin/components/ConfigPageGuard.tsx",
    "backend/internal/config/handler_system.go",
    "backend/internal/config/handler_snippets.go",
    "backend/internal/common/model/code_snippet.go",
  ],
  related: [
    "admin-access-control",
    "admin-oauth-config",
    "admin-payment-merchants",
  ],
  sections: [
    {
      id: "system",
      title: "站点级配置",
      markdown: `系统设置页先概览站点安全与通知通道，再分别编辑邮箱验证、Turnstile、Google Analytics/GTM、邮件 SMTP 和短信网关，并执行连接测试。下图依次展示系统总览和基础/邮件/短信表单。

修改要求 config.manage，多数配置以整行 PUT 保存。页面会处理加载失败、未保存改动和离页提醒，但这不等于数据库级全局审计日志。维护状态会显示在后台全局提醒中，不过当前系统设置页没有维护模式编辑控件。`,
      embeds: [
        { id: "admin-system-config" },
        {
          id: "admin-system-channel-forms",
          caption: "基础安全、邮件 SMTP 与短信网关配置面板",
        },
      ],
    },
    {
      id: "snippets",
      title: "代码片段",
      markdown: `代码片段页列出已配置脚本及启用、位置和作用范围；打开编辑器后，再填写类别、注入位置、优先级、加载时机、全局或路径范围，以及 HTML/JavaScript 内容。下图依次展示片段列表和高风险编辑弹窗。

类别为 SEO、analytics、ad、social 或 other，位置为 head、body-start 或 body-end。内容允许任意 HTML/JavaScript，错误配置可能造成 XSS、供应链或全站性能风险；应像发布代码一样评审，并留存可回滚文本。`,
      embeds: [
        { id: "admin-code-snippets" },
        {
          id: "admin-code-snippet-editor",
          caption: "全站注入脚本的高风险编辑弹窗",
        },
      ],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "任意 HTML/JavaScript 都可能引入 XSS、供应链和全站性能风险。启用前按代码发布标准评审，并保留可立即回滚的上一版文本。",
          },
        },
      ],
    },
  ],
};
