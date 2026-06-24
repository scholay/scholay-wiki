I have all the verified context I need. Writing the final plan now.

# Scholar GEO 落地方案

> 适用范围:`scholar`(后端 Go/Gin · 前端 React19+Vite SPA · Nginx 反代)。本方案紧贴当前代码现状,所有动作均映射到真实文件。
> 编写依据:GEO 一手研究(Aggarwal et al. *GEO: Generative Engine Optimization*, KDD 2024, arXiv:2311.09735)、Vercel/Cloudflare 的 AI 爬虫一手实测、各厂 robots 官方文档,以及本仓库 `internal/seo` / `internal/seosubmit` / `config/handler_ssr.go` / `nginx` 的实际实现。
> 标注规范:凡引用结论后标 **[一手已核实]** / **[行业说法·谨慎]** / **[已证伪·勿押注]**。

---

## 1. 现状盘点小结

Scholar 已有**生产级的传统 SEO 三层注入 + 主动推送**基建,但**几乎没有面向 AI 爬虫的差异化处理**。具体:已有①动态 sitemap(论文/作者/期刊/工具多源分页 50K/页,Redis 版本号驱动失效,`internal/seo/handler.go` + `featuretool/sitemap.go`);②`robots.txt` 由后端动态生成(`handler.go:548` `ServeRobotsTxt`),只有 `*` / `Baiduspider` / `Sogou web spider` 三组,**无任何 AI 爬虫具名规则**;③SSR JSON-LD(`config/handler_ssr.go`,四类实体页注入 ScholarlyArticle / ProfilePage+Person / Periodical / SoftwareApplication + noscript 卡片);④Nginx 爬虫分流(`nginx/nginx.conf` 的 `map $is_crawler` 匹配 30+ UA → `user.conf:238` 实体路由 `return 418` → `@ssr_backend` SSR);⑤前端 `RouteSEO.tsx` 列表/营销页 title/canonical;⑥主动推送 IndexNow + 百度普通收录(`internal/seosubmit/{indexnow,baidu}.go`,worker 5 分钟消费,**默认在 .env 关闭**)。**缺**:AI 爬虫(GPTBot/ClaudeBot/PerplexityBot/OAI-SearchBot 等)在 `robots.txt` 与 `$is_crawler` map 里**未命中**(`bytespider`/`applebot`/`googlebot` 在,但 OpenAI/Anthropic/Perplexity 不在)→ AI 检索爬虫被当普通用户走 SPA、拿到空首屏;JSON-LD 缺 ScholarlyArticle 的 `citation`/`isPartOf` 期刊卷期/`mentions`、缺 FAQPage、缺全站 Organization+BreadcrumbList 实体图;无术语表/FAQ/对比页等"可被引用"内容资产;无 AI 爬虫命中 + AI referral 的监测。

---

## 2. 落地动作清单(按优先级)

### P0 — 本周可做(低成本、高 ROI、不改架构)

