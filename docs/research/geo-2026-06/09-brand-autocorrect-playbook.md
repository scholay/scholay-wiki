# 让搜索引擎别把 scholay 纠错成 scholar 的行动手册

## 一、为什么会被纠错(先理解机制,才知道往哪使劲)

搜索引擎的"纠错"不是查字典,而是**纯统计 + 用户行为驱动的概率判断**。它在判断:你输入的 `scholay` 到底是"一个真实存在的东西",还是"`scholar` 打错了一个字母"。Scholay 不幸踩满了所有"判我为错字"的反向条件:

1. **像一个高频常见词**:`scholay` 与 `scholar` 编辑距离只有 1,而 `scholar` 是搜索量巨大的常见词。引擎默认"用户大概率是想搜那个常见词打错了"。
2. **新品牌,全网 footprint 极低**:`scholay` 在 Google/百度的网页语料、搜索日志里出现频次极低,几乎"零信号"。
3. **不是已知实体**:它不在 Wikidata / 百度知识图谱 / 词库里,引擎没有"这是个机构/产品"的依据。
4. **自我强化的循环**:用户搜 `scholay` 被纠错后,如果改搜 `scholar` 或点了 `scholar` 的结果不返回,引擎会把这当作"确实是打错了"的证据 → 越纠越确信。

Google 的内部信号叫 **QF-IRF / query rank ≈ 出现频率 × 反修正频率**:一个词被搜后用户越少改写它、点完越满意,得分越高;反之越被判为 typo。百度的纠错管线(错误检测 → 候选召回 → Deep&Wide 纠错排序)看的也是同四类信号:**是否在词库/实体库、语料频次、点击行为、是否被知识图谱识别为实体**。Bing 的 Speller100 则靠"索引全网所有词和短语(哪怕罕见/生造)"识别新词,只要全网把 scholay 当独立实体用得够多,就会停止纠正。

### 一个诚实的预期(请先接受这一点)

**没有"举报这个纠错"的一键开关。** Google 明确说过这是全自动算法、无法对单个查询手动改判;百度/Bing 的反馈入口只是弱信号,不能直接关闭。

退出纠错循环只能靠四件事叠加,**且都需要时间累积**:
- **建立实体**(让引擎确信 scholay 是一个机构/产品,而非错字)
- **全网 footprint**(多个独立、权威来源一致地把它写成 "Scholay")
- **用户点击信号**(真实用户搜 scholay → 点你的站 → 不接受纠错)
- **时间**(信号过阈值后,引擎概率判断才翻转)

经验时间线:从**数周到数月**开始缓解,完整知识面板可能要 3–12 个月。务实排期:1–2 月铺结构化数据,2–6 月做媒体提及和品牌导流,4–9 月看到纠错明显减弱。任何承诺"立刻解决"的说法都不要信。

---

## 二、分优先级行动清单

> 标注规则:**【自己做】**=前端/技术/账号操作即可完成;**【需运营】**=需要 PR、市场预算、内容运营或资质材料推动。

### 海外(Google / Bing)——机制:Wikidata → 知识图谱 → 实体确权

#### P0 立刻做、最高 ROI、几小时内能完成
| 做什么 | 在哪做 | 谁做 | 预期作用 |
|---|---|---|---|
| 建 **Wikidata 条目**(`Special:NewItem`):`instance of`=公司/软件、`official website`=scholay.com、`sameAs`(LinkedIn/Crunchbase/GitHub/社交主页)、description 写清"AI 学术平台"做消歧 | wikidata.org | **【自己做】** | 公认最高杠杆、最快见效。Google 知识图谱直接读 Wikidata,QID 把域名锚定为"已验证实体"而非 scholar 的错拼变体。无需 Wikipedia 的 notability 门槛即可手建 |
| 官网注入 **Organization + WebSite JSON-LD**:`name:"Scholay"`、`url`、`logo`、`alternateName`(收敛 "Scholay AI / Scholay academic search" 变体)、`sameAs` 数组回链 Wikidata QID/LinkedIn/Crunchbase | 官网 on-page | **【自己做】** | schema **不创造实体,但是引擎交叉验证实体的关键确认信号**,必须和 Wikidata 配套。`sameAs` 把官网和外部权威源"焊"在一起 |

