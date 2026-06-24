# Scholar 现有 SEO/GEO 基建与内容资产盘点(来自代码库扫描)

### Scholar 项目 SEO 与搜索引擎推送基建现状分析
Scholar 项目已建立成熟的 SEO 与主动推送系统，但面向生成式引擎优化（GEO）存在明显缺口。当前已覆盖传统搜索引擎（Google、百度）的四层基建：

**已有能力**：
1. Sitemap：论文/作者/期刊/工具多源分页索引(50K 条/页)，Redis 版本号驱动增量失效
2. Robots 配置：针对百度/搜狗的爬虫规则，禁止 /api 与 OAuth 路由，支持 IndexNow key 文件验证
3. JSON-LD 结构化数据：ScholarlyArticle(论文)、Person + ProfilePage(作者)、Periodical(期刊)、SoftwareApplication(工具)，通过 SSR 注入 HTML head
4. 主动推送：索引 Now(Bing/Yandex 等)与百度普通收录 API，工作线程每 5 分钟消费队列，支持日配额限制

**关键文件**：
- `/internal/seo/handler.go`：公开 sitemap/robots 端点(11 个)，HTTP 处理逻辑
- `/internal/seo/service.go`：SEO 业务编排，缓存版本号合并(5 秒窗口)，写入路径触发主动推送
- `/internal/seosubmit/{handler,service,baidu,indexnow}.go`：主动提交的队列/推送/配额管理
- `/internal/config/handler_ssr.go`：详情页 SSR 注入(title/og/canonical/JSON-LD)+ 301 重定向
- `/internal/featuretool/sitemap.go`：工具广场独立 sitemap

**明显缺口面向 GEO**：
1. 无专门 AI 爬虫识别与优化路径(robots 里仅配 * User-agent)
2 无 AI 优化的 JSON-LD 扩展(如 Tool、CreativeWork、Dataset schema)
3. 无工具调用声明(tool_use 字段、openapi.json 暴露)
4. 无 RAG 友好的文本提取接口与语义分片
5. 无 API 级元数据端点供 AI 模型直取(仅 SSR 内 HTML)
6. 无针对深思-深研(深度推理)搜索的优化(无 complexity/source-quality 信号)
7. Nginx 配置无 AI 爬虫分流(成本控制/限流)

当前系统对 GPTBot/ClaudeBot/PerplexityBot/Google-Extended/Bytespider 零差异化对待，完全依赖通用爬虫策略。