| 优先级 | 动作 | 涉及文件/模块 | 影响 | 工作量 | 说明 |
|---|---|---|---|---|---|
| P0 | **`robots.txt` 显式放行 AI 检索类爬虫** | `backend/internal/seo/handler.go:548` `ServeRobotsTxt` | 让 ChatGPT Search/Perplexity/Claude 能合法收录并引用,否则未来无法被引 | 0.5d | 新增独立 User-agent 组(robots 不继承 `*`,**每个 token 必须各自带 Disallow**,与现有 Baiduspider 同理):放行 `OAI-SearchBot`、`PerplexityBot`、`Claude-SearchBot`、`ChatGPT-User`、`Claude-User`、`Perplexity-User`、`Bingbot`(喂 Copilot)。判断依据:Vercel 实测主流 AI 爬虫不执行 JS,封检索爬虫=把品牌移出 AI 答案 **[一手已核实]**。训练类(`GPTBot`/`Google-Extended`/`Bytespider`)按"放行营销内容/可选封训练"处理,见 3.1 |
| P0 | **`$is_crawler` map 补 AI 爬虫 UA → 让它们走 SSR 拿首屏** | `nginx/nginx.conf:85` `map $http_user_agent $is_crawler` | 当前 AI 检索爬虫被判为普通用户走 SPA → 拿到空壳 HTML(CSR 风险),补后即走 `@ssr_backend` 拿首屏静态内容 | 0.5d | 在 map 增 `"~*(gptbot|oai-searchbot|chatgpt-user|claudebot|claude-searchbot|claude-user|perplexitybot|perplexity-user|google-extended|amazonbot|meta-externalagent)" 1`。判断依据:Vercel/MERJ 5 亿次 GPTBot 抓取零 JS 执行,CSR 页对它们=空白 **[一手已核实]**。注意 `Google-Extended` 是 opt-out 令牌不会作为 UA 命中,放 map 里无害但真正生效在 robots |
| P0 | **ScholarlyArticle JSON-LD 补"证据型"字段** | `backend/internal/config/handler_ssr.go:303` `injectPaperSEOMeta` + `seo/ssr_meta.go` `PaperSSRMeta` | GEO 论文实测:加统计/引用/来源是被引提升最强三法,各约 +30–40% **[一手已核实]** | 1d | 给 ScholarlyArticle 补 `citationCount`(数字证据)、`isPartOf`(Periodical + `volume`/`issueNumber`/`issn`)、`sameAs`(DOI,已有则保留)、`inLanguage`、`isAccessibleForFree`。这些字段在 `ssr_meta.go` 的 `PaperSSRMeta` 已有 venue/year,需把 minicod 已返回的引用数/卷期补进 meta struct |
| P0 | **AI 爬虫日志监测起步(grep + 周报)** | 新增 `scripts/ai-crawler-stats.sh`(仿 `scripts/check-alipay-callback.sh`),读 `docker logs scholar_nginx` access log | 区分"被抓取"(训练类)vs"被当答案源"(实时拉取类),后者命中=真实被引信号 | 0.5d | `grep -Ei "GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-User|PerplexityBot|Perplexity-User|Google-Extended|Bytespider"` 分类计数。判断依据:Cloudflare 数据训练抓取占 79%、crawl-to-refer 极度失衡(ClaudeBot 38000:1),**抓取量≠被引,必须看实时拉取命中** **[一手已核实]**。UA 易伪造,关键 UA 配反向 DNS 校验 |
| P0 | **GA4 自定义 Channel Group 抓 AI referral** | 前端 `frontend-user/index.html`(GA 注入处,见记忆 `google-analytics-integration`)+ GA4 后台配置 | 把 AI 转介从 "Direct" 里捞出来,起步衡量 AI 带量 | 0.5d | GA4 后台建正则 channel 匹配 `chatgpt.com|chat.openai.com|perplexity.ai|claude.ai|gemini.google.com|copilot.microsoft.com|deepseek.com`,排序置于 Referral 之上。已知限制:App 内点击仍记 Direct、AI Overviews 归 Organic **[一手已核实]**,故只能作"下限" |

### P1 — 本月(中等工作量,显著扩大被引表面)