#### P1 这几周做(地基已稳后铺 footprint)
| 做什么 | 在哪做 | 谁做 | 预期作用 |
|---|---|---|---|
| 全站品牌名**统一只写 "Scholay"**(title/H1/footer/About/meta 完全一致),用文本不用图片,正文自然密集出现全词 | 官网 on-page | **【自己做】** | Google NLP 对拼写/大小写敏感,变体会被拆成不同实体、稀释信号 |
| 在 **Bing Webmaster Tools** 验证站点 → Site Scan 修标题/描述/结构化数据 → URL 提交重抓;**Google Search Console** 提交 sitemap、确认品牌页收录 | webmaster.bing.com / search.google.com | **【自己做】** | Bing 的主要确权入口(不能人工改 snippet,靠多轮抓取);GSC 只能监测+加速收录,不能直接改纠错 |
| 入驻并用**同一句 entity bio + 一致拼写**:Crunchbase / G2 / Product Hunt / LinkedIn 公司页 / AI 工具目录 / GitHub | 各平台 | **【需运营】** 部分自己做 | 抬全网出现频率 + 跨平台 entity co-occurrence,是引擎"多个权威源都这么写"的证据。**多源 > 单源多篇** |

#### P2 持续投入(决定性但慢)
| 做什么 | 在哪做 | 谁做 | 预期作用 |
|---|---|---|---|
| **数字 PR / 媒体提及**:8–15 篇不同独立媒体用正确拼写报道 Scholay(产品/发布/融资),措辞一致 | 站外 | **【需运营,高成本】** | 提及越多越快越过 misspelling 阈值,也为日后 Wikipedia 铺路 |
| 投**品牌词广告**(Google/Bing Ads)投 `scholay` 关键词 | 广告后台 | **【需运营,需预算】** | 品牌词点击极便宜($0.05–0.10),被改写时仍占顶部 + 制造真实点击信号 |
| 在 Bing 结果页底部 Feedback / Google 纠错提示下 `report inappropriate predictions` 上报 | 结果页 | **【自己做】** | 直接的人工反馈信号,**弱、需累积**,非一键开关 |
| 达到 notability 后再考虑 **Wikipedia 条目**(需独立可靠来源,勿过早硬上) | wikipedia.org | **【需运营】** | 单篇 Wikipedia 常能直接触发知识面板/实体识别 |

### 国内(百度为主)——机制:百度百科 → 知识图谱 → 官网认证/收录

> 百度知识图谱约 50 亿实体,**很大程度来自百度百科词条分类**——所以"让 scholay 进百科"是从纠错管线**源头**解决问题的最强杠杆。

#### P0 立刻做
| 做什么 | 在哪做 | 谁做 | 预期作用 |
|---|---|---|---|
| 在**百度搜索资源平台**验证站点、提交 sitemap、用"普通收录/链接提交"主动推送所有含 Scholay 的页面 | ziyuan.baidu.com | **【自己做】** | 几分钟到几天见收录,提高 scholay 在百度网页库的独立出现频次 |
| 官网全站用**真文本**(非图片)高密度规范使用 Scholay,配语义上下文如 "Scholay 学术平台" 与 scholar 明确区分 | 官网 on-page | **【自己做】** | 喂语料 + 降低与 scholar 的混淆,提升语义识别 |

#### P1 这几周做
| 做什么 | 在哪做 | 谁做 | 预期作用 |
|---|---|---|---|
| 创建**百度百科 Scholay 品牌词条**(词条名=商标名、客观中立禁"领先/最佳"、附官网/商标证/第三方媒体参考资料) | baike.baidu.com | **【需运营,中等难度】** 需 R 标 + ≥1 篇第三方权威报道,可能多次过审 | **最强结构性杠杆**:词条进库即喂知识图谱+词典,纠错管线把它当专名而非错拼 |
| 申请**百度官网认证(蓝标)**:营业执照+商标证+ICP 一致性核验;高级版可用商标自定义品牌触发词词包 | trust.baidu.com | **【需运营】** 需资质审核,可能收费 | 把 scholay 强关联到经营主体、利于判为品牌词;搜品牌词时官网展蓝标优先展示 |

#### P2 持续投入
| 做什么 | 在哪做 | 谁做 | 预期作用 |
|---|---|---|---|
| 铺第三方语料:百度知道自问自答("Scholay 是什么")、知乎/36氪/CSDN 稿件、统一品牌社交账号 | 站外 | **【需运营】** | 稀释 "scholay=scholar 错拼" 的统计先验,多独立来源是收录与纠错置信度下降的关键 |
| 百度搜索结果反馈(结果旁倒三角)/ 投诉中心声明"scholay 是真实品牌、纠错有误" | tousu.baidu.com | **【自己做】** | 即时但弱信号,需配合百科/收录才有效 |
| 站点成 VIP 或关联智能小程序(MAU 达标)后开通站点 LOGO/品牌展现权益 | ziyuan.baidu.com | **【需运营,门槛高周期长】** | 锦上添花,增强信任与记忆度,非直接解决纠错 |

