# 情报功能 · SEO / GEO + 网站地图 + slug 路由 + SSR + JSON-LD 设计

> 版本: 2026-06 · 配套调研: `docs/research/geo-2026-06/`(GEO 总纲) + 本目录其它 03/05 文档
> 范围: 仅覆盖**情报详情/列表页的搜索引擎与 AI 引擎可见性**(SSR / JSON-LD / sitemap / robots / nginx)。
> 接收/验签/落库见 `01-*`(webhook),前端展示见 `02/03-*`(移动刷新流 + PC 首页情报区)。
> **不含业务代码**,只给文件级落地点与字段映射。

---

## 0. 一句话结论

情报(news)是「**DB 动态数据**」,但它的 SEO/GEO 暴露面与现有「博客/资源」(`internal/content`,go:embed 静态)**几乎同构**:
都是「详情页 SSR 把全文写进 `<noscript>` + 注入 `Article` 系 JSON-LD + 自指 canonical + 进 sitemap」。
因此**复用现有 SSR/sitemap/robots/nginx 四件套的渲染骨架,只换数据源(go:embed → DB 查询)**,
新建 `internal/news` 模块做 DB + webhook,SSR 注入与 sitemap 以 **provider 接口**挂进现成的 `config.Handler` / `seo` 框架,
不另起一套渲染逻辑。

与 content 的唯一本质差异 = **取数从编译期固化的 `content.Get/List` 变成运行时 DB 查询**,
对应需要一个 `NewsSSRProvider` 接口(见 §2.3)+ DB 驱动的 sitemap 数据源(见 §4)。

---

## 1. URL / slug 体系

### 1.1 slug 来源:上游已给,直接用

上游 `item.slug` 形如 `2026-06-12-xxx`(日期前缀)。**直接采用,不在本侧重新生成**,理由:

- **时效语义**:日期前缀让搜索引擎/AI 一眼判断新鲜度(GEO 偏好近 90 天内容);
- **全局唯一**:日期前缀天然降低撞名;
- **人读友好 + 稳定**:slug 是 URL 的一部分,一旦发布不可变更(变更=换 URL=丢权重)。
- **幂等键不是 slug**:`item.id`(uuid)才是覆盖/去重主键(`news.updated` 用 `item.id` 覆盖)。
  slug 仅做 URL,DB 里 slug 建唯一索引但更新以 id 为准。

> 注意:`original_date`(可空)是「新闻事件原始发生日」,**不进 URL,也不当 dateModified**;
> URL 前缀里的日期 = slug 自带的发布语义,排序/freshness 用 `published_at` / `updated_at`(见 §3、§6)。

### 1.2 路由结构(对齐现有实体页风格)

| 页面 | 路由 | canonical | 类比现有 |
|---|---|---|---|
| 情报详情页 | `/news/{slug}` | 自指 `BASE/news/{slug}` | `/blog/{slug}`(单段 slug) |
| 情报列表页(全部) | `/news` | 自指 `BASE/news` | `/blog` `/resources` |
| 分区页(按 section) | `/news/section/{section}` 或 `/news?section=major-event` | 见下 | (新增) |

**分区页 canonical 取舍**(重要,避免薄内容/重复页):

- 推荐用**路径形 `/news/section/{section}`**(4 个固定枚举值:`major-event` / `china-policy` / `top-journal` / `other`),
  每个分区页自指 canonical、有独立 H1 + 引导文案 + 该分区条目列表,可作 SEO 落地页。
- **不要**用 `/news?section=xxx` 作为可索引 canonical —— query 形参分区会被判与 `/news` 重复;
  若前端用 query 做交互式筛选,该筛选态的 canonical 必须**回指无参的 `/news` 或 `/news/section/{section}`**。
- 分区是**封闭枚举**(4 个),所以分区页数量有限、可控,适合进 sitemap。

**与现有 URL 归一规则的兼容**:`handler_ssr.go:93-103` 已对尾斜杠做 301(`/news/x/` → `/news/x`),
`/news/*` 天然受益,无需额外代码;`/news` 段需加入 nginx SSR 白名单与前端 `route-validation.ts`(见 §7)。

