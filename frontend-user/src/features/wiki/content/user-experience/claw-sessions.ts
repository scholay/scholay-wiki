import type { WikiArticle } from "../../types";

export const ClawSessionsArticle: WikiArticle = {
  slug: "claw-sessions",
  title: "Claw 会话与历史",
  summary:
    "创建、切换、重命名和删除自己的 Claw 会话，并在长历史中分批加载较早轮次。",
  category: "research-ai",
  kind: "feature",
  status: "current",
  audience: ["Claw 用户", "研究者"],
  aliases: ["Claw 历史", "新对话", "会话重命名"],
  sourcePaths: [
    "frontend-user/src/features/claw/routes.tsx",
    "frontend-user/src/features/claw/api/session.ts",
    "frontend-user/src/features/claw/components/sidebar/ClawSessionList.tsx",
    "frontend-user/src/features/claw/components/sidebar/ClawSessionDialogs.tsx",
    "frontend-user/src/features/claw/hooks/makeAgentConversationHook.ts",
  ],
  related: [
    "claw",
    "claw-attachments-and-references",
    "claw-stream-tool-states",
  ],
  sections: [
    {
      id: "routes",
      title: "会话入口",
      markdown: `打开 Claw 时会进入新对话或恢复当前入口；从会话历史选择一条记录后，会打开对应对话。列表按最近访问时间组织，并且只显示当前账户拥有的会话。切换会话时，页面会更新当前地址并重新连接该对话的实时状态。`,
    },
    {
      id: "management",
      title: "管理动作",
      markdown: `在桌面端从对话区顶部打开会话历史，或在手机端拉出会话抽屉，就可以新建、切换、重命名和删除对话；下图展示桌面历史列表。标题不能为空，删除前会再次确认；删除当前会话后会切到剩余会话，没有其他记录时回到新对话。

每个会话会保存自己的模型选择，刷新页面或换设备后仍以该会话已经保存的选择为准。`,
      embeds: [{ id: "claw-session-history" }],
    },
    {
      id: "history-window",
      title: "长历史加载",
      markdown: `打开很长的会话时，页面会先载入最近 100 轮；点击“加载更早”，每次再增加 100 轮。为了保持滚动流畅，页面先显示最近 60 轮，再分批展开。每条历史记录始终归属于自己的会话，切换会话不会把两边的消息混在一起。`,
    },
  ],
};
