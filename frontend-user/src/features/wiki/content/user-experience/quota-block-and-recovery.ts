import type { WikiArticle } from "../../types";

export const QuotaBlockAndRecoveryArticle: WikiArticle = {
  slug: "quota-block-and-recovery",
  title: "AI 额度阻断与恢复",
  summary:
    "区分起跑前额度阻断与回合内成本停止，并按账户条件选择重置、升级、经费续用或充值。",
  category: "membership",
  kind: "rule",
  status: "current",
  audience: ["使用 AI 的登录用户", "会员用户"],
  aliases: ["额度耗尽", "被拦消息", "用经费继续", "额度重置"],
  sourcePaths: [
    "frontend-user/src/stores/quota.store.ts",
    "frontend-user/src/shared/components/chat/QuotaComposerStrip.tsx",
    "frontend-user/src/shared/components/quota-recovery.tsx",
    "frontend-user/src/shared/components/QuotaNotifier.tsx",
    "frontend-user/src/shared/components/funds-reminder/FundsReminder.tsx",
    "frontend-user/src/stores/funds-reminder.store.ts",
    "frontend-user/src/features/claw/components/chat/ConversationWorkspace.tsx",
    "frontend-user/src/features/search/components/smart-search/SmartSearchPanel.tsx",
    "frontend-user/src/features/prism/components/PrismChatPanel.tsx",
    "frontend-user/src/features/claw/hooks/makeAgentConversationHook.ts",
    "backend/internal/agentbridge/spec.go",
    "backend/internal/agentbridge/hub.go",
    "backend/internal/vip/quota.go",
  ],
  related: ["ai-usage-quota", "wallet-payg", "claw-stream-tool-states"],
  sections: [
    {
      id: "blocked-message",
      title: "被拦消息不会假装已发送",
      markdown: `额度不足时，本轮消息会明确显示为“未发送/额度不足”，输入文字、文库引用和已经保存的附件仍留在当前会话中。下图只展示全局系统通知的一种样式；Claw、智能搜论文和 Prism 的输入区恢复条，以及矩阵、翻译、审稿等操作的弹窗，不在此图中。`,
      embeds: [{ id: "quota-status-toasts" }],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "article-link",
          card: {
            articleSlug: "ai-usage-quota",
            sectionId: "accounting",
            title: "为什么这轮任务会被额度门禁拦下",
            description:
              "了解所有 AI 功能共享的成本额度、恢复周期和真实成本记账方式。",
            icon: "sparkles",
          },
        },
      ],
    },
    {
      id: "recovery-actions",
      title: "按条件出现的四类出口",
      markdown: `Claw、智能搜论文和 Prism 会把提醒放在输入框上方，其他功能可打开全局对话框。页面会根据资产与档位给出可用动作，而不是同时固定显示四个按钮：有重置次数时显示“立即恢复”；Free 显示“升级会员”，Pro 显示“升级 Max”，Max 不再显示升级；付费会员有经费但未开启续用时显示“用经费继续”；需要补充经费时显示“充值经费”。

重置会立即恢复满额并重新开始周期；经费续用只支付超出周期额度的部分，之后可在账户资产中关闭。下方两张示意分别说明旧恢复动作和当前条件化经费提醒。`,
      embeds: [{ id: "quota-recovery" }, { id: "funds-reminder" }],
      blocks: [
        { type: "markdown" },
        { type: "embeds" },
        {
          type: "tip",
          tip: {
            text: "先确认原消息仍标记为未发送，再选择恢复方式。重置会立即开始新周期；“用经费继续”只在你明确开启后按超额部分结算。",
          },
        },
        {
          type: "article-link",
          card: {
            articleSlug: "wallet-payg",
            sectionId: "autopay",
            title: "“用经费继续”怎样结算",
            description:
              "了解开关不会预扣、在途回合怎样记账，以及为什么低余额可能出现小额负数。",
            icon: "resource",
          },
        },
      ],
    },
    {
      id: "mid-turn-stop",
      title: "已经开始后也可能因成本上限停止",
      markdown: `Claw、智能搜论文、Prism、科研绘图、数据分析和 Boltslides 会在本轮执行中累计模型调用成本；达到动态 TurnCostCap 时，系统会请求停止并把回合记为 aborted，已经生成的内容仍保留。这与“发送前被拦”不同：前者已有部分输出，后者消息根本没有送达。

未知模型、旧执行器没有上报增量用量或无法取得价格时会 fail-open，最终仍按真实成本记账。智能审稿为了完成整套任务不采用回合内硬停，而以自己的起跑门禁控制。`,
    },
    {
      id: "resume",
      title: "恢复原任务",
      markdown: `重置额度或开启经费续用成功后，页面会刷新额度，并允许你重新发送刚才被拦下的消息；也可以选择忽略它。关闭提示本身不会恢复额度，也不会把未发送的消息改成已发送。`,
      blocks: [
        { type: "markdown" },
        {
          type: "next-steps",
          group: {
            title: "恢复后继续",
            description: "重新发送前确认额度或经费状态，之后再核对实际流水。",
            items: [
              {
                articleSlug: "ai-usage-quota",
                sectionId: "amounts",
                title: "查看当前额度与恢复时间",
                description:
                  "以账户资产页的当前百分比和恢复时间判断是否已经恢复。",
                icon: "search",
              },
              {
                articleSlug: "wallet-payg",
                sectionId: "balance",
                title: "核对科研经费余额与流水",
                description:
                  "在开启按量续用后区分周期额度与经费变化，检查实际结算记录。",
                icon: "resource",
              },
            ],
          },
        },
      ],
    },
  ],
};
