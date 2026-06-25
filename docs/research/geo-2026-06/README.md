# Scholar GEO(生成式引擎优化)调研 · 2026-06

目标:让 **Scholar 平台本身**被国内外生成式引擎(ChatGPT / Perplexity / Google AI Overviews / Gemini / Bing Copilot · 百度文心 / 豆包 / 腾讯元宝 / Kimi / DeepSeek / 夸克)**检索、引用、推荐**。

本目录由一次多智能体调研 workflow 产出:3 个 agent 扫描 Scholar 现有 SEO/GEO 基建,9 个 agent 全网检索 9 个 GEO 角度,27 条核心论断经对抗式证伪(1 条证伪 / 11 条降级),去重 90 条来源。报告中所有结论按 **[一手已核实] / [行业说法·谨慎] / [已证伪·勿押注]** 三级标注。

## 文件导读

| 文件 | 内容 | 给谁看 |
|---|---|---|
| [01-geo-research-report.md](01-geo-research-report.md) | **GEO 调研报告**:什么是 GEO、RAG 选源机制、海外+国内引擎逐个拆解、三层最佳实践清单、学术垂类特殊性、风险红线 | 想理解 GEO 全貌的人 |
| [02-scholar-landing-plan.md](02-scholar-landing-plan.md) | **Scholar 落地方案**:P0/P1/P2 动作清单,每条映射到真实文件(`internal/seo`/`seosubmit`/`handler_ssr.go`/`nginx`),含 robots 放行 AI 爬虫、SSR 覆盖、JSON-LD 扩展、主动推送、监测 | 工程师(改哪个文件) |
| [03-content-playbook.md](03-content-playbook.md) | **内容生产 Playbook**:内容矩阵+真实标题示例、可引用性写作模板、国内外分发、量质平衡红线、30/60/90 天 roadmap | 内容/运营 |
| [scholar-current-state.md](scholar-current-state.md) | Scholar 现有 SEO/GEO 基建与内容资产盘点(代码扫描原始结论) | 背景参考 |
| [verification.md](verification.md) | 27 条核心论断的对抗式核实逐条结果 | 想知道哪些"业界说法"不可信 |
| [sources.md](sources.md) | 90 条去重来源清单 | 溯源 |

### 第二轮(2026-06-24):页面体检 + 内容/品牌计划

| 文件 | 内容 | 给谁看 |
|---|---|---|
| [04-page-audit-Q1.md](04-page-audit-Q1.md) | **页面体检报告(Q1)**:逐页型实抓(Googlebot/GPTBot/真人 UA)+ sitemap/SSR 交叉核对。结论=实体页健康,但 **11 个路径进了 sitemap 却对爬虫只返回空壳**(`/search`/`/journals/search`/`/privacy`/`/terms`/`/disclaimer`/`/contact`/`/feedback`/`/claw`/`/prism`/`/peer-review`),`/features/*` 六子页重复内容,博客/资源只给爬虫 teaser,普遍缺专属 title/OG/公司主体 | 工程 + 运营 |
| [05-content-enrichment-plan-Q2.md](05-content-enrichment-plan-Q2.md) | **内容丰富计划(Q2)**:四块定位重切(介绍/文档/资源/博客)+ 目标站点地图 + P0/P1/P2 新增/加厚页清单(对比页/术语表/FAQ 中心/功能深度页,带真实中文标题)+ 介绍页可引用性模板 + 「白名单+inject+sitemap 三件套」落地映射 | 内容 + 工程 |
| [06-product-story-plan-Q3.md](06-product-story-plan-Q3.md) | **产品故事/品牌叙事计划(Q3)**:品牌内核与一句话定位、vs 五大竞品差异化文案、首页/about/features 文案草稿、E-E-A-T 信任信号、Organization 实体建设(Wikidata/百科 sameAs)、30/60/90 天节奏。⚠️ 顶部有「数据规模」数字订正 | 品牌 + 运营 |

> **第二轮三条要点**:① 体检的高危是「sitemap 提交了、爬虫却抓不到」——根因是 nginx SSR 白名单(`user.conf:238`)漏了那些路径,已实测确认;② 丰富内容的铁律=每个可索引新页必做「nginx 白名单 + SSR inject + sitemap」三件套,缺一即空壳;③ GEO 时代「讲产品故事」=建立 AI 对品牌实体的标准认知(全渠道首句一字一致),不是情怀。

## 三条最关键结论(TL;DR)

1. **现在是窗口期。** GEO 论文(KDD 2024)实测:加权威引文 / 统计数据 / 标注来源是被引提升最强三法(各约 +30–40%),且存在"民主化"效应——排名靠后的小站靠证据质量可与头部同台被引。Scholar 品牌权重尚未压倒谷歌学术,正该趁早做。

2. **最高 ROI 是技术放行,不是写 llms.txt。** Scholar 已有生产级 SEO 三层注入 + 主动推送,但 `robots.txt` 与 nginx `$is_crawler` map **都没放行任何 AI 检索爬虫**(GPTBot/OAI-SearchBot/PerplexityBot/ClaudeBot 全不在)→ AI 爬虫被当普通用户走 SPA 拿到空首屏。P0 同时改这两处 = 几乎零成本打开被引大门。**明确不押注 llms.txt**(Google 已否定,97% 从未被请求)。

3. **国内靠生态,海外靠 Bing 索引 + 第三方权威。** 国内必须按引擎分渠道铺内容(元宝吃公众号、文心吃百家号/百度百科、豆包吃抖音头条、Kimi/DeepSeek 偏好中科院文献/会议论文——后者是学术站天然主场);海外保证 Bing 收录干净 = 间接喂 ChatGPT(87%+ 引用匹配 Bing),并争取进知乎/Reddit/.edu LibGuides/"best tools"榜单。

## 建议的第一步

落地方案里的 **P0 五项**(robots 放行 AI 爬虫 + nginx map 补 UA + ScholarlyArticle 补证据字段 + AI 爬虫日志监测脚本 + GA4 AI referral channel),合计约 2.5 人日,无架构改动,是性价比最高的起点。详见 [02-scholar-landing-plan.md](02-scholar-landing-plan.md#1-现状盘点小结)。