已有能力: 动态 Sitemap 生成（论文/作者/期刊/工具）; Sitemap 索引页合并（papers/authors/journals/blogs/resources/static）; 版本号驱动 Redis 缓存失效（papers/authors/journals 独立计数器）; 5 秒缓存合并窗口（同窗口内多次写入只触发 1 次版本递增）; 论文/作者/期刊质量分层（tier-1 详情点击 → weekly / tier-2 搜索曝光 → monthly）; Priority 动态计算（根据质量层级 + 曝光/点击量）; Legacy /paper/{slug} / /author/{slug} → Canonical /paper/{source}/{id} 永久重定向; ScholarlyArticle JSON-LD 注入（title/abstract/authors/year/venue/DOI）; Person + ProfilePage JSON-LD 注入（名字/机构/主页/h-index/被引数）; Periodical JSON-LD 注入（刊名/出版商/ISSN）; SoftwareApplication JSON-LD 注入（工具名/分类/描述/价格）; SSR noscript 爬虫卡片（支持无 JavaScript 爬虫）; Open Graph 元数据注入（社媒分享卡片）; Canonical link 注入（同源重复页去重）; 关键词自动生成（论文/作者/期刊/工具场景高频词）; Robots.txt 爬虫规则（Disallow /api /admin /settings /callback）; Robots.txt User-agent 分组（通用 * 与百度 / 搜狗专属规则）; IndexNow 协议推送（Bing/Yandex/Naver/Liste.cz/Yep 聚合）; IndexNow Key 文件验证（GET /{key}.txt）; 百度普通收录 API 推送（日配额软限）; 推送队列（Redis ZSET 自动去重）; 推送配额管理（每日 YYYYMMDD 隔离）; 启动时 seed 入队（静态/博客/热门论文/作者）; 后台 worker 队列消费（可配置间隔，默认 5 分钟）; Canonical 路径推送（避免 legacy slug 被 301 稀释权重）; Host 校验过滤（IndexNow/百度协议要求）
面向GEO缺口: 无 AI 爬虫识别：robots.txt 无 GPTBot/ClaudeBot/PerplexityBot/Google-Extended/Bytespider 具名规则; 无 AI 爬虫成本控制：Nginx 无针对 AI 爬虫的限流/分流/缓存策略; 无 API 级元数据端点：AI 模型需读取结构化数据只能爬 HTML SSR 字段，无专门 /api/v1/public/papers/{id}/seo 端点; 无 OpenAPI 2.0 暴露：Minicod API 文档已下线，不支持 AI 工具调用声明（无 openapi.json 或 /api/v1/public/openapi.json）; 无 RAG 友好的文本分片接口：论文摘要/作者简介无分块 API，仅提供完整 HTML，不利于向量化; JSON-LD 未扩展深思类 schema：仅有 ScholarlyArticle/Person/Periodical/SoftwareApplication，缺 Dataset/CreativeWork/Thing 等通用类型; 无源质量信号：Sitemap entry 无 quality/credibility/academic_impact 元字段，无法向 AI 模型表达论文等级; 无 AI 引用链路标记：结构化数据无 citation/reference 字段指向引用的论文（仅有 sameAs DOI）; 无多语言标记：JSON-LD 无 @language 字段，搜索引擎难以判断内容语言（中英混合）; 无机器学习模型卡片支持：无 Model schema.org 类型（对 MLOps 领域论文不友好）; 无学术影响力信号：Sitemap priority 仅基于曝光/点击，无引用计数/h-index/会议等级权重; 无富片段优化：ScholarlyArticle 未声明 isAccessibleForFree/educationalLevel/learningResourceType 等教育属性; Robots 无访问频率建议：Crawl-delay 仅对百度/搜狗有效，无通用 Request-rate; 无 AI 友好的聚合接口：无 /api/v1/public/feed 支持 limit/offset/sort=recency 等 AI RAG 常见参数; 无字数/阅读时间信号：SSR 注入无 articleBody 字符数、estimatedReadingTime 等时间成本信号; sitemap.xml 索引页缺 priority：当前仅声明 lastmod，无 priority 提示爬虫应优先抓哪类子 sitemap; 无增量 sitemap 协议支持：仅提供全量分页，无 sitemap.xml 的 news: 或 mobile: 命名空间
关键文件: /Users/youngp/mypro/fuck_副本/scholar/backend/cmd/server/routes.go (SEO 端点注册（sitemap/robots 公开路由）), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seo/handler.go (Sitemap/Robots 生成，版本号缓存管理，曝光种子记录入队), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seo/service.go (SEO 业务层：seed 记录、缓存版本号、主动推送触发), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seo/ssr_meta.go (SSR 元数据类型定义（PaperSSRMeta/AuthorSSRMeta/JournalSSRMeta/ToolSSRMeta）), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seosubmit/service.go (主动推送业务层：路径入队、IndexNow/百度判断、worker 生命周期), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seosubmit/baidu.go (百度普通收录 API 推送（日配额限制、host 过滤）), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seosubmit/indexnow.go (IndexNow 协议推送（Bing/Yandex 等，自动重试+熔断）), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/config/handler_ssr.go (SSR 注入主逻辑：title/meta/canonical/JSON-LD/og/noscript，301 重定向), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/featuretool/sitemap.go (功能广场工具独立 sitemap（与 papers/authors/journals 解耦）)
端点: routes.go:192 — GET /sitemap.xml 索引文件（papers/authors/journals/blogs/resources/tools/static）; routes.go:193-201 — GET /sitemap-{kind}-:page.xml 分页 sitemap（论文/作者/期刊/工具，分页大小 50K）; routes.go:202 — GET /robots.txt 爬虫规则（Disallow /api/* /admin /settings/callback）; handler.go:548-581 — ServeRobotsTxt：返回 robots.txt，User-agent * + 百度 + 搜狗 + IndexNow key 声明; handler.go:184-310 — ServeSitemapIndex：生成索引文件，版本号驱动 Redis 缓存（6h TTL）; handler.go:358-430 — ServeEntitySitemap：论文/作者/期刊分页，priority + changefreq 按 quality_tier; handler_ssr.go:79-215 — ServeIndexHTML：SSR 注入逻辑，title/og/canonical/JSON-LD/noscript + 301 重定向; handler_ssr.go:303-542 — injectPaperSEOMeta：论文详情 SSR 注入（ScholarlyArticle JSON-LD + noscript 卡片）; handler_ssr.go:634-703 — injectAuthorSEOMeta：作者详情 SSR 注入（ProfilePage + Person JSON-LD）; handler_ssr.go:772-854 — injectJournalSEOMeta：期刊详情 SSR 注入（Periodical JSON-LD）; handler_ssr.go:936-992 — injectToolSEOMeta：工具详情 SSR 注入（SoftwareApplication JSON-LD）; sitemap.go:28-52 — ServeToolSitemapIndex + ServeToolSitemap：功能广场工具独立 sitemap; service.go:142-180 — RecordSearchSeeds：记录搜索曝光（tier-2），主动推送 canonical 路径; service.go:99-122 — RecordDetailClick：记录详情点击（tier-1），升级到高优先级; baidu.go:82-161 — SubmitBaidu：百度普通收录 API，配额限制 + host 校验; indexnow.go:74-135 — SubmitIndexNow：IndexNow 协议推送，自动重试 2 次，熔断保护

### Scholar 前端 SEO 基建现状与 GEO 落地清单
Scholar 目前实现了三层 SEO 注入架构,已达到生产级别,但存在几个面向 GEO 优化的明显缺口。

**现状**: 采用混合渲染模式——爬虫经 Nginx 爬虫 UA 映射 ($is_crawler 基于 30+ 已知爬虫关键字)走后端 SSR(handler_ssr.go ServeIndexHTML),普通用户走前端 SPA(react-helmet 客户端注入 / RouteSEO 组件)。后端对 /paper/{source}/{paperId}、/author/{source}/{authorId}、/journal/{id}/{slug}、/tools/{slug} 这四类实体页做动态 SSR,正则替换 index.html 的 meta tags + 注入 JSON-LD(ScholarlyArticle / ProfilePage / Periodical / CreativeWork)+ noscript 纯文本卡片供弱 JS 爬虫;首页 index.html 静态品牌 meta + Organization/WebSite 结构化数据;RouteSEO 为静态/列表页(搜索、内容中心、营销页)注入 title/description/canonical。Sitemap 完整(主 + static + blogs + resources + papers/authors/journals 分页),robots.txt 对中文爬虫有 Crawl-delay,但主动推送(百度 / IndexNow)在 .env 关闭未启用。

**关键缺口**(面向地理位置优化与高价值页面发现的明显问题):
1. **缺地理位置标记**: 无 hreflang(多语言版本存在时必加) / geo 标签;没有中国特化(简体中文 + 繁體繁體中文)的语言标记。
2. **页面层级与主题聚类弱**: paper/author/journal 的 noscript 卡片只有基本信息(标题+作者+摘要),缺深度内容索引;没有「论文分类 / 学科领域」的 topic cluster + pillar page 结构,每篇论文是孤立页,易被 Google 判为 thin content。
3. **JSON-LD 结构不完整**: ScholarlyArticle 缺 issn/volume/issue(期刊分卷信息) + mentions(关键概念) + author 的 homepage/affiliation;Journal 无 rating / evaluation / 影响力等 aggregate 评分,难以触发 Google Scholar / 学术搜索的高级摘要展示。
4. **内容营销页无深度**: /resources /blog 逐篇标题、摘要已有(2026-06 补全),但缺 FAQ 结构化(faq.json-ld) / 作者 byline / 发布日期 / 修改日期 / 阅读时长,难以升级成 featured snippet。
5. **爬虫 UA 列表可能过时**: 目前 map $is_crawler 列表(30+爬虫名)已涵盖主流(百度、Google、必应、Yandex、Sogou、Bytespider),但 Claude / OpenAI 官方爬虫 UA 如无特殊标记无法识别,被降级到 SPA 流程;缺主动「预热」让大模型爬虫高效发现高价值页。
6. **国际化稀缺**: 全站用中文,无英文版本 hreflang;品牌词 「Scholay」英文搜索无竞争力(无独立英文内容),GEO 拓展至欧美困难。
7. **SEO 种子摄入有漏洞**: detail_papers (tier-1 论文详情浏览)已上报机制存在,但 /search 搜索曝光(tier-2)的采样率未知、可能存在采样偏差,长尾冷门论文难被发现。

**GEO 落地关键通道**(已验证):
- Nginx 爬虫分流 + 后端 SSR 框架已就位,可无缝增量加地理感知逻辑(如响应 Accept-Language + 检测地理属性的页面内容)。
- Sitemap + robots.txt + JSON-LD 全栈可编程,无硬依赖。
- 新增页面类型(如 paper cluster / topic summary)可直接扩展 ServeIndexHTML 的 handler 和 JSON-LD builder。

已有能力: 三层 SEO 注入完整(静态壳 + React RouteSEO + 后端 SSR); 爬虫 UA 识别分流(30+ 爬虫覆盖,Nginx 层无成本判定); 四类实体页 SSR(paper/author/journal/tool 动态 meta + JSON-LD + noscript); Sitemap 完整齐全(主索引 + 6 个子 sitemap:static/blogs/resources/papers/authors/journals,分页 50k); robots.txt 可控(Baiduspider/Sogou 具名组 + Crawl-delay + Sitemap 指令); 搜索曝光上报渠道(tier-1 detail_papers + tier-2 papers/authors/journals,sendBeacon 非阻塞); noscript 纯文本卡片供弱 JS 爬虫(弱 JS 百度可读完整内容,无 CSR-only 陷阱); 301 尾斜杠归一 + legacy slug 重定向(canonical 链入房权重保留); 内容文章真实元数据(BlogArticles/ResourceArticles 逐篇标题+摘要+LastMod 镜像,驱动 noscript); 无主动推送依赖症(代码已就绪,只需 .env 开启 + 密钥填入); 可扩展SSR句柄(ServeIndexHTML pattern 支持新实体类型无改 Nginx/router 逻辑)
面向GEO缺口: 无 hreflang 多语言标记:仅中文站,缺英文 / 繁体 / 日文版本声明,GEO 拓展困难; 缺地理位置信息: 无 schema.org areaServed / spatial coverage / audience region 标记,难以触发地理搜索; JSON-LD 不完整: paper schemeVersion 缺 issn/volume/issue/mentions + author.homepage/affiliation;journal 无 aggregate rating / h-index / acceptance rate;tool 无 application/SoftwareApplication 的 operatingSystem/processorRequirements/offers 丰富化; 页面主题聚类缺失: paper/author/journal 无 "pillar-cluster" 结构,每篇论文孤立,缺 "学科领域" / "引文网络" 的 topic summary + breadcrumb 导航,易被 Google 判 thin content; 内容营销页 thin: /resources /blog 虽有标题+摘要(2026-06 补),仍缺 FAQPage(faq.json-ld) / Article byline / datePublished / dateModified / timeToRead,难升级 featured snippet; 爬虫 UA 可能过时: 无 OpenAI / Claude / Anthropic 官方爬虫标识(如有);无法主动预热大模型爬虫(token/rate limit 优化盲区); 搜索曝光数据隐患: tier-2 搜索曝光(exposePapers)无采样率限制+无重复去重,长尾冷论文如无其他导入可能永不浮现(只靠后端 tier-1 读 GET 接口覆盖不全); 国际化稀缺: 品牌词 "Scholay" 英文搜索无竞争力(全英文内容为 0),无法打开欧美 GEO 市场(仅中文爬虫友好,Western crawler 看到中文语言属性可能降权); 内容深度未量化: noscript 卡片字数上限(truncate 200-500),无完整文本摘要;论文详情的「被引数据」(citation count/h-index/field-weighted impact)未在 JSON-LD 中暴露,难以成为学术垂直搜索的高权重源; 无主动「预热」机制: 新上线页面无 fetch-as-Googlebot / prerender 机制,爬虫发现延迟可能 1-2 周;无 Partial Content 预加载(如论文列表页预注入 top-20 的 paper.paperId 便于爬虫深链发现); Canonical 一致性未验证: SSR 注入的 canonical + RouteSEO 计算的 canonical + frontend-user/index.html 硬编码的 og:url 三者无 diff 巡检,易产生默认 self-canonical 的不一致; 分析缺失: 无 Search Console 集成(sitemap 提交、coverage 错误、sitelinks 信号);无 schema.org 结构化数据验证工具的定期扫描
关键文件: /Users/youngp/mypro/fuck_副本/scholar/frontend-user/index.html (静态 SEO 壳:品牌 title/meta/OG/JSON-LD(@graph Organization+WebSite+SearchAction+SoftwareApplication);非 JS 爬虫可见), /Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/shared/components/RouteSEO.tsx (前端运行时 SEO:React 19 原生 hoist,静态/列表页注入 title/description/keywords/canonical/noindex;故意不发 og/JSON-LD), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/config/handler_ssr.go (后端 SSR 核心:四个实体(paper/author/journal/tool)的动态 meta 正则替换 + JSON-LD 注入 + noscript 卡片;爬虫 UA 识别 + Nginx 418→@ssr_backend 路由), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seo/ssr_meta.go (SSR 元数据类型:PaperSSRMeta/AuthorSSRMeta/JournalSSRMeta/ToolSSRMeta 定义,后端产数据、config handler 消费), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seo/handler.go (SEO 业务逻辑:ServeRobotsTxt(爬虫规则)/ Sitemap 生成(索引+分页) / ExposeSeeds(搜索曝光)), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/featuretool/sitemap.go (工具广场 sitemap:/sitemap-tools.xml 生成(20k/页,automated)), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seo/content_articles.go (内容文章索引:StaticPages(27 静态页)/ BlogArticles(16篇)/ ResourceArticles(13篇)+ 其元数据,驱动 sitemap + noscript 卡片), /Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/shared/api/seo.ts (前端 SEO 曝光 API:paper/author/journal toSeed() 映射 + exposePaperDetail/Papers/Authors (sendBeacon 投递 /api/v1/public/seo/expose)), /Users/youngp/mypro/fuck_副本/scholar/nginx/conf.d/user.conf (Nginx 爬虫分流:map $is_crawler + location ~ /(paper|author|journal|tools|resources|blog|help|about|features|pricing) 判断 418→@ssr_backend / 普通用户→frontend SPA), /Users/youngp/mypro/fuck_副本/scholar/nginx/nginx.conf (Nginx 爬虫 UA 映射:map $is_crawler 30+ 爬虫关键字(bot|crawler|spider|googlebot|baiduspider|bytespider 等))
端点: /api/v1/public/seo/expose (POST) — 前端火一条搜索曝光请求,包含 papers/authors/journals/detail_papers,后端合并锁 5s 后 upsert seo_papers/seo_authors/seo_journals; /sitemap.xml (GET) — Sitemap 索引,列出 static/blogs/resources/papers-*/authors-*/journals-*/tools sitemap 条目; /sitemap-static.xml (GET) — 27 个静态页面(首页、功能、营销、内容中心、合规)的 sitemap,priority/changefreq 按业务定级; /sitemap-papers-{N}.xml (GET) — 论文 sitemap 分页(50k/页),priority 0.5 tier-2 / 0.8 tier-1,changefreq weekly; /sitemap-authors-{N}.xml (GET) — 学者 sitemap 分页,同上; /sitemap-journals-{N}.xml (GET) — 期刊 sitemap 分页(新增,2026-06 补的 journal reconcile); /sitemap-blogs.xml (GET) — 16 篇博客文章 sitemap,读 backend/internal/seo BlogArticles 表; /sitemap-resources.xml (GET) — 13 篇资源中心文章 sitemap,读 ResourceArticles 表; /sitemap-tools.xml / /sitemap-tools-{N}.xml (GET) — 功能广场工具 sitemap 索引+分页(20k/页),来自 featuretool service; /robots.txt (GET) — 爬虫规则:Allow / / Disallow /admin /api 等,含 Baiduspider/Sogou 具名组 + Crawl-delay:2 + Sitemap 指令; Nginx location ~/(paper|author|journal|tools|resources|blog|help|about|features|pricing)(/|$) — 爬虫 if ($is_crawler) { return 418; } → error_page 418 @ssr_backend 内部跳,后端 ServeIndexHTML SSR;普通用户 → frontend SPA

