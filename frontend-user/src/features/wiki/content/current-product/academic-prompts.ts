import type { WikiArticle } from "../../types";

export const AcademicPromptsArticle: WikiArticle = {
  slug: "academic-prompts",
  title: "学术prompts",
  summary:
    "在 scholay广场按综述、摘要、审稿回应与投稿等科研场景浏览可复用提示词卡片。",
  category: "knowledge",
  kind: "page",
  status: "experimental",
  audience: ["研究者", "学生", "智能助手用户"],
  aliases: ["学术提示词", "Academic Prompts", "Prompt 广场"],
  sourcePaths: [
    "frontend-user/src/features/tools/pages/ToolsPromptsPage.tsx",
    "frontend-user/src/features/tools/routes.tsx",
    "frontend-user/src/features/tools/components/PlazaHeader.tsx",
    "frontend-user/src/app/layouts/app-sidebar-records.ts",
  ],
  related: ["scholay-plaza", "claw", "community-skills"],
  sections: [
    {
      id: "experimental",
      title: "产品演示阶段",
      markdown: `该能力处于产品演示阶段。\`/tools/prompts\` 已提供列表、搜索和场景标签，但提示词来自页面内静态表，当前没有后端目录、收藏、版本或审核流程。卡片上的使用次数也是演示数据。`,
    },
    {
      id: "browse",
      title: "浏览方式",
      markdown: `进入学术prompts 后，可以按标题、场景、正文和标签搜索。当前示例覆盖审稿意见改写、Related Work 骨架、中文摘要压缩和 Rebuttal 逐条回应。页面用于发现和阅读模板；现行卡片没有一键复制、收藏或直接启动智能助手的动作，需要用户自行核对并按真实任务补足材料、输出格式和证据边界。`,
    },
    {
      id: "prompt-vs-skill",
      title: "Prompt 与 Skill 不同",
      markdown: `Prompt 是一段可复用的任务说明，不能授予工具权限，也不会自动加载到会话。学术skills 则是经过创建、版本和发布流程的能力包，可以由智能助手按会话加载。两者都需要用户核对内容，但不能互相当作同一种资源。`,
    },
  ],
};