---

## 2. SSR 爬虫友好:把 `body_html` 全文喂给爬虫

### 2.1 复用的现成机制(noscript 全文注入)

现有「博客/资源详情页」对爬虫的全文注入链路(直接照搬骨架):

1. nginx `nginx/conf.d/user.conf:241-244` 把命中 `$is_crawler` 的实体/内容页用 `return 418 → @ssr_backend` 引到 backend SSR。
2. backend `NoRoute` → `config.Handler.ServeIndexHTML`(`backend/cmd/server/routes.go:212-219`)。
3. `ServeIndexHTML` 取前端壳 HTML 后,调 `injectRouteNoscript`(`handler_ssr.go:139`)
   → `getRouteNoscriptContent`(`handler_ssr.go:1357`)按 path 分支,博客/资源命中
   `content.Get(...)` + `content.RenderNoscriptHTML(...)`(`handler_ssr.go:1374-1383`)渲**完整正文**进 `<noscript>`。
4. `insertNoscriptBlock`(`handler_ssr.go:479-489`)把这段 `<noscript>` 插在 `</body>` 前
   (当前 Vite 壳无 noscript 锚点,这是唯一可靠锚点)。浏览器执行 JS 时 noscript 不渲染(SPA 接管),爬虫能读到。
5. 同时 `injectArticleSEOMeta`(`handler_ssr.go:1298`)补 title/description/自指 canonical + JSON-LD + OG。

> **GEO 关键**:`content.RenderNoscriptHTML`(`render.go:13`)渲染的是**全文**而非 teaser ——
> 这是「修中危·爬虫只拿到 teaser」的修复,情报必须延续同一原则(快讯也要全文 summary+body+sources,见 §5/§6)。

### 2.2 情报与 content 包的差异:动态 DB vs go:embed

| 维度 | content(博客/资源) | news(情报) |
|---|---|---|
| 数据载体 | `data/{blog,resources}/*.json` `go:embed`(`content.go:20-21`) | DB 表(webhook 写库) |
| 取数 | `content.Get/List`(内存 map,`content.go:129-139`) | DB 查询(repository) |
| 正文字段 | 结构化 `Sections []Section`(`content.go:47-71`),`RenderNoscriptHTML` 自己拼 HTML | 上游已给 **`body_html`(zh,可直接展示)** —— 不需要再拼 |
| 更新触发 | 改 JSON → 重新编译部署 | `news.updated` webhook → DB 行更新(无需部署) |

**取数挂钩方案(核心):**

情报正文上游已经给了 **`body_html`(已是可直接展示的 HTML,`/uploads` 已绝对 URL)**,
所以**不需要**像 content 那样从结构化 sections 拼 HTML;但**绝不能把上游 `body_html` 原样塞进 noscript** ——
必须经一层**白名单 sanitize**(只放行 `p/h2/h3/ul/ol/li/table/thead/tbody/tr/th/td/a/strong/em/blockquote/figure/img` 等,
剥 `<script>/<style>/on*` 属性,`a[href]` 仅允许 http(s)/相对路径),理由:

- 上游虽是可信 server-to-server,但「可信来源 + 渲染进我方页面 HTML」仍是 stored-XSS 面;
- noscript 内容会进我方域 HTML,被 Google 当作我方正文索引,脏标签也会损害 SEO。

实现路径(挑一,不写业务码,仅给方向):
1. 新建 `internal/news`(DB 表 + repository + service + webhook handler);
2. service 暴露一个 **provider 方法** `RenderNewsNoscript(slug) (htmlSafe string, ok bool)`,内部做 DB 查 + sanitize;
3. 在 `getRouteNoscriptContent`(`handler_ssr.go:1357`)新增 `case strings.HasPrefix(path, "/news/")` 分支,
   通过注入的 provider(见 §2.3)拿 sanitize 后的 HTML,包进现有 `<section>` 壳(沿用 `baseStyle/headingStyle/textStyle`)。
   注意:列表页 `/news`、分区页 `/news/section/{section}` 也各加分支,渲染「条目链接列表」(类比 `articleListNoscript`,`handler_ssr.go:1504`),
   让爬虫从列表发现各详情页。

