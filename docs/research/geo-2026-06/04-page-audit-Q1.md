Confirmed: the source code's robots.txt declares `sitemap.xml` + `sitemap-tools.xml`, while the sitemap index (`ServeSitemapIndex`) emits static/blogs/resources/papers/authors/journals — `sitemap-tools.xml` is NOT in the index. This matches the runtime observation, so this is current-code behavior, not just a deploy artifact. Now I have enough verified facts to write the report.

# Scholar 平台 SEO / GEO 体检报告(Q1)

## 总体结论

**实体页(论文/作者/期刊/工具)健康**:全部 200、走 backend SSR、有专属 `<title>` + 2 段 JSON-LD(ScholarlyArticle / Person+ProfilePage / Periodical / 工具),Googlebot 与 GPTBot/ChatGPT-User 逐字节一致,无 cloaking 风险,且已进对应分页 sitemap(papers 239 / authors 522 / journals 328 条)。**静态/介绍/文档页一半残**:`/about /features /pricing /help /resources /blog` 有 SSR noscript 卡片但全部缺页面专属 `<title>`(用首页通用标题),`/features/*` 六个子页内容塌缩成同一张 394 字卡片,博客/资源正文页只给爬虫"H1+一句摘要"而非全文。**真漏洞集中在三处**:① 8 个页面进了 sitemap 却对爬虫只返回 11394 字节空 CSR 壳(`/search /journals/search /contact /privacy /terms /disclaimer /claw /prism /peer-review /feedback`);② robots.txt 声明的 sitemap 与索引实际子图对不齐;③ 全站缺 OG 标签、缺公司主体信息。

## 核心体检表

> Human(真人 UA)对每个路径一律返回同一空壳:bytes=11394、noscript=0、JSON-LD=1、通用 title。下表"搜索引擎/AI 可抓内容"均指爬虫 UA(Googlebot/GPTBot)视角;GPTBot 与 Googlebot 输出逐字节一致。

| 页型 | 样例 URL | 页面正常? | 在 sitemap? | 搜索引擎可抓内容? | AI 爬虫可抓内容? | SSR/CSR | 内容厚度 | 主要问题 |
|---|---|---|---|---|---|---|---|---|
| 首页 | `/` | 200 ✅ | 是(static) | 仅 meta+JSON-LD | 仅 meta+JSON-LD | 静态壳 | noscript 0 字 | 无首屏正文卡,GEO 无可摘正文(可接受) |
| 论文 | `/paper/olx/olx:W4406458261` | 200 ✅ | 是(papers, 239) | ✅ 全 | ✅ 全 | SSR | 12628B / noscript 107 字 / JSON-LD 2(ScholarlyArticle) | 正文偏薄(107 字) |
| 作者 | `/author/olx/olx:A5100747839` | 200 ✅ | 是(authors, 522) | ✅ 全 | ✅ 全 | SSR | 13480B / 242 字 / JSON-LD 2(Person+ProfilePage) | 健康 |
| 期刊 | `/journal/5/journal-of-applied-polymer-science` | 200 ✅ | 是(journals, 328) | ✅ 全 | ✅ 全 | SSR | 12969B / 204 字 / JSON-LD 2(Periodical) | 健康 |
| 工具 | `/tools/12` | 200 ✅ | 是(tools, ≥12) | ✅ 全 | ✅ 全 | SSR | 13320B / 737 字 / JSON-LD 2 | 健康(内容最厚) |
| 营销-about | `/about` | 200 ✅ | 是(static) | 部分(卡片有,title 通用) | 同 | SSR 卡 | 12296B / 345 字 / JSON-LD 1 | 无专属 `<title>`;缺公司主体信息 |
| 营销-features | `/features` `/features/search` `/features/prism`… | 200 ✅ | 是(static) | 部分,且**6 子页同款** | 同 | SSR 卡 | 12803B / 394 字 / JSON-LD 1 | 子页内容全塌缩成同一卡片;无专属 title;占位化(141 行) |
| 营销-pricing | `/pricing` | 200 ✅ | 是(static) | 部分(卡片有,title 通用) | 同 | SSR 卡 | 12248B / 297 字 / JSON-LD 1 | 占位化(125 行);无专属 title |
| 文档资源页 | `/help` `/resources` `/blog`(索引) | 200 ✅ | 是(static) | ✅(较厚) | ✅ | SSR 卡 | help 13615B/1107字 · resources 13423B/796字 · blog 17518B/4150字(16 链接) | 无专属 title;列表页无 BlogPosting/ItemList schema |
| 博客文章 | `/blog/semantic-scholar-vs-google-scholar` | 200 ✅ | 是(blogs, 16) | ⚠️ 仅 teaser | ⚠️ 仅 teaser | SSR(薄) | 12361B / **316 字(H1+摘要+返回链,无正文)** | 爬虫看不到正文,GEO 无可引段落;无专属 title |
| 资源指南 | `/resources/literature-review-guide` | 200 ✅ | 是(resources, 13) | ⚠️ 仅 teaser | ⚠️ 仅 teaser | SSR(薄) | 12305B / **255 字(无正文)** | 同上 |
| 帮助 | `/help`(见文档资源页) | 200 ✅ | 是(static) | ✅ | ✅ | SSR 卡 | 13615B / 1107 字 | 无专属 title |
| 法务页 | `/privacy` `/terms` `/disclaimer` | 200 ✅ | **是(static)** | ❌ **空壳** | ❌ **空壳** | CSR | 11394B / noscript 0 字 | 进 sitemap 却对爬虫零内容(合规/信任信号不可索引) |
| CSR 列表页 | `/search` `/journals/search` | 200 ✅ | **是(static, prio 0.8/0.7)** | ❌ **空壳** | ❌ **空壳** | CSR | 11394B / noscript 0 字 | 高优先级进 sitemap 却空壳,搜索入口不可索引、浪费抓取预算 |
| 应用/反馈入口 | `/contact` `/feedback` `/claw` `/prism` `/peer-review` | 200 ✅ | **是(static)** | ❌ **空壳** | ❌ **空壳** | CSR | 11394B / noscript 0 字 | 进 sitemap 却空壳,低质收录 |

