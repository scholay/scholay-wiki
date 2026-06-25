我已经掌握了足够的现状与既有结论。现在产出完整的中文计划。

---

# Scholar《静态/介绍/文档页 内容丰富计划》(Q2 回答)

> 目标:在不破坏现有 SSR 主干(实体页/工具页健康)的前提下,**把"营销介绍页 + 文档 + 资源 + 博客"四块从"功能罗列 / teaser 空壳"升级成"可被搜索引擎索引、可被 AI 逐段引用"的内容资产**,同时守住 E-E-A-T 与反 scaled-content-abuse 红线(全程对齐 `03-content-playbook.md`)。
> 一条贯穿全文的铁律(来自体检 Q1):**"在 sitemap 里 ≠ 爬虫拿得到内容"——新增/加厚的每一页,正文必须随 SSR noscript 真正吐给爬虫,否则等于没写。**

---

## 0. 先校准:本计划与体检报告的分工

体检 Q1 暴露的问题分两类,本计划**只负责"内容侧"**,但会明确标注哪些条目依赖"工程侧"先修通:

| 类别 | 谁来修 | 本计划的角色 |
|---|---|---|
| `/search /journals/search /privacy/terms/disclaimer` 进 sitemap 却空壳(高危1)、robots/索引不齐(高危2) | **工程侧**(nginx 白名单 + robots/sitemap 索引) | 本计划在"落地映射"里给出**每个新页型必须挂进 SSR 白名单**的清单,不重复工程修复 |
| `/features/*` 六子页内容塌缩、博客/资源只给 teaser、缺专属 title/OG/schema(高危3-6) | **内容侧 + SSR inject** | **本计划主战场**:既写内容,又指明对应 SSR inject 函数 |
| 缺 glossary / 对比页 / FAQ 中心 / API 文档 / 公司主体 | **内容侧(全新)** | **本计划主战场** |

---

## 1. 信息架构重构(四块定位 + 目标站点地图)

### 1.1 四块各自定位(消除当前的边界重叠)

体检指出 `Help Center vs Resources`、`About vs Contact`、`/features/* vs /search 产品页` 三处定位含糊。重新切刀如下:

