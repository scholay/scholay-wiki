# 内容架构:博客 / 学术资源「单一真源」(2026-06-25)

为让文章**全文**被搜索引擎 / AI 爬虫读到(GEO),并消除前后端正文双写,把博客/资源文章正文收口为**后端单一真源**。

## 管线

```
backend/internal/content/data/{blog,resources}/*.json   ← 正文单一真源(结构化 JSON, go:embed)
        │  (sections: paragraph | heading | tip,沿用前端 ArticleSection schema)
        ├──> SSR(internal/config/handler_ssr.go)
        │      /blog/{slug} /resources/{slug} 爬虫请求
        │      → content.RenderNoscriptHTML 把全文写进 <noscript>(爬虫读到完整正文)
        │      → injectArticleSEOMeta 注专属 <title>/description/canonical + BlogPosting/Article JSON-LD + OG
        └──> 公开 API(internal/content/handler.go)
               GET /api/v1/content/:kind        列表(卡片,不含 sections)
               GET /api/v1/content/:kind/:slug  全文(含 sections)
               → 前端文章列表/详情页取数渲染(复用 ArticleSection 渲染组件)
```

## 关键文件

- `backend/internal/content/content.go` — go:embed + 解析 + `Get(kind,slug)` / `List(kind)` / `MaxLastMod(kind)`,内存索引,lastmod 倒序。
- `backend/internal/content/render.go` — `RenderNoscriptHTML`(sections→爬虫可见 HTML)+ `(*Article).BuildJSONLD`(BlogPosting/Article)。
- `backend/internal/content/handler.go` — 公开内容 API(无鉴权、无状态)。
- `backend/internal/content/data/{blog,resources}/*.json` — 29 篇正文(16 blog + 13 resources),由前端 `blog-articles.ts`/`resource-articles.ts` 一次性无损迁移(`scratchpad/migrate-articles.mjs`,esbuild 转译后导出)。
- 接线:`config/handler_ssr.go`(getRouteNoscriptContent 的 /blog//resources/ 分支改读 content 包 + 新增 injectArticleSEOMeta)、`cmd/server/routes.go`(注册 `/api/v1/content/*`)。

## 现状 & 后续

**已做**:
- 后端(编译通过):正文迁移 + content 包 + SSR 全文 noscript + 专属 title/JSON-LD/OG + 内容 API。**部署后**爬虫即可读到 16 篇博客 + 13 篇资源的**完整正文**(此前只有 255–316 字 teaser,体检中危4)。
- 前端(tsc + vite + docker build 均过):`api/content.ts`(`useArticleList`/`useArticle`/`relatedArticles` + 类型);`BlogList/Detail`、`ResourceList/Detail`、`HelpCenter` 5 页改 `useQuery` 取 `/api/v1/content/*`、复用 `ArticleRenderer`;**已删除** `data/blog-articles.ts` / `data/resource-articles.ts`(前端不再打包正文)。`author` 由后端 JSON 解析好直接用。后端 content 包对 `Tags` 做 nil-guard(资源无 tags → 永远回 `[]`,防前端 `.filter` 崩)。

**Section schema 已扩展(2026-06-25)**:除 paragraph/heading/tip,新增 `list`(items/ordered)、`table`(headers/rows)、`faq`(faq[{q,a}])。`faq` 由后端 `(*Article).BuildFAQJSONLD` 额外产出 **FAQPage JSON-LD**。前后端(`content.Section` / `render.go` / `ArticleRenderer.tsx` / `api/content.ts`)同构。

**全部 29 篇已 GEO 重写(2026-06-25)**:答案前置 + 对比表(28/29)+ 列表(29/29)+ FAQ(29/29,均出 FAQPage JSON-LD)+ 统计 + 诚实对比 + 具名作者(资源类也补了作者,E-E-A-T)。由并行 workflow 起草、schema 强校验、人工写回。

**索引/ sitemap 已统一单源(2026-06-25)**:`/blog`、`/resources` 索引页 noscript 与 `sitemap-blogs/resources.xml` 现在都读 `content.List`(`config` 的 `articleListNoscript` + `seo` 的 `articleEntriesFromContent`),sitemap lastmod 取文章 UpdatedDate→促爬虫重抓。`seo` 的 `BlogArticles/ResourceArticles` registries 仅剩 `AllBlogPaths/AllResourcePaths`(主动推送 slug 列表)在用,slug 与 content 同步无漂移。

**新增 `qa` 学术问答板块(2026-06-25)**:第三个 content kind `qa`(`Kinds=['blog','resources','qa']`,embed `data/qa/*.json`)——每个问题一篇完整长答案。端到端打通:后端 SSR(`/qa/{slug}` injectArticleSEOMeta + `/qa` 索引 noscript)、`/sitemap-qa.xml` 入索引、`StaticPages` 加 `/qa`、nginx 白名单加 `qa`;前端 `QAListPage`/`QADetailPage` + `/qa`、`/qa/:slug` 路由(复用 `ArticleRenderer`,`ContentKind` 加 `'qa'`)。

**10 主题真实需求内容批(2026-06-25)**:基于真实需求调研([08-academic-topics-real-needs.md](08-academic-topics-real-needs.md):学术开题/研究领域/研究方法/数据集/AI辅助写作/模拟审稿/查重/AI幻觉/文献不准确/AI科研技能,国内知乎·小木虫·CSDN + 国外 Reddit·AcademiaSE·arXiv)写了一批博客说明 + QA 长答案。**当前内容总量:博客 26 + 资源 13 + 问答 29 = 68 篇**,67 含对比表、68 含 FAQ(均出 FAQPage JSON-LD)。并行 workflow 起草 + schema 强校验 + 人工写回。坑:研究阶段复杂 StructuredOutput schema 偶发失败(写作阶段 Article schema 稳),失败主题改"直接写作(无研究 schema)+ 人工 grounding"补齐。

**铁律(给后续/未来会话)**:
- 文章正文**只**改 `backend/internal/content/data/{blog,resources,qa}/*.json`,**别**再往前端写正文 TS(已退役)。
- 新增/改文章 = 改 JSON → 重新 build(go:embed 在编译期固化)。
- 新 section 类型记得前后端同改(`content.Section` + `render.go` + `ArticleRenderer.tsx` + `api/content.ts`)。
- 批量生成内容时:写作 Article schema 可靠,**研究阶段别用太复杂的嵌套 StructuredOutput schema**(易撞重试上限),或拆成纯文本研究 + 结构化写作两步。
