import type { WikiArticle } from "../../types";

export const AdminSkillModerationArticle: WikiArticle = {
  slug: "admin-skill-moderation",
  title: "社区 Skill 审核",
  summary: "社区 Skill 的审核、举报处置与全局下线控制。",
  category: "administration",
  kind: "rule",
  status: "current",
  audience: ["内容审核员", "管理员", "安全人员"],
  aliases: ["Skill Review", "技能审核", "Skill 下架"],
  sourcePaths: [
    "frontend-user/src/features/admin/pages/SkillReviewPage.tsx",
    "frontend-user/src/features/admin/api/skills.ts",
    "backend/internal/skillmarket/model.go",
    "backend/internal/skillmarket/service.go",
    "backend/internal/skillmarket/bundle.go",
  ],
  related: ["community-skills", "admin-tool-operations"],
  sections: [
    {
      id: "moderation",
      title: "审核状态",
      markdown: `进入社区 Skill 审核后，可以先处理待审核内容，再切到举报队列核对理由和上下文；如果列表加载失败，页面会显示可重试的错误态，而不是把它伪装成空队列。下方三张图依次展示审核列表、举报队列和加载失败状态。

审核状态为 pending、approved、rejected 或 flagged。只有公开、approved 且 active 的 Skill 才能被其他用户查看和安装；作者修改已公开版本后会重新进入 pending。举报只提供人工判断依据，不会按数量自动改状态或下架。`,
      embeds: [
        { id: "admin-skill-moderation" },
        {
          id: "admin-skill-report-queue",
          caption: "独立于上架审核的技能举报队列",
        },
        {
          id: "admin-skill-review-error",
          caption: "与真实空队列区分的加载失败状态",
        },
      ],
    },
    {
      id: "takedown",
      title: "下架与安全边界",
      markdown: `全局开关可以停止社区市场，单项强制下架要求输入 TAKEDOWN，并把内容改为私有、禁用。审核流程会解析和规范化 SKILL.md，但不是恶意代码沙箱，也不会通过执行压缩包内脚本来证明其安全性；审核人仍需检查指令、外链和权限诱导。`,
      blocks: [
        { type: "markdown" },
        {
          type: "tip",
          tip: {
            text: "解析 SKILL.md 不等于完成恶意代码审计。粘贴 TAKEDOWN 前，仍需核对证据、目标条目和处置范围，并留存人工审核记录。",
          },
        },
        {
          type: "article-link",
          card: {
            articleSlug: "community-skills",
            sectionId: "trust",
            title: "社区 Skill 的用户侧信任边界",
            description:
              "了解安装、加载与安全证明之间的区别，避免把审核通过理解为无限制授权。",
            icon: "review",
          },
        },
      ],
    },
  ],
};