> **为什么不复用 content 的 `Section` 结构**:上游直接给了 `body_html`,再反解析成 sections 是徒劳;
> 但 noscript 头部的「标题 + 署名/日期 + summary(前置)」可仿照 `render.go:13-40` 的头部块,
> 把 `title` / `published_at` / `updated_at` / `summary` 渲在 body_html 之前,GEO answer-first(见 §5)。

### 2.3 SSR provider 接口(挂进 config.Handler)

现有 `config.Handler` 已用「provider 接口 + Setter」模式接 paper/author/journal/tool 四类 SSR 数据源
(`handler.go:47-66` 接口、`handler.go:80-89` 字段、`handler.go:125-142` Setter、`bootstrap.go:195/201/371` 注入)。
情报照葫芦画瓢,**避免 config 包反向 import news 包**(沿用 paper/tool 的解耦做法):

- 在 `config/handler.go` 新增 `NewsSEOProvider` 接口,例如:
  - `ResolveNewsBySlug(slug string) (*seo.NewsSSRMeta, error)` —— 详情页 meta(供 §3 JSON-LD + title/desc/OG)
  - `RenderNewsNoscript(slug string) (string, bool)` —— 详情页全文 noscript(已 sanitize)
  - `RenderNewsListNoscript(section string) (string, bool)` —— 列表/分区页条目列表(section 空=全部)
- 在 `seo/ssr_meta.go`(`ssr_meta.go:19` 包)新增 `NewsSSRMeta` 类型(谁产数据谁定义类型,沿用 §3 字段)。
  注意:`NewsSSRMeta` 放 seo 包是为了让 config → seo 单向依赖成立(与 `PaperSSRMeta` 等同处)。
  但**数据真源在 `internal/news` 的 DB**,所以 provider 实现可由 `news.Service` 提供,
  内部把 DB 行映射成 `seo.NewsSSRMeta`(类比 `seo` 包自己实现 paper provider;若 news.Service 实现则它 import seo,单向无环)。
- `config/handler.go` 加 `newsSEOProvider` 字段 + `SetNewsSEOProvider`,`bootstrap.go` 注入。
- `ServeIndexHTML`(`handler_ssr.go:148-227` 那一串 if 分支)加 `/news/` 分支:
  单段 slug → `injectNewsSEOMeta`(新增,见 §3);`/news` 与 `/news/section/{x}` 走 §2.2 的列表 noscript + 列表页 title/canonical。

---

## 3. 结构化数据 JSON-LD

### 3.1 选型:`NewsArticle`(继承 `Article`)

- **用 `NewsArticle`**,不用泛型 `Article`:`NewsArticle` 语义更明确,是 Google Top Stories / News 富结果的目标类型,
  对时效情报最贴合。它继承 `Article` 全部字段,无损。
- **publisher.logo 必给**:`NewsArticle` 进 Google Top Stories 的硬要求。
  publisher 用我方机构(`成都恩特罐罐文化科技有限公司` / 站点品牌 `Scholay学术`,沿用 `render.go:116-118` / `handler_ssr.go:332` 的 Organization 写法)。

### 3.2 字段映射(item 字段 → NewsArticle)

| JSON-LD 字段 | 来源 item 字段 | 说明 |
|---|---|---|
| `@type` | 常量 `NewsArticle` | |
| `headline` | `title`(truncate 110) | 沿用 `truncateRunes`(`render.go:182`)/`truncate`;勿截断成语义破碎 |
| `name` | `title` | |
| `description` | `summary` | answer-first,GEO 核心(§5) |
| `datePublished` | `published_at`(RFC3339) | 上游已是 RFC3339,**直接合规**,无需转换 |
| `dateModified` | `updated_at` | **freshness + AI 引用核心信号**;`news.updated` 落库必须刷新它(§6) |
| `url` / `mainEntityOfPage` | canonical `BASE/news/{slug}` | 自指 |
| `inLanguage` | 常量 `zh-CN` | 沿用 `render.go:115` |
| `articleSection` | `section_label` | 4 个分区标签 |
| `author` | 机构(或具名编辑) | 沿用 publisher 机构;若上游无具名作者,用 Organization 作 author 亦可 |
| `publisher` | 机构 + `logo` | `{@type:Organization,name,url,logo:{@type:ImageObject,url}}` |
| `image` | **封面图(需补,见 §3.3)** | ≥50K px,16:9;无图则省略该字段(勿塞占位) |
| `isBasedOn` / `citation` | `sources[].url` | **GEO 强信号**:可信来源(§5) |
| `about` | 可选,从 section/标题主题实体 | 类比 `buildPaperJSONLD` 的 `about`(`handler_ssr.go:359-370`) |

