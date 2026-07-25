# 附录 · 六路调研原始报告

## A. 国际科研痛点
## claw 下一个「重能力」调研报告:科研全流程痛点扫描

> 调研方法:围绕「选题→文献综述→实验设计→数据分析/统计→写作→投稿格式→返修→汇报/海报→基金」9 个阶段,联网检索 Nature/Science 调查、时间分配研究、r/PhD·GradCafe 用户原声、竞品(Elicit/Covidence/Julius/MSTATA/PosterGen 等),重点判断「哪些环节重且高频、通用聊天(ChatGPT/Claude)解决得最差、且需要『跑代码+产文件+查真文献』的 agent 才能做好」。

---

### 一、总览:科研时间到底花在哪

- **一个 PI 平均 42% 的时间花在行政/非科研事务上**,其中「写基金申请」15.4%、「项目后期行政」13.6% 最耗时。近 **94% 的 PI 把「减少行政/文书负担」列为最高或次高诉求**。来源: [Chemistry World](https://www.chemistryworld.com/news/almost-half-of-us-researchers-time-goes-on-admin/7728.article) · [Key Solutions](https://www.keyusa.com/blog/reducing-researcher-administrative-burden-research-universities)
- **中文语境的经典引用(美国 NSF 统计)**:科技人员花在「查找和消化科技资料」上的时间占全部科研时间的 **51%**,计划思考 8%,实验 33%,书面总结 8%。来源: [万维书刊转引](https://eshukan.com/academic/show.aspx?id=160607&cid=24)
- 一项针对 **759 个研究项目**的调查显示,SCI 发表最大障碍依次是:方案撰写与提交(近 62% 认为最难)、伦理/行政、**统计分析(被称为「论文发表的最大拦路虎」)**、写作、选刊、回复审稿。来源: [万维书刊](https://eshukan.com/academic/show.aspx?id=160607&cid=24)

**结论**:最重且高频的三块是「文献消化/综述」「数据分析与统计」「写作—投稿—返修—汇报的产出链」。其中数据/统计与系统综述,恰恰是通用聊天做得最差、而 agent(能跑代码+产文件+查真文献)最能拉开差距的两块。

---

### 二、逐阶段痛点与竞品

#### 1. 数据分析与统计 —— 最痛、最高频、通用聊天最差(⭐ 头号候选)
- **痛点密度极高**:
  - **统计焦虑影响多达 80% 的研究生**,会实质性拖累课程与研究表现,45% 因此拖延。来源: [ERIC/EJ1232517](https://files.eric.ed.gov/fulltext/EJ1232517.pdf)
  - **导师供给严重错配**:约 **49.5% 的博士生说从没得到过统计帮助,而 97% 的导师声称自己提供了统计指导**。来源: [PMC 医学论文失败原因研究转引](https://core.ac.uk/works/43719122)
  - **约 50% 的医学/口腔论文含至少一处统计错误**;38% 的 Nature 论文、1/4 的 BMJ 论文含统计错误。来源: [PMC4401313](https://pmc.ncbi.nlm.nih.gov/articles/PMC4401313/) · [Newswise](https://www.newswise.com/articles/published-research-contains-high-level-of-statistical-errors)
  - **数据清洗占数据工作的 60–80%,且被 76% 的人评为「最不享受」的环节**。来源: [Forbes/CrowdFlower](https://www.forbes.com/sites/gilpress/2016/03/23/data-preparation-most-time-consuming-least-enjoyable-data-science-task-survey-says/) · [BigDATAwire](https://www.hpcwire.com/bigdatawire/2020/07/06/data-prep-still-dominates-data-scientists-time-survey-finds/)
  - 样本量/效应量计算「常常是功效分析中最难的一步」,研究者普遍在社交媒体求助或直接照抄别人的 n=6。来源: [Statistics By Jim](https://statisticsbyjim.com/hypothesis-testing/sample-size-power-analysis/)
- **通用聊天为什么做不好**:ChatGPT/Julius 都有**可复现性问题**——同一 prompt 会给出不同结果,自然语言层让人「无法验证到底算了什么」;ChatGPT 文件上限 512MB。来源: [Julius 评测](https://mcpanalytics.ai/articles/julius-ai-review) · [Effortless Academic](https://effortlessacademic.com/julius-ai-in-depth-review/)
- **竞品现状**:
  - 中文市场已有验证需求的产品:**MSTATA 医学统计机器人**——以「研究设计类型」为菜单入口、聊天式让大模型生成 R 代码并自动跑,产出**符合杂志格式的 Word 统计报告**、甚至自动生成 3000–5000 字论文草稿;VIP 188–999 元/年。**SPSSAU / 风暴统计(浙中医郑卫军团队,R 语言零代码)**同赛道。来源: [MSTATA](https://mstata.com/) · [SPSSAU](https://spssau.com/indexs.html) · [风暴统计](https://www.medsta.cn/)
  - 空白/差异化机会:这些工具要么黑箱(看不到/改不了代码),要么绑定固定菜单;**claw 已有 bwrap 沙箱能跑 Python/R + 产 docx/xlsx/pdf 前端预览 + minicod 查真文献**,可主打「**可复现、可审计、可导出代码+图表+Word 报告一整包**」,并把「选方法→查假设→算功效→清洗→出图→写方法学段落」串成一条被引导的重流程,正好补上通用聊天的可复现短板。

#### 2. 文献综述 / 系统评价 —— 月级耗时,通用聊天「编引用」硬伤(⭐ 强候选)
- **耗时以「月」计**:系统评价通常 **6–18 个月**,有图书馆员协作的团队从递交方案起平均 **12.5 个月**;标题/摘要筛选约占 20% 工作量,**每条摘要约 36 秒**、动辄数千上万条。来源: [DistillerSR](https://www.distillersr.com/resources/systematic-literature-reviews/how-long-does-it-take-to-do-a-systematic-review) · [MSK Library](https://libguides.mskcc.org/systematic-review-service/how-long)
- **通用聊天的致命伤——编造引用**:Deakin 研究发现 GPT-4o 生成的**参考文献约 1/5 是编的、总计 56% 或假或含错**;带 DOI 的假引用里 64% 指向真实但完全无关的论文,极难识别。OpenAI Deep Research 明确**无法读付费墙文献**、会「幻觉事实」。来源: [Nature Sci Reports](https://www.nature.com/articles/s41598-023-41032-5) · [StudyFinds](https://studyfinds.org/chatgpts-hallucination-problem-fabricated-references/) · [JMIR Deep Research](https://www.jmir.org/2025/1/e75666)
- **竞品现状**:Elicit(筛选可扩到 4 万篇)、Covidence(Cochrane 推荐但 **339 美元/单个综述/年、无学生折扣**)、Rayyan(免费协作筛选)、**Silvi.ai/LASER AI(声称筛选省 45%、抽取省 53%)**;但业界共识是「**没有一个工具能把整条流程做好,只能各管一段**」。来源: [INRA 对比](https://www.inra.ai/blog/covidence-vs-rayyan-vs-elicit) · [ResearchGold](https://researchgold.org/blog/covidence-alternatives-systematic-review-tools) · [LASER AI](https://www.laser.ai/)
- **claw 的独特位**:**minicod 76 个 MCP 工具能查真论文/引文网络/期刊信息(引用可溯源,天然规避编造)+ 沙箱跑筛选/去重脚本 + 产出 PRISMA 流程图 + 结构化数据抽取表(xlsx)**,可把「检索式构建→去重→双人筛选记录→PICO 抽取→PRISMA 图」做成一条被引导的重流程,单点打通通用聊天与专用工具都没做全的整链。

#### 3. 投稿格式化 / 期刊改格式 —— 巨量隐形浪费(候选,但与 Prism 重叠)
- **每篇稿件平均 14 小时改格式、约 477 美元**;全球每年 **2380 万小时 / 11 亿美元**耗在改格式上,**20% 的稿件因此延迟发表 3 个月以上**,不到 4% 的期刊接受免格式初投。来源: [Nature d41586-023-01846-9](https://www.nature.com/articles/d41586-023-01846-9)(经 [Livewrite 转引核实数字](https://livewrite.app/blog/manuscript-reformatting-time-cost))
- 竞品:SciSpace/Typeset 号称 10 万+ 期刊模板一键套用。此块与平台已有的 **Prism(LaTeX IDE + 投稿包 lens)**高度重叠,更适合作为 Prism 增强而非 claw 新重模式。来源: [SciSpace](https://typeset.io/for-writers/)

#### 4. 返修 / 审稿回复(rebuttal)—— 高压高频,但偏文本(候选,已有轻 guide)
- 审稿回复对青年学者「相当有压力和困惑」,常花「数周、逐条回应、把方法学解释到极度详尽」;小修 1–2 月、大修 3–4 月合理。来源: [Elsevier Connect](https://www.elsevier.com/connect/how-to-respond-to-reviewer-comments-the-calm-way) · [Nature Index](https://www.nature.com/nature-index/news-blog/how-to-respond-difficult-negative-peer-reviewer-feedback)
- 竞品:SciSpace「Response to Reviewers 生成器」、Paperpal 都能出逐条 DOCX 回复信。来源: [SciSpace agent](https://scispace.com/agents/response-to-reviewers-letter-generator-19b8wauz)
- claw 已有 rebuttal 轻 guide + peerreview 模块;偏纯文本、跑代码需求弱,升级为重模式的差异化不如前两者。

#### 5. 学术汇报:组会 slides / 会议海报 —— 高频刚需,PPT 模式已覆盖一半(候选)
- **组会是周级刚需且被大量吐槽**。GradCafe 用户原声:「我们组一周两次这种可怕的会,9–11 点」「**一周浪费 4 小时**」「轮到自己前几天就开始紧张」「有人把所有数据塞进数不清的、粗制滥造的 PPT」。来源: [GradCafe 论坛](https://forum.thegradcafe.com/topic/75046-lab-meetings-are-bs-and-a-complete-waste-of-time/)
- **「论文→海报/slides」是学界活跃研究方向**:PosterGen、Paper2Slide、AutoPresent、SlideGen 等多智能体框架 2025 年密集出现,说明需求真实且现有工具「产物需大量手工返修」。来源: [PosterGen arXiv](https://arxiv.org/html/2508.17188v1) · [Paper2Slides GitHub](https://github.com/HKUDS/Paper2Slides)
- **平台现状**:claw 已有「制作PPT」重模式(学术主题+公式+引用),但**「从一篇已发表论文/稿件一键生成组会汇报」与「会议海报」两个场景尚未专门覆盖**;海报是明确空白。可作为 PPT 模式的横向延展(paper2slides / poster),而非全新方向。

#### 6. 基金申请 —— 极重但低频 + 合规风险(次要候选)
- 平均一份标书耗 **116 PI 工时 + 55 CI 工时**(≈8 个 PI 周);澳洲 NHMRC 每份标书约 **38 个工作日**;光写标书就占标准工作周近 10%,含行政近 20%。来源: [PLOS One 116h 研究](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0118494) · [PMC 澳洲观察研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC3664356/)
- 竞品:GrantCopilot、PROPOSIA、Granted AI 号称把起草时间砍 60–70%。**但合规红线明确:NIH 自 2025 年 7 月起禁止在 Specific Aims/Research Strategy 用 AI 生成文本**;国自然 2026 年也在改版。低频 + 合规风险高,优先级低于 1/2。来源: [Granted AI 榜单](https://grantedai.com/blog/best-ai-grant-writing-tools-2026) · [国自然改版分析](https://zhuanlan.zhihu.com/p/1989342633034801709)

---

### 三、判断与建议(哪个最值得做成下一个一级重模式)

按「重 × 高频 × 通用聊天做得最差 × 需要 agent(跑代码+产文件+查真文献)× 平台已有基建能吃下」五维打分:

1. **数据分析与统计(第一优先)**——痛点最密、频率最高(几乎每篇论文都要)、受众最广(尤其中国医生/临床科研这一超大人群)、通用聊天的可复现性硬伤最突出、而 claw 的沙箱(Python/R + docx/xlsx/pdf 预览)天生契合;竞品(MSTATA/Julius)验证了市场但留下「黑箱/不可复现/不可审计」空白。**最该做,且差异化清晰。**
2. **系统综述/文献筛选与抽取(第二优先)**——月级耗时、价值高、通用聊天「编引用」是致命短板,而平台的 **minicod 真文献 + 可溯源引用**正是最强护城河,能一站式打通竞品都只做一段的整链。
3. **Paper→汇报/海报(第三,作为 PPT 模式延展)**——组会周级刚需 + 海报空白,但可复用现有制作PPT基建,建议作为增量而非全新方向。

投稿格式化归 Prism、rebuttal 归现有 guide/peerreview、基金申请因低频+合规暂缓。

---

## B. 中文科研用户痛点
# 中文科研用户「重而高频」痛点调研报告(claw 下一个重能力选型)

> 调研时间:2026-07;方法:21 次中文联网检索/页面抓取,覆盖知乎、澎湃、科学网、丁香园/健康界、医咖会、小木虫系内容站、LetPub/意得辑等服务商定价页。所有价格与百分比均附来源 URL。

---

## 一、中文用户特有痛点全景(vs 国际用户)

### 1. 制度性压力是「中国特色」的痛点放大器
- **医生晋升与 SCI 硬挂钩**:清华社科学院+中国医师协会 12930 份问卷(28 省)显示,**69.74% 的医师感受到「科研、发论文压力大」**,日均出诊 7.77 小时、科研仅 1.47 小时;丁香园调研 **44.5% 医务人员无法按时完成论文指标,其中 45.3% 主因是「没时间」**,仅 14.4% 能轻松完成。([健康界·近万名医师齐吐露论文压力](https://www.cn-healthcare.com/articlewm/20210506/content-1217064.html)、[健康界·SCI是否三甲晋升必选项](https://www.cn-healthcare.com/articlewm/20200720/wap-content-1131312.html))
- **国自然是青椒的「生死线」**:每年 1–3 月全国性冲刺,衍生出成熟的标书辅导市场——知乎/川观新闻上「实测 16 家国自然标书服务机构」系列软文横行,机构宣传「服务后中标率 56.8%–78.8%」、专家 1v1 修改/评估/课题设计五大件。([知乎·实测16家标书机构](https://zhuanlan.zhihu.com/p/1948426189849986563)、[川观新闻](https://cbgc.scol.com.cn/news/5961912))
- **毕业论文「双重查重」是中国高校独有新痛点**:2025 届起大量高校同时查「重复率+AIGC 率」,超标不得盲审答辩。澎湃报道原声:**「救命!查重15%,知网AIGC率却有99%,PaperYY才40%」**;同一篇论文「PaperYY 50%、PaperPass 30%、知网 25%」,「一大堆被标红『疑似AI』的文字是自己写的」——降 AI 成玄学,自检费用 35–500 元/次。([澎湃新闻](https://m.thepaper.cn/newsDetail_forward_30573507))

### 2. 语言鸿沟:英语是最普遍、最先掏钱的痛
- 中式英语(Chinglish)直接导致拒稿是社区高频话题;「中译英论文常带『中文味』」。([万维学术](https://www.wanweixueshu.com/news/detail/137263)、[沁言学术](https://www.qinyanai.com/knowledge/article/963))
- 润色按词计价 **0.5–0.6 元/词**(一篇 5000 词≈2500–3000 元),知乎常年有「润色太贵」讨论。([新浪·为什么SCI润色这么贵](https://news.sina.cn/sx/2022-10-13/detail-imqmmthc0736774.d.html)、[知乎·润色价格](https://zhuanlan.zhihu.com/p/429834445))

### 3. 统计是医科/社科用户的「硬性无能区」
- 医学生/医生普遍不会 SPSS/R,催生统计代做与天价咨询:**医咖会系服务「课题论文数据分析 5000–50000 元/篇」「毕业论文数据分析与指导 10000–50000 元/篇」「医院/科室年度数据分析 5–15 万/年」「线下统计培训 2 万/半天」**。([医咖会科研服务](https://www.mediecogroup.com/group/posts/gp_HyVf9PXA/)、[风暴统计 2025 报价](https://medsta.cn/archives/2025nian-wo-men-ti-gong-tong-ji-fu-wu-yi-yuan-lin-chuang-hu-li-shu-ju-fen-xi-ke-yu-kai-fa-piao))
- meta 分析(医生零实验发 SCI 的主流路径)一对一辅导 **2.1–2.2 万/人**(丁香公开课)。([梅斯医学培训](https://www.medsci.cn/service/show.do?id=59)、[医咖社区](https://www.mediecogroup.com/group/posts/gp_yKwRzQBj/))
- 竞品 SPSSPRO 免费在线拖拽分析,但只出「分析结果+AI解读」,不产论文级三线表/方法学段落/审稿应对。([SPSSPRO](https://www.spsspro.com/)、[知乎对比](https://www.zhihu.com/question/663758208))

### 4. 导师放养 + AI 幻觉 = 「没人教我怎么做科研」
- 「导师放养如何自救」是知乎常青问题;70% 研究生在组会 PPT 上拖延,「读了很多文献但汇报逻辑混乱被导师误认为偷懒」。([知乎·导师不指导如何自救](https://www.zhihu.com/question/393560769)、[知乎·PPT拖延症](https://zhuanlan.zhihu.com/p/352751711))
- 学生转向 DeepSeek 求救却被坑:**「DeepSeek 推荐的文献都是编造的,PubMed 根本搜不到」**,「DeepSeek 乱编文献坑惨大学生」冲上热搜。([搜狐](https://www.sohu.com/a/876816605_121956425)、[华声在线](https://m.voc.com.cn/portal/news/show?id=28244197)) → **这正是 Scholar 平台(minicod 真实文献库)的天然差异化优势**。

### 5. 投稿-返修全程「程序性折磨」
- 选刊怕预警期刊/分区错判;按期刊 guidelines 排版(图 8-9cm/17-18cm、600-1200dpi、行号、双栏)反复折腾;返修回复信「非常考究语言表达,不想改或不能改时要有艺术地辩论」,「审稿人要求补实验/补统计怎么办」是高频求助。([意得辑排版指南](https://www.editage.cn/sci-writing/6130/)、[科学网·如何回复审稿意见](https://blog.sciencenet.cn/blog-3462448-1473082.html)、[知乎·补实验](https://www.zhihu.com/question/637436629)、[CSDN·选刊工具清单](https://blog.csdn.net/paperxie_ai/article/details/155388802))

---

## 二、付费意愿最强的环节(灰产/服务商定价侧面印证)

| 环节 | 市场价格证据 | 付费人群 |
|---|---|---|
| **统计代做/咨询** | 5000–50000 元/篇;meta 辅导 2.1 万/人;科室包年 5–15 万 | 医生/医学生(最刚) |
| **国自然标书辅导** | 机构 16 家+被「实测」横评,1v1 修改万元级 | 青椒/临床医生,季节性爆发 |
| **英文润色/翻译** | 0.5–0.6 元/词,单篇 2500–3000 元 | 全体 SCI 作者,频次最高 |
| **降重/降AIGC** | 人工降重 120–200 元/千字;降 AI 2.7–8 元/千字;检测自费 35–500 元/次 | 毕业季全体学生 |
| **代写代发(灰产上限)** | 2009 年已 10 亿产值(保守);SCI 代写发 2 万–10 万/篇 | (不可做,仅证明支付能力) |

来源:[人民网·斩断论文代写产业链](http://society.people.com.cn/n1/2019/0325/c1008-30992456.html)、[知乎·人工降重收费](https://zhuanlan.zhihu.com/p/444402621)、[新浪科技·用AI降AI率](https://finance.sina.com.cn/tech/discovery/2026-05-28/doc-inhzmayt1124852.shtml)、上表各行已引来源。

---

## 三、痛点 × claw 能力匹配(会跑代码 + 产文件 + 查真文献 + 长期记忆)

| 痛点 | 跑代码 | 产文件 | 查文献(minicod) | 匹配度 |
|---|---|---|---|---|
| 统计分析 | ★★★(pandas/scipy/statsmodels/R 全在沙箱) | ★★★(三线表 docx + 图) | ★(方法学引用) | **最高** |
| 基金标书 | ★(技术路线图=已有科研绘图) | ★★★(官方模板 Word) | ★★★(立项依据引文防幻觉) | **高** |
| 投稿返修 | ★★(格式合规检查脚本) | ★★★(cover letter/response docx) | ★★★(期刊 API 已有 76 工具含投稿信息) | **高** |
| 综述/开题 | ★ | ★★★(长文档 docx) | ★★★(引文网络+真实引用) | **高** |
| 润色降重 | ★ | ★★ | ★ | 中(Prism 已覆盖润色;降AIGC 有学术诚信+政策风险,**不建议做成能力**) |

---

## 四、候选能力(按推荐优先级)

### 候选 1:统计分析工作台(暂名「数据军师」)⭐ 首推
- **形态**:claw 第三个重模式。用户上传 Excel/CSV/SPSS .sav → agent 对话式澄清研究设计(分组/结局/配对与否)→ 自动选择并解释检验方法 → 沙箱跑 Python/R → 交付「论文级」产物包:基线特征三线表(docx)、统计图(接科研绘图 matplotlib 车道)、中英双语方法学段落(Methods 直接可贴)、结果解读。返修场景:粘贴审稿人统计意见 → 补分析并生成逐条回复。
- **为什么是它**:付费天花板最高(单篇 5000–5 万)、频次高(每篇实证论文必经)、与「会跑代码+产文件」100% 同构、竞品(SPSSPRO/SPSSAU)停留在「拖拽出结果」不产论文交付物、代做服务贵且有学术诚信风险(我们做「教学式陪跑」正当性强)。
- **风险**:需明确定位为「分析助手+可复现代码」而非代做;.sav 解析(pyreadstat)、大数据集内存限额需工程处理。

### 候选 2:基金标书工作台(国自然模式)
- **形态**:向导式结构化写作:选题 gap 分析(minicod 引文网络找空白)→ 立项依据(真实文献引用,直击 DeepSeek 编文献痛点)→ 研究内容/方案 → 技术路线图(复用科研绘图 SVG 车道)→ 按官方模板出 Word + 形式审查自检清单。年度节奏:12–3 月爆发,4–8 月做「函评视角预演」(复用 peerreview lens 架构做标书模拟评审)。
- **为什么**:付费意愿极强(万元级人工辅导)、机构服务贵且质量参差、AI 标书工具全在商业招投标领域、科研标书是空白;平台已有 peerreview 多 lens 架构可直接迁移做「模拟函评」。
- **风险**:强季节性;需防「代写」观感——定位为结构化辅导+评审预演。

### 候选 3:投稿返修工场(选刊 → 合规 → cover letter → 返修信)
- **形态**:一条龙:摘要进 → minicod 期刊 API 出选刊短名单(分区/IF/审稿周期/预警过滤)→ 按目标刊 Guide for Authors 跑格式合规检查(字数/图规格/参考文献样式,代码可自动查)→ 生成 cover letter → 拒稿/返修时把 decision letter 粘进来,逐条生成 response letter(docx)+ 改稿建议。升级现有 rebuttal 轻量 guide 为重模式。
- **为什么**:平台独有筹码——76 个 minicod 工具里已含期刊投稿信息;竞品(LetPub AI 选刊/TKPaper/GoJournal)只做「选刊单点」,无人串起全链;返修回复是社区高频求助且情绪浓度最高的环节。
- **风险**:期刊 guidelines 时效性依赖 minicod 数据质量。

### 候选 4:综述/开题工作台(带真实引用的长文档 deep research)
- **形态**:主题进 → 引文网络扩展检索 → 文献矩阵(xlsx:方法/样本/结论逐篇提取)→ 对话式定提纲 → 分节生成带真实 DOI 引用的综述初稿/开题报告(docx,含参考文献表),接个人文献集。
- **为什么**:研究生第一痛(开题+综述);「AI 编造文献」热搜正是转化契机——「我们引的每一篇都能在库里点开」是最强卖点;秘塔/知网研学只做检索摘要,不产合格长文档。
- **风险**:与 smart-search、Prism、library 有重叠,需明确分工(claw 出「初稿文件」,Prism 接「精改」);AIGC 检测环境下需内置「辅助而非代写」的使用引导。

### 候选 5:组会汇报模式(论文精读 → 讲稿 + PPT)
- **形态**:上传论文 PDF 或选文献集条目 → 精读拆解(复用 paper-explain)→ 生成组会汇报 PPT(复用制作PPT 重模式)+ 演讲逐字稿 + 预判导师提问清单。
- **为什么**:周频刚需、70% 研究生 PPT 拖延;但更适合做成「制作PPT 的场景入口 + paper-explain 升级」而非独立重模式,故排最后。

### 明确不建议:降重/降AIGC 能力
付费意愿虽强(毕业季刚需),但本质是对抗学校检测系统,学术诚信与政策风险高(学位法明确 AI 代写可撤销学位),且「降 AI 率」已被媒体定性为灰产,做了伤平台品牌。([澎湃](https://m.thepaper.cn/newsDetail_forward_30573507)、[新浪科技](https://finance.sina.com.cn/tech/discovery/2026-05-28/doc-inhzmayt1124852.shtml))

---

## 五、用户原声摘录
- 「一千字两元,好贵啊!」「救命!查重15%,知网AIGC率却有99%,PaperYY才40%」「一大堆被标红『疑似AI』的文字是自己写的」——毕业生谈双重查重([澎湃](https://m.thepaper.cn/newsDetail_forward_30573507))
- 「DeepSeek 推荐的文献都是编造的,PubMed 根本搜不到」——医学生谈 AI 幻觉([搜狐](https://www.sohu.com/a/876816605_121956425))
- 69.74% 医师「科研、发论文压力大」;45.3% 完不成论文指标的首因是「没时间」——医师群体调研([健康界](https://www.cn-healthcare.com/articlewm/20210506/content-1217064.html))
- 「明明做了很多工作、读了很多文献,但汇报逻辑混乱抓不住重点,被导师误认为偷懒」——组会痛点([知乎](https://zhuanlan.zhihu.com/p/352751711))
- 「回复审稿人非常考究语言表达能力,尤其当有些观点不想改或不能改时,需要有艺术地辩论」——返修痛点([科学网](https://blog.sciencenet.cn/blog-3462448-1473082.html))

## 六、结论
**首推「统计分析工作台」为 claw 下一个重模式**:它同时命中「付费天花板最高(医科统计代做 5000–50000 元/篇)、频次高、竞品空白(无人产论文级交付物)、与 agent 能力(跑代码+产 docx/图+查文献)同构度 100%」四个条件;**次选「基金标书工作台」**(季节性爆发+万元级付费意愿+可复用 peerreview lens 架构做模拟函评);「投稿返修工场」凭 minicod 期刊数据独占性列第三。三者可共享「上传文件 → 对话澄清 → 沙箱产出交付物包」的同一交互骨架,复用制作PPT/科研绘图已验证的重模式基建。

---

## C. 国际竞品矩阵
# 国际学术 AI 工具竞品矩阵调研报告(2025-2026)

> 调研方式:20 次联网检索,覆盖 15 个指定竞品与系统综述/统计/海报等相邻赛道。目标:为 Scholar 平台 claw 找下一个「重而高频」的一级模式。

## 一、竞品逐个画像

### 1. Elicit —— 系统综述/结构化抽取的标杆
- **主打**:138M 论文语义检索、论文数据抽取成结构化表格、系统综述筛选(PRISMA 兼容)、自动报告;2026-03 上线 API 供机构嵌入。
- **定价**:Free(5000 credits)/ Plus $10-12 / Pro $49(含 Research Agents、系统综述,单综述筛 5000 篇)/ Team $79;宣称筛选+抽取省时 80%。
- **口碑**:学术圈公认最认真做系统综述的 AI 工具;吐槽集中在 credit 消耗贵。
- 来源:[Elicit Pricing](https://top50aitools.com/pricing/elicit) · [aiagentsquare](https://aiagentsquare.com/agents/elicit) · [aiproductivity](https://aiproductivity.ai/pricing/elicit/)

### 2. SciSpace —— 全家桶但口碑塌方
- **主打**:Chat with PDF、文献综述表格、写作、检测,200M 论文元数据。融资仅 $3.85M。
- **口碑(重要反面教材)**:credit 消耗不透明无法预估成本;取消后仍扣费、重复扣费;24 小时退款承诺被埋在条款里的「300 credit 门槛」架空;硬科学领域不够聪明、综述功能产出幻觉引用;客服被形容为「AI 生成式敷衍」。
- **启示**:全家桶+credit 黑箱=信任崩塌;计费透明与引用可核验是学术工具生死线。
- 来源:[Capterra 评价](https://www.capterra.com/p/178127/Scispace/reviews/) · [Tracxn 融资](https://tracxn.com/d/companies/scispace/__BgKebNxb1UNRuwBervIPD_az8snNCAA0GA1orTBDWHw)

### 3. Consensus —— 循证问答,低价走量
- **主打**:200M 论文循证搜索,Consensus Meter 显示研究结论一致度,Q1-Q4 期刊过滤。
- **定价**:免费档慷慨;Premium $8.99 / Pro $15 / 学生 $6——学术 AI 里最便宜的正经工具。
- **口碑**:好评为主,上手友好;定位「快问快答」,不做重交付。
- 来源:[Effortless Academic 评测](https://effortlessacademic.com/consensus-ai-review-for-literature-reviews/) · [tooljunction](https://www.tooljunction.io/ai-tools/consensus-ai)

### 4. scite.ai —— 引文态度数据资产
- **主打**:Smart Citations,1.6B+ 引文陈述分类为支持/反驳/提及并展示原文语境;引用可信度审计独家。
- **定价**:$12/月(年付 $144);评测认为物有所值但个人用户觉得偏贵。
- 来源:[techpoint 实测](https://techpoint.africa/guide/scite-ai-review/) · [elephas 评测](https://elephas.app/blog/scite-ai-review)

### 5. txyz —— 读搜写一体,声量小
- **主打**:读论文+搜索+写作 agent 工作流;Free / Pro $96/年 / Ultra $288/年。市场存在感弱,未见规模化口碑。
- 来源:[aipure](https://aipure.ai/products/txyz-ai) · [aichief](https://aichief.com/ai-text-tools/txyz-ai/)

### 6. Undermind —— 深检索 agent,小而美付费验证
- **主打**:MIT 量子物理 PhD 创办;3-6 分钟多跳深搜,读全文、追引文链,解决「查全率」;产综合书面报告。
- **定价**:免费 3 次/月,Pro $16-20/月 30 次深搜;GSK 1000+ 科学家及 MIT/Harvard/Caltech 用户。
- **启示**:单点「深检索报告」按次付费成立。
- 来源:[buildfastwithai](https://www.buildfastwithai.com/ai-tools/undermind) · [aivario](https://aivario.com/tools/undermind)

### 7. Jenni AI —— AI 续写,信任危机
- **主打**:学术续写+引用插入;免费 200 词/天,付费 $30/月。
- **口碑**:引用过时/标注错误、退订难、拒绝退款,写作质量被同行(Paperpal)公开对比嘲讽;学术圈信任度低。
- 来源:[allaboutai 评测](https://www.allaboutai.com/ai-reviews/jenni-ai/) · [skywork 实测](https://skywork.ai/blog/jenni-ai-review-2025-academic-citation-workflow/)

### 8. Paperpal —— 非母语润色王者,150 万用户
- **主打**:Cactus(22 年 STM 编辑积累)出品;润色、30+ 语言翻译、降重、投稿前 30+ 合规检查、250M 文献检索。
- **定价**:Prime $25/月,年付 $139(约 $11.6/月);150 万+ 用户。
- **启示**:「非母语作者投稿链路」是已被大规模验证的付费场景,且年付折扣极深换留存。
- 来源:[research.com 评测](https://research.com/software/reviews/paperpal-review) · [G2](https://www.g2.com/products/cactus-global-paperpal/reviews)

### 9. Writefull —— 被 Digital Science 收编进 Overleaf
- **主打**:学术语言反馈、Academizer/摘要生成;Premium $150/年。
- **动向**:2025-06 Digital Science 把 Writefull AI 能力(AI Assist)推给 Overleaf 2000 万用户——巨头正在把「LaTeX 内润色」变成平台标配。
- 来源:[Digital Science 发布](https://markets.financialcontent.com/publicradio/article/gnwcq-2025-6-24-digital-science-launches-new-cutting-edge-ai-writing-tools-for-20-million-overleaf-users) · [Capterra](https://www.capterra.com/p/236309/Writefull/)

### 10. Litmaps / ResearchRabbit —— 文献地图,商业化艰难
- **主打**:引文网络可视化发现文献。ResearchRabbit("科研版 Spotify")长期免费,2025-11 被 Litmaps 收购后转 freemium。
- **启示**:可视化发现是好功能但撑不起独立付费,适合作为平台内嵌能力而非主商业化方向。
- 来源:[Effortless Academic 对比](https://effortlessacademic.com/litmaps-vs-researchrabbit-vs-connected-papers-the-best-literature-review-tool-in-2025/) · [scidart 对比](https://www.scidart.com/en/blog/comprehensive-comparison-of-litmap-and-research-rabbit-for-researchers/)

### 11. NotebookLM —— 免费巨头,通用「资料问答」的天花板
- **主打**:50 源问答、音频/视频概览、思维导图;2025-10 起连发八次大升级:Deep Research、Gemini 3、幻灯片编辑+PPTX 导出、Veo 3 视频概览、Data Tables Studio。
- **定价**:Free / $7.99 / $19.99 / Ultra $99.99+。
- **启示**:「上传 PDF 问答/总结」这条路已被免费巨头碾平,不要正面做;它不接学术库、不管引文规范、不产学术交付物,这是缝隙。
- 来源:[felloai 更新汇总](https://felloai.com/notebooklm-update-1m-token-chat-goals-saved-history/) · [Effortless Academic](https://effortlessacademic.com/googles-notebooklm-updates-in-2025-for-literature-review-and-study/)

### 12. OpenAI Deep Research —— 通用深研,学术上不达标
- 学术侧公认短板:幻觉、无法区分权威与传闻、无法表达不确定性、引用达不到同行评审标准;不接 PubMed/Embase 等学术库。
- **启示**:「学术版 Deep Research」(真学术库+可核验引文)仍是通用巨头覆盖不了的地带。
- 来源:[AJN 局限分析](https://ajnoffthecharts.com/deep-research-understanding-the-limitations-of-the-latest-powerful-ai-tool-for-scholarly-authors/) · [JMIR 视角](https://www.jmir.org/2025/1/e75666) · [OpenAI System Card](https://cdn.openai.com/deep-research-system-card.pdf)

### 13. FutureHouse / PaperQA2 / Kosmos —— 「AI Scientist」资本共识
- PaperQA2 宣称文献任务超 PhD 水平;2025-11 推 Kosmos:文献 agent+数据分析 agent 双引擎,单次跑 4.2 万行代码、读 1500 篇论文,「一天=六个月科研」,80% 结论准确;商业化实体 Edison Scientific 以 $250M 估值融 $70M 种子。
- **启示**:「文献检索 + 容器跑代码做数据分析」的组合是下一代科研 AI 的资本共识——恰是 Scholar 已具备的底座形态。
- 来源:[HPCwire 报道](https://www.hpcwire.com/aiwire/2025/11/07/futurehouse-spins-out-edison-scientific-launches-kosmos-ai-for-research/) · [FutureHouse](https://www.futurehouse.org/)

### 14. Julius AI —— 对话式数据分析,$10M 种子
- **主打**:自然语言→后台写代码执行→图表/摘要;支持 CSV/Excel/数据库。Free 5 条/月,Plus $20(250 条),Pro $45 不限量;2025 年中 $10M 种子。
- **口碑**:100+ 用户实测反馈准确性尚可但需人工复核;通用向,不懂学科统计规范。
- 来源:[eesel 定价指南](https://www.eesel.ai/blog/julius-ai-pricing) · [upsolve 百人实测](https://upsolve.ai/blog/julius-ai-review)

### 15. 相邻赛道补充
- **系统综述筛选**:Covidence $339/年/单篇综述(无月付无学生折扣)仍是机构标配;Rayyan 免费 3 项目,AI Reviewer 仅机构版且不公布召回率。→ 重度付费被反复验证。[researchgold 对比](https://researchgold.org/blog/covidence-alternatives-systematic-review-tools) · [atlasworkspace](https://www.atlasworkspace.ai/blog/ai-systematic-review-tools)
- **统计工具新物种**:StatRyx「上传数据→自动选检验→验假设→直接输出 APA 结果段落」;医学界在用 GPT 复核 SPSS 结果。[statryx](https://statryx.ai/blog/best-spss-alternatives) · [PMC 研究](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12065437/)
- **科研视觉**:BioRender $35/月、Mind the Graph $15/月;paper→poster 自动生成是 2025-2026 论文热点(P2P、APEX),但工具端仅消费级产品,无学术规范无可编辑导出。[P2P](https://arxiv.org/pdf/2505.17104) · [APEX](https://arxiv.org/pdf/2601.04794) · [BioRender 定价](https://www.saasworthy.com/product/biorender/pricing)
- **基金写作**:NIH 2025-07 起禁止 AI 生成 specific aims/research strategy 正文——政策风险高,不宜做成「代写」。[OpenGrants](https://opengrants.io/best-ai-for-grant-writing/)
- **Rebuttal**:学界密集出 agent 框架(DRPG/Defend),商业工具仅 Paperpal 轻量支持。[manusights](https://manusights.com/blog/best-ai-tools-for-responding-to-reviewers)
- **大盘**:Wiley 5000 人调查:研究者 AI 使用率 2024→2025 从 45% 跳到 62%,文献阅读筛选耗时 13.5 小时/周;Nature 调查 65% 认可 AI 参与论文起草、过半研究者已在审稿环节用 AI。[Nature](https://www.nature.com/articles/d41586-025-04066-5) · [paperguide 汇总](https://paperguide.ai/blog/academic-research-ai/)

## 二、哪些方向被验证「用户愿意付费」

| 方向 | 验证者 | 价格锚点 | 强度 |
|---|---|---|---|
| 系统综述筛选/抽取 | Covidence、Elicit Pro、DistillerSR | $339/年/篇;$49/月 | ★★★ 最硬(按篇付费、机构买单) |
| 非母语润色+投稿链路 | Paperpal(150 万用户)、Writefull | $139-150/年 | ★★★ 规模最大 |
| 深检索报告 | Undermind(GSK 1000+)、Elicit | $16-49/月 | ★★ 小而美,按次心智 |
| 对话式数据分析 | Julius($10M 种子)、StatRyx | $20-45/月 | ★★ 通用已验证,学术细分空着 |
| 引文可信度 | scite | $144/年 | ★★ 依赖独家数据资产 |
| 循证问答 | Consensus | $6-15/月 | ★ 低价走量 |
| 科研视觉交付物 | BioRender、Mind the Graph | $72-420/年 | ★★ 素材订阅模式 |

## 三、拥挤区 vs 空白区

**拥挤区(勿正面进攻)**
1. Chat with PDF / 资料问答总结 —— NotebookLM 免费碾压,SciSpace/txyz 等一片红海;
2. 通用语义文献搜索 —— Consensus/Elicit/SciSpace 混战且 Scholar 已有 smart-search;
3. 纯润色 —— Paperpal/Writefull 深耕多年,且 Overleaf 平台化(Scholar 的 Prism 31 lens 已覆盖);
4. AI 续写代写 —— Jenni 式信任危机 + 期刊政策风险;
5. 基金正文代写 —— NIH 已明令禁止,政策雷区。

**空白区(结构性机会)**
1. **「检索→筛选→提取→统计→成稿」的 Meta 分析全流程** —— 现状是 4-5 个工具拼接,无一家有代码执行能力把统计环节接上;
2. **懂出版规范的统计分析 agent** —— Julius 通用不懂三线表/APA/医学统计规范,StatRyx 太浅;
3. **学术级 paper→poster/graphical abstract** —— 论文热点已证可行,产品端只有不懂学术的消费级工具;
4. **学术版 Deep Research** —— OpenAI 不接学术库,Undermind 未进中文市场;
5. **审稿-返修-回复信闭环** —— 商业工具几乎空白,且 Scholar 独有 peerreview+Prism 可串联。

## 四、对 Scholar(agent 容器能跑代码产文件)的差异化裁决

竞品矩阵里绝大多数玩家是「LLM + 检索 API」的轻架构,**没有代码执行沙箱**——这正是 Scholar claw(bwrap 容器跑 Python/R/Node、产 docx/xlsx/pptx/pdf、minicod 76 工具、内联出图)的护城河。资本市场对此已投票:FutureHouse Kosmos「文献 agent + 数据分析 agent」= Edison $250M 估值的核心叙事,而 Scholar 的底座形态与之同构。

**首选:Meta 分析·系统综述工作台**(重、高频、付费最硬、竞品结构性缺位)——minicod 管检索、agent 管筛选提取、容器跑 metafor/森林图/漏斗图/PRISMA 流程图、产 docx 结果章节;瞄准中文医学生/医生这一国内最强付费科研人群,对标 Covidence $339/年的价格锚。

**次选:出版级统计分析**(数据上传→选检验→跑代码→三线表+方法学文字)——与 Meta 分析共用容器统计能力,可先作为其子能力孵化再独立成模式。

**第三:学术海报 Poster 生成**——复用「制作PPT + 科研绘图」两条现成管线,边际成本最低,会议季爆发;纯排版不碰生成式图像,与 Nature 政策一致。

**第二梯队:深研报告模式**(升级 smart-search 而非新模式)与 **Rebuttal 重模式**(串联 peerreview+Prism,频次偏低缓做)。

**反面清单**(来自竞品血泪):credit 黑箱计费(SciSpace 之死)、引用不可核验(Jenni 之踵)、承诺退款不兑现;做 Meta 分析必须每条结论挂 DOI 可回溯,计费必须可预估。

---

## D. 国内竞品矩阵
# 国内学术 AI 工具竞品调研报告(2026-07)

> 调研方式:24 次中文联网检索,覆盖任务指定的全部竞品 + 2025-2026 新出科研 agent 产品。目标:为 claw 寻找下一个「重而高频」的一级模式(对标 制作PPT / 科研绘图)。

---

## 一、竞品逐个盘点

### 1. 秘塔AI搜索(学术/研究模式)
- **主打**:中英文学术库检索(覆盖数千万篇 OA 论文)、按期刊权威度排名、三档模式(简洁/深入/深度研究),2025-07 上线 DeepResearch,可生成结构化报告 + 思维导图,"内容堪比一篇小论文"。
- **定价**:免费 100 点/天(约 4-5 次深度研究);年费会员约 179 元(500 点/天);API 0.03 元/次。千万月活。
- **口碑**:学术检索精准、免费好用是主基调;知网曾发 28 页文件控诉其抓取,内容版权存争议。
- **与我们重合**:与 smart-search 高度重合;其「深度研究→结构化报告」形态是我们尚未产品化的部分。
- 来源:[搜狐](https://www.sohu.com/a/966584134_121956424) · [秘塔+DeepSeek R1 评测](https://zhuanlan.zhihu.com/p/21366001536) · [定价](https://www.sohu.com/a/964558635_122496371) · [秘塔上线DeepResearch](https://finance.sina.com.cn/cj/2025-07-15/doc-inffpfvy7317596.shtml) · [知网控诉](https://news.qq.com/rain/a/20240819A090JS00)

### 2. Kimi(月之暗面)
- **主打**:超长上下文批量读 PDF 文献;论文全流程提示词玩法(选题/框架/综述/扩写/润色/参考文献格式化);2025 推 Kimi+ 学术专属模式与 Deep Research(自动任务拆解、多轮搜索)。
- **定价**:主功能免费,靠会员/额度变现。
- **口碑**:大学生使用率 Top3 的论文辅助工具,"打工神器";但深度垂直能力(统计、格式合规)弱。
- **与我们重合**:与 claw 通用对话 + 文献阅读重合度高;无沙箱产出 docx/pptx 的交付能力。
- 来源:[Kimi论文写作全攻略](https://zhuanlan.zhihu.com/p/1913337653132264703) · [Kimi-Researcher评测](https://blog.csdn.net/nal/article/details/149533345) · [CSDN实测](https://blog.csdn.net/qq_64378896/article/details/145774154)

### 3. 豆包(字节)
- **主打**:通用助手,选题推荐、摘要、初稿;免费。
- **口碑**:"生成内容详细但机械,像拼凑的文献合集";常见玩法是"豆包+知网 30 分钟出初稿",定位辅助。
- **重合**:低-中;是流量入口型通用产品,不做科研纵深。
- 来源:[知乎](https://zhuanlan.zhihu.com/p/731031254) · [DeepSeek/豆包/笔灵对比](https://blog.csdn.net/EdwardAITooL/article/details/147123607)

### 4. DeepSeek(科研用法)
- **主打**:免费满血推理模型;科研人用于代码、统计思路、润色、数据清洗与可视化建议;高校大量接入(WPS365+DeepSeek 进清华等)。
- **口碑**:能力强但"第一批科研受害者已出现"——编造文献引用、幻觉是最大投诉点;它是模型不是科研工作流产品。
- **重合**:claw 的底座能力与之同型,但我们有沙箱真跑代码 + 真文献 API,恰好是 DeepSeek 幻觉痛点的解法。
- 来源:[全流程赋能研究生](https://blog.csdn.net/u014180504/article/details/146222702) · [科研受害者](https://hub.baai.ac.cn/view/44240) · [数据分析用法](https://blog.csdn.net/Interview_TC/article/details/145650307)

### 5. 知网 AI 学术研究助手(CNKI AI for Academic)
- **主打**:AI 增强检索 / AI 辅助研读(单篇问答、伴读、全文翻译)/ AI 辅助创作(润色批改)/「苹果树」智能体,四大体系;绑定中文权威文献库垄断。
- **定价**:主走高校机构采购试用;个人分免费/平台会员/AI会员,签到积分兑换。
- **口碑**:高校图书馆大面积开通试用,机构侧渗透强;个人端体验一般、会员体系复杂。
- **重合**:文献检索/研读侧与 smart-search、claw guides 重合;中文库是其护城河(我们走 minicod 英文为主)。
- 来源:[AI工具集](https://ai-bot.cn/cnki-ai-for-academic/) · [上海大学图书馆](https://lib.shu.edu.cn/info/1023/5444.htm) · [南大图书馆](https://lib.nju.edu.cn/info/1013/3849.htm)

### 6. 百度橙篇
- **主打**:超长图文理解与创作(号称首个研报/论文级长文工具),100 个文件、万字长文一键生成、参考文献可溯源、学术检索(100 多万国内学术站点)。
- **定价**:免费+文库会员。
- **口碑**:能力全但"生成需等 10 分钟"、内容模板化;更像文库流量产品。
- **重合**:长文写作与 Prism 部分重合;非 LaTeX、非 agent。
- 来源:[AI工具集](https://ai-bot.cn/sites/12962.html) · [CSDN评测](https://blog.csdn.net/weixin_40780178/article/details/141671482)

### 7. 文小言(百度)
- **主打**:通用助手,支持 2-3 万字毕业论文一键生成、文档解析。
- **口碑**:检索覆盖广,但"深度专业领域理解不足";学术只是其场景之一。重合低。
- 来源:[知乎首测](https://zhuanlan.zhihu.com/p/718592527) · [四家对比](https://blog.csdn.net/2401_85375298/article/details/143936449)

### 8. WPS AI / 灵犀
- **主打**:office 原生智能体:搜全网、读文档、AI 写作/润色、AI PPT、数据分析;教育版免费,联合 DeepSeek 进高校。
- **定价**:内测免费,社区普遍预期将并入会员体系收费。
- **口碑**:办公场景顺手,论文润色"几分钟搞定";但学术纵深浅(无文献库、无统计规范)。
- **重合**:文档交付(docx/PPT)与 claw 产出能力重合;它赢在 office 入口,我们赢在科研纵深。
- 来源:[AI工具集](https://ai-bot.cn/sites/17620.html) · [清华WPS365+DeepSeek](https://its.tsinghua.edu.cn/__local/5/45/0D/8361A483B2F98C194547F4A351A_3715872D_2FED51.pdf) · [WPS社区收费讨论](https://bbs.wps.cn/topic/41296)

### 9. 讯飞星火 / 星火科研助手
- **主打**:联合中科院文献情报中心;成果调研(arXiv 订阅+综述生成)、论文研读(多篇对比问答)、学术写作(翻译润色);2.0 加论文预审、降重、查 AIGC 率。
- **定价**:面向机构(中科院全院开通)+个人免费额度。
- **口碑**:官方称调研效率提升 10 倍、研读有效率/写作采纳率 90%+;机构背书强,个人端存在感一般。
- **重合**:与 smart-search+Prism lens 组合重合度中等。
- 来源:[官网](https://paper.xfyun.cn/) · [中科院开通](https://las.cas.cn/news/fwcx/202311/t20231103_6915220.html) · [极客公园](https://www.geekpark.net/news/342541)

### 10. 笔灵 / 茅茅虫 / 66论文(论文商单工具带)
- **主打**:大纲→初稿→降重→去 AI 痕→答辩 PPT 一条龙,按篇付费。
- **定价(付费验证最硬)**:66论文 10 元/千字;茅茅虫套餐 229.99-629.99 元(开题报告+论文+答辩PPT 打包,还有"4人宿舍餐");笔灵降 AI 3 元/千字。
- **口碑**:毕业季销量大、质量口碑一般("怕延毕"焦虑营销);学术圈鄙视但市场真实存在。
- **重合**:与 Prism/claw 定位错位(我们面向真科研,不做代写);但其付费结构证明「按交付物打包收费」在学生市场成立。
- 来源:[茅茅虫定价](https://openi.cn/sites/112886.html) · [66论文](https://www.ai138.com/link/2862.html) · [四家对比](https://www.66paper.cn/article/622.html)

### 11. SPSSAU / SPSSPRO(在线统计)
- **主打**:网页拖拽式统计分析,约 500 类方法+智能文字解读,SPSSAU 有医学统计专区(含 SPSS 没有的算法);SPSSPRO 免费、主打数学建模竞赛。
- **定价**:SPSSAU 免费版仅分析前 100 行;日会员 9.8 元起,周/月/年会员含人工咨询——**付费验证成立**。
- **口碑**:"傻瓜易懂零学习成本"是卖点;但用户仍需自己知道选什么方法,SPSSAU"限制不严格,跑通了结果可能是错的"(知乎),解读文字机械、离"能写进论文"有距离。
- **重合**:目前为零——这是我们版图上最大的空白面。claw 沙箱能跑 Python(pandas/scipy/statsmodels),天然可做「agent 化的 SPSSAU」。
- 来源:[知乎对比](https://www.zhihu.com/question/663758208) · [SPSSAU会员](https://spssau.com/memberservice.html) · [数学建模讨论](https://www.zhihu.com/question/553132863)

### 12. 研读 Scholaread(靠岸学术)
- **主打**:英文文献对照翻译阅读器(重排模式、逐段对照、图表翻译、Zotero 同步、多端)。
- **口碑**:App Store 4.6 分(1138 评分),"用过就离不开";订阅制,付费验证成立。
- **重合**:与 claw paper-explain guide 部分重合;文献翻译阅读已是成熟红海。
- 来源:[App Store](https://apps.apple.com/cn/app/id6473978803) · [知乎](https://zhuanlan.zhihu.com/p/677461715)

### 13. 飞书妙记 / 通义听悟(录音转写类)
- **主打**:音视频转写、声纹分发言人、纪要待办;通义听悟是独立转写产品中体验最佳。
- **口碑**:职场向成熟;科研组会是其顺带场景,无学术纵深(不懂术语、不接文献)。
- **重合**:零;但需要音频管线,与 claw 文本/文件形态不匹配,优先级低。
- 来源:[飞书妙记](https://www.feishu.cn/product/minutes) · [腾讯网对比](https://news.qq.com/rain/a/20230811A00U5100)

### 14. 知乎直答·专业搜索
- **主打**:接入 5000 万篇正版论文(维普等)+4 万本杂志,可溯源问答;配套「知识会员」30 元/月。
- **意义**:证明**学术检索问答可以直接收订阅费**。与 smart-search 重合。
- 来源:[量子位实测](https://www.qbitai.com/2024/11/214459.html) · [网易](https://www.163.com/dy/article/JFRBL7FU0511CPVM.html)

### 15. 2025-2026 科研 agent 新趋势
- **通用 agent**:Manus 爆火、字节扣子空间(任务拆解→查资料→写报告→做图表/网页/PPT)、Kimi/秘塔 DeepResearch——2025 被称 agent 元年;但通用 agent 做科研任务"归纳强、专业浅",不懂统计规范/引用规范。
- **科研垂直**:知乎出现「10 大 AI 科研 Agent Skills,从读文献到申基金全打通」这类内容,垂直科研 agent 心智正在形成,但尚无占据心智的国产产品——**窗口期**。
- **医学 Meta 分析 AI**:「AI自动Meta」等产品声称文献筛选→数据抽取全自动、"1 天写完 Meta";sohu 软文密集投放,说明医生科研市场需求旺盛、供给以营销课+半自动工具为主,质量参差。
- 来源:[扣子空间](https://zhuanlan.zhihu.com/p/38753842617) · [每经实测](https://www.nbd.com.cn/articles/2025-04-22/3843168.html) · [十大Agent](https://zhuanlan.zhihu.com/p/1897694014251173715) · [AI自动Meta](https://zhuanlan.zhihu.com/p/21362800991) · [Meta分析AI教程](https://www.sohu.com/a/856576755_121118947) · [AI科研Agent Skills](https://zhuanlan.zhihu.com/p/2047437434770796612)

### 16. 周边高痛点带(工具化竞品)
- **降 AIGC 率**:2026 毕业季超级痛点——高校强制查 AIGC 率、误判高发(自己写的被判 97%),付费工具 3-8 元/千字成灰色产业带;政策与伦理风险高。来源:[京报网](https://news.bjd.com.cn/2026/05/21/11758506.shtml) · [横评](https://www.cnblogs.com/humanizeai/p/19658336)
- **国自然/课题标书**:2026 申请书**底层结构大改版**(立项依据/研究内容/研究基础三段式)+ 新增 **AI 使用如实声明**模块;现有 AI 标书工具最大痛点是"一本正经胡说八道",在评审中致命;写标书是公认的"慢活细活难活",付费意愿极高。来源:[科学指南针解读](https://www.shiyanjia.com/knowledge/articleinfo-9185.html) · [AI声明合规](https://zhuanlan.zhihu.com/p/2015814613111939852) · [LetPub讨论](https://www.letpub.com.cn/index.php?page=grant_article_details&article_id=1314)
- **课题申报书/开题报告 AI**:易笔AI、68爱写等长尾工具,支持技术路线图、按篇收费,SEO 软文密集——学生/青椒需求真实。来源:[68爱写横评](https://www.68aixie.com/article/747.html)
- **选刊/投稿**:LetPub、艾思科蓝免费 AI 选刊引流;我们 minicod 已有期刊投稿数据,smart-search 可覆盖。来源:[艾思科蓝](https://www.ais.cn/journal/match) · [LetPub](https://www.letpub.com.cn/index.php?page=journal_selection)
- **审稿回复**:科研者之家(回复信模板库)、爱改写(回复生成器)——全是轻工具/模板,无"上传审稿意见+原稿→逐点回复+改稿 diff"的 agent 化产品。来源:[爱改写](https://www.aigaixie.com/x-review-response-generator) · [科研者之家介绍](https://www.sohu.com/a/799469299_121124347)
- **问卷/量表**:问卷星 AI 可出图文数据报告,但"缺学术量表库、结果无法转化为论文中的测量工具描述"——社科论文链路半空白。来源:[问卷星AI](https://www.wjx.cn/app/themehtml/wjxai.aspx) · [CSDN横评](https://blog.csdn.net/hongzhishuai/article/details/155912751)

---

## 二、市场格局判断

### 已卷成红海(不建议正面进入)
| 领域 | 玩家 | 说明 |
|---|---|---|
| 学术检索/问答 | 秘塔、知网AI、知乎直答、星火、橙篇 | 免费+大厂+版权库,我们 smart-search 已在做,不必再加码新模式 |
| 论文初稿生成/降重 | 笔灵、茅茅虫、66论文、文小言 | 销量大但口碑差、学术声誉风险,与平台定位冲突 |
| 文献综述一键生成 | Aibiye、秒篇、小鱼AI、星火 | 同质化严重,15-20 分钟出万字综述 |
| 文献翻译阅读 | Scholaread、知云等 | 成熟订阅产品,4.6 分高满意度 |
| 答辩/学术 PPT | 茅茅虫、AiPPT、WPS | 我们「制作PPT」已覆盖且更强(可编辑 pptx+公式) |
| 通用 DeepResearch | 秘塔、Kimi、扣子空间、Manus | 大厂免费轰炸 |

### 付费已验证成立的模式
- 按交付物打包:茅茅虫 229-630 元套餐(开题+论文+答辩PPT)
- 按千字计费:66论文 10 元/千字、降AI 3-8 元/千字
- 统计工具会员:SPSSAU 9.8 元/天起(免费限 100 行卡脖子)
- 学术订阅:知乎直答知识会员 30 元/月、秘塔 179 元/年、Scholaread 订阅、医咖会会员
- 结论:**科研用户愿意为「直接能用的交付物」和「按次解卡」付费**,与 claw 的 token/额度体系兼容。

### 空白/半空白(机会带)
1. **数据统计分析的 agent 化**:SPSSAU 是"点选工具"(要自己懂方法、结果解读机械),通用 agent 不懂统计规范,DeepSeek 只给思路不真跑。「上传数据→自动选方法→真跑代码→三线表/出版级图/方法学与结果段落」无人做成 agent 产品。
2. **Meta 分析/循证工作台**:医生刚需、单价高,现有供给=营销课+半自动工具,无严肃产品。
3. **基金标书工作台**:2026 改版+AI 声明合规窗口;现有工具因幻觉在评审中致命,「真文献支撑+合规声明」是差异化。
4. **审稿返修工作台**:竞品只有模板库,无 agent 化逐点回复+改稿。
5. **社科问卷→论文链路**:量表库+信效度+论文化输出,半空白。

---

## 三、结论:claw 下一个重能力候选(推荐排序)

**首推「智能数据分析」(候选1)**:唯一同时满足「重(多步工作流+真代码执行+多文件交付)+高频(几乎每篇实证论文都要)+空白(无 agent 化竞品)+能力对口(沙箱 Python/xlsx/docx/科研绘图车道复用)+付费已被 SPSSAU 验证」五条的方向。候选2(Meta 分析)可作为其医学纵深的第二期;候选3(标书)重且付费意愿最高但强季节性;候选4(审稿返修)可由现有 rebuttal guide 升级,成本最低。降 AIGC 方向付费虽验证但政策/伦理风险高,明确不建议。

---

## E. 学术可视化交付物
# 学术可视化交付物:claw 下一个重能力方向调研报告

> 调研时间 2026-07;方法:中英文联网检索 22 次,覆盖 6 个候选方向的用户量、竞品现状、差评点与合规红线。

## 总览结论

| 方向 | 频次 | 模板化程度 | 合规风险 | 竞品空白 | 判断 |
|---|---|---|---|---|---|
| 1. 学术会议海报 poster | 高(每会议一张,人手一份) | 极强(IMRaD/BetterPoster 定式) | 无 | 大(导出质量普遍差) | **首选重模式** |
| 2. 图文摘要 graphical abstract | 高(投稿伴生,Elsevier/Cell 系普遍要求) | 强(左因右果单页版式) | 中(须走矢量组装,避生成式图像) | 大(BioRender 贵+许可争议) | **次选,与 poster 同引擎** |
| 3. 答辩/组会 PPT | 极高(周更) | 强 | 无 | 中(通用工具公式/引用/幻觉三大伤) | 强化既有「制作PPT」,非新模式 |
| 4. video abstract | 低(单篇一次且可选) | 弱 | 中 | 外包 $1500/条 | 远期观望,可先出「脚本+分镜」轻能力 |
| 5. 图表美化+三线表 | 高 | 强 | 无 | 中 | 轻能力/并入科研绘图 |
| 6. 期刊封面图 | 低 | 弱(艺术创意) | **高(生成式图像红线正中靶心)** | 人工代做市场 | **不做** |

---

## 方向一:学术会议海报(推荐为下一个重模式)

**痛点强度**:全球性痛点已被 #BetterPoster 运动验证——传统海报要求读者「站着读 10 分钟」,院系间代代相传的密集 PPT 模板是根因([Inside Higher Ed](https://www.insidehighered.com/news/2019/06/24/theres-movement-better-scientific-posters-are-they-really-better)、[The Publication Plan 访谈 Morrison](https://thepublicationplan.com/2020/08/25/what-is-the-optimal-design-for-a-scientific-poster-insights-from-the-founder-of-the-betterposter-movement/))。中文侧痛点集中在:尺寸/分辨率/横竖版要先问会务、长论文压缩成一页、工具(AI/PS/InDesign)学习成本高最后回到 PPT 手排([研飞指南](https://help.ivysci.com/guide/poster.html)、[CSDN](https://blog.csdn.net/sxf1061700625/article/details/132060619)、[知乎模板帖 300 模板+200 范例的收藏热度](https://zhuanlan.zhihu.com/p/416938594))。

**竞品与空白**:AI poster 工具已成赛道——ChatSlide(自称 750+ 大学在用,2 分钟出 A0/36×48 结构化海报,导 PPTX/PDF)、Mew Design、SciDraw(卖点是可编辑 SVG 导出)、Veeso、MolyPix、Poster.sh、SciSpace agents([ChatSlide 指南](https://www.chatslide.ai/guides/research-poster-presentation-ai-guide)、[SciDraw](https://sci-draw.com/blog/best-ai-scientific-poster-generator-2026)、[Poster.sh](https://poster.sh/zh/academic-posters))。但社区口碑综述指出通病:**导出即碎——字体替换、布局重叠、pptx 实为「一张图」不可编辑;内容幻觉编造论文标题/DOI;模板脸**([Reddit 500+ 评论分析](https://www.slidegmm.ai/en/blog/reddit-ai-presentation-tools-analysis-2026)、[Slidely 汇总](https://slidely.ai/blog/what-reddit-actually-says-about-the-best-ai-tools-for-powerpoint))。

**技术可行性已被开源验证**:PosterAgent/Paper2Poster(2025 开源)把 22 页论文转成**可编辑 .pptx** 海报,GPT-4o 成本 $0.55、开源模型 $0.0045,VLM 评测 3.72/5 接近人工水平([量子位](https://www.qbitai.com/2025/06/290507.html)、[知乎](https://zhuanlan.zhihu.com/p/1913279962527556794));更有 Posterskill 直接以 **Claude Code Skill** 形态做海报(单 HTML 拖拽编辑+导 PDF)([新浪](https://www.sina.cn/news/detail/5277514969646984.html))——与 claw 的 Claude Code 底座同构,先例现成。

**为什么适合 claw**:海报 = 单页大版面 pptx/PDF,与已上线「制作PPT」的可编辑 pptx 管线、KaTeX 公式、引用、SciCharts 主题、科研绘图三车道复用度极高;minicod 引文核查可直接杜绝竞品的「编造 DOI」硬伤;示意图走 SVG 车道无 AI 图像合规问题。

## 方向二:图文摘要 Graphical Abstract(次选,同引擎顺产)

**需求趋势**:Elsevier 全线提供 GA 通道、Cell 主刊**强制**、Cell Reports 强烈建议且多数刊发论文都带;医学口叫 visual abstract,基础科学/化学叫 graphical abstract,均在扩散([Elsevier 官方](https://www.elsevier.com/researcher/author/tools-and-resources/graphical-abstract)、[Cell Press GA 指南 PDF](https://www.cell.com/pb/assets/raw/shared/figureguidelines/GA_guide.pdf)、[SciDraw 按刊要求汇总](https://sci-draw.com/blog/graphical-abstract-requirements-by-journal))。中文侧 LetPub 等长期卖 GA 人工代做服务,证明付费意愿([LetPub](https://letpub.com.cn/index.php?page=graphical_abstract))。

**竞品与空白**:BioRender 是标杆(400 万用户、40k 图标)但**个人学术版 $35-39/月、lab 版 $99-129/月,免费版禁止发表**;近两年因「学术许可与 CC-BY 开放获取冲突」陷入版权争议,PhD 群体普遍抱怨 $420/年不值([Natomy 分析](https://www.natomy.com/blog/biorender-pricing-limitations-alternatives)、[FigureGuild](https://figureguild.com/blog/biorender-alternatives)、[SaaSworthy 定价](https://www.saasworthy.com/product/biorender/pricing)、[BioRender 官方定价](https://www.biorender.com/pricing))。AI 生成类(FigureGuild/ConceptViz/Mind the Graph)在涌现但多为图像输出,可编辑矢量+学术准确性是空白。

**合规红线(关键)**:Springer Nature 明文「**生成式 AI 图像不允许发表**」,人类作者须对图形完整性负全责([FigureLabs 政策汇总](https://www.figurelabs.ai/blog/ai-figures-journal-policies-2026)、[CSHL LibGuide](https://cshl.libguides.com/aitools/aijournalpolicies))。因此 GA 必须走**矢量组装路线**(SVG + bioicons 图标库 + 流程箭头,agent 写图形代码、人可逐元素验证/编辑),与平台已确立的「不做图像生成」立场完全一致——这反而是对 BioRender 式手工组装的降维:同样合规,但由 agent 从摘要自动起稿。

## 方向三:答辩/组会 PPT(强化既有模式,不立新模式)

组会周更+文献汇报+开题+答辩是中文研究生最高频交付物,中文互联网已有大量「上传论文→组会/答辩 PPT」垂直工具(Acadwrite、Paperxie、笔灵等)做内容营销([Acadwrite](https://acadwrite.cn/learn/group-meeting-ppt)、[知乎](https://zhuanlan.zhihu.com/p/1908172146917766799))。通用工具在学术场景的三大差评:①公式弱(Gamma 仅 KaTeX 手输,[Gamma 社区](https://community.gamma.app/x/questions/etjnajkmqw4t/does-gamma-support-latex-for-equations));②模板脸+内容/颜值不可兼得(AiPPT 颜值高内容差、Kimi 内容好颜值差,[知乎 12 款实测](https://zhuanlan.zhihu.com/p/715157730)、[ezone 实测](https://ezone.hk/article/20059005/%E5%AF%A6%E6%B8%AC-ai-ppt%E8%87%AA%E5%8B%95%E7%94%9F%E6%88%90%E5%B7%A5%E5%85%B7-gamma-kimi-%E9%80%9A%E7%BE%A9-%E6%B8%85%E8%A8%80-ai%E8%BE%A6%E5%85%AC%E5%AE%A4));③幻觉编造文献([Reddit 分析](https://www.slidegmm.ai/en/blog/reddit-ai-presentation-tools-analysis-2026))。claw「制作PPT」已解决公式/引用/图表,缺的是「上传论文 PDF → 组会汇报/开题/答辩」的场景化入口与叙事模板,属于既有模式深耕。数学重学科另有 Beamer 生态(公式/定理编号优势,[LaTeXWriter 对比](https://latexwriter.com/blog/beamer-vs-powerpoint-latex-academic-presentations)),claw 具备 LaTeX 能力,可作差异化选项。

## 方向四:Video Abstract(远期观望)

效果有实证:带视频摘要文章 views 最高 +112%、某些刊 citations +201%([MDPI Encyclopedia](https://encyclopedia.pub/insights/breaking-out-of-the-database-how-video-abstracts-amplify-research-impact));PLOS One 对照研究显示 video abstract 传播效果优于 graphical abstract([PLOS One](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0224697))。期刊多为「鼓励可选」(Dove/IOP/JCI 等有格式规范,[Enago 汇总](https://www.enago.com/academy/video-abstract-formats-journal-requirements/));外包昂贵(ACS $1500/条、行业 $1000-5000/分钟,[ACS](https://authoringservices.acs.org/promotional-services))。但对平台而言:单篇一次且可选=低频,沙箱内视频渲染+配音管线重,中文期刊几乎无此要求,且 AI 生成画面同样擦合规边。建议只做轻能力(脚本+分镜+关键帧 SVG),不立重模式。

## 方向五:图表美化与三线表(轻能力吸收)

三线表是 GB/T 7713.1 学位论文国标与中文期刊普遍要求,Word 手调线宽/格式刷是高频小痛([知乎](https://zhuanlan.zhihu.com/p/613661499));顶刊风格图表(SciencePlots/配色)需求大([CSDN](https://blog.csdn.net/weixin_39653948/article/details/106395917)、[X-MOL Nature 同款教程](https://www.x-mol.com/news/17643));多面板组图拼版被学界确认「耗时易错、须逐刊对 DPI/字号规范」,新工具 EasyFigAssembler(bioRxiv 2025)、FigureGuild 正在补位([bioRxiv](https://www.biorxiv.org/content/10.1101/2025.10.01.679913.full.pdf)、[FigureGuild](https://figureguild.com/multi-panel-figure-creator))。这些与「科研绘图」模式天然相邻:组图拼版可做科研绘图第四车道,三线表可做 claw guide 或并入 Prism,不值得独立重模式。

## 方向六:期刊封面图(明确不做)

封面图市场存在(LetPub 专业代做、初稿含 4 次免费修改;高校对封面文章有奖励惯例,[LetPub](https://www.letpub.com.cn/index.php?page=journal_cover)),但它是六个方向中**唯一正面撞上合规红线**的:封面恰是最依赖照片级/艺术级生成图像的场景,而 Springer Nature 明令生成式 AI 图像不得发表([FigureLabs](https://www.figurelabs.ai/blog/ai-figures-journal-policies-2026)),平台又已刻意不做图像生成;且单用户低频。最多在科研绘图内提供「封面概念矢量草图 + 给设计师的 brief」辅助,不立能力。

---

## 落地建议(优先级)

1. **P0 新重模式「学术海报」**:上传论文/结论要点 → 可编辑 pptx(A0/A1/48×36 横竖版)+ 打印级 PDF;内置传统 IMRaD 版式与 #BetterPoster 版式双模板;图表复用科研绘图三车道,引用走 minicod 核查(直击竞品幻觉硬伤);会议规范(尺寸/DPI)开场即问。复用「制作PPT」管线,增量成本低。
2. **P1 同引擎扩展「图文摘要 GA」**:摘要 → 单页矢量版面(SVG/bioicons 组装,导出 SVG+PPTX+按刊尺寸 TIFF/PNG),文案明确「矢量组装、非生成式图像、逐元素可验证」以立合规人设;对标 BioRender 的价格与许可痛点。
3. **P1 场景强化**:「制作PPT」加「组会汇报/开题/答辩」upload-paper 入口与叙事骨架;可选 Beamer 输出。
4. **P2 轻能力**:三线表规范化(docx/LaTeX)入 guides;组图拼版+期刊 figure 规范检查入科研绘图。
5. **不做**:期刊封面图(合规红线)、video abstract 重管线(留脚本/分镜轻能力观察)。

---

## F. 数据分析/统计方向
## claw 下一个重能力调研:科研数据分析 / 统计方向

### 一句话结论
科研统计是一个「人群极大 · 单点极痛 · 通用聊天工具够不着」的黄金场景。一个**沙箱里真跑 pandas/scipy/statsmodels、产出图+表+可下载可复现报告**的 agent,对 ChatGPT/DeepSeek/Julius 这类「预测 token 或黑箱跑数」的工具存在结构性碾压点:**数值真实(不编造)、可复现(导出脚本)、数据不出平台(合规)、并能把统计方法学 know-how 通过 skill 内置成「守门人」**。这正好复用 claw 现有的 bwrap 沙箱 + Python 运行 + 前端 docx/xlsx/pdf 预览 + 学术图表主题,落地成本低、差异化高。

---

### 一、科研统计求助到底有多痛(人群 × 痛感)

**人群规模是「全体做研究的人」量级,不是小众:**
- SPSSAU 早在 2018 年就累计 **200 万用户**,当前覆盖全国 **95% 的 3000+ 高校,100% 覆盖 985/211**([SPSSAU 关于我们](https://spssau.com/About_us.html))。SPSSPRO 自称被 1500+ 高校采用([SPSSPRO](https://www.spsspro.com/))。这两个「在线 SPSS」的体量,直接标出了「不会/不想装 SPSS 但必须做统计」的刚需人群。
- 问卷星内置 SPSS 分析服务(信度、效度、T 检验、方差、回归),但**免费版最多分析 1000 份、企业版 2000 份、超 1 万份直接隐藏高级分析入口**([问卷星 SPSS 分析帮助](https://www.wjx.cn/help/help.aspx?helpid=562))——说明问卷/量表分析是高频标准化需求,且现有工具有明确天花板。
- 医咖会(临床研究学习平台)沉淀了**几百篇统计教程**、GraphPad/SPSS/Stata/R 全覆盖,专门服务医生做科研([医咖会](https://www.mediecogroup.com/))。生态越繁荣,越反证「医生普遍卡在统计」。

**痛感来自「不会选方法 + 选错就被拒稿」:**
- 医学统计选方法本身就难:要区分计数/计量资料、判断正态性方差齐性、再决定 t 检验 / 方差分析 / 非参 / 两两比较([医学 SCI 统计学处理](https://zhuanlan.zhihu.com/p/264359266))。
- 高影响因子期刊的审稿人明确指出:**未做方法学咨询的稿件被「不送审直接拒」的比例 71% vs 57%**,常见死因是「违反模型前提假设、未校正多重比较、未处理聚类/缺失、样本量/效能不足」([BMC Research Notes: Common statistical and research design problems](https://link.springer.com/article/10.1186/1756-0500-4-304);[Ten common statistical mistakes](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6785265/))。根因是「多数医学研究者缺统计训练,又没跟统计学家合作」——这正是 AI 能补位的缺口。

**灰色代做市场证明「有人愿意花钱买这段活」,但踩学术红线:**
- 淘宝上「只做数据分析那一段」约 **400 元**,本科整篇代写约 450 元([中新网:代写隐患](https://www.chinanews.com.cn/sh/2026/03-18/10588606.shtml);[澎湃:网购毕业设计](https://www.thepaper.cn/newsDetail_forward_2233119))。
- 但教育部明令**代写/伪造数据属学术不端,可撤销学位**([同上])。这给产品划了红线:合规定位必须是「辅助 + 透明 + 可复现」,而不是「黑箱代做」。

---

### 二、通用聊天工具跑数据的真实短板(碾压点从哪来)

| 工具 | 关键短板(有据) |
|---|---|
| **DeepSeek** | 专家模式**不能传文件**;网页端「不真跑代码,只预测 token 输出」——简单单表 80–90% 准确、**复杂多表 < 60%**([知乎实测](https://zhuanlan.zhihu.com/p/31799319012);[实在智能](https://www.ai-indeed.com/encyclopedia/20907.html)) |
| **ChatGPT Advanced Data Analysis** | 真跑 Python 且**能看代码(透明)**,但:文件 ≤100MB、单任务 **60 秒超时**、只 Python、顺序执行、几百 MB 就 OOM、生成代码质量参差([Codecademy](https://www.codecademy.com/article/how-to-use-chat-gpt-advanced-data-analysis);[InfiniSynapse](https://infinisynapse.com/en/blog/chatgpt-data-analysis-limit)) |
| **Julius AI** | 面向非技术用户体验好,但**高级统计建模能力弱**、复杂统计/预测/ML「**幻觉风险太高,不适合别人要依赖的定量工作**」、慢、有月度用量上限;**架构不保证可复现(跨会话代码不同)**([Effortless Academic](https://effortlessacademic.com/julius-ai-in-depth-review/);[Fastero 对比](https://fastero.com/compare/julius-vs-chatgpt-data-analysis)) |
| **纯 LLM(无沙箱)** | 数学/数字问题幻觉率约 60%;临床场景可编造 lab 值/结论达 50–82.7%;**闭源模型结果不可复现**(模型一改结果就变)([Nature Comms Med](https://www.nature.com/articles/s43856-025-01021-3);[知乎:AI 数学局限](https://www.53ai.com/news/LargeLanguageModel/2024060429453.html)) |

**→ claw 的四个碾压点:**
1. **数值真实**:沙箱内 scipy/statsmodels 真算,p 值/置信区间来自代码而非「预测」,直接压制 DeepSeek/纯 LLM 的编造问题。
2. **可复现 + 透明**:导出可运行 `.py`/`.R` 脚本 + 环境版本,同数据同代码同结果——这是 Julius 明确做不到的(架构不保证)。对应期刊「披露 AI 使用 + 方法可审计」的硬要求(截至 2025 年 1 月约 **70% 期刊已有 AI 政策、3556/5114 家要求披露**,[thesify](https://www.thesify.ai/blog/ai-policies-academic-publishing-2025);[arXiv 政策综述](https://arxiv.org/pdf/2512.06705))。
3. **数据不出平台(合规叙事)**:把研究数据上传 ChatGPT 可能同时违反 HIPAA/FERPA/IRB 协议([HIPAA Certify](https://blog.hipaacertify.com/students-uploading-research-data-ai-tools-risk/))。claw 数据在自家沙箱内处理,可以打「机构数据不外流」的合规牌——这是面向医生/临床数据的强卖点。
4. **一条龙 + 学科 know-how**:清洗→前提检验→选对检验→出图→出表→出报告(含 Methods 段)一次完成,且把「选错检验/漏做多重校正」这类审稿死因通过 skill 内置成「守门规则」,复用 claw 已有的 lens/persona 模式。

---

### 三、Meta 分析 / 系统综述:一个「集中爆发」的高价值子场景

- RevMan/Stata 门槛高,森林图是循证医学最刚的产物;初学者要在 RevMan、Stata、R 之间反复折腾([图说 meta:森林图与 RevMan](https://zhuanlan.zhihu.com/p/115033648))。
- AI meta 工具已成赛道:Meta-Mar、Gatsbi Reviewer、AutoForest、Elicit、Paperguide 都在做「PDF 数据提取 → 效应量合并 → 森林图/漏斗图/I² 异质性」([Paperguide 盘点](https://paperguide.ai/blog/ai-tools-for-meta-analysis/);[AutoForest 论文](https://arxiv.org/pdf/2606.02403))。**但它们几乎都强调「只是人类专家的补充」**,且多为独立英文站点——中文用户、与「个人文献集/审稿」打通的一体化体验是空白。claw 有 library + minicod 引文网络 + 沙箱出图,天然适配。

---

### 四、风险(必须设计进产品的护栏)

1. **统计误用(选错检验、多重比较、p-hacking、把 p<0.05 当效应大小)**——这是审稿最常见死因([Top 10 statistical pitfalls](https://research.aston.ac.uk/en/publications/top-10-statistical-pitfalls-a-reviewers-guide-to-avoiding-common-/))。护栏:内置「方法学守门 skill」,自动做前提检验、强制多重比较校正、对「趋近显著」等话术拦截;不确定时**要求用户确认而非自动下结论**。
2. **审稿质疑 AI 分析**:70% 期刊要求披露 AI 使用。护栏:每次分析产出**可披露的方法学段 + 可复现脚本 + 软件版本号**,把「AI 黑箱」转成「可审计资产」,反而成为过审助力。
3. **LLM 选错方法/误读输出**:即便代码算对,模型仍可能挑错检验或误读结果。护栏:确定性校验(前提假设自动检测)+ 关键结论人类确认 + 展示代码。
4. **学术不端红线**:代做违规、可撤学位。护栏:产品语言坚持「辅助 + 透明 + 你来把关」,永不宣传「代做/包过」。

---

### 五、候选能力(详见结构化字段)
优先级建议:**统计分析工作台(核心一级模式)> 问卷/量表分析(毕业季超高频)> Meta 分析·森林图(集中爆发高价值)> 样本量与设计助手(前置防误用,可作子能力)**;生信(GEO/TCGA)受众偏窄、环境重,建议列为观察项不进首发。