| 优先级 | 动作 | 涉及文件/模块 | 影响 | 工作量 | 说明 |
|---|---|---|---|---|---|
| P1 | **开启主动推送 + 扩到必应 IndexNow** | `.env`(打开 seosubmit 开关 + 填 key)、`internal/seosubmit/indexnow.go` | 代码已就绪,仅 .env 关着;开启后 Bing 索引是 ChatGPT Search 的守门人(87%+ 引用匹配 Bing) **[一手已核实/SearchGPT 经 Bing 发现源]** | 0.5d | IndexNow 已聚合 Bing/Yandex 等,**无需为每引擎单独接**——这是关键:OpenAI/Perplexity 不收 sitemap ping,但吃 Bing 索引。优先保证 Bing 收录干净。`baidu.go` 普通收录同时打开覆盖国内文心 |
| P1 | **全站 Organization + 实体页 BreadcrumbList JSON-LD** | `config/handler_ssr.go`(各 inject 函数)、`frontend-user/index.html`(首页 `@graph` 已有 Organization,补 `@id` 供其余页引用) | 用 `@id` 把 Person/Article/Organization 串成内部知识图谱,提升 grounding 置信 | 1d | 首页定义 `Organization`(含 `sameAs` 指向 GitHub/未来 Wikidata Q-ID),实体页用 `@id` 引用而非重复定义;论文/作者/期刊页加 `BreadcrumbList`(首页→学科→实体)。判断依据:JSON-LD 结构化页被引率行业测 47% vs 28% **[行业说法·谨慎]**,但 schema 对 AI 解析的正向作用有微软官方背书 |
| P1 | **内容页补 FAQPage + Article 元数据(byline/datePublished/dateModified/timeToRead)** | `frontend-user/src/features/help/data/{blog,resource}-articles.ts`、`internal/seo/content_articles.go`、`config/handler_ssr.go` 新增 `injectArticleSEOMeta` | 29 篇博客/资源页升级为可被引、可进 featured snippet;具名作者+日期=E-E-A-T 信号 | 2d | 当前博客/资源页 noscript 只有标题+摘要 → thin。每篇补:问题式 H2 + 40–60 词答案胶囊、`FAQPage` JSON-LD、具名作者 bio、`dateModified`。判断依据:答案前置 + 定义式表述更易被引(Indig 300 万 ChatGPT 回复研究:44.2% 引用来自前 30% 正文)**[一手已核实]** |
| P1 | **新建"工具对比/替代品/术语表"内容簇(支柱-集群)** | `blog-articles.ts` / `resource-articles.ts` 扩条目 + `content_articles.go` 注册 slug + sitemap 自动覆盖 | 学术工具问答 88% 引用来自第三方/榜单/对比页,自建对比页占住"vs Semantic Scholar/Consensus/Elicit"长尾 | 3d | 新增:`学术搜索工具对比`(pillar 2000+ 字)+ 8–12 篇支撑文(术语表 glossary、`vs X` 对比、学科检索指南)。每页 ≥500 独特词、≥3 个独特块(对比表/决策标准/边界),双向内链。判断依据:"Best X" 类占 ChatGPT 被引页面相当比例 **[mixed·方向成立数字存疑,43.8% 原始出处张冠李戴]**;主题集群被引 2–3 倍 **[已证伪·勿当事实,仅作组织原则]** |
| P1 | **Nginx 对 AI 爬虫做轻量限流/分流(成本护栏)** | `nginx/conf.d/user.conf`(`@ssr_backend` 路由)+ `nginx.conf` limit_req zone | 防训练类爬虫(Bytespider/Amazonbot)高频抓 SSR 拖垮后端;Cloudflare 数据 crawl-to-refer 极失衡 | 1d | 对 `$is_crawler` 中训练类 UA 加 `limit_req`,检索类(*-User/SearchBot)放宽。不封,只限速。判断依据:训练抓取占 79% 却几乎不带量 **[一手已核实]** |

### P2 — 后续(战略性,需跨团队/运营配合)

| 优先级 | 动作 | 涉及文件/模块 | 影响 | 工作量 | 说明 |
|---|---|---|---|---|---|
| P2 | **公开 AI 友好元数据端点 `/api/v1/public/papers/{id}/seo`** | `backend/cmd/server/routes.go` + `internal/seo/handler.go` 新增 handler | AI 模型/agent 直取结构化 JSON 而非爬 HTML;为 RAG 提供干净分块 | 2d | 返回论文 title/abstract/authors/venue/citationCount/DOI 的 JSON。注意:**不是 GEO 的高杠杆**(主流引擎仍爬 HTML),优先级低于 SSR+robots |
| P2 | **站外实体建设:Wikidata 条目 + 榜单/社区铺设** | 非代码(运营),官网 `Organization.sameAs` 回填 Q-ID(`handler_ssr.go`) | AI 在没抓到站时也能"认识"Scholar;.edu LibGuides / 知乎 / Reddit 是学术垂类高权威源 | 持续 | 建 Wikidata(无 notability 门槛)写 sameAs;争取进 "best academic search tools" listicle、知乎专业问答、r/AskAcademia。判断依据:工具推荐 88% 引用来自第三方 **[mixed·方向成立]**;实体一致性是核心信号 **[一手已核实]** |
| P2 | **i18n + 英文核心内容(5–7 篇)+ hreflang** | 前端引入 i18n 框架、`config/handler_ssr.go` 补 `inLanguage`/hreflang | 打开欧美 GEO 市场,当前全中文对 Western 爬虫可能降权 | 大 | 战略项,工作量大,放最后 |
| P2 | **prompt 抽测被引率 / Share of Voice(国内引擎为主)** | 新增脚本/cron,跑豆包/DeepSeek/Kimi/文心 + ChatGPT/Perplexity | 衡量真实曝光(抓取量不代表被引) | 持续 | 起步用自建小样本(OneGlanse 思路:自带 LLM key 跑 prompt 集)。判断依据:手动小样本无统计意义,需自动化大样本 **[一手已核实]** |
| P2 | **❌ 不做 `llms.txt`(或仅作极低成本可选项)** | — | — | — | **明确不押注**:Google 官方(Illyes/Mueller)称不支持、类比已废弃的 keywords meta;Ahrefs 实测 97% 的 llms.txt 从未被请求,无主流厂商承诺读取 **[一手已核实]**。资源全部投向 SSR + robots 放行 + schema |