> **可信度**:`credibility_note` 不进 JSON-LD 标准字段(无对应),但**进可见正文**的「来源核验」区(§5)。
> 若做 FAQ(部分情报适合 Q&A 化),额外出 `FAQPage` JSON-LD,复用 `BuildFAQJSONLD`(`render.go:151`)的同构做法。

### 3.3 image 字段缺口

上游 item **无 image 字段**。`NewsArticle.image` 是 Top Stories 推荐字段,卡片(§02 PC 首页/移动流)的「左文右图」也需要图。
取舍三选一(由产品拍板,记入开放问题 §8):
1. 上游补 `cover_image` 字段(最优,需改协议);
2. 本侧从 `body_html` 抽第一张 `<img>` 作封面(脆弱,可能无图);
3. 本侧准备**按 section 的默认封面图**(4 张),`image` 与卡片都回退到默认图(保证 JSON-LD 与卡片不塌)。

### 3.4 注入点(仿 `injectArticleSEOMeta`)

新增 `injectNewsSEOMeta(html, slug, path string)`,与 `injectArticleSEOMeta`(`handler_ssr.go:1298-1332`)同构:
- 复用包级正则 `ssrTitleRe/ssrDescRe/ssrCanonRe`(`handler_ssr.go:430-433`)替换 title/description/canonical;
- canonical 用 `appconfig.CanonicalBaseURL()+path`(`handler_ssr.go:1316`);
- JSON-LD 用新增 `buildNewsJSONLD(meta, canonical)`(仿 `buildPaperJSONLD`,`handler_ssr.go:322`,或仿 `Article.BuildJSONLD`,`render.go:103`);
- OG 用 `injectOG(html, seoTitle, canonical, desc)`(`handler_ssr.go:444`)——
  否则社媒/AI 实时取页(`$is_crawler` 已含 `*-User`)分享卡塌缩到首页;
- title 模板仿 `injectArticleSEOMeta`:`{title} | Scholay 学术情报`(快讯/今日要览可带 `report_type` 标识)。

---

## 4. 网站地图

### 4.1 现状(可复用的 sitemap 框架)

- 索引 `/sitemap.xml`(`seo/handler.go:185` `ServeSitemapIndex`)枚举各子 sitemap;
- 子 sitemap:`sitemap-static/blogs/resources/papers-N/authors-N/journals-N/tools` 全在
  `routes.go:199-208` 注册;
- 博客/资源 sitemap(`ServeBlogSitemap`,`handler.go:340`)走 `articleEntriesFromContent`(`handler.go:351`)
  → `content.List` → `writeArticleSitemap`(`handler.go:361`),lastmod 取 `a.LastMod()`;
- Redis version-based 缓存(`handler.go:38-42`,`versionForKind` `handler.go:627`)。

### 4.2 情报进 sitemap:两张图(主 + News)

**A. 主 sitemap(必做):`/sitemap-news.xml`**(长期收录,所有已发布情报)

- 新增 `ServeNewsSitemap`(仿 `ServeBlogSitemap`,`handler.go:340`),数据源是 **DB 查询**(不是 content.List);
  - 因情报量会增长,**走分页** `sitemap-news-{N}.xml`(仿 papers/authors 分页,`handler.go:379` `ServePaperSitemap` + `parseSitemapPageParam`),
    单文件 ≤ 50000 URL 但建议 5000~10000/页(与现有 paper 分片粒度一致);量小初期可先单文件 `sitemap-news.xml`。