### 其他引擎(360 / 搜狗 / 神马)——只能靠收录+自动识别

- **360**:商业站官网认证已于 2020-02 关闭,只剩政府/公益/学校。普通企业走 zhanzhang.so.com 提交收录 + 知名度自动识别,无人工确权通道。**【自己做】**
- **搜狗**:无纠错专项,反馈走 fankui.help.sogou.com,提交 sitemap/URL。**【自己做】**
- **神马**(UC/阿里):zhanzhang.sm.cn 实名认证 + sitemap/URL/结构化数据提交,无独立纠错申诉。**【自己做】**

### 跨引擎通用——用户行为养词(把概率推过临界点)
| 做什么 | 谁做 | 预期作用 |
|---|---|---|
| 引导真实用户搜 scholay 被纠错时,**点你的站 + 点"仍然搜索 scholay / Search instead for scholay"**(绝不点纠错建议——点了=确认打错,反向训练) | **【需运营】** 可推动 | 直接对抗 QF-IRF / 点击模型,每次拒绝纠错都在教引擎"这是真实意图"。Matt Cutts:足够多人搜会很快被纠正过来 |
| 邮件/公众号/落地页**直接给 scholay.com 链接**,减少"搜一下被改写"的暴露面;落地页让 "Scholay" 与 "academic search / scholar tools" 反复同框 | **【自己做】+分发** | 过渡期保护转化;研究显示生造拼写降 12–14% 选择率,需主动消歧 |
| 用 GSC 的 query=`scholay` 展示量曲线 / 2025-11 上线的 branded queries filter + 无痕窗口人工核对,监测纠错率下降 | **【自己做】** | 验证策略生效(看趋势别看绝对值,GSC 2025 有过展示量统计 bug) |

---

## 三、哪些已做、哪些只能站外做

**已经做了的 on-page(无需重复)**:
- 品牌词 `alternateName` / Organization·WebSite **schema** 已补
- **noscript** 品牌锚点已补

也就是说,**官网侧的实体确认信号(schema/alternateName/noscript)地基已经打好**。但请记住:**schema 本身不创造实体,只在引擎已怀疑该实体存在时"确认"它**——所以它必须和站外的 Wikidata / 百度百科配套才生效。

**只能站外 / 运营做的(地基之外的决定性部分)**,这些无法靠改代码完成:
- **建实体**:Wikidata 条目(海外)/ 百度百科词条(国内)——这是断纠错的根本
- **全网一致提及**:Crunchbase / LinkedIn / Product Hunt / 媒体稿 / 百度知道 / 知乎,多源一致写 "Scholay"
- **官方认证**:百度蓝标(trust.baidu.com)
- **用户点击信号**:引导真实用户搜 scholay、点你的站、拒绝纠错
- **品牌词广告**:拉真实搜索量兜底

---

## 四、最快见效路径(给一个可落地的最小动作集)

如果只能集中做几件事,按这个顺序,通常**数周到数月**开始缓解:

1. **站点收录**(几天内):百度搜索资源平台 + Google Search Console 提交 sitemap,确保所有含 Scholay 的页被索引——引擎得先"知道"这个词在被使用。**【自己做】**
2. **建两个核心实体词条**(几小时~几周):**Wikidata**(海外,30 分钟,门槛低,立刻喂 Google 知识图谱)+ **百度百科**(国内,需 R 标和媒体参考资料,从源头让百度判为专名)。**【自己做 / 需运营】**
3. **几处高权重一致提及**(数周):Crunchbase / LinkedIn / Product Hunt + 几篇独立媒体,全部写 "Scholay" 并在 `sameAs` 里互链。**【需运营】**
4. **让早期用户搜 scholay 点进来**(持续):邮件/社群/发布引导真实用户搜 scholay、点你的站、点"仍然搜索 scholay";有预算就加品牌词广告兜底。**【需运营】**

**地基(已完成的 schema/alternateName/noscript)+ 上面 4 步**,就是把引擎的概率判断从"这是 scholar 的错拼"推过"这是真实品牌"临界点的完整链路。请保持耐心并用 GSC/无痕窗口持续度量——这是积累过程,不是开关。

---