---

## 3. 关键技术抓手的具体建议

### 3.1 AI 爬虫在 robots / Nginx 的放行 vs 封禁取舍

**结论:放行检索类,谨慎对待训练类。** 必须区分三类爬虫(此分类有 OpenAI/Google/Apple 官方文档支撑 **[一手已核实]**):

- **实时检索/索引类 → 全放行**(被引的前提):`OAI-SearchBot`、`PerplexityBot`、`Claude-SearchBot`、`Bingbot`。封它们 = 把 Scholar 移出 ChatGPT Search/Perplexity 答案。
- **用户即时取页类 → 全放行**:`ChatGPT-User`、`Claude-User`、`Perplexity-User`。这类命中页 = Scholar 正被当答案源,是最强被引信号。
- **训练类 → 业务决策,默认放行**:`GPTBot`、`ClaudeBot`、`Google-Extended`(opt-out 令牌)、`Amazonbot`、`Meta-ExternalAgent`。Scholar 是公开学术营销内容,封训练爬虫**保护不了内容价值,却会把品牌悄悄移出未来 AI 答案**;建议放行,仅对其加 Nginx 限速。`Bytespider`(字节,会无视 robots.txt **[一手已核实]**)只能靠 Nginx UA 限速/封堵,robots 拦不住。

**落地两处必改且配套**:
1. `handler.go:548` robots.txt:每个 AI token 加独立 User-agent 组(robots **不继承** `*`,这一点你们代码注释里已为 Baiduspider 写明,沿用同模式)。封 `ClaudeBot` 不会连带封 `Claude-SearchBot`/`Claude-User`,反之亦然——**逐 token 写**。
2. `nginx.conf:85` `$is_crawler` map:补 AI UA,否则即使 robots 放行,检索爬虫走 SPA 流程拿不到 SSR 首屏。**两处必须同时改**才闭环。

### 3.2 SSR/预渲染保证 AI 爬虫拿到首屏

**风险点(基于代码现状):** `user.conf:238` 的 SSR 分流只对 `/(paper|author|journal|tools|resources|blog|help|about|features|pricing)` 这些路径前缀 + 命中 `$is_crawler` 才走 `@ssr_backend`。问题有二:
- **AI 爬虫 UA 当前不在 `$is_crawler`** → 即便访问论文页也走 SPA → 拿到空 `index.html` 壳(React 未执行)。Vercel 实测 GPTBot/ClaudeBot/PerplexityBot **零 JS 执行** **[一手已核实]**。这是 P0 动作 2 要修的核心。
- **`/search`、`/journals/search`、`/m/feed` 等不在 SSR 路径白名单** → 这些是纯 CSR,AI 爬虫看到空白。短期可接受(详情页才是被引主体),但要确认 sitemap 不引导 AI 爬虫去这些 CSR 列表页拿空内容。

**建议:** P0 补 UA 后,抽查 `curl -A "PerplexityBot" https://<host>/paper/stc/<id>` 确认返回的是 SSR 后的完整 noscript 卡片而非空壳。同时 Vercel 数据显示 AI 爬虫 URL 发现能力弱(ChatGPT/Claude 约 34% 抓取命中 404)**[一手已核实]** → 保持 canonical 稳定、`user.conf:196` 的 301 尾斜杠归一已就位,继续维护少重定向。