- `<loc>` = `BASE/news/{slug}`;`<lastmod>` = `updated_at`(YYYY-MM-DD,`time.Format("2006-01-02")`,
  与其它子 sitemap 的天粒度一致,`handler.go:288`);`changefreq=daily`(快讯)/`weekly`(要览),`priority` 0.6~0.8。
- 在 `ServeSitemapIndex`(`handler.go:185`)的索引里加一行 `sitemap-news.xml`(仿 blogs 那行 `handler.go:268-269`);
  lastmod 取「全量情报 max(updated_at)」(DB 一次聚合查询;类比 `content.MaxLastMod`,`handler.go:206-207`)。
- 缓存:加一个 `versionForKind("news")` 版本号(`handler.go:627-650` 加 case),webhook 落库后 bump 该版本失效缓存
  (类比 papers/authors 的 `invalidateXxxCache`),让新情报快速上 sitemap。
- 路由:`routes.go:199-208` 加 `router.GET("/sitemap-news.xml", h.seo.ServeNewsSitemap)`(+ 分页变体)。
  数据源接口:`seo.Service` 不该 import news,故给 `seo` 一个 `NewsSitemapSource` provider 注入
  (类比 tools sitemap 由 `featuretool` 自己的 handler 提供,`routes.go:207-208`)——
  **更干净的做法**:`sitemap-news.xml` 由 `internal/news` 的 handler 直接提供(像 tools),不进 `seo.Service`,
  仅在 `seo` 的索引 `ServeSitemapIndex` 里引用其 URL(像 `sitemap-tools.xml` 那样只引 URL,`handler.go:275-278`)。

**B. Google News sitemap(可选,低优先级):`/sitemap-googlenews.xml`**

仅当**申请并被 Google News 收录后**才有意义,否则纯浪费。与普通 sitemap 三点差异:
- **仅含 48 小时内**的 item(`published_at` 在 48h 内,过期自动移出);
- 单文件 **< 1000 URL**;
- 需 `news:` 命名空间标签:
  - `news:publication` { `news:name`=站名, `news:language`=`zh-cn` }
  - `news:publication_date` = `published_at`(RFC3339 或 W3C 日期)
  - `news:title` = `title`
- 详情页**仍留在主 `sitemap-news.xml` 长期可索引**(News sitemap 只是「新鲜窗口」入口)。

> 取舍:**先做 A(主 sitemap-news + lastmod=updated_at),B 暂缓**。
> 理由(对齐 geo-2026-06):被 AI 引用/搜索收录的最高 ROI 是「**结构化数据 + AI 爬虫放行**」,
> Google News sitemap 排在它们之后;且 News sitemap 需先过 Google News 准入,工程性价比低。

### 4.3 robots / nginx 放行(含 AI 爬虫)

**robots.txt**(`seo/handler.go:565` `ServeRobotsTxt`):
- `rules` 是 `Allow: / + Disallow 列表`(`handler.go:569-579`);`/news/*` 是公开内容,**默认即放行**,无需额外 Allow。
- 但需确认 `/news` 不被任何 Disallow 误伤(当前 Disallow 是 `/admin /settings /api/` 等,不冲突 ✓)。
- **AI 爬虫已具名放行**(`handler.go:599-614`):检索类(`OAI-SearchBot/ChatGPT-User/Claude-SearchBot/Claude-User/PerplexityBot/Perplexity-User`)
  + 训练类(`GPTBot/ClaudeBot/Google-Extended/Amazonbot/Meta-ExternalAgent/CCBot`,带 `Crawl-delay`)。
  **情报无需改 robots** —— 这些组各自带与 `*` 同样的 `rules`,`/news/*` 自动放行。这正是 geo-2026-06「robots+nginx 两处同改」里 robots 那一处已完成的红利。
- Sitemap 行(`handler.go:616`)指向 `/sitemap.xml`(索引),索引里已含 news 子图,**无需在 robots 单列 news sitemap**。