## 高危问题清单(按严重度排序)

### 🔴 高危 1 — 进了 sitemap 却对爬虫空壳(共 11 个路径,核心漏洞)

根因:Nginx SSR 白名单(`user.conf:238`)= `^/(paper|author|journal|tools|resources|blog|help|about|features|pricing)(/|$)`,**不含** `search/journals/search/contact/privacy/terms/disclaimer/claw/prism/peer-review/feedback`,这些路径命中末尾通用 SPA `location /`,爬虫拿到与真人相同的 11394 字节壳(noscript=0、通用 title)。但它们全部被 `sitemap-static.xml`(23 条)收录提交给搜索引擎。

- **`/search`(prio 0.8)、`/journals/search`(prio 0.7)** — 最严重:全站搜索入口、最高优先级,搜索引擎按优先级先抓却撞空壳,既无法索引搜索入口,又浪费抓取配额、阻断流向下游论文/期刊页的内链权重。
- **`/privacy` `/terms` `/disclaimer`** — 法务页是合规与信任信号,通常需可索引,当前对爬虫完全不可见。
- **`/contact` `/feedback` `/claw` `/prism` `/peer-review`** — 反馈/裸应用入口本不该作 SEO 落地页,收进 sitemap 又零内容 = 低质收录,建议从 sitemap 移除或补 SSR 引导卡。

> 修法二选一:① 把需要被索引的(search/journals/search/privacy/terms/disclaimer)加进 nginx 白名单 + 后端 SSR handler 补对应 inject;② 把不需要索引的(contact/feedback/claw/prism/peer-review)从 `sitemap-static.xml` 移除。两者按页面意图分别处理。

### 🔴 高危 2 — robots.txt 声明的 sitemap 与索引实际子图不一致(已确认是当前代码行为,非仅部署问题)

源码核实:`seo/handler.go` 的 robots 处理器只输出 `Sitemap: /sitemap.xml` 与 `Sitemap: /sitemap-tools.xml` 两行(handler.go:52-53);而 `ServeSitemapIndex`(handler.go:260+)实际只 emit 了 static/blogs/resources/papers/authors/journals **六个子图,不含 tools**。结果:① robots 把不在索引里的 `sitemap-tools.xml` 单列出来;② 爬虫从 robots 发现的 sitemap 集合 ≠ 索引集合,工具页 sitemap 的发现路径割裂。**这不受"P0 未部署"影响——线上源码就是这样,需修代码让 robots 直接指向 sitemap 索引、并把 tools 子图纳入索引。**

### 🟠 中危 3 — `/features/*` 六个子页内容塌缩(重复内容)

`/features/search /prism /library /claw /submit /peer-review` 全部返回与 `/features` 完全相同的 12803 字节、394 字"Scholay 核心功能"卡片(h2 都一样)。6 个 sitemap URL 互为重复内容,无差异化排名价值,浪费抓取。需为每个子功能注入专属 SSR 文案(landing 数据已有 `landings.ts` 1484 行可驱动)。

### 🟠 中危 4 — 博客/资源正文页只给爬虫 teaser(GEO 不利)

`/blog/semantic-scholar-vs-google-scholar`(316 字)与 `/resources/literature-review-guide`(255 字)的 noscript 只有 H1+一句摘要+返回链,**没有文章正文**——但前端数据源里这些文章是 2500-3000 字完整长文(`blog-articles.ts` / `resource-articles.ts`)。GPTBot 摘不到可引用段落、Google 只见 teaser。需把正文写进 SSR noscript / 正文 DOM。

### 🟠 中危 5 — 营销/文档/博客/资源页全缺专属 `<title>`

除实体页/工具/首页外,`/about /features* /pricing /help /resources /blog` 及博客正文、资源指南的 `<head><title>` 全是首页通用标题"Scholay学术 - AI 驱动的…",尽管 noscript 内已有专属 h1/h2。削弱 SERP 主题相关性与 CTR。需在这些路径的 SSR inject 里写 unique title/description。