| 区域 | 一句话定位 | 内容性质 | 主读者 | 转化意图 | 不该放什么 |
|---|---|---|---|---|---|
| **营销介绍 `/features/* `/pricing` `/about`** | "我们是谁、能做什么、值多少钱" | **说服性**、品牌叙事 + 功能深度介绍 | 还没用过的潜在用户 | 高(注册/付费) | 不放教程、不放学术科普 |
| **文档/帮助 `/help` `/docs`** | "我已经在用了,怎么操作/出问题怎么办" | **操作性**、产品使用说明 + FAQ + API | 已注册用户、开发者 | 低(留存) | 不放营销话术 |
| **学习资源 `/resources`** | "怎么做学术这件事"(产品无关的方法论) | **教育性**、How-to 长指南 + 术语表 | 全体科研人(含非用户) | 间接(自然引出产品) | 不放"Scholay 怎么点按钮" |
| **博客 `/blog`** | "行业观点、对比评测、数据报告" | **观点/时效性**、对比 + 趋势 + 报告 | 搜"X vs Y""最好的工具"的人 | 中(拦截推荐查询) | 不放纯定义词条(归 glossary) |

**关键切分原则**:
- **Help vs Resources 的刀**:Help = "Scholay 这个产品怎么用"(绑产品);Resources = "学术检索/写作这件事怎么做"(产品无关的通用方法论,只在结尾自然引出 Scholay)。两者用读者意图区分,不再都叫"指南"。
- **`/features/* ` vs `/search` 产品页的刀**:`/features/search` = 给爬虫和未注册用户看的**介绍落地页(SSR、可索引)**;`/search` = 登录后真正干活的**应用列表页(CSR、不强求索引)**。体检里 `/search` 空壳是"工程侧决定要不要进 sitemap"的问题,不是内容问题。
- **新增 glossary(术语表)归属**:独立挂在 `/glossary`,**不塞进 Resources**——因为它是"定义型查询"专用、批量化、结构高度统一的资产,和长 How-to 指南混在一起会稀释。

### 1.2 目标站点地图(树状)

```
/                                    首页(补首屏 SSR 正文卡 —— 见 P2)
│
├─ /about                            关于我们(加厚:公司主体+里程碑+信任信号+Organization schema)
│   ├─ /about/team                   [新] 团队/创始人(E-E-A-T 作者背书源)
│   └─ /about/trust                  [新] 信任中心(数据规模/合作/媒体/合规)
│
├─ /features                         功能总览(去占位:矩阵+对比表+场景路由)
│   ├─ /features/search              [加厚] 智能检索深度介绍(去塌缩,专属文案)
│   ├─ /features/prism               [加厚] AI 写作深度介绍
│   ├─ /features/claw                [加厚] 智能助手深度介绍
│   ├─ /features/library             [加厚] 文献集深度介绍
│   ├─ /features/peer-review         [加厚] AI 审稿深度介绍
│   └─ /features/submit              [加厚] 投稿/选刊深度介绍
│
├─ /pricing                          定价(去占位:套餐对比表+额度说明+FAQ)
│   └─ /pricing/faq                  [新或锚点] 计费/额度 FAQ
│
├─ /compare                          [新] 对比中心(pillar:对比矩阵总表)
│   ├─ /compare/scholay-vs-google-scholar
│   ├─ /compare/scholay-vs-semantic-scholar
│   ├─ /compare/scholay-vs-cnki
│   └─ /compare/best-academic-search-tools-2026
│
├─ /glossary                         [新] 学术术语表(pillar:索引页 + ItemList)
│   ├─ /glossary/impact-factor
│   ├─ /glossary/h-index
│   ├─ /glossary/preprint
│   └─ …(P0 先 18 条,见 03-playbook 1.1)
│
├─ /resources                        学习资源(加厚:补 ItemList schema + 分类导航)
│   ├─ /resources/literature-review-guide   [补全正文 SSR]
│   ├─ /resources/how-to-search-literature  [新 How-to]
│   └─ …(13 篇补正文 + 新增 How-to)
│
├─ /blog                             博客(加厚:补 BlogPosting/ItemList + 分类)
│   ├─ /blog/semantic-scholar-vs-google-scholar  [补全正文 SSR]
│   └─ …(16 篇补正文 + 数据报告类新增)
│
├─ /help                             帮助中心(保留:已较厚,补专属 title + FAQPage)
│   ├─ /help/faq                     [新] FAQ 中心(全站问答聚合,FAQPage schema)
│   └─ /docs                         [新] 使用文档/API 文档(给开发者)
│       ├─ /docs/getting-started
│       ├─ /docs/search-syntax       检索式/布尔语法说明
│       └─ /docs/api                 公开 API 文档(若开放)
│
└─ /privacy /terms /disclaimer       法务页(工程侧:必须进 SSR 白名单可索引)
```

---

## 2. 要丰富/新增的页面清单(P0 / P1 / P2)

> 每条给:URL · 页型 · 目标 · 要点结构 · 为什么利于 SEO+GEO。**所有"为什么利于 GEO"均对齐 03-playbook 的一手结论**:答案前置 / 统计数字 / 对比表 / FAQ / 具名作者 / 孤岛测试(每段单独可读)。

### P0 — 先修"已暴露的烂页" + 拦截高意图查询(2-3 周)

| URL | 页型 | 目标 | 要点结构 | 为什么利于 SEO+GEO |
|---|---|---|---|---|
| `/about` | 营销-主体 | 补全公司主体/信任信号(体检高危:公司信息为 0) | TL;DR 一句话定位 → 公司主体(全称/成立年/团队规模)→ 里程碑时间线 → 数据规模(N 篇论文/N 期刊,**真实数字**)→ 价值观 → CTA | Organization schema + 具体数字 = E-E-A-T 的 Trust 信号;AI 回答"Scholay 是什么公司"时有可引主体 |
| `/features` | 营销-总览 | 去占位(当前 141 行塌缩) | TL;DR → 功能矩阵表(6 功能 × 能力)→ 按场景路由("我要查文献/写论文/审稿"→对应子页)→ FAQ | 矩阵表是 AI 最爱抽的结构;消除与子页的重复 |
| `/features/{search,prism,claw,library,peer-review,submit}` | 营销-功能深度 | **修高危3**:六子页去塌缩,各写专属 SSR 文案 | 每页:TL;DR(这个功能一句话)→ 能解决什么问题 → 工作流(编号步骤)→ 真实数据/截图 → 与同类工具差异 → 该功能 FAQ 3-4 条 | 数据已有(`landings.ts` 1484 行 6 功能全文案),只需驱动 SSR inject;六页差异化=消除重复内容 |
| `/pricing` | 营销-定价 | 去占位(当前 125 行) | TL;DR → 套餐对比表(Free/Pro/Max × token 额度/功能)→ 额度怎么算 → 计费 FAQ | 定价对比表 + FAQ 直接命中"Scholay 多少钱""免费版能用什么" |
| `/compare/scholay-vs-google-scholar` | 博客-对比 | 拦截最高意图查询 | 套 03-playbook **模板 B**:TL;DR → 一句话结论 → 核心对比表 → 各自适合谁 → 诚实写 Scholay 短板 → FAQ | "vs" 类是 AI 推工具被引最大类目之一;诚实标短板提升中立性被采信 |
| `/compare/scholay-vs-semantic-scholar` `…vs-cnki` `/compare/best-academic-search-tools-2026` | 博客-对比 | 拦截"替代品""最好用"查询 | 同上模板 B(横评类用多列对比表) | 同上 |
| `/glossary` + 前 18 条词条 | 资源-术语表 | **新增最高优先级资产**(站内 glossary 当前为 0) | 索引页:ItemList + 按主题分组;词条页套 03-playbook **模板 A**:TL;DR 定义 → 怎么算 → 局限 → 对比表 → FAQ | 定义型查询被引最稳;每条自洽 chunk;可用站内真实期刊数据回填示例(不算 thin) |

**P0 真实中文标题示例(每类 ≥8):**

营销介绍页(深度):
1. Scholay 智能检索:一次搜索,横跨中外文文献的 AI 学术搜索引擎
2. Scholay Prism:把 LaTeX 论文写作变成"和 AI 对话"
3. Scholay 智能助手:一个能查文献、读论文、做调研的科研 AI
4. Scholay 文献集:像网盘一样管理你的论文与综述素材
5. Scholay AI 审稿:投稿前先让 AI 帮你预审一遍
6. Scholay 选刊投稿:从影响因子到中稿率,帮你选对期刊
7. Scholay 是什么?一个面向中文科研人的 AI 学术平台(/about)
8. Scholay 怎么收费?Free / Pro / Max 三档套餐与 token 额度说明(/pricing)

对比页:
1. Scholay vs 谷歌学术:检索深度、中文支持、AI 能力全对比
2. Scholay vs Semantic Scholar:免费版能力与中文文献覆盖对比
3. Scholay vs 知网(CNKI):中外文文献检索场景怎么选
4. 2026 年最好用的 8 个论文检索工具横评(免费/付费/中文友好)
5. 谷歌学术打不开?5 个国内可直接访问的替代方案
6. Consensus / Elicit / Scholay:AI 文献调研工具怎么选
7. 免费的学术搜索引擎有哪些?7 款实测对比
8. PubMed vs 谷歌学术 vs Scholay:医学文献检索怎么选

术语表(glossary):
1. 什么是影响因子(Impact Factor)?计算方式与常见误读
2. h-index 是什么?如何计算、有哪些局限
3. 什么是预印本(Preprint)?与正式发表论文的区别
4. SCI 一区二区三区四区怎么分?中科院分区 vs JCR 分区
5. 什么是 DOI?它和 URL、PMID、arXiv ID 有什么区别
6. 影响因子、CiteScore、SJR、SNIP 有什么区别?
7. 什么是开放获取(Open Access)?金色/绿色/钻石 OA 区别
8. 什么是 ESI 高被引论文?如何判断一篇论文是否高被引

### P1 — 加厚现有薄内容 + FAQ 中心 + How-to(1-2 个月)

| URL | 页型 | 目标 | 要点结构 | 为什么利于 SEO+GEO |
|---|---|---|---|---|
| `/blog/{16篇}` `/resources/{13篇}` | 博客/资源正文 | **修高危4**:把已有 2500-3000 字全文写进 SSR noscript(当前只给 teaser 255-316 字) | 每篇:问题式 H2 → 40-60 词答案胶囊前置 → 正文 → FAQ → 具名作者 bio → dateModified | 数据已在 `blog-articles.ts`,只是没注进 SSR;补全后 GPTBot 才摘得到可引段落 |
| `/help/faq`(FAQ 中心) | 文档-FAQ | 新增全站问答聚合 | 按主题分组的问答列表,每条 FAQPage schema,答案胶囊式 | FAQPage 被 AI 抽取概率高;一问一答天生自洽答案前置 |
| `/resources/how-to-*`(15 篇 How-to) | 资源-指南 | 补操作型查询 | TL;DR → 编号步骤(可抽取)→ 每步"用 Scholay 做这步"引导 → FAQ | 编号步骤 + HowTo schema = AI Overviews 偏好格式 |
| `/docs` + `/docs/search-syntax` `/docs/getting-started` | 文档-使用说明 | 新增产品文档区(当前完全没有) | 入门 → 检索语法(布尔/字段)→ 各功能操作 → 常见报错 | 文档型内容是已注册用户留存 + 长尾操作查询入口 |
| `/about/team` `/about/trust` | 营销-信任 | 补 E-E-A-T 作者背书与信任信号 | 团队/资质 → 数据规模 → 合作机构/媒体(如有)→ 合规说明 | 具名作者来源(供 glossary/博客署名);Trust 信号 |
| `/features/*` 全部补 FAQPage + Article schema | schema 补全 | 修高危5/6 局部 | — | 专属 title + OG + schema 提升 CTR 与社交预览 |

**P1 真实中文标题示例(每类 ≥8):**

How-to 指南:
1. 如何快速检索一个陌生领域的文献?5 步从 0 到一份阅读清单
2. 如何读一篇综述(Review)?高效提取脉络的 6 个步骤
3. 如何选投期刊?从影响因子、分区、审稿周期到中稿率
4. 如何用关键词 + 布尔逻辑构造高质量检索式
5. 如何判断一篇论文是否值得精读?3 分钟快速评估法
6. 如何避免投到掠夺性期刊(Predatory Journal)
7. 如何用 AI 辅助读文献而不被"幻觉"坑
8. 如何回应审稿意见(Response to Reviewers)写作模板

FAQ 中心问题:
1. 影响因子越高的期刊就一定越好吗?
2. 预印本算正式发表吗?能写进简历吗?
3. 谷歌学术为什么打不开?有什么替代?
4. 中科院分区和 JCR 分区哪个权威?
5. AI 写的论文能直接投稿吗?有什么风险?
6. 没有数据库权限怎么查到全文?
7. 怎么免费查一篇论文的影响因子和分区?
8. Scholay 的 token 额度用完了怎么办?(产品类)

文档/API:
1. Scholay 快速上手:5 分钟完成第一次智能检索
2. Scholay 检索语法:布尔运算符、字段限定与精确匹配
3. 如何在 Scholay 里管理文献集与导出引用
4. Scholay 智能写作(Prism)操作指南
5. Scholay AI 审稿提交与报告解读
6. Scholay 公开 API 说明(若开放)
7. Scholay 常见报错与解决办法
8. Scholay 账号、额度与计费说明

### P2 — 规模化聚合页 + 数据报告 + 首页正文 + i18n(季度)

| URL | 页型 | 目标 | 为什么利于 SEO+GEO |
|---|---|---|---|
| `/glossary/*` 扩到全量 + 聚合页(各学科 Top 期刊/高被引学者) | programmatic 聚合 | 用站内 minicod 真实数据批量铺页 | 每页有独特可核验数据=合规 pSEO;Scholar 独有数据护城河 |
| `/blog/data-*`(数据报告) | 博客-数据报告 | 出原创榜单(《2026 各学科影响因子涨跌榜》) | 原创数据是被引硬通货,引发他站二次引用 |
| `/`(首页) | 首页正文卡 | 补首屏 SSR 正文(当前 noscript=0) | 让首页本身有可摘正文 |
| `/en/*` + hreflang | i18n | 英文核心 5-7 篇,开海外 GEO | 当前全中文,对英文 AI 爬虫不可见 |

数据报告/聚合页标题示例(≥8):
1. 《2026 各学科影响因子涨跌榜》
2. 《审稿周期最短的 50 本 SCI 期刊》
3. 《最容易被忽视但高质量的"黑马期刊" Top 30》
4. 《计算机科学领域影响因子最高的 20 本期刊(2026)》
5. 《医学文献检索完整指南:PubMed / 核心期刊 / MeSH》
6. 《[学科]近 5 年研究热点与高被引论文》
7. 《中文学者最常检索的 100 个研究关键词(2026)》
8. 《SCI 一区期刊全景:各学科一区刊清单》

---

## 3. 页面可引用性模板(直接套)

> 直接复用 03-playbook 的模板 A(定义型)与模板 B(对比型)。下面补两个**本计划专属的"介绍/说明类"模板**——因为营销介绍页和功能说明页在 03-playbook 里没有专门模板,而它们正是本次要加厚的重点。

### 模板 C:功能深度介绍页(给 `/features/*` 用)

```markdown
# Scholay 智能检索:跨中外文的 AI 学术搜索引擎

> **一句话答案(放最前,30-50字):** Scholay 智能检索是一款 AI 学术搜索引擎,
> 一次输入即可横跨中外文文献库,并用 AI 自动归纳检索结果、回答研究问题,
> 国内可直接访问、对中文文献友好。

## 这个功能解决什么问题?(场景前置,确定性表述)
传统学术搜索需要你自己拼检索式、逐条筛论文。Scholay 智能检索把这一步交给 AI:
你用自然语言提问,它负责检索、去重、按相关性排序并给出可引用的论文清单。

## 它怎么工作?(编号步骤——AI 可直接抽取)
1. 输入研究问题(中文/英文均可)
2. AI 解析意图并跨多源检索文献
3. 自动按相关性、被引数、时效排序
4. 给出带摘要的论文卡片,可一键加入文献集

## 关键能力与数据(带数字,可引用)
- 覆盖文献量:N 篇(站内真实数据回填)
- 支持检索源:X 个
- 中文文献:友好 ｜ 国内访问:直接可用 ｜ AI 问答:内置

## 和同类工具有什么不同?(对比表——诚实)
| 维度 | 传统学术搜索 | Scholay 智能检索 |
|------|------------|-----------------|
| 检索式 | 需手动拼 | 自然语言 |
| 结果归纳 | 无 | AI 自动归纳 |
| 中文/国内访问 | 视工具而定 | 友好/直接可用 |

## 常见问题(FAQPage schema)
**Q: Scholay 智能检索免费吗?** A: [确定性一句话作答]
**Q: 它能查到谷歌学术上的论文吗?** A: [作答]

---
*由 Scholay 团队维护 ｜ 最后更新:2026-XX-XX*
```

### 模板 D:介绍/品牌主体页(给 `/about` 用)

```markdown
# 关于 Scholay:面向中文科研人的 AI 学术平台

> **一句话答案:** Scholay 是 [公司全称] 打造的 AI 学术平台,提供文献检索、
> AI 写作、智能审稿与文献管理,服务中文科研人,成立于 20XX 年。

## 我们是谁(公司主体——信任信号,体检高危项)
- 运营主体:[公司全称]
- 成立时间 / 团队规模 / 所在地
- 平台数据规模:收录 N 篇论文、N 本期刊、N 位学者档案(真实数字)

## 发展里程碑(时间线)
- 20XX:[事件] ｜ 20XX:[事件]

## 我们相信什么(价值观,3 条)
学术第一 / AI 是助手 / 开放合作

## 信任与合规
数据来源 / 隐私合规 / 免责声明链接

---
*Organization JSON-LD + sameAs(GitHub / 未来 Wikidata)随 SSR 注入*
```

> 两个模板都过 03-playbook 的**"孤岛测试"**(每段单独读得懂,不用"它/这个"开头指代上文),并把 GEO 杠杆(答案前置 + 数字 + 对比表 + FAQ + 具名维护方 + last updated)全用上。

---

## 4. 落地映射(接入现有代码 + SSR 注入)

### 4.1 内容数据怎么进系统(沿用现有双写机制)

体检与代码已确认:博客/资源是**前端静态数据 + 后端 sitemap 镜像**双写(`content_articles.go` 注释明确"任何一侧新增/删除必须同步")。新内容沿用此模式:

| 新内容类型 | 前端数据文件 | 后端注册 | 自动进 sitemap? |
|---|---|---|---|
| 加厚博客/资源正文 | `frontend-user/src/features/help/data/{blog,resource}-articles.ts`(已有,只需把正文字段写满) | `seo/content_articles.go` 的 `BlogArticles`/`ResourceArticles`(已有) | ✅ 已有 sitemap 子图 |
| 对比页 `/compare/*` | 新建 `compare-articles.ts`(仿 blog 结构) | `content_articles.go` 加 `CompareArticles` 切片 + 新 sitemap 子图 **或**复用 blog slug | 需在 `ServeSitemapIndex` 注册新子图 |
| 术语表 `/glossary/*` | 新建 `glossary.ts`(条目结构统一) | `content_articles.go` 加 `GlossaryEntries` + sitemap 子图 | 同上 |
| How-to / FAQ / docs | 复用 resource-articles 结构或新增 | 对应注册 | 同上 |
| `/about` `/pricing` `/features/*` 加厚 | 各自 page 组件 + landing 数据(`landings.ts` 已有 6 功能全文案) | 已在 `StaticPages` | ✅ 已在 sitemap |

**关键提醒(体检数据口径不一致 bug)**:前端 `blog-articles.ts` 数到 16-19 条、后端 `content_articles.go` 数 16 条——加厚博客前**先统一两侧条数**,否则 sitemap 与列表渲染对不上(体检低危6)。

### 4.2 必须补的 SSR 注入(对齐体检"空壳/薄内容"结论)

体检确认 SSR inject 由 `backend/internal/config/handler_ssr.go` 控制,且 nginx 白名单(`user.conf:238`)= `^/(paper|author|journal|tools|resources|blog|help|about|features|pricing)(/|$)`。**新页型不在白名单 = 必然空壳。** 落地清单:

| 页面 | 现状 | 要做的 SSR 工作 |
|---|---|---|
| `/blog/{slug}` `/resources/{slug}` | 在白名单,但 inject 只给 teaser(高危4) | 改 inject 函数,把正文写进 noscript(数据已在前端,后端 sitemap 镜像里没正文,需新增正文供给:或后端读、或前端 SSR 改造) |
| `/features/{sub}` | 在白名单,但六页同款(高危3) | 新增 `injectFeatureSEOMeta`,按子路由取 `landings.ts` 对应数据注入专属 title + noscript |
| `/about` `/pricing` `/features` | 在白名单,缺专属 title(高危5) | 各自加专属 title/description/noscript inject |
| `/compare/*` `/glossary/*` `/docs/*` `/help/faq` | **不在白名单** | **① nginx 白名单加 `compare|glossary|docs`;② 新增对应 inject 函数;③ 加进 sitemap 索引** —— 三处缺一即空壳 |
| `/privacy /terms /disclaimer` | 不在白名单,空壳(高危1) | 工程侧:加白名单 + 法务正文 SSR(内容已在 `legal-content.ts`) |
| 全站 schema | 缺 OG / FAQPage / Organization / BlogPosting(高危6) | inject 里补:博客=`BlogPosting`、对比/glossary=`Article`+`FAQPage`、列表页=`ItemList`、about=`Organization`、全站=`og:*`/`twitter:card` |

> **一句话**:**新增任何可索引内容页,必做"白名单 + inject + sitemap"三件套**——这正是体检高危1的根因(进了 sitemap 漏了白名单)。

---

## 5. 量与质的红线(对齐 03-playbook §4)

规模化(尤其 P2 的 glossary/聚合页批量上线)必须守住,否则触发 Google **scaled content abuse** 与平台惩罚:

1. **判定看"为何创建"而非"如何创建"**:AI 生成内容本身不违规,**以操纵排名为目的批量生产低价值模板页才违规**(03-playbook §4 原文)。每一页都要能回答"一个真实用户为什么需要这一页"。
2. **量化门槛**:每页 **≥500 独特词、30-40% 差异度**,<300 词有 thin content 风险。这正是体检高危4(博客 teaser 仅 316 字)要修的——**补全正文不是为凑数,是过 thin content 门槛**。
3. **骨架模板化,血肉唯一化**:用第 3 节模板做骨架,每页注入站内 minicod 真实数据 + **≥3 个不与他页逐字相同的独特块**(对比表/决策标准/"不适合谁"的边界)。这直接解决体检高危3(`/features/*` 六页逐字相同 = 重复内容)。
4. **Canary 上线**:glossary/聚合页**先发 20 页 → 观察 60-90 天收录/被引 → 再扩 200**,避免短时海量上线触发 spam 信号。
5. **E-E-A-T / Trust 是学术 YMYL 重点**:每篇 glossary/博客**具名作者 + 可验证资质 bio + 数据来源透明 + 披露 AI 辅助**(这也是新建 `/about/team` 的用途——提供可信作者背书源)。涉医学的词条尤其标来源。
6. **关键词堆砌无效甚至负向**(03-playbook 一手结论)——加厚靠**证据(统计/引述/出处),不靠堆词**。

---

## 一页速记(给执行团队)

1. **先修烂页再铺新页**:P0 优先把 `/features/*` 塌缩、博客/资源 teaser、`/about` 空主体修掉(都是体检已暴露的高危),再上对比页/术语表。
2. **每个新内容页 = 内容 + SSR 三件套(白名单 + inject + sitemap)**,缺一即空壳——这是体检高危1的根因,别重蹈。
3. **四块各守边界**:介绍页说服、文档讲操作、资源教方法、博客出观点;glossary 独立成 `/glossary`。
4. **每页套模板 A/B/C/D**:答案前置 + 数字 + 对比表 + FAQ + 具名作者 + last updated,过孤岛测试。
5. **守红线**:≥500 独特词 + ≥3 独特块 + canary 上线 + 披露 AI 辅助;判定看"用户为什么需要这页"。
6. **数据复用现有资产**:`landings.ts`(6 功能全文案已有)驱动 `/features/*`;`blog/resource-articles.ts`(正文已有)只需注进 SSR;统一前后端博客条数口径。

相关代码定位(落地时直接改):
- SSR inject:`backend/internal/config/handler_ssr.go`(加 `injectFeatureSEOMeta`/`injectArticleSEOMeta`/`injectCompareSEOMeta`/`injectGlossarySEOMeta`)
- nginx 白名单:`nginx/conf.d/user.conf:238`(加 `compare|glossary|docs`)
- sitemap 注册:`backend/internal/seo/content_articles.go`(加 `CompareArticles`/`GlossaryEntries` 切片)+ `seo/handler.go` `ServeSitemapIndex`(注册新子图)
- 前端内容数据:`frontend-user/src/features/help/data/{blog,resource}-articles.ts`、`frontend-user/src/features/landing/data/landings.ts`、新建 `compare-articles.ts`/`glossary.ts`
- 法务正文:`frontend-user/src/features/help/legal-content.ts`(已有,工程侧接进 SSR)
