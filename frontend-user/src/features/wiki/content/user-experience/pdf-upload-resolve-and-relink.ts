import type { WikiArticle } from "../../types";

export const PdfUploadResolveAndRelinkArticle: WikiArticle = {
  slug: "pdf-upload-resolve-and-relink",
  title: "上传自己本地的文献",
  summary:
    "把本地 PDF 放入文献集。核对匹配候选后，可以关联到论文，或保留为自由文件。",
  category: "knowledge",
  kind: "feature",
  status: "current",
  audience: ["登录用户", "研究者"],
  aliases: ["上传 PDF", "PDF 解析", "文献识别", "重新关联"],
  sourcePaths: [
    "frontend-user/src/features/library/api/pdf.ts",
    "frontend-user/src/features/library/api/upload-resolve.ts",
    "frontend-user/src/features/library/api/relink.ts",
    "frontend-user/src/features/library/components/library-import-dialog/PdfUploadTab.tsx",
    "frontend-user/src/features/library/components/manage/RelinkPanel.tsx",
    "frontend-user/src/features/library/components/shared/validate-pdf.ts",
  ],
  related: ["literature-library", "pdf-reader", "paper-favorites"],
  sections: [
    {
      id: "validation",
      title: "文件预检",
      markdown: `这里只接受 PDF，文件大小需要略低于 50 MiB。上传前页面会检查文件格式，避免把只是改了扩展名的其他文件当作 PDF。文件名超过 250 个字符时会给出提醒，保存时会安全截短，不会因此阻止上传。`,
    },
    {
      id: "resolve",
      title: "流式识别与人工确认",
      markdown: `上传 PDF 后，页面会先解析题名、摘要、DOI、arXiv、作者和年份，再搜索可能匹配的论文。下图展示的是候选已经返回、等待你确认的状态。

Graph / Discovery 是候选来源。“标题精确匹配”只是匹配信号，不是身份确认。采用前仍要核对 DOI、作者和年份。左上角数字 3 表示当前流程步骤，不是候选数量。选择正确候选后保存为已关联论文；也可以拒绝所有候选，保存为自由文件。

扫描件无法提取文字时会提示识别受限，但仍允许保存 PDF。最终确认与保存最多等待 120 秒。`,
      embeds: [{ id: "pdf-resolve" }],
    },
    {
      id: "relink",
      title: "重新关联与合并",
      markdown: `识别错误时，打开“重新关联”，用当前标题或临时修改的标题再次搜索，并明确选择新候选；下图冻结在“已有当前关联、已经选中新候选但尚未提交”的状态。选中候选不会立即覆盖，点击底部“替换关联”才会提交；“取消”只退出本次操作，不等于取消现有论文关联。你也可以另行取消关联，把当前资料保留为自由文件。

如果目标论文已经在文献集中，系统会把 PDF 和 AI 处理状态合并到已有记录，并删除当前重复项；否则会在原位置替换关联。取消关联前会先保存当前显示的元数据。`,
      embeds: [{ id: "library-relink-workbench" }],
    },
  ],
};
