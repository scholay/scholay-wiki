这是一份纯写作任务,基于已提供的调研 dossier 和核实结果撰写中文 GEO 报告。所有材料已齐备,无需调用工具或读取代码。我直接产出报告。

# Scholar 平台 GEO(生成式引擎优化)调研报告

> 受众:Scholar 学术搜索平台团队 · 立场:务实可执行 · 证据分级标注(已核实事实 / 业界说法 / 已被证伪)

---

## 1. 什么是 GEO,为什么现在要做

**定义。** GEO(Generative Engine Optimization,生成式引擎优化)指系统性地提升内容在 ChatGPT、Perplexity、Google AI Overviews 等"生成式引擎"答案中被**引用、提及、推荐**的可见度。这个术语并非营销造词,而是有明确学术起源:Aggarwal、Murahari 等人的论文《GEO: Generative Engine Optimization》正式发表于 **KDD 2024(ACM SIGKDD)**,作者来自 Princeton、Georgia Tech、Allen Institute for AI、IIT Delhi。论文把"生成式引擎"定义为"从数据库(如互联网)检索相关文档,再用大模型生成基于来源的回答",并称 GEO 是"首个帮助内容创作者提升其内容在生成式引擎回答中可见度的新范式"。这一点经多个独立来源交叉核实,属**已核实事实** [GEO 论文](https://arxiv.org/abs/2311.09735) · [KDD 2024 收录](https://dl.acm.org/doi/abs/10.1145/3637528.3671900)。

**与 SEO 的关系与区别。** GEO 不是 SEO 的替代品,而是其上层延伸——两者共享"被索引、可抓取、内容相关"的地基,但优化目标根本不同:

| 维度 | 传统 SEO | GEO |
|---|---|---|
| 成功标志 | 排名(蓝链位次)→ **点击** | **被引用 / 被合成进答案** |
| 优化对象 | 关键词、整页内容 | 实体 / 语义 / 可被模型直接搬走的精炼片段 |
| 用户行为 | 点进网站 | 往往**零点击**(在答案里就拿到结论) |

**0-click / 被引用范式。** 零点击已是常态:SparkToro 2024 数据称 58.5% 的美国 Google 搜索无点击结束(业界引用数据)[iFactory](https://www.ifactory.com/insights/geo-vs-seo-a-higher-ed-marketers-guide-to-whats-actually-different-and-what-isnt/)。Pew Research 基于 900 名美国成年人真实浏览数据的权威调研更直接:有 AI 摘要时传统结果点击率从 15% 降到 8%,点摘要内链接仅 1% [Pew](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)。**结论:对学术工具站,"被 AI 当成答案的一部分讲出来"正在取代"被点进来"成为主要曝光路径——这是现在必须做 GEO 的根本原因。**

**学术研究证据(GEO 论文的硬结论)。** 论文在 GEO-bench(约 1 万条跨 8 领域查询)上系统测试了 9 种内容改写法,用两个指标衡量:Position-Adjusted Word Count(按引用位置加权的来源词数)和 Subjective Impression(综合主观可见度)。**最优方法相比基线在两指标上分别提升 41% 和 28%,整体可见度最高提升约 40%**。这组数字经一手全文核实,属**已核实事实**。最强三法是 Quotation Addition(加权威引文)、Statistics Addition(加统计数据)、Cite Sources(标注可信来源),各约 +30–40%;而传统 SEO 的 **Keyword Stuffing(关键词堆砌)几乎无效甚至低于基线**(论文中堆砌得分 17.8 < 基线 19.5) [GEO 论文全文](https://arxiv.org/html/2311.09735v3)。

> ⚠️ **降级提醒:** 业界广为流传的"加统计 +31%、加来源 +30%"这类**精确单值**是对论文区间的二手简化(不同来源写成 +32% / +37% 不一),应理解为"30–40% 量级",而非精确常数。这属于核实结果中的 **mixed** 项。

一个被低估的发现具有战略意义——**"民主化"效应**:Cite Sources 让 SERP 第 5 名站点可见度暴涨 **115.1%**,而头部站点平均**下降 30.3%**(论文 Table 2,已核实)。因为生成式引擎更看"证据质量"而非外链/域名权威,这让排名靠后的小站、新站第一次有了与头部同台被引的机会。**对 Scholar 这种品牌权重尚未压倒 Google Scholar 的平台,这是关键窗口期。**

---

## 2. 生成式引擎如何选源与引用(通用 RAG 机制)

几乎所有生成式引擎都走同一条 RAG(检索增强生成)流水线,理解它是做对 GEO 的前提:

```
查询意图解析 → 多路检索 → 多层重排 → 结构化拼装 → 受约束的合成 → 引用标注
  (query fan-out)  (BM25+向量)  (L1-L3 门槛)   (证据塞进prompt)              (cite-while-write)
```

1. **查询意图解析 / fan-out。** 把一个问题拆成多个子查询,跨子主题、多数据源并行检索(Google 官方称之为 "query fan-out",**已核实事实**)。
2. **多路检索。** BM25 关键词召回 + 稠密向量(embedding)语义召回,约取 10–60+ 候选页 [ZipTie](https://ziptie.dev/blog/how-perplexity-ai-answers-work/)。
3. **多层重排(L1–L3)。** 用 cross-encoder、实体/权威/新鲜度信号逐层筛,约 0.7 质量阈值,大量候选被淘汰。
4. **结构化拼装。** 把通过门槛的来源连同 citation 标记、元数据塞进 prompt。
5. **受约束的合成。** 模型只在"预装配的证据框架内"生成。Perplexity 用 **cite-while-writing(边写边引)**:支撑不了的句子就不写;若合格来源不足,整批作废、重新检索,**宁可不答也不弱引** [ZipTie]。

**"被检索"≠"被引用"——这是 GEO 最重要的认知分野。**
- **被检索** = 通过 embedding 相关性、freshness、结构化进入候选池;
- **被引用** = 通过**全部重排门槛**并出现在最终答案里。

实测落差巨大:研究显示 ChatGPT 只引用它实际检索页面的约 **15%**,其余 85% 被丢弃 [AirOps via SEL](https://searchengineland.com/chatgpt-retrieved-vs-citations-study-471606)。这意味着 Scholar 的内容要分两步达标:**先确保可被检索**(语义匹配、freshness、SSR 可抓、结构化),**再确保可被引用**(能直接支撑模型想说的具体论断、含统计/引文、结论前置)。

各引擎选源偏好差异极大,不能一刀切:ChatGPT 偏 Wikipedia,Perplexity 偏 Reddit,Google AI Overviews 偏 YouTube,Claude 偏博客(业界审计数据,各家口径不一,需谨慎)[Discovered Labs](https://discoveredlabs.com/blog/chatgpt-claude-perplexity-and-google-ai-overviews-how-each-platform-cites-sources-differently)。

---

## 3. 海外引擎逐个拆解

### Google AI Overviews / AI Mode
**选源机制(官方,最权威的反营销证据)。** 核心是 query fan-out;被引硬门槛**极低且与传统 SEO 一致**——页面只需"被索引 + 有资格在 Google Search 出 snippet + 满足技术要求",官方明确"**没有额外技术要求,不需要特殊优化/标记/文件**"(包括点名否定 llms.txt)[Google 官方](https://developers.google.com/search/docs/appearance/ai-features)。机制上是 **chunk 级抽取**:不引整页,只抽能回答某子查询的段落。与自然排名的重叠真实存在但行业分化巨大:SEOClarity(36.2 万查询)显示每个 AIO 平均仅引约 3 个 Top20 URL、**44% 引用来自 Top20 之外**;行业差异从医疗 75%、教育 73% 到电商 23%、餐饮 19% [SEOClarity](https://www.seoclarity.net/research/aio-rankings-overlap)。

> ⚠️ 注:dossier 中"重叠在减弱"的叙述与所引 BrightEdge/SEOClarity 数据(同窗口内重叠从 32.3% **升**到 54.5%)矛盾,属 **mixed**——重叠**减弱**的说法来自另一份更晚的 Top10 口径数据,不应与上述 Top20 数据混为一谈。

**想被引用怎么做:** 做扎实的主题集群覆盖各子查询(教育/学术正属高重叠行业,利好);答案前置;强 E-E-A-T 与新鲜度。

### ChatGPT Search / SearchGPT
**选源机制。** 来源经 **Bing 索引**发现(研究称 87%+ 引用匹配 Bing 结果,Bing 是"守门人")[Seer](https://www.seerinteractive.com/insights/87-percent-of-searchgpt-citations-match-bings-top-results)。专用爬虫 **OAI-SearchBot** 负责检索引用,与训练用的 GPTBot **独立**,可在 robots.txt 分别控制——**封 OAI-SearchBot 会把网站整体移出 ChatGPT Search 答案**(OpenAI 官方,已核实)[OpenAI 官方](https://developers.openai.com/api/docs/bots)。倾向引"前 150–300 字就给出答案"的页面。
**想被引用:** 保证 Bing 索引、放行 OAI-SearchBot、答案前置、结构清晰。

### Perplexity
**选源机制。** 自建索引(约 50 亿 URL)+ Bing 补长尾,实时检索无静态缓存;三层重排(BM25+embedding → cross-encoder → 带实体/权威信号的 ML reranker);平均每答约 7 条引用。**新鲜度最敏感**(约 80% 引用来自近 2–3 年内容);重 schema(Article/FAQ/HowTo);偏好 2500 字权威 pillar 页而非多篇薄页 [ZipTie] · [Bttr](https://www.makebttr.com/insights/how-perplexity-chooses-sources)。
**想被引用:** 可抽取性(事实写得能干净 lift)+ 新鲜度 + 结构化数据 + 主题一致性。

### Bing Copilot
仅用 Bing 实时索引,用户问题转成 grounding queries,走 retrieve→generate→cite,重权威/主题相关/清晰结构。**Bing 索引与排名好是被引前提**(微软/行业)。

### Gemini
用 Google Search(+Maps)做 grounding,先判断是否需检索→实时检索→snippet 并入生成→产出 grounding metadata 标源。**特殊点:Gemini(与 Applebot)是少数会渲染 JavaScript 的 AI 爬虫**——但其余主流爬虫不渲染(见第 5 节),不能因此放松 SSR。

**海外共性:** ① chunk 级抽取 + 答案前置普遍奏效;② 新鲜度是普遍强信号;③ 权威/实体/品牌提及信号 > 单纯反链/关键词;④ 多数引用仍相关于传统前排(尤其 Bing 生态),但相关性在减弱、行业分化。

---

## 4. 国内引擎逐个拆解

国内 AI 搜索的选源逻辑核心是**"生态绑定 + 高权重内容平台"**——每个大厂的 AI 优先调用自家生态内容,这一点有新榜约 1600 万条引用数据(1683.6 万信源 / 142.9 万次问答)支撑,是最权威的国内量化来源 [新榜](https://a.newrank.cn/trade/news/8386)。

- **百度文心 / AI 搜索:** 深度打通百度生态,**百家号 / 百度百科 / 百度文库 / 百度学术权重最高**,百家号是核心入口。生态打通与平台偏好属**可信**;但"对 YMYL 内容做硬性权威打分、无资质不被引用"证据偏弱(主要来自 SEO 从业者文章,无百度官方确认),属 **mixed**,不宜当既定事实 [白杨SEO](https://www.baiyangseo.com/blog/1096.html)。
- **豆包(字节):** TOP5 信源中 3 个来自字节系,移动端占比高(**已核实定性**)。偏好场景化 + 多模态 + 短平快。⚠️ "今日头条约 35% / 知乎约 20%"这组**精确占比不可信**(仅出自一篇 GEO 营销软文,与权威测评的定性描述冲突),属 **mixed**,只取"优先引抖音/今日头条"的定性结论 [新榜] · [量子位](https://www.qbitai.com/2025/05/285761.html)。
- **腾讯元宝:** **深度绑定微信公众号**(引用占比约 10%),背靠 3.6 亿公众号语料,这是其独家护城河;通过微信搜一搜 + 搜狗搜索检索,**搜狗独家收录订阅号文章**。多源交叉**已核实** [53AI](https://www.53ai.com/news/LargeLanguageModel/2024053016479.html) · [搜狗微信](https://weixin.sogou.com/)。
- **Kimi(月之暗面):** 无自有生态,信源外采;长文本见长,用户多为研究者,**偏好体系化 + 强逻辑 + 可溯源,更看中科院文献/国际会议论文/企业报告**——这对学术工具是直接利好渠道。
- **DeepSeek:** 无自有生态,信源分散多元(搜狐/百度百科/网易);商业/技术领域偏好逻辑链 + 权威数据 + 财报。
- **夸克 AI(阿里/UC):** 基于通义千问自研推理模型,深度思考可溯源,实测一次可引用 25 条信源;与神马搜索同属阿里、技术打通,神马专注移动端 [财经头条](https://finance.sina.com.cn/cj/2025-02-28/doc-inemzyrh9784239.shtml)。

**跨引擎通用高权重平台:** 搜狐、网易、今日头条在四大主流工具中都有高引用率;**知乎**因结构化 + 审核机制是国产模型重要语料源。

### 国内 vs 海外差异(小结)

| | 海外 | 国内 |
|---|---|---|
| 核心逻辑 | RAG + 公开网 + UGC(Reddit/Wikipedia/YouTube) | **强生态绑定 + 平台护城河** |
| 谁说了算 | Bing/Google 索引 + 第三方权威 | 各家自有生态:**公众号(元宝)/百家号(文心)/抖音头条(豆包)/百科** |
| 内容投放 | 一份权威内容多平台分发 | **必须按引擎分渠道铺**(同一篇文要落到对应生态才被对应 AI 看见) |
| 共性 | 知乎/Reddit 类社区 UGC 都被重视;结构化、新鲜度、可抽取性都奏效 | |

**对 Scholar:** 海外靠 Reddit/Wikipedia/LibGuides/listicle;国内靠知乎 + 公众号 + 百家号 + 百度百科,且 Kimi/DeepSeek 偏好的中科院文献/会议论文/报告渠道是学术站的天然主场。

---

## 5. GEO 最佳实践清单(分三层 + 证据强度)

> 标注口径:【事实】= 经一手/官方核实 · 【业界】= 行业研究/相关性数据(谨慎) · 【证伪】= 已被推翻

### A. 内容层

| 做什么 | 为什么 | 证据强度 |
|---|---|---|
| **加权威引文 / 统计数据 / 标注来源**(证据型写作) | GEO 论文实测三者各约 +30–40% 可见度,是最有效的轻量改写 | 【事实】方向硬,具体单值【业界】[GEO 论文](https://arxiv.org/html/2311.09735v3) |
| **答案前置(BLUF)**:问题式 H2/H3 后立刻给 20–60 词"答案胶囊" | chunk 级抽取偏好能直接 lift 的开头;研究称大量引用来自正文前段 | 【业界】(具体百分比如 72.4% 已被核实证伪/误引,方向成立)[SEL](https://searchengineland.com/chatgpt-citations-content-study-469483) |
| **确定性 / 定义式表述**,少用对冲含糊语 | 被引文本含确定性语言比例约为未引的两倍(36.2% vs 20.2%) | 【业界】(数字经独立复核,有 0.1pp 误差) |
| **chunk 自洽("孤岛测试")**:每段只讲一个观点,别用 It/This 开头 | RAG 只喂命中段,段落须能独立读懂 | 【事实】机制成立;但"语义切块提升召回 9%"是**错误归因 + 夸大**(实测语义切块仅比递归切分高约 1.8pp),【证伪】[Chroma](https://www.trychroma.com/research/evaluating-chunking) |
| **表格 / 编号步骤 / FAQ / 对比表** 优于长段散文 | 可抽取格式更易被解析与引用 | 【业界】[Contently](https://contently.com/2026/02/20/how-to-optimize-content-for-perplexity-ai/) |
| **原创数据 / 独家研究 + 具名归因** | 引发他站自然引用,跨提示复用 | 【业界】 |
| **定期更新 + 显示 Last updated** | Perplexity 等对新鲜度敏感 | 【业界】(注:AI 并非一味偏新,被引中位页龄约 14 个月,时间敏感话题才强吃新鲜度——两类对立证据,需分场景)[Ahrefs](https://ahrefs.com/blog/ai-overview-citations-top-10/) |

### B. 技术层

| 做什么 | 为什么 | 证据强度 |
|---|---|---|
| **SSR / 预渲染**:标题、摘要、作者、正文进首屏静态 HTML | **主流 AI 爬虫(GPTBot/ClaudeBot/PerplexityBot)不执行 JS**,CSR/SPA 对它们=空白页;唯 Applebot、Gemini 渲染 | 【事实·最硬】Vercel 5 亿+ 抓取实证 [Vercel](https://vercel.com/blog/the-rise-of-the-ai-crawler) |
| **robots.txt 放行检索类爬虫**(OAI-SearchBot / PerplexityBot / Claude-SearchBot),按需决定是否封训练类 | 封检索爬虫=移出 AI 答案;每个 token 须独立 Disallow | 【事实】[OpenAI 官方] · [No Hacks](https://nohacks.co/blog/ai-user-agents-landscape-2026) |
| 区分 Google-Extended / Applebot-Extended(**它们是 opt-out 令牌,非爬虫**,只出现在 robots.txt) | 误封只阻止进训练,不影响抓取;封它们无意义 | 【事实】(Google/Apple 官方确认) |
| **schema.org / JSON-LD**:学术站用 ScholarlyArticle(含 issn/volume/issue/datePublished)、Person(affiliation/ORCID 走 sameAs)、Dataset、Organization,用 @id 串内部知识图谱 | 结构化数据帮 LLM 解析,提升引用概率 | 【业界】(2.3x/4.2x 等多为厂商研究,非独立复核)[Hashmeta](https://www.hashmeta.ai/en/blog/structured-data-for-ai-search-engines-the-complete-guide-to-schema-markup-for-chatgpt-perplexity-google-ai) |
| 干净 canonical、少重定向、完整 sitemap | AI 爬虫 URL 发现能力弱(ChatGPT/Claude 约 34% 抓取命中 404) | 【事实】[Vercel] |
| **llms.txt** | —— | ⚠️ **【证伪/无效杠杆】** Google 官方(Mueller)类比已废弃的 keywords meta;Ahrefs 实测 **约 97% 的 llms.txt 从未被任何 bot 请求**;无主流厂商承诺读取。**别投入,优先 SSR + robots + schema**;仅作低成本可选项 [Ahrefs](https://ahrefs.com/blog/llmstxt-study/) · [SEJ](https://www.searchenginejournal.com/googles-mueller-says-llms-txt-cant-help-llms-differentiate-sites/579304/) |

### C. 站外权威层(Scholar 的最高 ROI 战场)

核心范式:**一次"无链接的品牌提及"在 AI 时代功能上接近一条外链**——AI 即使没抓到你站,也会通过训练语料 + 实时检索里的第三方信号"认识并推荐"你。

> ⚠️ 降级:"提及等同于外链"属**夸大**(mixed)——提及建实体认知、外链解决发现/引流,二者分工不同;但"品牌网络提及与 AI 可见度相关性(0.664)远超外链(0.218)"这一核心结论由 Ahrefs 75K 品牌研究**支持** [Ahrefs](https://ahrefs.com/blog/ai-overview-brand-correlation/)。

| 做什么 | 为什么 | 证据强度 |
|---|---|---|
| **进 "best X / 对比 / 替代品" listicle** | "Best X"清单是 ChatGPT 高频被引页面类型(Ahrefs 数据);挑活页、补缺口、个性化外联,2–6 周落地 | 【业界】(43.8% 这一具体数字出处张冠李戴,但"清单类主导"方向【事实】)[Ahrefs/Chosenly] |
| **建 Wikidata 条目 + sameAs**(无 notability 门槛),积累报道后冲 Wikipedia / 百度百科 | Wikipedia 在训练语料中被严重超配(GPT-3 加权约 3% vs 原始 token 0.6%;LLaMA 约 4.5%),模型信任度远超体量 | 量化【事实】(GPT-3/LLaMA 论文证实);"抑制品牌幻觉"【业界·未坐实】 |
| **多平台分散下注**:Reddit / 知乎 / Wikipedia / YouTube / listicle 同时铺 | 单平台权重剧烈波动(ChatGPT 对 Reddit 一个月内从约 60% 跌到约 10%) | 【事实】[Semrush](https://www.semrush.com/blog/most-cited-domains-ai/) |
| **实体一致性**:LinkedIn/Crunchbase/G2/Capterra 描述与官网一致 | 信号越一致 AI 越能高置信归类引用 | 【业界】 |
| 国内:知乎专业问答(含实测数值 + 机构全称 + 报告编号)、公众号白皮书、百度百科补资质 | 双路径(边缘权威信号 + 中心知识图谱核验)协同;实测引用率可从 2%→29% | 【业界·国内实测】[特比昂](https://www.talpiotech.com/geo-618/) |

> ⚠️ **【证伪】** dossier 中"主题集群被引率是孤立发文 2–3 倍 / Yext 称双向内链 2.7 倍 / AI 按域级评估"——经核实:2–3 倍仅出自单一厂商自营数据;2.7 倍系**伪造归因**(Yext 原文无此结论);"按域级而非页级"与 Google 实际的 passage/段落级检索**方向相反**。**主题集群仍值得做(扩大检索面、提升一致性),但别用这组数字作论证。**

---

## 6. 学术垂类的特殊性

**核心矛盾:AI 推荐学术工具时极少引用工具自家官网。** 方向性结论是"第三方远多于厂商官网"(多个独立研究支持),但 dossier 中"仅 12% 官网 / 88% 第三方"这对**具体数字出处张冠李戴、不可信**(mixed)——AirOps 较可靠的数据是品牌自有域约 13%、第三方约 85%,品牌经第三方被提及概率高约 6.5 倍。**结论不变:Scholar 必须"对内做可抓取地基 + 对外抢占第三方共识层"双线并行。**

**学术专属高权威渠道(竞品正是这么被推荐的):**
- **大学图书馆 LibGuides(.edu)** 持续推荐 Consensus / Elicit / scite / Semantic Scholar——`.edu` 是 AI 极信任的学术权威信号,被收录价值远超普通博客 [Duke LibGuide](https://guides.library.duke.edu/litreviews/AI)。
- **社区共识**:r/AskAcademia、r/PhD、academia.stackexchange、知乎"文献检索/科研工具",真实参与被自然提及。
- **评测站**:G2 / Capterra / Product Hunt / Crunchbase 建立一致档案(评测站引用门槛存在,需积累一定评论量)。

**竞品打法对照:**
- **Consensus / Elicit / scite / Semantic Scholar** 的共同杠杆是**被 LibGuides + listicle + 社区反复一致提及**,形成"共识层"——AI 靠多源一致来对抗幻觉,孤立权威(哪怕排第一)不触发置信。
- **Semantic Scholar 类**强调"每个答案锚定到已验证论文"——AI 辅助引用对接 PubMed/arXiv/Semantic Scholar/Crossref/OpenAlex 等 grounding 源,完美匹配率显著高于普通网搜 [arXiv AAAI-26](https://arxiv.org/html/2602.01686)。

**Scholar 可被抓取的内容地基(学术专属硬指标):**
1. **Google Scholar 收录硬门槛**(官方):每篇必须有 `citation_title` / `citation_author` / `citation_publication_date`(Highwire 优先,Dublin Core 末选);期刊页补 `citation_journal_title/volume/issue/firstpage/lastpage/ISSN`;**PDF 须可搜索文本、≤5MB、用 `citation_pdf_url` 从 HTML 摘要页指向同子目录**;robots 不拦,首页到全文 ≤10 个纯 HTML 链接 [Google Scholar 官方](https://scholar.google.com/intl/en/scholar/inclusion.html)。**这是【事实】级清单,应直接落到论文/期刊详情页。**
2. **结构化数据**:为论文/期刊/作者页补 ScholarlyArticle + Dataset + FAQ schema,用 citation/isBasedOn/about/mentions/isPartOf 织内部实体图。
3. **主动呈现真实论文元数据 + 数字 + 引文**——学术答案高度偏好被 grounding 到真实论文。

**结合 Scholar 现状的可执行清单:**
- 补 **Highwire meta + citable PDF**(对接现有 SSR `injectPaperSEOMeta`,这是最高确定性动作)。
- JSON-LD 补全:ScholarlyArticle 加 issn/volume/issue/mentions,作者加 affiliation/ORCID(sameAs),期刊加被引数/h-index——填平现有缺口。
- 新增**学术术语 Glossary、工具对比页(vs Semantic Scholar/Consensus/Elicit)、学科检索指南**,扩大被引表面(直接补全 dossier 盘点出的内容缺口)。
- 站外:建 Scholay 的 **Wikidata 条目**,主动外联 LibGuides 与中外 listicle,在 Reddit/知乎做真实深度回答。
- **补英文内容**(核心 5–7 篇):当前全中文,Western 爬虫看到中文语言属性可能降权,欧美 GEO 几乎为 0,这是最大瓶颈。
- 国内:Kimi/DeepSeek 偏好的中科院文献/会议论文/报告是 Scholar 的主场,把权威数据报告发到知乎机构号 + 公众号。

---

## 7. 风险与红线

1. **规模化内容滥用(Google scaled content abuse)。** 政策判定核心是**"为何创建(why)"而非"如何创建(how)"——AI 生成本身不违规,大规模生产低价值内容操纵排名才违规**(官方原文,【事实】)。2025 年 8 月起 SpamBrain 强化执法,专打 scaled content abuse 与 site reputation abuse(寄生 SEO)[Google 官方](https://developers.google.com/search/docs/essentials/spam-policies) · [SEL](https://searchengineland.com/google-august-2025-spam-update-done-rolling-out-461560)。
   - **对 Scholar 的 programmatic SEO**(期刊/作者/学科聚合页):合规前提是**每页有真实唯一属性**(影响因子、分区、发文趋势、代表作)。行业可量化门槛:每 URL **≥3 个独特块、≥500 独特词、30–40% 差异度**;<300 词有风险。"若各变体推荐永不变化,那不是 pSEO 而是门页工厂。"用 **canary batch**(先发 20 页测效果,60–90 天决策环)避免异常发文激增 [BlogSEO](https://www.blogseo.io/blog/programmatic-seo-quality-rules-avoid-thin-content)。
   - ⚠️ Scholar 当前每篇论文是**孤立页、易被判 thin content**(现状盘点已点明)——必须配主题聚类 + pillar 页 + 双向内链补救。

2. **E-E-A-T(尤其 Trust)。** 在 GEO 语境从"质量指南"变成"AI 可见度过滤器":行业研究称 96% 的 AI Overview 引用来自有强 E-E-A-T 信号的来源(【业界·相关性数据】);Google 官方明确 **E-E-A-T 中 Trust 最重要,YMYL 主题额外严审**(【事实】)[ClickRank](https://www.clickrank.ai/e-e-a-t-and-ai/)。学术内容属高 YMYL 级,**具名作者 + 可验证学历/资质 bio + Article/FAQ schema(含 author、dateModified)** 是高杠杆且低风险的动作。

3. **平台政策红线。**
   - 国内:微信公众号明确处罚虚假宣传/违规营销/低质诱导内容(禁转发/删文/删粉直至封号);**商业推广须走腾讯官方广告平台**。国内站外铺设(知乎/小红书/公众号)**忌刷帖、忌付费虚假评价、忌极限词**,要真实 UGC 做多源交叉印证 [微信运营规范](https://ad.weixin.qq.com/docs/48)。
   - 海外:Reddit/社区参与必须真实有深度,刷帖会被识别且损害实体一致性。

4. **度量风险(别被抓取量误导)。** Cloudflare 2025 数据:训练抓取占 AI 爬取 **79%**;抓取-转介严重失衡(ClaudeBot 曾 38000:1,GPTBot 曾 3700:1)——**"被大量抓取 ≠ 被引用导流"**(【事实】)[Cloudflare](https://blog.cloudflare.com/crawlers-click-ai-bots-training/)。度量要三管齐下:① 服务器日志区分**实时拉取类**(*-User / ClaudeBot 命中=被当答案源)与训练类;② GA4 建自定义 Channel Group 正则匹配 AI 域名(注:App 内点击仍记 Direct、AI Overviews 归 Organic,无法 100% 归因);③ 主动 prompt 抽测被引率 / Share of Voice(国内用 SheepGeo/GEOBase 等覆盖豆包/DeepSeek/元宝)。

---

## 结语:给 Scholar 的优先级

**P0(高确定性、低成本):** 补 Highwire meta + citable PDF(对接现有 SSR);robots.txt 放行 OAI-SearchBot/PerplexityBot/Claude-SearchBot 并具名;确认四类实体页 SSR 对 AI 爬虫无空白页。
**P1(高 ROI 站外):** 建 Wikidata 条目;外联 LibGuides 与中外 listicle;知乎/Reddit 真实参与;补英文核心内容 5–7 篇。
**P2(内容地基):** 学术 Glossary + 工具对比页 + 学科指南补全被引表面;主题聚类 + pillar 页解 thin content;JSON-LD 补 issn/mentions/affiliation/被引数。
**别做:** 把资源压在 llms.txt 上(已证伪无效);用关键词堆砌(对 GEO 无效甚至负向);规模化生成无独特数据的模板页(踩 scaled content abuse 红线)。

核心心法一句话:**让裸 HTML 首屏可被无 JS 的爬虫读懂 → 用证据型、结论前置、结构化的内容确保"可被引用" → 在第三方共识层(LibGuides/listicle/知乎/Reddit/Wikidata)被反复一致提及。** 学术垂类的"民主化"窗口(证据质量 > 域名权威)对 Scholar 是有利的——现在做,正当其时。