**nginx**(`nginx/conf.d/user.conf`):
- 关键改动:把 `news`(及 `news/section`)加入 SSR 白名单 location 的正则
  `user.conf:241`:`location ~ ^/(paper|author|journal|...|news)(/|$)`。
  **不加 = 爬虫(含 GPTBot/PerplexityBot,它们已在 `$is_crawler` map 命中,`nginx.conf:85-96`)只拿到空 SPA 壳**(已进 sitemap 却抓不到内容——正是 04-page-audit 的高危根因)。
- `$is_crawler` map(`nginx.conf:85-96`)已含全部目标 AI/搜索 UA(`gptbot|oai-searchbot|perplexitybot|claudebot|claude-user|...`),
  **无需改 map**;只要 `/news` 进白名单 location,这些 UA 即 418 → `@ssr_backend` 拿到 §2/§3 注入的全文+JSON-LD。
- sitemap location(`user.conf:196`)正则 `^/(sitemap[a-zA-Z0-9_-]*\.xml|robots\.txt)$` 已能匹配 `sitemap-news.xml` / `sitemap-news-1.xml`,**无需改**。

> **铁律(geo-2026-06 + 04-page-audit)**:每个可索引新页必做「**nginx 白名单 + SSR inject + sitemap**」三件套,缺一即空壳。
> 情报对应:nginx 白名单加 `news`(§4.3)+ SSR inject(§2/§3)+ sitemap-news(§4.2)。

---

## 5. GEO(被 AI 引用)友好

情报是**时效 + 可信来源**双重属性,这恰是 GEO 最吃香的内容类型(AI 引用 50% 内容 < 13 周)。
本侧相对通用资讯站的**最大差异化资产 = `sources` + `credibility_note`**,务必「**可见**」渲染(进 noscript 全文,不只进 meta):

1. **answer-first**:noscript 头部先渲 `summary`(开头 40-60 字给核心结论),再渲 `body_html`。
   仿 `render.go:37-39` 的 excerpt 前置块。带具名来源 + 统计的内容被 AI 引用率高约 40%。

2. **可见「信息来源」区**:在 noscript 正文末尾渲染 `sources[]`(`{url,label}` → 带链接引用列表),
   同时映射进 JSON-LD `isBasedOn/citation`(§3.2)。这是 AI 检索层「attribution line」命中关键。

3. **可见「可信度说明」**:`credibility_note` 渲成显式 `<aside>`「来源核验 / 可信度说明」
   (仿 `render.go:50-53` 的 tip `<aside>` 样式)。AI 引擎偏好带 attribution + 核验说明的内容。

4. **freshness 信号外露**:noscript 头部显「发布 {published_at} · 更新 {updated_at}」
   (仿 `render.go:27-35` 的 metaParts),`dateModified` 近 90 天对 Perplexity 等尤其加分。

5. **结构化数据提升被引概率**:`NewsArticle` JSON-LD(§3)+ 可选 `FAQPage`(`render.go:151` 同构)
   让 AI 引擎机器可读地拿到 headline/date/author/publisher/sources,降低「抽取错误」从而提高被选中作为引用源的概率。

6. **量化证据**:若 `score` / `view_count` / `heat_external` 有意义,可在 noscript 渲「热度/关注度」
   (类比 `buildPaperNoscriptCard` 渲被引数,`handler_ssr.go:660-666`),给 AI 一个可量化的「重要性」信号。

---

## 6. 时效性 SEO 注意点

1. **freshness 闭环必须打通**:`news.updated` 落库 → 刷新 `updated_at` →
   详情页 `dateModified`(§3.2)→ sitemap `lastmod`(§4.2)→ bump sitemap 缓存版本 →
   促搜索/AI 重抓。**任一环断 = 更新对 SEO 不可见**。

2. **不做「假更新」**:别为蹭新鲜度对无实质变化的情报刷 `updated_at`(Google 能识别表层改日期,反伤信任)。
   `news.heat` 事件**只刷热度(heat_external/heat_trend/heat_measured_at),不应改 `updated_at`/不应触发 `dateModified`/不应 bump sitemap**
   —— 热度刷新不是内容更新。这是「热度刷新页被判重复/虚假新鲜」的关键隔离。

3. **canonical 自指**:详情页一律自指 `BASE/news/{slug}`(§3.4);
   热度刷新、来源跳转参数(utm 等)都不改 canonical。