### Scholay 学术搜索平台 - 对外内容资产与可被 AI 引用的权威内容盘点
Scholar 是一站式学术研究平台,集检索、分析、写作、审稿、文献管理于一身。当前已存在的对外可被抓取及可被 AI 引用的内容资产分布如下:

已建成的内容载体:
1. 博客系统(16 篇长篇文章,2000-3000 字),按 6 大类别组织(学术搜索、AI与学术、论文写作、研究方法、工具教程、行业观察)。后端 internal/seo/content_articles.go 维护 slug 列表作 sitemap 生成器,前端数据在 blog-articles.ts。代表文章包括「AI 学术搜索与 Google Scholar 深度对比」「2026 年学术搜索工具全景对比」。

2. 资源中心(13 篇教程性文章),按 5 类分组(研究方法、论文写作、学术工具、引文规范、学术伦理)。代表文章包括「如何高效检索学术文献」「文献综述撰写全攻略」「学术论文写作技巧」。

3. 功能落地页(7 个 /features/{slug} 营销页面 + /features 总览 + /pricing 定价页,各 1500-2000 行代码)。

4. 静态内容页(/help /about /contact /privacy /terms /disclaimer /feedback 约 12 页)。

5. 动态详情页:论文(/paper/:source/:paperId)、学者(/author/:source/:authorId)、期刊(/journal/:id/:slug),由后端 minicod API 实时生成,包含 SEO friendly 的 JSON-LD schema。

