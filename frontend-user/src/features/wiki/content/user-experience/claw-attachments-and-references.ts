import type { WikiArticle } from "../../types";

export const ClawAttachmentsAndReferencesArticle: WikiArticle = {
  slug: "claw-attachments-and-references",
  title: "Claw 附件、文库引用与 Skill",
  summary:
    "向 Claw 消息加入受支持的图片、文档、文库资料和已安装 Skill，并理解格式与数量限制。",
  category: "research-ai",
  kind: "feature",
  status: "current",
  audience: ["Claw 用户", "研究者"],
  aliases: ["Claw 上传文件", "文库引用", "会话 Skill"],
  sourcePaths: [
    "frontend-user/src/shared/hooks/useComposerAttachments.ts",
    "frontend-user/src/shared/components/chat/LibraryReferencePicker.tsx",
    "frontend-user/src/features/claw/components/chat/ComposerSkillsButton.tsx",
    "frontend-user/src/features/claw/components/chat/ChatComposer.tsx",
    "frontend-user/src/shared/api/agent-attach.ts",
  ],
  related: ["claw", "claw-sessions", "community-skills", "literature-library"],
  sections: [
    {
      id: "attachment-limits",
      title: "附件限制",
      markdown: `一条消息最多添加 10 个附件。JPEG/JPG、PNG、WebP、GIF 图片每个最多 5 MB；PDF、DOCX、XLSX、PPTX、ODT、RTF 和常见文本或代码文件每个最多 30 MB。

只有显示“上传完成”的附件会随消息一起发送；仍在上传、上传失败或已经移除的文件不会交给助手。`,
    },
    {
      id: "unsupported",
      title: "不支持的格式",
      markdown: `SVG、BMP、TIFF、HEIC 和 AVIF 目前不能作为图片附件上传；旧版 Office 文件请先另存为 DOCX、XLSX 或 PPTX。SPSS、Stata、SAS 的专有文件需要先转换为 CSV 或 XLSX；如果 CSV 来自中文 Windows 环境，还要留意文件可能使用 GBK 编码。`,
    },
    {
      id: "references-skills",
      title: "文库引用与 Skill",
      markdown: `在 Claw 输入框中点击文库或 Skill 按钮，可以从自己的文献中选择论文作为本轮引用，也可以启用已安装的 Skill；下图展示的是附件、文库引用和 Skill 入口同时可见的输入区。发送前请确认所选内容已出现在消息上方。

引用论文不等于上传原始 PDF，能否读取全文仍取决于文献记录。Skill 用于提供任务步骤和输出要求；拼图图标后的数字表示本会话已启用的 Skill 数，模型名表示当前会话模型。输入框中的上下文百分比是本会话已占用的模型上下文，不是账户 AI 剩余额度或上传进度；达到高位时应新开会话或精简材料。每个会话可启用数量及账户安装上限以页面提示为准，也不会因为 Skill 的文字而获得额外工具权限。`,
      embeds: [{ id: "claw-context-composer" }],
    },
  ],
};
