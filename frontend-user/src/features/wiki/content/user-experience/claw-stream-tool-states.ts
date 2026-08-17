import type { WikiArticle } from "../../types";

export const ClawStreamToolStatesArticle: WikiArticle = {
  slug: "claw-stream-tool-states",
  title: "Claw 卡住、发不出去和断线",
  summary:
    "发送后没有回应、任务停很久、连接中断，或同一个对话在另一个窗口打开时，页面会怎么提示，你可以怎么处理。",
  category: "research-ai",
  kind: "feature",
  status: "current",
  audience: ["Claw 用户", "研究者"],
  aliases: [
    "Claw 卡住",
    "工具调用",
    "消息未发送",
    "连接重试",
    "流式连接",
    "异常状态",
  ],
  sourcePaths: [
    "frontend-user/src/features/claw/hooks/makeAgentConversationHook.ts",
    "frontend-user/src/shared/hooks/useAgentSocket.ts",
    "frontend-user/src/features/claw/components/chat/ConnectionBadge.tsx",
    "frontend-user/src/shared/components/chat/ToolCallBlock.tsx",
    "frontend-user/src/shared/components/chat/StallNotice.tsx",
    "frontend-user/src/shared/components/AgentDisplacedBanner.tsx",
  ],
  related: [
    "claw",
    "claw-sessions",
    "quota-block-and-recovery",
    "agent-runtime",
  ],
  sections: [
    {
      id: "delivery",
      title: "消息发出去了吗",
      markdown: `点发送之后，页面会等助手开始回应。如果大约 10 秒都没有任何动静，这一轮会标成“未发送”，并出现一键重发。你刚才打的字还在，不会丢。

有时其实已经发出去了，只是提示来晚了——这种提示会自己消失，不用刷新页面。就算多点几次重发，同一条消息也不会被处理两遍。

如果是额度不够被拦住，提示同样是“未发送”，但原因是额度而不是网络。恢复额度后再重发即可。`,
    },
    {
      id: "stream",
      title: "回答还在进行时",
      markdown: `助手回答时，内容会一段段出来：先是思考或检索，再是正在使用的工具，然后才是正文，有时还会生成文件。这些都表示“还在做”，不是最终结论。

想停下来，点输入框旁的停止。页面会先等这一轮收尾；如果大约 20 秒还停不住，输入框会重新能用，方便你继续操作。后台任务有时还会再跑一小会儿。系统忙的时候，页面会自己重试几次，不必反复点发送。`,
    },
    {
      id: "abnormal",
      title: "停很久、掉线和另一个窗口",
      markdown: `如果大约三分钟都没有新内容，页面会弹出停滞提醒，如下图。圆角工具条告诉你此刻在做什么、已经做了多久；方形按钮用来请求停止本轮。它们只说明任务还在跑，不能当成回答已经完成。

你可以继续等，也可以停掉再重发。停滞提醒本身不会打断长任务。

连接断开时，页面会自己重连，最多试 8 次，两次之间最长等大约一分钟。先看它是否恢复，不要在仍显示处理中时连点同一条消息。

同一个对话如果在另一个浏览器窗口打开，当前页会提示已被另一个窗口接走，避免两边同时发送。回到这个窗口继续时，按提示重新接上即可。`,
      embeds: [{ id: "claw-run-states" }],
      blocks: [
        {
          type: "markdown",
          markdown: `如果大约三分钟都没有新内容，页面会弹出停滞提醒，如下图。圆角工具条告诉你此刻在做什么、已经做了多久；方形按钮用来请求停止本轮。它们只说明任务还在跑，不能当成回答已经完成。

你可以继续等，也可以停掉再重发。停滞提醒本身不会打断长任务。`,
        },
        { type: "embeds", ids: ["claw-run-states"] },
        {
          type: "markdown",
          markdown: `连接断开时，页面会自己重连，最多试 8 次，两次之间最长等大约一分钟。先看它是否恢复，不要在仍显示处理中时连点同一条消息。

同一个对话如果在另一个浏览器窗口打开，当前页会提示已被另一个窗口接走，避免两边同时发送。回到这个窗口继续时，按提示重新接上即可。`,
        },
        {
          type: "article-link",
          card: {
            articleSlug: "marketing-pages-and-implementation-boundaries",
            sectionId: "agent-status",
            title: "工具条、思考过程和进度条分别是什么",
            description:
              "分清正在调用的工具、过程说明和真正的回答，避免把“还在做”当成已经做完。",
            icon: "sparkles",
          },
        },
      ],
    },
  ],
};