6. 移动端个性化流(/m/feed),每日实时生成论文推荐。

语言与国际化:中文为主,所有界面、菜单、帮助文档均中文。博客文章含英文术语并存。无系统化的 i18n 框架,英文用户面临全中文界面,是 GEO 扩展的主要瓶颈。

URL 路由与内容映射:/ 首页(品牌入口),/search 文献搜索,/journals/search 期刊搜索,/claw /prism /peer-review /library /tools 功能页面,/blog 及 /blog/{slug} 博客入口与 16 篇文章(sitemap canonical),/resources 及 /resources/{slug} 资源入口与 13 篇教程(sitemap canonical),/features/{slug} 营销页面,/pricing 定价,/paper /author /journal 动态详情页。

现有高价值内容:29 篇原创文章(博客 16 + 资源 13)已建立专业话术和深度分析;论文/学者/期刊详情页每日数千条更新,权威数据。

明显缺口:无学术术语词汇表(Glossary);无最佳实践指南合集;无案例研究(Case Studies);无 FAQ 系统;无学科专题深入页(如 AI 研究完整工作流系列);无数据统计与趋势报告;无英文版本;无学科导航(如计算机科学领域完整指南)。

基础设施缺陷:博客/资源无数据库,无后台编辑界面,迭代成本高;无 i18n 框架导致英文扩展困难;无相关文章推荐机制,内容聚类效率低。

