# Scholay Wiki 信息架构

## 顶层导航

Wiki 采用“开始 + 分类 + 词条索引 + 单词条”的结构：

- `/wiki`：开始页，承担搜索与常用任务入口，不重复完整栏目目录。
- `/wiki/all`：可搜索、可按类型/状态筛选的完整词条索引。
- `/wiki/sources`：仓库来源路径到词条的反向索引。
- `/wiki/coverage`：页面、模块、Agent、小程序、技能、迁移与数据集的核验口径。
- `/wiki/category/:slug`：一个领域下的页面、功能、实体和规则。
- `/wiki/:slug`：词条正文、目录、来源与相关词条。

路由必须保留真实链接，确保键盘操作、打开新标签和搜索引擎内链都可用。

## 分类

读者侧采用 `WIKI_NAV_CATEGORIES` 的 16 个任务与产品栏目；“全站概览”是其中第一个正式内容栏目。开始页只选取其中 6 个高频入口，不复制完整目录。

读者目录最多三级：栏目本身是一级，`category.children` 是二级，其直接子节点是三级。三级节点必须是可点击词条，不能继续挂第四级；更细的模式、状态和步骤应写进目标词条正文，或在同一二级分组下改成语义完整的三级入口。`WIKI_NAV_CATEGORIES` 是读者目录的唯一结构真源，`wiki-content.test.ts` 会输出完整违规路径并阻止层级继续增长。

底层词条同时保留以下 10 个内容分类，用于权限、搜索元数据与工程归档；它们不直接等同于读者侧栏目：

1. `getting-started`：Scholay、账户、导航与基础概念。
2. `discovery`：论文、作者、期刊、搜索、暂存区与引用网络。
3. `research-ai`：智能搜论文、Claw、审稿、Prism、数据分析、科研绘图与演示文稿。
4. `knowledge`：文献集、文件夹、分享、资源、博客与问答。
5. `membership`：会员、额度、钱包、支付、订单、签到、邀请与优惠。
6. `mobile`：移动 Web、微信小程序与设备分流。
7. `administration`：后台管理、内容运营、配置、统计与审计。
8. `platform`：后端服务、Agent、数据库、对象存储、消息、SEO 与部署。
9. `policies`：服务条款、隐私、免责声明、反馈与使用边界。
10. `history`：兼容路径、已下线模块和迁移记录。

## 页面结构

单词条按需从以下章节中选择，但“概览”“来源”不可缺少：

1. 概览
2. 入口与适用角色
3. 可以做什么
4. 工作方式
5. 状态与流程
6. 规则与限制
7. 数据与权限
8. 与其他能力的关系
9. 历史与兼容性
10. 来源与核对信息

规则词条必须额外写清：触发条件、计算口径、结果、例外、失败/回滚行为和用户可见文案。

## 内容对象

前端内容注册表使用一个稳定结构：

```ts
interface WikiArticle {
  slug: string;
  title: string;
  summary: string;
  category: WikiCategory;
  kind: WikiArticleKind;
  status:
    "current" | "experimental" | "compatibility" | "historical" | "planned";
  audience: string[];
  aliases: string[];
  sourcePaths: string[];
  related: string[];
  sections: WikiSection[];
}
```

`sourcePaths` 只接受仓库相对路径。覆盖脚本负责验证路径存在，并检查路由/模块/页面是否被至少一篇词条引用。

产品术语集中维护在 `content/terms.ts`。每项至少声明现行 `canonical`、
旧产品名 `deprecated` 和主定义词条 `articleSlug`，`wiki-term-links.ts` 只能从该表
派生自动链接。兼容搜索使用的 `aliases` 不参与正文旧称门禁；历史说明确需原样引用
旧界面文案时，必须以“词条 + 章节 + 同片段 context + 原因”加入精确白名单，不能按
整篇词条或全局放行。

### 章节中的结构化引导

旧章节继续使用 `markdown`、`table` 和 `embeds`。需要在指定语境旁插入交互内容时，使用有序的 `blocks`；页面不会扫描关键词来猜应出现哪种组件。

```ts
type WikiSectionBlock =
  | { type: "markdown" }
  | { type: "table" }
  | { type: "embeds" }
  | { type: "prompt-tabs"; group: WikiPromptGroup }
  | { type: "article-link"; card: WikiArticleLinkCard }
  | { type: "tip"; tip: WikiTip }
  | { type: "next-steps"; group: WikiNextStepGroup };

interface WikiSection {
  id: string;
  title: string;
  markdown: string;
  table?: WikiSectionTable;
  embeds?: WikiEmbedRef[];
  blocks?: WikiSectionBlock[];
}
```