### 来源
- Google QF-IRF 纠错机制(query rank × inverse revision frequency)— SEO by the Sea [来源](https://www.seobythesea.com/2007/02/when-google-thinks-youve-misspelled-a-business-name-spell-corrections-and-query-refinements/)
- Google thinks your brand is misspelled — Energise [来源](https://www.energise.co.nz/blog/google-thinks-brand-misspelled/)
- How to establish your brand entity for SEO: A 5-step guide — Search Engine Land [来源](https://searchengineland.com/establish-brand-entity-for-seo-guide-427717)
- Wikidata for SEO: How Brands Use It to Win Google — Reputation X [来源](https://www.reputationx.com/blog/wikidata)
- Wikidata and SEO: The Secret Tool Behind Google's Knowledge Graph — Wikibusines [来源](https://www.wikibusines.com/wikidata-seo-knowledge-graph)
- Organization Schema Markup — Google Search Central [来源](https://developers.google.com/search/docs/appearance/structured-data/organization)
- schema sameAs / Wikidata 实体识别 — Schema App [来源](https://support.schemaapp.com/support/solutions/articles/33000277321-how-to-use-additionaltype-and-sameas-to-link-to-wikipedia)
- Introducing the branded queries filter in Search Console(2025-11)— Google [来源](https://developers.google.com/search/blog/2025/11/search-console-branded-filter)
- Google Mistakes My Brand Name for a Typo — Google Search Central Community [来源](https://support.google.com/webmasters/thread/322859615/google-mistakes-my-brand-name-for-a-typo?hl=en)
- Ask HN: How to stop Google from autocorrecting our company name?(Autimo/Zune)[来源](https://news.ycombinator.com/item?id=43380184)
- Microsoft Speller100(Bing 索引罕见词/品牌名)— Neowin [来源](https://www.neowin.net/news/microsoft-adds-spelling-improvements-to-bing-search/)
- How to report a concern or contact Bing — Microsoft Support [来源](https://support.microsoft.com/en-us/topic/how-to-report-a-concern-or-contact-bing-1831f0fe-3c4d-46ae-8e57-16c487715729)
- Bing displaying incorrect company name in search results — Microsoft Q&A [来源](https://learn.microsoft.com/en-my/answers/questions/5839786/bing-displaying-incorrect-eyebrow-company-name-on)
- Did You Mean vs Search Instead For — Hallam [来源](https://hallam.agency/blog/did-you-mean-vs-search-instea-for/)
- 百度中文纠错技术实践(错误检测/候选召回/Deep&Wide 纠错排序)[来源](https://www.secrss.com/articles/15103)
- 搜索引擎的 Query 自动纠错技术和架构 — 达观 [来源](https://www.datagrand.com/blog/query.html)
- 全面理解搜索 Query:纠错置信与确认提示 [来源](https://zhuanlan.zhihu.com/p/112719984)
- 百度官网认证(蓝标)介绍 — trust.baidu.com [来源](https://trust.baidu.com/vstar/official/intro?type=gw&fl=1)
- 品牌类词条编辑指南 — 百度百科 [来源](https://baike.baidu.com/item/品牌类词条编辑指南/22835036)
- 站点属性/站点 LOGO/品牌展现权益 — 百度搜索资源平台 [来源](https://ziyuan.baidu.com/property/index)
- 百度网页搜索如何发起投诉(结果反馈/投诉中心)[来源](https://zhuanlan.zhihu.com/p/357575265)
- 官网认证 — 360 搜索使用帮助 [来源](https://www.so.com/help/help_3_4.html)
- 360 搜索站长平台下线官网认证功能 — 泪雪博客 [来源](https://zhangzifan.com/360so-close-site-verify.html)
- 搜狗站长指南/反馈 — 搜狗搜索帮助中心 [来源](https://help.sogou.com/guide.html)
- 神马站长平台 [来源](https://zhanzhang.sm.cn/)
- Lyft/Tumblr/Flickr 非常规拼写的消费者反应 — AMA [来源](https://www.ama.org/2023/04/25/lyft-tumblr-flickr-how-do-consumers-respond-to-unconventionally-spelled-brand-names/)
- 非常规拼写降 12–14% 选择率 — Notre Dame [来源](https://news.nd.edu/news/lyft-vs-lift-consumers-are-less-likely-to-support-brands-with-unconventional-spellings-study-shows/)
- How do search engines handle misspellings — Milvus [来源](https://milvus.io/ai-quick-reference/how-do-search-engines-handle-misspellings-in-queries)
- How to Get a Google Knowledge Panel(2026)— InstantPress [来源](https://www.instantpress.co/blog/how-to-get-a-google-knowledge-panel-the-real-process)