### 🟡 低危 6 — 全站缺 OG / JSON-LD schema / 公司主体信息

- 全站无 `og:image` / `og:title` / `twitter:card`,社交分享预览空白。
- Blog/Resources 列表页无 `BlogPosting` / `ItemList` JSON-LD;About 页无 `Organization` schema。
- 公司主体信息完全缺失(无公司名、注册号、成立年份、团队规模);About 仅愿景叙事,无信任信号(媒体/案例/合作机构)。
- 数据口径不一致:博客篇数前端数 16-19 条、后端 `content_articles.go` 数 16 条,需统一(影响 sitemap 与列表渲染)。

## 受"后端 P0 改动尚未部署"影响的结论(请部署后复测)

任务背景提示后端新代码可能未部署。以下结论以**当前线上现状**为准,部署后需重新核验:

- **robots.txt 的 sitemap 声明**(高危 2):本次已核对源码确认是代码逻辑本身的不一致(robots 声明 tools 子图却不在索引中),**不只是部署问题**;但若 P0 改动已重写 robots/索引生成,部署后请用 `curl /robots.txt` 与 `curl /sitemap.xml` 重新对齐两边集合。
- **citation / JSON-LD 字段完整度**:实体页若 P0 增补了 citation 等字段,当前抓到的 noscript 字数(论文 107 字偏薄)和 JSON-LD 内容可能变化,部署后复测 `/paper/*` 的 ld+json 块。
- **SSR 白名单是否扩容**:若 P0 在 nginx/后端把 `/search` 等纳入 SSR,高危 1 的部分路径会自动消解;部署后用爬虫 UA 重抓上述 11 个空壳路径确认 bytes 是否 >11394、noscript 是否 >0。

## 一句话行动建议

先修高危 1 的 `/search` `/journals/search` `/privacy/terms/disclaimer`(决定加 SSR 还是出 sitemap)和高危 2 的 robots/索引对齐 + tools 子图入索引——这两项直接决定"提交给搜索引擎的东西爬虫到底抓不抓得到";其余(features 去重、博客正文补全、专属 title、OG/schema)按 SEO/GEO 价值排期。实体页与 sitemap 主干健康,无需动。

相关源码定位:nginx 白名单 `nginx/conf.d/user.conf:238` · robots/sitemap 索引 `backend/internal/seo/handler.go:52-53, 260+` · SSR inject `backend/internal/config/handler_ssr.go` · 文章数据源 `frontend-user/src/features/help/data/{blog-articles,resource-articles}.ts` 与 `backend/internal/seo/content_articles.go`。

---

## 修复进度(2026-06-25 · 高危 1 & 2 已落地代码)

两个高危已修(代码已改 + 后端镜像编译通过;nginx 已本地 restart 生效,**后端需部署后全量生效**):

| 高危 | 处理 | 改动文件 |
|---|---|---|
| 🔴1 进 sitemap 却空壳 | **5 个需索引页改为可抓**:`/search` `/journals/search` `/privacy` `/terms` `/disclaimer` 纳入 nginx SSR 白名单 + 后端补 noscript 卡片(`getRouteNoscriptContent`)+ 专属 title/description/自指 canonical(新增 `injectStaticPageSEOMeta`)。**5 个非落地页移出 sitemap**:`/contact` `/feedback` `/claw` `/prism` `/peer-review`(SEO 语义由 `/features/*` 营销页承担) | `nginx/conf.d/user.conf` · `config/handler_ssr.go` · `seo/content_articles.go` |
| 🔴2 robots/索引不齐 | tools 子图纳入 sitemap 索引(`ServeSitemapIndex`)+ robots 去掉冗余的单列 `sitemap-tools.xml`,只指向索引 | `seo/handler.go` |

**已验证**:`docker compose build backend` 通过;`nginx -t` 通过并 restart;实抓确认 nginx 路由侧生效(`/search` 11393B/noscript=0 → **12537B/noscript=1**)。

**后端部署后复测清单**:① 爬虫 UA 抓 `/journals/search` `/privacy` `/terms` `/disclaimer` → bytes>11591、noscript=1、title 专属;② `curl /sitemap.xml` 含 `sitemap-tools.xml`;③ `curl /robots.txt` 只剩一行 `Sitemap: …/sitemap.xml`;④ `/sitemap-static.xml` 不再含 `/contact /feedback /claw /prism /peer-review`。可直接跑 `scripts/ai-crawler-stats.sh` 之外的 `curl -A Googlebot` 抽查。

**未做(非本轮 A 范围,留后续)**:其余静态页专属 title(高危5)、`/features/*` 去塌缩(中危3)、博客/资源正文进 SSR(中危4)、OG/schema/公司主体(高危6)——属内容侧,见 [05](05-content-enrichment-plan-Q2.md) / [06](06-product-story-plan-Q3.md)。