- `prompt-tabs`：只用于真实的自然语言任务说明或提问模板。学科、场景切换必须复用同一目的，每个选项都能原样复制；DOI、邀请码、密码、筛选器等结构化输入不属于 Prompt。
- `article-link`：解释当前段落出现的一个站内概念，标题和摘要默认继承目标词条。
- `tip`：紧邻当前操作的短边界或风险提示，不重复正文大段内容。
- `next-steps`：放在一段工作流的尾部，帮助读者执行下一项动作或做出选择；它不同于宽泛的 `related`。

提供 `blocks` 时，章节已有的 Markdown、表格和演示图必须分别出现对应引用块，避免内容在重排时静默丢失。Prompt 文本、卡片标题和下一步说明同样进入 Wiki 搜索索引。

### 术语和跨章节链接

高频术语由人工维护的小型注册表控制。渲染时只链接单篇词条中首次有效出现的位置，并跳过标题、代码、表格、已有链接和 Prompt；不得直接把所有 `aliases` 自动转成链接。

- 首次写“智能助手（Scholay Claw）”，后文简称“智能助手”。
- 首次写“智能写作（Scholay Prism）”，后文简称“智能写作”。
- 用户侧统一用“论文库搜索”“智能搜论文”“PDF Chat”“我的资源 › 文献集”“交付物”。
- “AI 周期额度”“算力点”“科研经费”是不同概念，不能互作同义词。
- “暂存”“收藏”“加入文献集”是三个不同动作。
- “开放获取（OA）”“存在全文链接”“拥有可用 PDF”不是同一状态。

## 搜索

第一阶段在浏览器内对标题、别名、摘要、分类和章节正文建立轻量索引；内容是随版本发布的静态事实，不依赖登录或后端运行。结果按标题精确命中、别名、摘要和正文依次降权。

后续若词条数量和编辑频率显著增加，可把同一注册表迁到后端或独立内容仓库，但 URL 与 slug 不改变。

## 状态表达

- **现行**：当前路由或运行时代码可达，并且该词条声称的业务动作已有真实后端
  handler/service（需要持久化时还应有迁移）接线；相关契约测试可作为补强证据。
- **实验**：纯前端 mock、MSW 静态数据、占位跳转、只展示未接后端的交互，以及受
  开关、白名单或未稳定接口控制的能力。纯 mock 词条必须使用
  `status: "experimental"`，并在正文首段明确写“该能力处于产品演示阶段”。
- **兼容**：只为旧链接、旧数据或迁移保留。
- **历史**：当前代码不再提供，留作版本脉络。
- **计划**：仅有设计/研究资料，不能写成已上线能力。

列表和正文必须显式展示状态，搜索结果也不能隐藏这一差异。

### `experimental` 与 `current` 的判定证据

1. 只有 mock/fixture/MSW/静态数组的 `sourcePaths`，判为 `experimental`；前端能点开
   或已经合入代码不等于后端已交付。
2. 判为 `current` 时，`sourcePaths` 至少覆盖真实运行时入口；涉及服务端事实的词条还要
   指向对应后端模块、路由或迁移。只有截图、Wiki fixture 或设计说明不能证明 `current`。
3. 同一词条混有已交付与纯 mock 子能力时，必须拆段标状态；若摘要把两者作为一个整体
   能力承诺，则整篇保持 `experimental`，直到关键动作后端接线。
4. 后端模块存在但用户入口仍是占位，不得据此把用户页面写成 `current`；反之，真实后端
   已交付但本轮没有产品入口时，只能在后端/架构词条说明，不能虚构可达入口。

### 静态 fixture 的复核日期

`mock-surface-coverage.ts` 中每个 `fixture`/`covered` 可见项必须有 ISO 日期
`verifiedAt`。日期表示最后一次逐项对照其 `mockSourcePaths`，不表示后端交付状态。
`npm run wiki:drift -- <old>..<new>` 命中这些来源且目标提交晚于 `verifiedAt` 时，会把
对应 fixture 标为“过期”；复核完成后只更新实际检查过的条目，不能批量刷新日期。

### 嵌入 fixture 的主题策略

嵌入式组件默认使用 `follow-wiki`，通过语义色 token 跟随 Wiki 的日间或夜间模式；mock theme 只能保留间距、圆角、字号等几何变量，不得重新写入固定浅色 palette。只有 PDF 白纸、二维码等颜色本身承载内容含义的局部区域保持黑白/亮底；确需整块固定浅色时，才在注册表显式声明 `light-only`，不得用滤镜伪造暗色。
