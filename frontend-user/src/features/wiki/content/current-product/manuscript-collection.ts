import type { WikiArticle } from "../../types";

export const ManuscriptCollectionArticle: WikiArticle = {
  slug: "manuscript-collection",
  title: "稿件集",
  summary:
    "在我的资源中汇合智能写作稿与审稿上传稿，并用阶段、版本和审稿轮表达写作—审稿循环。",
  category: "knowledge",
  kind: "feature",
  status: "experimental",
  audience: ["论文作者", "智能写作用户", "智能审稿用户"],
  aliases: ["Manuscript Collection", "稿件管理", "写作审稿循环"],
  sourcePaths: [
    "frontend-user/src/features/library/pages/LibraryPage.tsx",
    "frontend-user/src/features/library/resource-model.ts",
    "frontend-user/src/features/library/components/ManuscriptCollectionView.tsx",
    "frontend-user/src/features/library/components/ManuscriptDetailDialog.tsx",
    "frontend-user/src/features/library/components/ManuscriptContentPane.tsx",
    "frontend-user/src/shared/api/manuscripts.ts",
    "frontend-user/src/mocks/manuscripts.ts",
    "frontend-user/src/mocks/manuscript-cycle.test.ts",
  ],
  related: [
    "my-resources",
    "manuscript-vs-publication",
    "prism",
    "peer-review",
  ],
  sections: [
    {
      id: "experimental",
      title: "产品演示阶段",
      markdown: `该能力处于产品演示阶段。前端已经提供稿件集列表、正文内容区、版本时间线和写作—审稿动作，但统一稿件 API 当前由 MSW mock 实现，仓库后端还没有对应的 manuscript 路由族。页面展示的循环可以用来核对产品形态，不应据此承诺生产数据已经跨设备持久化。`,
    },
    {
      id: "origins",
      title: "两类来源不是对称能力",
      markdown: `**智能写作稿**以 \`origin=prism\` 关联一个 Prism 项目，来源标注为“来自智能写作”；可以继续写作，也可以把当前版本快照送入智能审稿，收到决议后再回写作修改。**审稿上传稿**以 \`origin=upload\` 登记，只保留上传稿、版本和审稿记录；它不会自动生成 Prism 项目，因此不能直接进入完整写作循环。

稿件是作者工作中的版本，不等于检索与详情页里的公开出版物。即使题名相同，也必须分别核对版本、发表状态和 DOI。`,
    },
    {
      id: "stages",
      title: "阶段徽章与循环",
      markdown: `列表用三个阶段徽章概括当前状态：**写作中**表示还在形成或修改稿件，**审稿中**表示已有进行中的审稿轮，**已决议**表示最近一轮已经给出结果。已决议并不等于期刊正式录用；它只表示 Scholay 内部模拟审稿轮已有决议。

送审时会先为当前稿件创建版本快照，再建立绑定该版本的审稿轮。进行中的审稿轮完成前不能重复送审；完成后可以查看报告或回到写作继续修改，再产生下一版。`,
      embeds: [{ id: "manuscript-collection" }],
    },
    {
      id: "details",
      title: "详情、正文与移动",
      markdown: `点击稿件可在右侧内容区阅读从写作主文件或上传稿抽取的标题、作者、摘要和章节；“状态与历史”对话框按时间列出版本快照和审稿轮，并允许把稿件移动到其他稿件集。写作来源的稿件还可以直接打开关联 Prism 项目。正文区是只读预览；没有可抽取内容时会明确显示空态。`,
    },
  ],
};