4. **分页 canonical**:`/news` 列表分页(`?page=2`)**不要 canonical 回第 1 页**(Google 已弃 `rel prev/next`);
   每页自指 canonical;**深翻页(> 10~15 页)加 `noindex`**,避免低价值分页吃配额。
   分区页 `/news/section/{x}` 同理。

5. **坚决避免薄内容**:`hourly` 快讯也必须 `summary + body_html + sources + credibility_note` 成型,
   **不能只剩标题**(Google Helpful Content 降权薄页,AI 跳过薄内容)。
   若某条 item 正文极短,noscript 至少要 summary + sources + 可信度说明三件,撑起最小可索引体量。

6. **`status` 恒 `published`**:协议里 status 恒为 published,本侧无草稿态;但**仍需校验**——
   非 published(防御性)不渲染、不进 sitemap。

7. **slug 不可变**:发布后 slug 即 URL,`news.updated` 用 `id` 覆盖内容但**不得改 slug/URL**(改=丢权重+死链)。

---

## 7. 落地步骤清单(file 级)

> 前置:`internal/news` 模块(DB 表 + webhook 验签/幂等/落库/热度覆盖)由 `01-*` 负责;本清单只列 SEO/GEO/sitemap 部分,假设 news.Service 已能查到 item。

### 后端 SSR

- [ ] `backend/internal/seo/ssr_meta.go`(`:19` 包):新增 `NewsSSRMeta` 类型(§3.2 字段集:slug/title/summary/bodyHTMLSafe/sectionLabel/publishedAt/updatedAt/sources/credibilityNote/image)。
- [ ] `backend/internal/config/handler.go`:新增 `NewsSEOProvider` 接口(§2.3,仿 `:64` `ToolSEOProvider`)+ `newsSEOProvider` 字段(仿 `:89`)+ `SetNewsSEOProvider`(仿 `:140-142`)。
- [ ] `backend/internal/config/handler_ssr.go`:
  - `getRouteNoscriptContent`(`:1357`)加 `case` 分支:`/news/{slug}` 渲全文 noscript(answer-first + sources + credibility_note),`/news` 与 `/news/section/{x}` 渲条目列表(仿 `articleListNoscript` `:1504`)。
  - 新增 `injectNewsSEOMeta`(仿 `injectArticleSEOMeta` `:1298`)+ `buildNewsJSONLD`(仿 `buildPaperJSONLD` `:322` / `Article.BuildJSONLD` `render.go:103`)。
  - `ServeIndexHTML`(`:148-227` 分支区)加 `/news/` 注入分支。
  - body_html **sanitize**(白名单)实现:放 `internal/news`(provider 内做),SSR 只拿安全 HTML。
- [ ] `backend/cmd/server/bootstrap.go`(`:195/201/371` 附近):`core.configHandler.SetNewsSEOProvider(newsSvc)`。

### 后端 sitemap / robots / 路由

- [ ] `backend/internal/seo/handler.go`:
  - `ServeSitemapIndex`(`:185`)索引加一行 `sitemap-news.xml`(仿 blogs `:268-269` / tools `:275-278`,只引 URL),lastmod = news max(updated_at)。
  - `versionForKind`(`:627`)加 `case "news"`(供缓存失效)。
  - News sitemap 推荐由 `internal/news` 自己的 handler 提供(像 tools),`seo` 仅在索引引用 URL。
- [ ] `backend/internal/news/`(新):`ServeNewsSitemap`(+ 分页 `ServeNewsSitemapPage`,仿 `seo/handler.go:340/379/361`),`<loc>=BASE/news/{slug}`、`<lastmod>=updated_at`(天粒度);webhook 落库后 bump sitemap 缓存版本。
- [ ] `backend/cmd/server/routes.go`(`:199-209` 附近):`router.GET("/sitemap-news.xml", ...)`(+ 分页变体)。
- [ ] `robots.txt`(`seo/handler.go:565`):**无需改**(`/news/*` 默认放行,AI 爬虫组已具名放行,sitemap 走索引)。确认 Disallow 不误伤 `/news` ✓。

### nginx