建议:立即补充学术术语词汇表与现有文章交叉链接;新增数据报告类内容;补充英文版本(核心 5-7 篇);建立主题聚类页面;补充学科专题导航;逐步引入 i18n 框架以支持全球语言覆盖。

已有能力: 博客系统(16 篇文章,完整 Markdown 渲染); 资源教程中心(13 篇实操指南); 7 个功能营销落地页; 动态论文详情页(SEO JSON-LD schema); 动态学者档案页(h-index、论文列表); 动态期刊详情页(影响因子、分区); 移动端个性化论文流(/m/feed); 后端 sitemap 生成(自动 slug 索引); 全国际化汉化界面与菜单; 论文/学者/期刊实时 API 数据
面向GEO缺口: 无学术术语词汇表(Glossary)系统化定义; 无最佳实践指南(Best Practices Hub)集合; 无案例研究页面(Case Studies); 无常见问答(FAQ)系统; 无学科专题深入指南(如 AI 研究工作流系列); 无数据统计与趋势报告(权威报告内容); 无英文版本(全球 GEO 覆盖为 0); 无学科导航页(如计算机科学完整指南); 无博客/资源数据库后端管理(纯前端维护,迭代成本高); 无 i18n 框架(国际化扩展困难); 无内容推荐机制(相关文章、主题聚类低效); 无用户评论与反馈系统(内容互动无; 无版本控制与编辑历史(透明度缺失)
关键文件: /Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/features/help/data/blog-articles.ts (博客文章数据源(16 篇,2000+ 字,6 个分类)), /Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/features/help/data/resource-articles.ts (资源教程数据源(13 篇,1500+ 字,5 个分类)), /Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/features/landing/routes.tsx (营销落地页路由(7 个功能页 + 价格页)), /Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/app/router.tsx (全站路由总入口(landing/help/search/detail pages 组装)), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seo/content_articles.go (博客与资源 slug 注册表(sitemap 生成、主动提交数据源)), /Users/youngp/mypro/fuck_副本/scholar/backend/internal/seo/ssr_meta.go (SSR JSON-LD schema 生成(论文、学者、期刊动态 SEO)), /Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/features/browser/pages/BrowserPage.tsx (论文/学者/期刊动态详情页容器), /Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/app/menus.ts (全站 7 个功能菜单定义(检索、智能、资源分类)), /Users/youngp/mypro/fuck_副本/scholar/frontend-user/src/features/home/HomePage.tsx (首页品牌入口与搜索发现)
