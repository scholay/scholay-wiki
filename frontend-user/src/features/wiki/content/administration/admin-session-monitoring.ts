import type { WikiArticle } from "../../types";

export const AdminSessionMonitoringArticle: WikiArticle = {
  slug: "admin-session-monitoring",
  title: "AI 会话监控",
  summary: "只读检查多个 AI 功能的会话、消息、工具调用和产物。",
  category: "administration",
  kind: "page",
  status: "current",
  audience: ["管理员", "技术支持", "安全人员"],
  aliases: ["会话监控", "Agent 会话审计", "Peer Review 调试"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/SessionMonitorPage.tsx",
    "frontend-user/src/features/admin/components/ChatSessionMonitor.tsx",
    "frontend-user/src/features/admin/components/PeerReviewMonitor.tsx",
    "backend/internal/agentbridge/admin_monitor.go",
    "backend/internal/peerreview/admin.go",
  ],
  related: ["agent-runtime", "peer-review", "admin-token-cost"],
  sections: [
    {
      id: "coverage",
      title: "覆盖范围与刷新",
      markdown: `AI 会话监控可以在 smart、claw、slides、draw、stat、prism 和 peer review 之间切换；通用会话按搜索词、模型、轮次、重置状态和时间筛选，Peer Review 则提供投稿检索、评审模式与执行状态。下图依次展示通用会话总览和 Peer Review 监控面板。

通用列表每页 20 条并每 30 秒刷新。详情可查看消息、工具调用、附件与产物；Peer Review 还保留偏调试用途的原始记录。`,
      embeds: [
        { id: "admin-session-monitoring" },
        {
          id: "admin-peer-review-monitor",
          caption: "投稿检索、评审模式与执行状态总览",
        },
      ],
    },
    {
      id: "read-only",
      title: "只读与隐私边界",
      markdown: `点击监控记录后，可以只读查看对话与工具调用、智能审稿的投稿和进度，并在受控预览器中打开附件。下方三张图依次展示通用会话详情、Peer Review 详情和文件预览。

这些页面要求 analytics.view，只用于排障，不能修改会话或代替用户继续对话。记录可能包含未发表研究、附件和模型输出，应按敏感业务数据处理；拥有后台权限不代表可以无目的浏览。`,
      embeds: [
        {
          id: "admin-chat-session-detail",
          caption: "包含消息与工具调用的只读会话抽屉",
        },
        {
          id: "admin-peer-review-detail",
          caption: "投稿信息、评审进度与原始记录详情",
        },
        {
          id: "admin-file-preview",
          caption: "会话附件的受控预览界面",
        },
      ],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "未发表研究、附件和模型输出都属于敏感业务数据。只在明确排障目的和授权范围内查看，禁止无目的浏览或外传。",
          },
        },
      ],
    },
  ],
};