- [ ] `nginx/conf.d/user.conf:241`:SSR 白名单 location 正则加 `news` →
  `location ~ ^/(paper|author|journal|journals|tools|resources|blog|help|about|features|pricing|search|privacy|terms|disclaimer|news)(/|$)`。
- [ ] `nginx/nginx.conf:85-96`:`$is_crawler` map **无需改**(已含全部目标 AI/搜索 UA)。
- [ ] sitemap location(`user.conf:196`)**无需改**(正则已匹配 `sitemap-news*.xml`)。
- [ ] 改后 `docker exec scholar_nginx nginx -t && nginx -s reload`。

### 前端

- [ ] `frontend-user/src/app/route-validation.ts`:`KNOWN_FIRST_SEGMENTS` 加 `news`(否则 `/news` 被当 stale-chunk 假 404,违反前端铁律)。
- [ ] 前端详情/列表页走公开 API 取数(类比 `frontend-user/src/features/help/api/content.ts`),正文不进前端 TS(单一真源 = DB)。SSR 注入与前端渲染读同一份 DB 数据,保持同构。
- [ ] 详情路由对不存在/越权统一 `ResourceError`(404),后端 `/news/{不存在 slug}` SSR 走 fallback(不注入,前端渲 404),不枚举泄漏。

### 验证

- [ ] `curl -A "GPTBot" http://localhost:5411/news/{slug}` 看 noscript 全文 + `NewsArticle` JSON-LD + 自指 canonical + OG。
- [ ] `curl -A "Baiduspider" ...` 同上(弱 JS 爬虫拿到真实正文)。
- [ ] `curl http://localhost:5411/sitemap.xml` 含 `sitemap-news.xml`;`curl .../sitemap-news.xml` 含各 `/news/{slug}` + `lastmod`。
- [ ] `news.updated` 后:`dateModified`/`updated_at`/sitemap `lastmod` 三处同步刷新;`news.heat` 后三处**不变**(§6.2)。
- [ ] 后端编译验证:`docker compose build backend`(本机无 Go)。

---

## 8. 开放问题

1. **封面图(§3.3)**:上游补 `cover_image` 字段?还是本侧按 section 兜默认图?——
   影响 `NewsArticle.image`(Top Stories)+ 卡片「左文右图」(02-* PC/移动展示)。**建议推动上游补字段**。
2. **Google News sitemap(§4.2-B)**:是否申请 Google News 收录?不申请就别做 News sitemap(纯浪费)。默认**暂缓**。
3. **分区页(§1.2)**:`/news/section/{section}` 是否作独立可索引落地页(进 sitemap)?
   还是只做 `/news` 一个列表 + 前端 query 筛选(分区不可索引)?——影响 sitemap 条目与薄内容风险。建议**做 4 个固定分区落地页**(枚举封闭、可控)。
4. **author 具名**:JSON-LD `author` 用机构 Organization,还是上游能给具名编辑/记者?具名作者对 E-E-A-T 更强,但情报多为聚合,机构作 author 通常更诚实。
5. **`original_date` 的用途**:是否在可见正文展示「事件原始日期 {original_date}」以区别「我方收录/发布日期」?
   (避免读者误把发布日当事件日)。不进 JSON-LD date 字段(§1.2)。
6. **body_html sanitize 白名单**(§2.2):具体放行标签/属性清单需定稿,并对 `<img src>`/`<a href>` 做协议校验(http(s)/相对);
   `/uploads` 绝对 URL 是否同域(同域才安全计入我方内容)。
7. **News sitemap 分片阈值**:初期单文件 vs 直接分页?取决于情报日产量与累计量预估(参考 paper 分片粒度)。
8. **热度刷新与 ISR/缓存**:`news.heat` 高频刷新热度,详情页 SSR 是否缓存(`ssrCache`,`handler.go:73`)?
   若缓存,热度变化不影响 SEO(热度本就不进 JSON-LD/sitemap,§6.2),但前端展示需另走实时 API ——
   确认 SSR 缓存 TTL 不会让 `news.updated` 的内容更新延迟过久(可在 updated 时主动失效该 slug 的 SSR 缓存)。
