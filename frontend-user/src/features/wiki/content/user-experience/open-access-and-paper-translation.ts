import type { WikiArticle } from "../../types";

export const OpenAccessAndPaperTranslationArticle: WikiArticle = {
  slug: "open-access-and-paper-translation",
  title: "开放获取与论文翻译",
  summary:
    "优先使用论文自带的开放获取线索。有 DOI 时，再查询合法开放版本。登录后可翻译标题和摘要。",
  category: "discovery",
  kind: "feature",
  status: "current",
  audience: ["所有访客", "登录用户", "研究者"],
  aliases: ["OA 全文", "Unpaywall", "AI 翻译", "摘要翻译"],
  sourcePaths: [
    "frontend-user/src/features/browser/api/open-access.ts",
    "frontend-user/src/features/browser/components/paper-detail/PaperMetadataBlock.tsx",
    "frontend-user/src/shared/components/TranslatePaperButton.tsx",
    "frontend-user/src/shared/api/translate.ts",
  ],
  related: ["paper-detail-and-actions", "pdf-reader", "ai-usage-quota"],
  sections: [
    {
      id: "oa",
      title: "开放获取查找",
      markdown: `在论文详情的动作区查看全文入口：有直接开放 PDF 时可以打开阅读器；只有 DOI 时，页面会继续查找 Unpaywall 收录的合法开放版本。下图只证明页面已有合法全文入口；是否来自 Unpaywall 要以实际入口旁的来源标注为准，图中未展示。

页面会区分可下载 PDF 与普通免费全文，并在使用 Unpaywall 结果时标注来源。找到论文元数据页或原始网页，不等于已经找到可合法下载的全文。`,
      embeds: [{ id: "paper-detail" }],
    },
    {
      id: "translation",
      title: "AI 翻译",
      markdown: `只有标题或摘要包含需要翻译的文字时，才显示按钮。首次翻译要求登录，并消耗 AI 周期额度；完成后会缓存中文标题和摘要。之后“AI 翻译/原文”只在已缓存内容之间切换，不会重复请求。额度用尽后，按 AI 周期额度页的恢复流程处理。`,
    },
    {
      id: "limits",
      title: "边界",
      markdown: `翻译覆盖标题和摘要，不是整篇 PDF 翻译，也不会改写论文原始记录。OA 查询依赖 DOI 和第三方覆盖，失败时用户仍可尝试上游原始页；Scholay 不以“OA”标签替代版权和许可判断。`,
    },
  ],
};
