import type { WikiArticle } from "../../types";

export const HelpCenterAndQaArticle: WikiArticle = {
  slug: "help-center-and-qa",
  title: "帮助中心与学术问答",
  summary:
    "按主题浏览后台维护的科研长问答，并在详情页使用目录、相关问答和产品快捷入口。",
  category: "knowledge",
  kind: "page",
  status: "current",
  audience: ["所有访客", "研究者", "学生"],
  aliases: ["Help Center", "QA", "常见问题", "学术问答"],
  sourcePaths: [
    "frontend-user/src/features/help/pages/HelpCenterPage.tsx",
    "frontend-user/src/features/help/pages/QADetailPage.tsx",
    "frontend-user/src/features/help/api/content.ts",
    "frontend-user/src/features/help/components/ArticleRenderer.tsx",
    "frontend-user/src/features/wiki/embeds/WikiEmbedRhinoAssistant.tsx",
    "frontend-user/public/wiki/assets/rhino/pet-idle-frame-000.png",
    "frontend-user/src/shared/components/RhinoRunLoader.tsx",
    "frontend-user/src/shared/components/GlobalLoadingOverlay.tsx",
    "frontend-user/src/shared/components/LazyRoute.tsx",
    "frontend-user/src/stores/page-loading.store.ts",
    "frontend-user/src/app/providers.tsx",
    "frontend-user/src/shared/mascot/rhino-clips.ts",
    "frontend-user/src/shared/mascot/rhino-sit.ts",
    "frontend-user/src/shared/mascot/rhino-pose.ts",
    "frontend-user/src/shared/mascot/rhino-perch.ts",
    "frontend-user/src/features/claw/components/chat/ClawNoviceTour.tsx",
  ],
  related: [
    "feedback-and-support",
    "resource-and-blog-center",
    "service-policies",
  ],
  sections: [
    {
      id: "hub",
      title: "问答首页",
      markdown: `进入帮助中心后，你会看到按主题整理的学术问答；分类较多时，可以用页内主题入口直接跳转。牛犀犀助手的「帮助」面板还提供拖点、功能、对话和导览说明；第二张图只展示面板默认打开的「拖点」标签，它不是问答列表。下图分别展示问答首页和「拖点」标签。

旧的问答列表地址会自动转到帮助中心；加载中会显示提示，页面底部还保留关于、反馈、联系和政策入口。`,
      embeds: [{ id: "help-center" }, { id: "rhino-assistant-help-panel" }],
    },
    {
      id: "rhino-assistant",
      title: "牛犀犀助手",
      markdown: `桌面页面角落会停着可拖动的“牛犀犀”。把指针移到角色上，就能看到对话、功能、帮助、反馈、通知和隐藏入口；双击角色会直接打开对话。通知入口和红色数字只对已登录用户显示。

选择“隐藏”后，悬浮角色会离开页面，顶栏头像旁会出现一枚小犀牛按钮，点击即可重新放出。`,
      embeds: [{ id: "rhino-assistant-entry" }, { id: "rhino-assistant-dock" }],
    },
    {
      id: "loading-and-tours",
      title: "牛犀犀加载、坐姿与 Claw 导览",
      markdown: `页面懒加载时，全站只挂载一层带 \`aria-live\` / \`aria-busy\` 的加载遮罩，由计数 store 合并并发加载请求，避免多个路由各叠一层。遮罩中的牛犀犀使用向右下奔跑的序列帧与滚轮；系统开启“减少动态效果”时会停止逐帧运动。

牛犀犀还包含坐下、保持坐姿、打字和从坐姿站起等前端动作片段，用于停靠、助手状态和导览衔接。它们是客户端角色演出，不代表后台任务阶段或真实处理进度。Claw 首次导览会依次聚焦输入框、模型、Skill、附件/文库引用与模板，并在结束后回到待机；聚光框只解释控件，不会执行任务。`,
      embeds: [{ id: "theme-and-rhino-loading" }],
    },
    {
      id: "detail",
      title: "问答详情",
      markdown: `点击问答标题后，详情页会显示分类、作者、预计阅读时长、正文目录和相关产品入口，文末最多推荐 3 篇同类问答；下图展示的是一篇内容已经载入的详情页。每篇问答都有稳定链接。找不到文章或加载失败时会返回帮助中心，不会显示空白详情。`,
      embeds: [{ id: "help-content-detail" }],
    },
    {
      id: "source",
      title: "内容来源",
      markdown: `问答正文来自后台发布的内容，页面负责按章节展示并让搜索引擎正确识别。学术问答用于解释和教学；涉及平台限制、会员或法律边界时，应继续查看相应的现行规则词条。`,
    },
  ],
};