### 3.3 schema.org JSON-LD 扩展

按 GEO"证据型内容"原则(`config/handler_ssr.go` 各 inject 函数 + `ssr_meta.go` 类型扩字段):

- **论文页 `ScholarlyArticle`**(`injectPaperSEOMeta:303`):现有 title/abstract/authors/year/venue/DOI。补 → `citationCount`(数字证据,GEO 最强信号之一)、`isPartOf`(嵌 `Periodical` + `volume`/`issueNumber`/`issn`)、`author` 的 `affiliation`,`inLanguage`,`isAccessibleForFree`,`sameAs` 保留 DOI。
- **FAQ 页 `FAQPage`**:博客/资源/help 页新增(P1)。每篇问答用 `Question`/`acceptedAnswer`,答案 40–60 词胶囊式。
- **`Organization`**(首页 `index.html` 的 `@graph` 已有,补 `@id` + `sameAs`):全站只定义一次,其余页 `@id` 引用。
- **`BreadcrumbList`**:四类实体页加(首页→学科/期刊→实体),帮 AI 理解层级。
- 用 `about`/`mentions`/`isPartOf`/`citation` 把 Person、Periodical、Article 串成内部实体图,**只标可见内容**。

### 3.4 sitemap 覆盖与主动推送是否扩展

- **sitemap**:覆盖已很全(papers/authors/journals/tools/blogs/resources/static),`featuretool/sitemap.go` + `handler.go` 分页 50K。**新增内容簇(对比页/术语表)走 `content_articles.go` 注册 slug 即自动进 sitemap**,无需新协议。建议给 sitemap 索引页补 `priority` 提示(当前只有 lastmod),让爬虫优先抓 tier-1。
- **主动推送扩展**:**核心是开启已有的 IndexNow + 百度**(P1,.env 关着)。**不需要为每个 AI 引擎单独接推送**——OpenAI/Perplexity 不收 sitemap ping,但 ChatGPT Search 经 Bing 发现源(87%+ 匹配 Bing)**[一手已核实]**,所以**保证 Bing 收录干净 = 间接喂 ChatGPT**。国内文心吃百度收录,豆包/元宝吃抖音/公众号生态(非本站可推送,属 P2 站外运营)。

### 3.5 监测:识别 AI 爬虫命中与 AI referral(起步自建)

两条管道,均用现有 docker logs,无需外部平台(与项目"日志走 docker logs"一致):
1. **爬虫命中**(P0 脚本):grep nginx access log 的 UA,**分训练类 vs 实时拉取类**——实时拉取(`*-User`/`*-SearchBot`)命中才是被引信号。Cloudflare 数据证明抓取量≠被引(crawl-to-refer 38000:1)**[一手已核实]**,所以**不能只看抓取量**。关键 UA 配反向 DNS 防伪造。
2. **AI referral**(P0 GA4):自定义 channel group 正则。已知归因下限(App 内点击落 Direct、AIO 落 Organic)**[一手已核实]**,作趋势参考。
3. **被引率/SOV**(P2):自建 prompt 集跨国内外引擎抽测,周测被引率、月测 SOV。

---

## 4. 不要踩的坑(基于核实结果)

- **不押注 `llms.txt`**:Google 否定 + 97% 从未被请求 **[一手已核实]**。
- **"主题集群被引 2–3 倍""Yext 双向内链 2.7 倍"是已证伪/伪造归因 [已证伪]** —— 支柱-集群仍值得做(扩大检索面、内链有益),但**别拿这俩数字当 KPI 依据**。
- **关键词堆砌在生成式引擎无效甚至负向 [一手已核实]** —— 内容侧投入应放在统计/引语/来源/答案前置,而非堆词。
- **"加统计+31%/来源+30%"是区间的二手简化值 [mixed]** —— 对外汇报用"约 +30–40%"区间表述,别写成精确单值。
- AI 爬虫日志监测里 `anthropic-ai` 是**已废弃旧 token**,实时拉取真名是 `Claude-User`;`Google-Extended` 是 robots opt-out 令牌、**不会作为 UA 出现在日志**——脚本归类别搞反 **[核实结论已修正原 dossier 错误]**。
