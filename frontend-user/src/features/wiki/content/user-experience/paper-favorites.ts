import type { WikiArticle } from "../../types";

export const PaperFavoritesArticle: WikiArticle = {
  slug: "paper-favorites",
  title: "将搜索到的文献收藏",
  summary:
    "把论文保存到文献集的指定文件夹。重复收藏不会搬家；取消收藏可能删掉已上传的文件。",
  category: "knowledge",
  kind: "feature",
  status: "current",
  audience: ["登录用户", "研究者"],
  aliases: ["收藏论文", "取消收藏", "加入文件夹"],
  sourcePaths: [
    "frontend-user/src/shared/components/FavoritePaperButton.tsx",
    "frontend-user/src/shared/api/user-library-mutations.ts",
    "frontend-user/src/features/library/components/CollectFolderPicker.tsx",
    "frontend-user/src/stores/pending-action.store.ts",
    "frontend-user/src/stores/collect-picker.store.ts",
  ],
  related: ["literature-library", "paper-detail-and-actions", "mobile-feed"],
  sections: [
    {
      id: "favorite",
      title: "收藏流程",
      markdown: `在搜索、矩阵、论文详情或移动 Feed 中点击收藏。未登录时，页面会先打开登录，并在成功后继续刚才的收藏；已登录但没有指定位置时，会让你选择目标文件夹。下图只展示确认收藏前的目标文件夹选择界面。

弹窗打开时默认文件夹已经预选；若不改选择，点击“完成收藏”会保存到默认文件夹。选择其他文件夹会替换目标，不是多选。`,
      embeds: [{ id: "paper-favorite-flow" }],
    },
    {
      id: "duplicate",
      title: "重复收藏",
      markdown: `同一篇论文已经收藏时，页面会提示“已在文件夹中”，不会再创建一份副本，也不会因为这次选择了另一个文件夹就悄悄移动原记录。需要更换文件夹时，请到文献集中执行移动。`,
    },
    {
      id: "unfavorite",
      title: "取消收藏是删除记录",
      markdown: `再次点击已收藏按钮时，页面会先要求确认。这一步不在上图中，但需要特别注意：取消收藏不只是去掉星标。如果该记录包含你上传的 PDF、编辑过的元数据或处理进度，这些内容也可能一并丢失。文献集中的删除提示会说明这项风险；确认前请先检查是否需要保留文件。`,
    },
  ],
};
