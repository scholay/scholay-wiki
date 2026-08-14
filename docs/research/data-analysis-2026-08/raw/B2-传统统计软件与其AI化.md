# B2 · 传统统计软件与其 AI 化

> 供给侧调研 · 为「数据分析」能力卡片定需求
> 调研时间:2026-08-04 · 调研员:领域调研员(供给侧 B2)
> 检索方式:WebFetch 直取官网/文档/定价页 + lite.duckduckgo / html.duckduckgo 检索 + Hacker News Algolia API + pullpush.io(Reddit 归档 API)。
> ⚠️ 本次会话的 WebSearch 配额在开工前已被耗尽(200/200),全部检索改用 WebFetch 完成,共 40+ 次。Reddit 官网、知乎、丁香园、G2、TrustRadius、IBM 官网多次返回 403 / CAPTCHA,凡受影响的结论均在文中标注置信度。

---

## 〇 · 一句话结论

**传统统计软件的护城河不是功能,是「导师会不会 + 审稿人认不认 + 教程有没有」;它们的 AI 化(SPSS AI Output Assistant / Minitab AI / JMP Assistant)全部押在同一件事上——把已经跑出来的结果翻译成人话,而不是替用户做分析。这条赛道 2025Q4–2026Q1 刚开门,做得都很浅,而且全部锁在付费软件内部,中国用户基本够不着。**

推论:我们那张「数据分析」卡片的真实竞品不是 SPSS,是 SPSSAU(¥258/月)、SPSSPRO 和淘宝上 500 块的代做商单;真实价值不在「能不能算」,在「算完之后到论文之间那 3 小时手工活」。

---

## 一 · IBM SPSS Statistics

### 1.1 版本与定价(2026-08 实测)

| 口径 | 价格 | 来源 |
|---|---|---|
| 商业订阅 Base(美国) | **$86.58/月,按年结算** | daisource.com/spss-subscription/(DDG 检索快照,2026-08-04)· 置信度中 |
| 商业订阅(单用户年费) | **$1,188/年**;10 用户 $11,880;100 用户 $118,800 | pricingnow.com/question/ibm-spss-statistics-pricing/(2026-08-04 抓取)· 置信度中 |
| 学生 GradPack Premium 29(12 个月) | **$89.00**(页面标原价 $2,300) | studentdiscounts.com/product-category/spss/(DDG 快照,2026-08-04)· 置信度中 |
| 学生 GradPack Premium 29/27(OnTheHub) | 挂牌 **MSRP $8,050**(12-Months Rental) | spss.onthehub.com(DDG 快照)· ⚠️ 这是划线价不是实付价 |
| **中国 · 学生专享(官方独家代理 思杰马克丁)** | **原价 ¥899,限时 ¥399** | spss.mairuan.com/monthly.html(2026-08-04 直取页面)· 置信度高 |
| 中国 · Base 版年订阅 | ¥1999/年(原价 ¥2999) | 中文二手来源(百度知道系),**未在代理商官网核实到数字**· 置信度低 |

模块结构固定为 **Base → Standard → Professional → Premium** 四档,采用「模块化定价,只为需要的功能付费」(pricingnow 原文:"employs a modular pricing model")。IBM 官网 `ibm.com/products/spss-statistics/pricing` 与 `/commercial-editions` 在本次调研中**均返回 403**,官网原始报价未核实。

**关键细节(对我们定价最有用的一条)**:中国官方代理卖给学生的那个 ¥399 包,授权期只有 **30 天**,但包里塞的东西是——

> "30天SPSS Base版正版授权 / 专属社群专家答疑支持 / 6大核心分析方法视频课程 / **标准化三线表制作指导** / 官方安装指导教学"
> —— spss.mairuan.com/monthly.html,2026-08-04 直取

也就是说:**IBM 在中国的官方代理,自己就承认「软件本身不够,得配三线表指导才卖得动」。** 这条比任何用户调研都硬。

### 1.2 中国的盗版现实

搜索 `SPSS 破解版 安装 知乎 正版价格` 返回的头部结果全部是安装破解版的教程:

- 知乎专栏《【2026】IBM SPSS Statistics 27最新保姆级安装教程》,含"永久使用方法"(zhuanlan.zhihu.com/p/2043590314754061760)
- B 站《2026最新版SPSS下载安装教程，内附免费安装包》(bilibili.com/video/BV1ZH3M6JE9e/)
- CSDN《别再用盗版了!手把手教你从官网下载并安装最新版spss》——标题本身就是在对着一个默认盗版的读者群喊话(blog.csdn.net/weixin_42526015/article/details/160436275)

**结论**:破解版在中文互联网上是**默认路径**,教程供给充分、检索排名靠前。
**未核实**:具体盗版率没有任何可信统计,任何百分比都是编的。我不给数字。

对我们的意义:**中国用户的「SPSS 支出」现实上是 0 元**。我们不是在跟 ¥1999/年 竞争,是在跟 0 元 + 一个下午的安装折腾竞争。这决定了价格锚点只能落在「一次代做的钱」而不是「一份 license 的钱」。

### 1.3 交互范式:为什么又爱又恨

爱的一侧,来自不会写代码的人:

> "You could use SPSS for stats, it's easier if you aren't used to programming."
> —— GalwayGirlOnTheRun23,r/PhD,created_utc 1739639942(≈2025-02-15),经 pullpush.io 抓取

> "I found SPSS super easy to learn as someone who isn't statistically minded"
> —— birdbirdeos,r/labrats,created_utc 1737150309(≈2025-01-17)

恨的一侧,几乎全部关于**输出**和**价格**:

> "plots from SPSS look like a kid drew them with crayons (imo)"
> —— FeistyRefrigerator89,r/labrats,created_utc 1716902660(≈2024-05-28)

> "spss is expensive trash that will only delay you learning a useful tool."
> —— bonferoni,r/IOPsychology,created_utc 1738038913(≈2025-01-28)

> "And an individual license is absolutely stupid expensive."
> —— Mofego,r/spss(pullpush 抓取,2026-08-04)

> "SPSS used to be more in favour (had a GUI) but the institution licenses got expensive as hell after it got bought by IBM."
> —— dr_tardyhands,r/AskStatistics(pullpush 抓取,2026-08-04)

### 1.4 IBM 的 AI 进展:AI Output Assistant

**这是本次调研最重要的供给侧发现。**

- 首次出现于 **SPSS Statistics 31.0.1**(2025-09-24 由 IBM 社区博客宣布,community.ibm.com/community/user/blogs/anu-j-r/2025/09/24/spss-statistics-31010-is-here)
- 由 **IBM watsonx.ai** 驱动
- 官方文档描述:"designed to enhance user experience by providing contextual guidance through prompts";用户可以"select output and ask questions to Large Language models (LLMs) and get explanations"
  —— ibm.com/docs/en/spss-statistics/31.0.0?topic=system-ai-output-assistant(DDG 快照,2026-08-04;直取该页 403)
- **必须自备 watsonx 账号(trial 或付费)**
- IBM 社区已有专门讨论帖反馈 credential 与加载故障,"persisting even after applying patches"(community.ibm.com/community/user/discussion/ai-output-assistant-dialog-box)

**读法**:IBM 的选择极具信息量——它没有做「自然语言 → 帮你跑分析」,它做的是 **「选中一个输出表 → 问它这是什么意思」**。也就是说,连 IBM 自己都判断:用户最大的卡点在**读结果**,不在**跑分析**。

**同时它也把门槛做死了**:要用这个功能,你得(a)买 SPSS 31.0.1+ (b)另外注册 watsonx (c)网络可达 IBM 云。中国用户三条全废。

---

## 二 · GraphPad Prism

### 2.1 定价(官网直取,置信度高)

来源:graphpad.com/how-to-buy/,2026-08-04 直接抓取。

**个人订阅(年付)**
- 学生 **$142/年**
- 学术 **$260/年**
- 商业 **$520/年**
- 月付选项 **$50/月**

**团队订阅(年付)**
- 学术:2 席 $520 / 5 席 $1,300 / 10 席 $2,600
- 商业:2 席 $1,120 / 5 席 $2,800 / 10 席 $5,600
- Enterprise:custom(含 SSO / user provisioning)

**永久授权**
- 学术 **$1,600** / 商业 **$3,200**
- 官网原话:**"We do not recommend this option"**,理由是没有升级、没有支持保障、没有管理功能。

这句"我们不推荐买断"值得单独记一笔:GraphPad 正在主动把整个生物医学圈往订阅制赶。

### 2.2 为什么生物医学圈粘性极高

不是因为统计强,是因为**它是唯一一个把「实验台上的数据布局」直接当作一等公民的软件**。用户原声:

> "heavily geared toward research. The built in tools for statistics, common graph types, and the overall functionality is unmatched."
> —— Nords1981,r/biotech(pullpush 抓取,2026-08-04)

> "Calculating the Half-Maximal Inhibitory Concentration (IC50) or Effective Concentration (EC50) often requires expensive software like GraphPad Prism."
> —— mw2taba88,Hacker News,2026-01-09T02:07:16Z

> "There are all kinds of systems like GraphPad Prism which try to bridge Excel and 'real' stats, where 30 lines of python and a CSV file would save them months."
> —— snovv_crash,Hacker News,2021-07-28T11:15:42Z

最后这条是全场最锋利的:**Prism 的价值恰恰在于它替不会写代码的人省掉了那 30 行 Python**。反过来说,一个能真的替用户写那 30 行并交付图表的 AI,打的正是这块地。

反对派也很有代表性:

> "I have colleagues who insist on using GraphPad Prism, but in my opinion it is setting up students for failure. Why not train them to use R from day one? Super powerful and free."
> —— FungalNeurons,r/labrats(pullpush 抓取)

> "every time my analysis was updated, I would have to potentially update the data frame significantly and redo the analyses."
> —— cookie_arrest,r/labrats(pullpush 抓取)——Prism 的死穴:**数据一改,全部重来**

### 2.3 「分析向导」设计

Prism 的核心交互是:先选**数据表类型**(XY / Grouped / Column / Contingency / Survival / Parts of whole / Multiple variables / Nested),再点 **Analyze**,软件在弹出的对话框里**按数据表类型过滤掉不适用的检验**。这是一种「用数据形状约束方法选择」的设计——用户不需要知道该用什么检验,只需要知道自己的数据长什么样。

⚠️ 我尝试直取 graphpad.com/guides/prism/latest/statistics/stat_choosing_a_test.htm 返回 **404**,上述描述基于 Prism 11 release notes 中对 Multiple Variables 表的描述("Run t-tests, nonlinear regression, and survival analysis through **variable assignment rather than reformatting data**")+ 通识,**结构细节未逐字核实,置信度中**。

### 2.4 AI 功能:**没有**

Prism 11.0.0 于 **2026-02-17** 发布(graphpad.com/updates/prism-11-0-0-release-notes,2026-08-04 直取)。新增内容为:
- Formulas in Columns(表内公式)
- Multifactor ANOVA(一路到 N-way)
- Multiple Variables 表直跑经典分析
- 效应量全面报告(eta-squared / Cohen's d / Hedges' g / Cramér's V)
- 浏览器上传 .prism 文件
- 新增 Content Manager 角色
- 新分层:**Prism Pro / Prism Enterprise**

**整份 release notes 里没有任何 AI 功能。** 这是一个非常明确的信号:生物医学圈最粘的那个软件,到 2026 年 2 月为止**完全没有进入 AI 战场**。

⚠️ 澄清一处极易搞混的地方:2026-01-28 OpenAI 发布了一个**同名产品 Prism**(openai.com/index/introducing-prism/),是基于收购的 Crixet 做的 AI 科研工作台。**与 GraphPad Prism 无关**。我们自家的「智能写作 Scholay Prism」在检索层面已经处在一个三重同名的命名泥潭里,值得内部提一嘴。

---

## 三 · 其余商业软件

### 3.1 Stata(官网直取,置信度高)

stata.com/order/new/edu/profplus/,2026-08-04:

| 版本 | 年费 | 续费 |
|---|---|---|
| Stata/BE | $175 | $160 |
| Stata/SE | $275 | $250 |
| Stata/MP 2-core | $395 | $355 |
| Stata/MP 4-core | $560 | $505 |
| Stata/MP 6-core | $675 | $610 |
| Stata/MP 8-core | $790 | $710 |

Stata 是经济/金融/公共卫生的默认工具,粘性来自 `.do` 文件的可复现性与期刊对 replication package 的要求。**未查到 Stata 有官方 AI 助手**(置信度中,未穷尽检索)。

### 3.2 SAS —— Viya Copilot

- **SAS Viya Copilot 是 SAS Viya 4 的原生功能,不额外收费**(sas.com/en_us/software/viya/copilot.html)
- 2025.12 stable release 起作为 SaaS 能力可用(katalyzedata.com/news/sas-viya-copilot-is-now-available/)
- 能力:生成代码、搭建模型 pipeline、AI 辅助报表本地化翻译、跨工作流的对话式引导
- 底座是 Microsoft Azure AI + LLM,带治理与透明度特性
- 官方定位话术:"Unlike general-purpose AI assistants, SAS Viya Copilot is built on trusted SAS analytics"

学术侧 SAS 全免费:**SAS OnDemand for Academics**、**SAS Viya for Learners**、**SAS Viya Workbench for Learners** 三条线,均限"academic, noncommercial use only"。

### 3.3 Minitab —— 最接近「结果翻译」的现成品

support.minitab.com/.../minitab-ai/(2026-08-04 直取):

Minitab AI 干两件事:
1. **对话式帮你选分析或图表**
2. **把分析结果转成自然语言摘要** —— 官方原话是生成 "key insights about your analysis results",变成 "clear, easy-to-understand natural language summaries"

限制与免责(原文):
> "AI technology may make mistakes. It is the user's responsibility to ensure the output is accurate, appropriate, and meets your organization's standards and requirements."
> "Minitab does not use or save any user input or AI-generated output."

仅在 **web app** 可用,且需要订阅里开通。使用建议里明确写着「用英文提问、把复杂问题拆小、分步追问」——**变相承认了长上下文一次性解读不可靠**。

### 3.4 JMP

- **JMP Assistant**:生成式 AI,自然语言 prompt → **JMP Scripting Language (JSL) 代码**,挂在 JMP marketplace 上(marketplace.jmp.com/appdetails/Assistant)
- JMP 19 主打"enhanced AI-driven capabilities"
- 定价:学术低至 **$29.95**;商业 **$1,250/user/年**起
  —— 来自 zoftwarehub / g2 快照,**置信度中**(未在 jmp.com 官网核实)

注意 JMP 的路线跟 Minitab/IBM 不同:**它把 AI 定位成「生成脚本」而非「解释结果」**。三家大厂在同一个季度分裂成两条路线,本身就说明这事没有共识。

### 3.5 Origin / MedCalc

- **Origin/OriginPro**:studentdiscount.tech 挂 $1,088/年(**置信度低**,该站是折扣聚合站);OriginLab 对**中国、印度、越南**等地学生提供 **OriginPro Learning Edition 免费 6 个月**(originlab.com,DDG 快照)。中国官方代理为睿驰科技(reachsoft.cn),**人民币标价未查到**。
- **MedCalc**:单用户**永久授权 €549(≈$634)**,无订阅制(medcalc.org/en/order/,DDG 快照,置信度中)。医学统计小众但在临床研究里有一批死忠,因为它内置 ROC / 诊断试验 / Bland-Altman 这些临床专用分析。

### 3.6 XLSTAT

TrustRadius 口径 **$295–$1,495/年**,三档方案,有免费试用与免费版(**置信度中**;xlstat.com/en/pricing 返回 404,官方数字未核实)。定位是「Excel 插件补齐统计能力」——这条路线的存在本身证明了**大量用户就是不愿意离开 Excel**。

---

## 四 · 免费替代品:JASP / jamovi / R / Python

### 4.1 JASP

jasp-stats.org(2026-08-04 直取):
- "A free cross-platform software program with a state-of-the-art graphical user interface"
- 由**阿姆斯特丹大学**支持;历史赞助方含 ERC、荷兰 NWO、Center for Open Science
- **关键卖点(官网原文)**:"Support for APA format (**copy graphs and tables directly into Word**)" 与 "Annotated output for communicating your results"

用户原声证实了这个卖点是真的兑现了:

> "I downloaded JASP, opened up my SPSS file and literally ran my first analysis and had a table done within five minutes. The learning curve was nonexistant..."
> —— Zelamir,r/labrats,created_utc 1689968759(≈2023-07-21)

> "Copy. Paste. DONE"
> —— Zelamir,r/labrats,描述 JASP 的 APA 自动排版(pullpush 抓取)

> "JASP is an open source statistical package similar to SPSS but without the $$$$"
> —— Cadberryz,r/research(pullpush 抓取)

### 4.2 jamovi

- jamovi.org:"a free and open statistical spreadsheet, designed to be easy to use and **powered by the R statistical language**"
- 社区模块生态:官网 modules 页宣称通过社区模块再提供 "70+ more" 分析
- Rj Editor 允许在 jamovi 里直接写 R
- jamovi Cloud:免费 guest 档 + 付费档。价格两个来源打架——topbusinesssoftware.com 说 **$5/user/月**,alexmtrussell.com.au 说 **$9.90/月**。**置信度低,未在 jamovi.org 核实**(该站 403)。

> "JAMOVI [outputs] absolutely everything in APA tables you can literally copy and paste into a Word document"
> —— VanillaSkittlez,r/IOPsychology(pullpush 抓取)

> "Jamovi is similar to SPSS but free. I think both are far better for analysis than Prism for non-coders"
> —— dee477,r/labrats,created_utc 1737177309(≈2025-01-18)

**JASP/jamovi 的公认短板**(pullpush 汇总的社区意见):
> jamovi/JASP "pretty good for simple analysis but can't use some techniques that require a bit more power (multiple imputation, bootstrapping, etc.)"

### 4.3 R / RStudio / Posit

- **Positron**(positron.posit.co,2026-08-04 直取):"the data science IDE. Human-driven, AI-assisted",**免费**,采用 Elastic License 2.0(source-available,不是 OSI 开源)
- **Posit Assistant**:2026-03 推出,是 **Positron Assistant(2025-06)+ Databot(2025-08)** 的合并继任者,在 **Positron 2026.07 GA**,成为默认 AI 体验。能力:"connects to your live session to help you explore data, build reproducible analysis with code",写代码、debug、解释代码
- Databot 的原始定位是 "dramatically accelerate exploratory data analysis for data scientists"

**这条线是我们最需要盯的**:Posit 是唯一一家把「AI + 活的数据 session + 可复现代码」三者绑在一起的。但它的受众是**已经会写 R/Python 的人**,跟我们的目标用户不重合。

### 4.4 Python 生态

- **pingouin**(pingouin-stats.org):"Open-source statistical package written in Python 3 based mostly on Pandas and NumPy",提供 ANOVA、post-hoc、稳健统计;被描述为 **"an APA-friendly wrapper for common biostatistics tests"**
- **statsmodels**:"the most comprehensive statistical modeling capabilities with detailed diagnostics, making it the go-to choice for formal statistical analysis"
- pingouin 底层大量依赖 scipy / statsmodels

**对我们的直接价值**:如果我们的「数据分析」卡片要在沙箱里真跑统计,**pingouin 是最优先的依赖**——它是唯一一个默认输出就带效应量、置信区间、检验前提诊断的 Python 统计库,天然贴合论文要报的东西。statsmodels 做回归,scipy 做底层。这条技术选型基本没有悬念。

---

## 五 · Excel:大量用户其实停在这里

- **Microsoft 365 Copilot**:企业版 **$30/user/月**(年付承诺,作为合格基础套餐的 add-on);中小企业(<300 人)$18–$21;个人 Copilot Pro $10/月;E7 Frontier Suite $99/user/月(多来源一致,置信度中高)
- **Python in Excel**:可在网格里直接写 Python 公式、出图、做统计与清洗
- **Copilot in Excel 的 advanced analysis 模式**:"opens a new sheet and inserts Python code as **refreshable Python cells**" —— 也就是说,微软选择了**生成可刷新的代码单元**而不是给一次性答案。2026-04 起 "Excel now supports Python directly inside Copilot workflows"
- **Analysis ToolPak**:功能天花板极低。最典型的缺口是 **ANOVA 之后没有内置事后检验(post hoc)**,用户必须手动实现(fastercapital.com 相关条目)

**判断**:Excel + Copilot 已经能吃掉「描述统计 + 简单检验 + 画个图」这一层。我们如果只做这一层,是在跟 $30/月 的微软正面撞车,而且撞不赢。**必须往论文场景的下游走**(方法学正确性 + 报告规范 + 三线表 + 讨论段落),那里微软不会去。

---

## 六 · 四个必答问题

### Q1 · 用户从 SPSS 迁移走的真实阻力是什么

**不是功能,是三样社会性的东西。**

**(a) 导师会不会 —— 最硬的一条**

> "SPSS when my PI insists on seeing what I'm doing because she's old and never learned"
> —— AvocadosFromMexico_,r/AcademicPsychology,created_utc 1735071993(≈2024-12-24)

> "...he made me show them how I got my stats by hand - didn't 'trust' SPSS."
> —— shubonid,r/labrats,created_utc 1699471062(≈2023-11-08)

> "Your PI is being ridiculous and has antiquated attitudes."
> —— Stauce52,r/PhD,created_utc 1739196197(≈2025-02-10),回应的正是一个 PI 禁止学生用 R 的帖子

**(b) 院系与课程的路径依赖**

> "Is it normal? Unfortunately yes. Is it a disservice to all of the students who almost certainly will not have access to SPSS in industry? Also yes"
> —— creich1,r/IOPsychology,created_utc 1738886128(≈2025-02-07)

> "it was important for them to not have any math prerequisites which severely limited how they were able to teach statistics"
> —— rite_of_spring_rolls,r/AcademicPsychology,created_utc 1745986206(≈2025-04-30)

pullpush 汇总里还有一条:学生指出 "the majority of the universities prefer SPSS for stats"。

**(c) 点选 vs 写代码 —— 真实的能力断层**

> "R plots look nice but I have to say that using R is pain in the ass and if you do not have programming experience it is not worth it. Rather use prism, excel or event spss outputs."
> —— Pkyr,r/labrats,created_utc 1716890778(≈2024-05-28)

**(d) 一个反直觉的发现:界面本身几乎不是阻力**

JASP/jamovi 的迁移成本被用户反复描述为「接近零」(Zelamir 的五分钟、"similar set up to spss but free")。**真正锁住人的是社会关系,不是学习曲线。**

**(e) 触发迁移的唯一可靠事件:失去 license**

> "every student who starts becoming dependent on SPSS's user-friendlyness will start to struggle the moment they lose access to their university's academic license"
> —— wischmopp,r/AskStatistics(pullpush 抓取)

> "SPSS is expensive and you simply won't always have a license."
> —— CJP_UX,r/UXResearch(pullpush 抓取)

**对我们的推论**:不要试图说服用户「离开 SPSS」。**要让我们的产物看起来就是从 SPSS 里出来的**——同样的表结构、同样的术语、同样的报告口径。用户和他导师都不需要知道底下跑的是 Python。这是能不能被采用的分水岭。

---

### Q2 · 输出形态与「搬进论文」的手工劳动量

**SPSS 输出的物理结构**(spss-tutorials.com/spss-output/,2026-08-04 直取):

输出查看器 = 左侧 **output outline**(导航树)+ 右侧 **output items**(枢轴表 pivot tables 与图),存为 `.spv`。原文:这些条目 "often exported to WORD or Excel for reporting"。

一次最普通的 t 检验会吐出**两张表**(Group Statistics + Independent Samples Test),后者是一张横跨 Levene's Test 与 t-test 两个大表头、约 10 列的宽表。一次线性回归会吐出**四张表**(Model Summary / ANOVA / Coefficients / Excluded Variables)。**论文里需要的信息散落在这些表里,而论文能放的只有一张。**

**这中间的手工活到底有多大?** SPSS 官方教程列出的调整动作:

1. 用 `TVARS` / `TNUMBERS` 语法配置变量与数值的显示方式
2. 出结果**之前**先设好 tablelooks(表外观)与 chart templates
3. 出完之后**删掉**用不上的输出项
4. 用 `OUTPUT MODIFY` 批量改格式
5. File → Export 批量导出,或者 Ctrl+C/Ctrl+V 逐个粘,粘不动的时候用 "copy special"

而枢轴表编辑器,官方教程自己的建议是:

> "we recommend you only use the pivot table editor **if everything else fails**. One reason is that **you can't replicate and rerun whatever you do in the pivot table editor**."
> —— spss-tutorials.com/spss-output/

IBM 官方文档对导出 Excel 的描述:"Pivot table rows, columns, and cells become Excel rows, columns, and cells."(ibm.com/docs/en/spss-statistics/31.0.0)——**结构原样搬过去,格式全丢**。

**中文场景更惨:三线表。** 中文期刊与学位论文强制三线表(顶线、表头线、底线,无竖线)。SPSS 的近似做法是:

> 「打开SPSS软件,点击顶部菜单栏的'编辑' → '选项'。在弹出的'选项'对话框中,切换到'透视表'选项卡。在'表外观'下拉菜单中,选择 **'Academic'** 样式。」
> —— blog.csdn.net/zhangfeng1133/article/details/146131229(2026-08-04 直取)

即便如此,该文仍指出导出 Word 后需要"手动调整边框",另有中文来源明确写"透视表选择Academic格式可展现**近似**三线表"。

**结论(量化)**:一篇社科/医学硕士论文的第四章,典型包含 8–15 张统计表。每张表的路径是「SPSS 跑出 2–4 张宽表 → 人工挑出要报的行列 → 重排成三线表 → 手改边框 → 手写显著性星号 → 手写表下注释 → 再写一段叙述文字」。**保守估计 2–4 小时纯手工,且每次数据一改全部重来。**

这就是那个「AI 应该吃掉的东西」。而 JASP/jamovi 之所以在社区里被反复安利,理由几乎只有这一条——**它们把这 2–4 小时压成了 Ctrl+C / Ctrl+V**。

---

### Q3 · 有没有产品在做「SPSS 结果翻译/解读」?做得怎么样?

**有,而且 2025Q4–2026Q1 集中爆发,但全部很浅。** 分四类:

**(1) 大厂内建(锁在付费软件里)**
| 产品 | 形态 | 起始时间 | 门槛 |
|---|---|---|---|
| IBM **AI Output Assistant** | 选中输出 → 自然语言提问 → LLM 解释 | SPSS 31.0.1(2025-09) | 需 SPSS 授权 **+ 另买/试用 watsonx 账号**;社区反馈有 credential/加载故障 |
| **Minitab AI** | 结果 → 自然语言摘要;对话式选分析 | 已上线(web app) | 需订阅开通;**仅 web 版** |
| **JMP Assistant** | 自然语言 → **JSL 脚本**(不是解释结果) | marketplace 上架 | 需 JMP 授权 |
| **SAS Viya Copilot** | 生成代码 / 搭 pipeline / 报表翻译 | 2025.12 stable | 含在 Viya 4,不额外收费 |

**(2) 独立小工具(最值得抄的)**

**Uedufy「Chapter 4 Interpreter」**(app.uedufy.com/tools/stats-interpreter/,2026-08-04 直取)——这是本次调研里做得最像样的一个,值得逐条拆:

- **输入**:SPSS 导出的 **PDF**(支持 v25–29),覆盖信度、描述统计、前提假设检验、t 检验、ANOVA、回归、中介、调节;也吃 **AMOS PDF**(SEM 拟合指数);Excel 用户可手工填表单
- **输出**:APA 7 叙述段 + **结构化 APA 表** + 引文(George & Mallery / Hayes / Field / Cohen)+ 参考文献列表 + 可下载 PDF 报告
- **定价**:$5 / 5 次(单次 $1);Thesis Pack $15 / 20 次(单次 $0.75);**一次性付费,不订阅**
- **最关键的一条**:它把核心卖点定为 **"Zero Hallucinations Guarantee"**,承诺"every statistic in the interpretation is pulled directly from your SPSS output",并提供 7 天退款覆盖「捏造统计量或引文」

**这条对我们是硬约束**:市场已经把「AI 编数字」认定为这个品类的头号失效模式,并且已经有人拿退款保证去打它。我们的账本/引用校验机制在这里不是加分项,是**入场券**。

**(3) 通用数据对话工具**:Vizly.ai(chat with your data)、ANDRE(直接吃 .sav)、StatRyx(免费在线 t/ANOVA/回归)、DataStatPro(SPSS 输出 → APA 表)。这一层同质化严重,均未核实定价与真实质量。

**(4) 中国本土(我们的真实竞品)**

| 产品 | 定价 | AI 表述(原文) |
|---|---|---|
| **SPSSAU** | **¥9.8/24小时、¥69.8/周、¥258/月、¥2588/年**;免费版限**前 100 行** | "智能化文字分析"、"规范化分析结果"、"几分钟,报告就已经完成";约 **500 类**分析方法 |
| **SPSSPRO** | 官网标"免费使用",有会员入口,**具体价格未查到** | "一键生成智能分析报告,所有算法配备分析步骤与智能分析,**AI大模型自动生成专业解读结论**";"AI自动识别数据结构,推荐最佳算法";360+ 算法、43 种图 |
| **ChatSPSS**(成都自然智科技) | **未查到定价** | "像聊天一样完成统计分析";27+ 分析方法;吃 CSV/Excel/.sav/.dta;**"自动生成三线表与专业解读"** |

SPSSAU 定价页原文抓取(spssau.com/addmoney.html,2026-08-04):¥9.8/24小时档**不含**文本分析与 Power 功效模块;周/月/年档全开放,含"智能化数据分析"、"完美导出分析结果"、"5*8客服"、可开发票与纸质合同。

**判断:这三家已经把「上传数据 → 点分析 → 出三线表 + 出解读文字」这条路走通了,而且比 IBM 便宜两个数量级、比 IBM 更懂中文论文规范。** 我们不是进入一片空地。

**但它们的共同弱点**(基于产品页表述推断,**置信度中,未做实际试用**):
- 都是**表单驱动**:先选方法 → 再拖变量 → 再点开始。**用户仍然必须自己知道该用哪个检验**。这是最大的缺口——而这恰恰是 agent 最擅长的。
- 解读文字是**模板化**的("所有算法配备分析步骤与智能分析"这种表述指向固定模板 + 变量替换),不是针对研究问题的。
- **前提假设诊断链条断裂**:没有证据表明它们会主动告诉用户「你的数据不满足正态性,应该换非参数检验」。
- 不接研究语境:不知道你的论文在问什么,只知道你选了哪个按钮。

---

### Q4 · 定价对中国学生意味着什么(价格锚点)

把所有数字换算成人民币(按 1 USD ≈ 7.2 CNY,汇率为估算):

| 项目 | 原价 | ≈ 人民币/年 |
|---|---|---|
| SPSS 商业订阅 Base | $86.58/月 | **≈ ¥7,480/年** |
| SPSS 单用户年费 | $1,188/年 | ≈ ¥8,550/年 |
| **SPSS 中国学生包(官方代理)** | **¥399 / 30 天** | ≈ ¥4,788/年(如果续) |
| SPSS GradPack Premium(美国) | $89 / 12 月 | ≈ ¥640/年 |
| GraphPad Prism 学生 | $142/年 | ≈ **¥1,022/年** |
| GraphPad Prism 学术 | $260/年 | ≈ ¥1,872/年 |
| Stata/SE 学术 | $275/年 | ≈ ¥1,980/年 |
| JMP 学术 | $29.95 | ≈ ¥216 |
| MedCalc 永久 | €549 | ≈ ¥4,300(一次性) |
| M365 Copilot | $30/月 | ≈ ¥2,590/年 |
| **SPSSAU 月费** | — | **¥258/月 = ¥3,096/年** |
| **SPSSAU 24 小时** | — | **¥9.8** |
| **淘宝/知乎 代做一次** | — | **¥100–500(知乎口径"一般五百左右,包含小调数据")** |
| **Uedufy 单次解读** | $1 / $0.75 | **≈ ¥7 / ¥5.4** |
| **破解版** | — | **¥0** |

**四条推论:**

1. **国际正版价格对中国学生是不存在的。** 中位数月生活费量级的支出,对应一个可以免费破解的软件——这个方程从来没成立过。任何以「比 SPSS 便宜」为卖点的定价都是自说自话。

2. **真实的心理锚点是三个:¥0(破解版)、¥9.8–¥258(SPSSAU 档)、¥100–500(代做)。** 我们的卡片应该锚在中间那档,并且用**按次/按天**而不是**按年**。SPSSAU 敢卖 ¥9.8/24 小时,说明这个市场天然接受「我这周要交论文,给我买一天」的形态——而这跟我们已有的「经费/算力点」按量付费模型完全兼容。

3. **代做的 ¥500 是价值上限,不是价格上限。** 用户掏 500 块买的不是「算出来」,是「有人替我把整个第四章搞定,包括我看不懂的部分」。**我们能替代掉的部分越接近这个整包,越能定到接近 500 的价。** 反过来,只做「跑个 t 检验」,天花板就是 SPSSAU 的 ¥9.8。

4. **不要按订阅卖这个能力。** 学生的需求是脉冲式的(开题、中期、盲审前、投稿返修),不是持续的。年订阅在这个场景里是反人性的。

---

## 七 · 我们不该做什么(砍需求)

**1. 不要做「又一个统计软件」。**
SPSSAU 有 500 类方法、SPSSPRO 有 360+ 算法,拼方法数量我们进去就是垫底,而且这是**永远打不完**的军备竞赛。用户真正跑的分析,90% 集中在:描述统计、信度效度、t 检验、方差分析、卡方、相关、线性/logistic 回归、中介/调节。**做深这 8 类,拒绝铺量。**

**2. 不要做「.sav / .spv 文件解析器」。**
诱人但是坑。理由:(a)Uedufy 的做法是吃 **PDF** 而不是 .spv,一个专门做这行的团队选了更笨的路,大概率有原因;(b)SPSS 版本碎片化严重(v25–29 只是 Uedufy 声明的支持范围);(c)中国用户手里的多是破解版,版本更乱;(d)真正的需求是「从原始数据到论文」,不是「从别人已经跑好的结果到论文」。**先做原始数据入口(Excel/CSV),.sav 支持排到很后面。**

**3. 不要试图说服用户离开 SPSS,也不要在文案里贬低 SPSS。**
Q1 的证据很清楚:锁住用户的是导师和院系,不是软件。任何「取代 SPSS」的叙事都会把用户置于跟导师对抗的位置。**正确的叙事是「你在 SPSS 里跑,我帮你把结果变成能交的东西」或者「我按 SPSS 的口径给你算,你导师看不出区别」。**

**4. 不要做实时协作 / 团队工作区 / 权限管理。**
Prism Enterprise、SPSS 的多用户授权都在这个方向,但那是机构采购的逻辑。我们的用户是**单人、脉冲式、deadline 驱动**的。

**5. 不要做通用「和数据聊天」的 BI 式看板。**
Vizly / ANDRE / Julius 那一层同质化已经很严重,而且真正的付费方是企业不是学生。我们的差异化在**论文场景的下游**(方法学正确性 + 报告规范 + 三线表 + 讨论段落),不在上游的探索性分析。

**6. 不要做暗色/花哨的可视化风格。**
用户要的是能塞进论文的图。GraphPad Prism 的图之所以被生物医学圈认,不是因为好看,是因为**审稿人见惯了**。我们的图应该长得像 Prism/Origin 的产物,不是像 Recharts 的产物。

**7. 不要在没有前提假设诊断的情况下直接给检验结果。**
中国医学期刊审稿人明确会因为「3组比较用多次t检验未做多重比较校正」「有序分类资料用普通卡方检验」打回(dxy.cn/bbs/newweb/pc/post/52615229,DDG 快照;⚠️ 该帖直取时被丁香园人机验证拦截,**内容未逐字核实,置信度中**)。**一个不查正态性就吐 t 检验的 AI,交付的是一颗定时炸弹。**

**8. 不要按年订阅收费,不要包月首选。**
见 Q4 推论 4。

**9. 不要自建统计引擎。**
pingouin + statsmodels + scipy 已经把该有的都有了,而且 pingouin 默认就输出效应量与置信区间。自研统计算法是纯粹的自伤。

**10. 不要承诺「全自动」。**
Minitab 官方自己都写着 "AI technology may make mistakes. It is the user's responsibility to ensure the output is accurate"。承诺全自动的那一刻,我们就要为每一个 p 值负责。**正确姿态是「每一个数字都能点回去看它是怎么算出来的」。**

---

## 八 · 对「数据分析」卡片的形态建议(供 PM 决策)

基于以上供给侧扫描,给三条具体的:

**(a) 入口不是「选方法」,是「说你的研究问题 + 传数据」。**
所有现存竞品(SPSSAU / SPSSPRO / SPSS 本体 / Prism)的第一步都是**让用户选检验方法**。这是它们共同的、结构性的弱点,也是 agent 唯一的、真正的差异化机会:**用户根本不知道自己该用什么检验,这才是第一个卡点。**

**(b) 交付物不是「分析结果」,是「论文第四章的一节」。**
= 三线表(可直接粘 Word)+ 规范的结果叙述段(含效应量、置信区间、显著性)+ 前提假设检验的说明 + 可选的图。参照 Uedufy 的产物清单,但要往中文期刊规范上做(三线表、GB/T 数字格式、中文统计术语)。

**(c) 每个数字必须可回溯到执行过的代码。**
这是我们相对所有竞品的结构性优势(沙箱 + 证据账本已有),也是这个品类的入场券(Uedufy 已经在拿 "Zero Hallucinations Guarantee" 打市场)。**产物面板应该做成「表格/图 ← 代码 ← 原始数据」三层可下钻**,而不是一个只能读的报告。

---

## 九 · 已知缺口与未核实项(诚实清单)

1. **IBM SPSS 官网原始定价未取到** —— ibm.com 的 pricing / commercial-editions 页面 403。文中 $86.58/月、$1,188/年 均来自第三方,置信度中。
2. **SPSS 中国区人民币标价未取到** —— 官方代理 mairuan.com 的年费页只有版本说明无价格,¥1999/年 来自中文二手来源,**置信度低**。学生包 ¥399/30天 是页面直取,置信度高。
3. **盗版率无任何可信数字** —— 只能确认「教程供给充分、检索排名靠前」,不能给百分比。
4. **SPSSPRO / ChatSPSS 定价未查到** —— 两家都没在公开页面挂价。这两家是我们最直接的中国竞品,**建议后续实际注册试用一次**。
5. **jamovi Cloud 定价两个来源打架**($5/月 vs $9.90/月),jamovi.org 403。
6. **Origin 中国人民币标价未查到**;$1,088/年 来自折扣聚合站,置信度低。
7. **JMP 定价未在官网核实**($29.95 学术 / $1,250 商业)。
8. **XLSTAT 官网定价页 404**,$295–$1,495 来自 TrustRadius。
9. **Prism 分析向导的交互细节未逐字核实** —— 官方 guide 页 404。
10. **Reddit 原声全部经 pullpush.io 归档 API 二手抓取**,reddit.com 本体被环境屏蔽。引文文本可信,但**部分 created_utc 时间戳存在归档批次异常**(多条不同内容返回相近的 174xxxxxxx 时间戳),文中对这类条目未标注具体日期。
11. **知乎 / 丁香园 / 小木虫 / 经管之家原帖均未取到正文** —— 403 或人机验证。中文原声主要来自 CSDN 与厂商营销页,**其中若干「学生痛点」句是厂商代拟的口径,不是真实用户自述**,文中已标注。
12. **Chinese 代做市场价格区间(¥100–500)证据较薄** —— 主要来自知乎问答摘要与淘宝/闲鱼商品标题,**未逐个核实实际成交价**。
13. **未调研 AMOS / Mplus / LISREL / Lavaan** —— 结构方程建模是社科论文的重灾区,且 Uedufy 明确支持 AMOS PDF,说明这块有真实需求。**建议单开一轮。**
14. **未调研 R Markdown / Quarto / apaTables / gtsummary / flextable 这条「用代码直出 APA 表」的路线** —— 这条路线的成熟度直接决定我们后端实现的难度,**建议技术侧单独摸一次**。

---

## 附:事实核查记录

> 对抗性复核,2026-08-04。默认怀疑、以推翻为目标。共 35+ 次独立取证(WebFetch 直取 / DuckDuckGo HTML+Lite / r.jina.ai 代理绕 403 / pullpush.io Reddit 归档 API)。
> 逐条结论见下。**判定为 REFUTED / 需修正的条目,更正文本已直接给出,可原样替换回正文。**

### 一、CONFIRMED(直取官方页,逐字对上)

| # | 断言 | 核查依据 |
|---|---|---|
| 1 | SPSS 31.0.1 AI Output Assistant / watsonx.ai / 「解释输出」而非「跑分析」/ 必须自备 watsonx 账号 | IBM 官方文档经 r.jina.ai 代理取到(直取 403):「The AI Output Assistant in IBM SPSS Statistics is designed to enhance user experience by providing contextual guidance through prompts」「**You should have a trial or paid account in IBM watsonx to use the AI Output Assistant feature**」;调用方式为输出查看器菜单「Analyze output with AI tools」或右键 → 选中输出项 → 选内置 prompt 或自定义提问。IBM 社区博客原文「The AI Output Assistant is powered by IBM watsonx.ai and lets you interact with your output using natural language questions」 |
| 1b | IBM 社区专帖反馈 credential/加载故障且打补丁后仍在 | community.ibm.com/community/user/discussion/ai-output-assistant-dialog-box 全文取到:José López 报错原文「**Credentials set, but the signal could not be renewed**」,弹窗永远 loading;版本 **31.0.2.0**,已打 fix `31.0.2.0-IM-S31STAT-ALL-IF002` **仍未解决**;时间线 02/23/26 报障 → 02/25 建议校验 API key/删注册表 api_key → 02/26 仍旧 → 03/04/26 建议「delete the entire ai_settings folder」,**帖子终结时问题未解决** |
| 2 | Prism 11.0.0 = 2026-02-17,含 Multifactor ANOVA / 表内公式 / 效应量 / Pro·Enterprise 分层,**零 AI** | graphpad.com release notes 直取:「Prism 11.0.0 was released on February 17, 2026」;新功能三项 Multifactor ANOVA、Classic Analyses from MV Data Tables、Calculated Variables(=表内公式,「included with Prism Pro and Enterprise」);效应量含 eta-squared / partial eta-squared / Cohen's f / Cohen's d / Hedges' g / Glass's Δ / Phi / Cramér's V;**全文 0 处 AI / assistant / LLM** |
| 3 | Prism 定价 $142 / $260 / $520 / $50 月付;永久 $1,600 / $3,200 +「We do not recommend this option」 | graphpad.com/how-to-buy/ 直取,**六个数字全部逐字对上**。另补:团体席位价 学术 2/5/10 席 = $520/$1,300/$2,600,商业 = $1,120/$2,800/$5,600 |
| 5 | SPSSAU ¥9.8/24h、¥69.8/周、¥258/月、¥2588/年;免费版限前 100 行;约 500 类方法;智能化文字分析 | addmoney.html 四档价全对上;helps 页原文「**免费版会限制分析前100行数据**」;首页原文「约500类分析方法」「智能化文字分析,分析随心所欲」 |
| 6 | SPSSPRO / ChatSPSS 的营销原话 | spsspro.com 逐字对上「一键生成智能分析报告」「AI大模型自动生成专业解读结论」「AI自动识别数据结构,推荐最佳算法」;chatspss.cn 首页整句取到「**像聊天一样完成统计分析:上传CSV/Excel/SPSS(.sav)/Stata(.dta)数据或直接描述研究问题,自动生成三线表与专业解读**」,主体 成都自然智科技有限公司(蜀ICP备2025134262号) |
| 8/10/11 | 四条 Reddit 原声 | pullpush.io 按 author 精确回捞,**四条全部逐字命中**:AvocadosFromMexico_ / r/AcademicPsychology / created_utc 1735071993「SPSS when my PI insists on seeing what I'm doing because she's old and never learned 🤷‍♀️」;wischmopp / r/AskStatistics / 1729006560;CJP_UX / r/UXResearch / 1734441237「SPSS is expensive and you simply won't always have a license」;VanillaSkittlez / r/IOPsychology / 1585445178「absolutely everything in APA tables you can literally copy and paste into a Word document」 |
| 9/11 | Zelamir 两条 | r/labrats,1689968759「I downloaded JASP... The learning curve was nonexistant」;1689967921「**Copy. Paste. DONE.** No fooling around in excel getting the proper outlines or having to copy and paste formatting」。JASP 官网逐字「Support for APA format (copy graphs and tables directly into Word)」 |
| 12 | SPSS 输出手工劳动清单 + 枢轴表编辑器警告 | spss-tutorials.com/spss-output/ 直取,TVARS/TNUMBERS、tablelooks(.stt)、SET CTEMPLATE(.sgt)、OUTPUT MODIFY、File>Export、Copy Special 全部对上;警告原文「**you can't replicate and rerun whatever you do in the pivot table editor**」,建议「only use the pivot table editor if everything else fails」 |
| 13 | 中文三线表只有近似方案 | CSDN 原文经代理取到:「编辑」→「选项」→「透视表」→「表外观」选 Academic;右键「导出」到 Word;并明写「**导出到Word的三线表可能需要进一步调整格式**」,需进编辑模式用「格式」→「表格属性」调边框 |
| 14 | Uedufy Chapter 4 Interpreter | app.uedufy.com 直取:$5 一次性 5 次 / $15 一次性 20 次($0.75 单次,save 25%),明写 no subscription/no auto-renewal;吃 SPSS PDF v25–29 + AMOS PDF(另支持 Excel 手录 / 表格文本粘贴);「**7-day Zero Hallucinations refund**」「if any number is hallucinated or any reference is fabricated」;引文语料「Fixed methodological corpus... (George & Mallery, Hayes, Field, Cohen)」 |
| 15 | Minitab AI | support.minitab.com 直取:web app 独占 + 需订阅开通;免责声明逐字「AI technology may make mistakes. It is the user's responsibility to ensure the output is accurate, appropriate, and meets your organization's standards and requirements.」;建议逐字「**Prompts in English give the best results**」「**Use a series of smaller prompts instead of one complex prompt**」「If you need more detail, ask step-by-step questions」 |
| 16 | JMP Assistant = NL→JSL;SAS Viya Copilot 含在 Viya 4 不额外收费、2025.12 起可用 | JMP Marketplace(作者 Russ Wolfinger@JMP,官方)「Generates the corresponding JSL code, runs the script automatically」;sas.com/viya/copilot 逐字「SAS Viya Copilot is a **native feature included at no extra cost** in SAS Viya 4, SAS Viya for Learners, SAS Visual Analytics and SAS Visual Statistics」;communities.sas.com「SAS Viya 2025.12 Release」引入 Copilot 的 code assistance 与 model pipeline(81 项新功能) |
| 17 | 「SPSS 破解版」头部结果全是破解教程 | DDG 头部实测:知乎 p/2043590314754061760(标题含「永久使用方法」)、知乎 p/2016557126139528219(「全面解锁」)、B站 BV1ZH3M6JE9e(「内附免费安装包」,5042 播放)、B站 BV1Le3Y6EELM(「免费分享」)。**结论方向成立** |
| 18 | 知乎口径「一般五百左右,包含小调数据」 | zhihu.com/question/513636025 摘要逐字命中 |
| 19b | Analysis ToolPak 无内置事后检验 | 微软官方支持页列出 ToolPak 全部 19 项工具(Anova 三种 / Correlation / Covariance / Descriptive / Exponential Smoothing / F-Test / Fourier / Histogram / Moving Average / RNG / Rank and Percentile / Regression / Sampling / t-Test 三种 / z-Test),**无 Tukey / Bonferroni / Scheffe 任何多重比较**。这条是官方一手证据,比原文引的 fastercapital 强得多,建议换源 |
| 19c | M365 Copilot $30/user/月 | 多源一致(enterprise,年付)。另注:小企业版 $21/user/月(促销 $18 延至 2026-09-30),且**必须叠加已有 M365 基础订阅** |
| 21a | Stata 学术 Prof+ BE $175 / SE $275 / MP2 $395 | stata.com/order/new/edu/profplus/ 直取,三个数字全对 |
| 21b | MedCalc 单用户永久 €549 | 官网价格由 JS 渲染取不到,经检索快照取到原句「The price of one MedCalc single-user perpetual license is **549 EUR (± 634 USD)**」 |
| 21d | SAS 学术免费 | sas.com OnDemand for Academics 页逐字「Access SAS software in the cloud – **for free**」 |
| 4 | 思杰马克丁 ¥399(原价 ¥899)/30 天,包内含「标准化三线表制作指导」 | spss.mairuan.com/monthly.html 直取:原价 ¥899 / 限时 ¥399;包内容四项 = 30天 SPSS Base 正版授权 + 专属社群专家答疑 + 6大核心分析方法视频课 + **标准化三线表制作指导** + 安装指导;学员成果展示「产出规范三线表8个」。**这条是全文最硬的证据之一,站得住** |

### 二、REFUTED / 必须修正

**R-1(断言 20,归属错误)** —— 「pingouin 是『an APA-friendly wrapper for common biostatistics tests』」**不是 pingouin 的自我描述**。pingouin-stats.org 与 GitHub README 的开篇原文是「Pingouin is an open-source statistical package written in Python 3 and based mostly on Pandas and NumPy」,全文**无 "APA-friendly" 字样**。该短语只见于第三方 Medium 对比文。**把第三方软文的话当成上游官方口径引用,是这轮核查里最典型的一处失误。**
> 实质内容仍成立:README 能力清单确有「Effect sizes and power analysis」「Parametric/bootstrapped confidence intervals」,且 `pg.normality()` / `pg.multivariate_normality()` 提供前提检验;文档原文「the `ttest` function of Pingouin returns the T-value, the p-value, the degrees of freedom, the effect size (Cohen's d), the 95% confidence intervals of the difference in means, the statistical power and the Bayes Factor (BF10)」。但这是**单个函数的返回**,不能说成「默认输出就带」的全局属性。

**R-2(断言 21,数字方向反了)** —— 「JMP 学术低至 $29.95」**与官方口径矛盾**。jmp.com/en/academic 原文:「JMP Student Edition, **a full-featured version of JMP Pro, is free** to all students, educators, and academic researchers at degree-granting institutions」,且「Renew – **at no cost** – every 12 months」。$29.95 与商业 $1,250/user/年 **均只出自 zoftwarehub 这个第三方聚合站**,官网无任何对应数字。**更关键的是:这条数字错误恰好削弱了本节自己的论点** —— JMP 学术侧不是「极低价」,是**彻底免费**,「大厂用免费锁学生」的模式比原文写的还更极端。

**R-3(断言 21,「无订阅」不成立)** —— medcalc.org/en/order/ 页面结构明确列出**两种**单用户购买方式:perpetual license **与** annual subscription(「yearly renewable with free updates during subscription」)。「€549 永久**无订阅**」中的「无订阅」应删。

**R-4(断言 7,推论被产品页直接证伪)** —— 「三家中国竞品的共同结构性弱点是表单驱动,用户仍必须自己知道该用哪个检验」**至少对 ChatSPSS 明确不成立**:其首页第一句就是「像聊天一样完成统计分析:上传...**或直接描述研究问题**」,即以自然语言描述问题为入口,恰恰绕开了「先选方法」。SPSSPRO 也公开宣称「AI自动识别数据结构,**推荐最佳算法**」。原文自己已注明「基于产品页交互描述**推断**,未做实际注册试用」——**这是本节唯一一条『刚好完美支持我方结论』的推断,且证据方向与之相反,必须改写或降级为待验证假设。**

### 三、需修正的次要偏差

- **断言 1**:社区博客的发布日期,URL slug 为 `/2025/09/24/`,页面显示日期为 **2025-09-25**;正文可写「2025-09-24/25」或直接引 URL。另:截至核查日 SPSS 已到 **31.0.2.0**,「31.0.1」在 2026-08 已非最新版,叙述宜加「31.0.1 起引入」。
- **断言 5**:¥9.8/24 小时档**明确不含**「智能化文字分析」与 Power 模块(addmoney.html 原注)。用这一档论证「市场接受脉冲式付费」仍成立,但**不能同时用它论证『¥9.8 就能拿到文字解读』** —— SPSSAU 恰恰把最贵的解读能力挡在了最便宜档之外,这对我们反而是可用的定价情报。
- **断言 8**:shubonid 那句的原文是「He made my PI go over and double check every little thing I did and **made me show them how I got my stats by hand - didn't "trust" SPSS**」,但**上下文是学术不端举报后的报复性审查**(该帖通篇讲实验室数据造假与打击报复),**不是**「导师因守旧而不信任软件」。用它支撑「导师是迁移第一阻力」属于**语境挪用**,建议删掉这条或改用其他例证。
- **断言 8**:Stauce52 那条(r/PhD,`/r/PhD/comments/1im2rok/what_all_do_you_use_r_for/`,2025-02-10)原文是「Your PI is being ridiculous and has antiquated attitudes. **What are their recommendations for "other tools"?** A programming language like R or Python is going to be more flexible...」。帖子标题是「what all do you use R for」,PI 的态度是**劝阻/不建议**用 R,原文写的「**禁止**学生用 R」在证据中无对应,宜改为「不建议/劝阻」。
- **断言 4**:mairuan 站点自挂「独家发行商」徽标,about 页原文是「作为 **IBM SPSS 合作伙伴**,思杰马克丁是一家行业知名的数字化软件发行公司,成立于2009年12月」;「IBM 官方独家代理」的表述目前只有**该经销商自述 + 知乎二手文**支撑,**未见 IBM 官方公告**。另 spss.mairuan.com 页脚运营主体显示为「苏州麦软网络有限公司」。建议表述降级为「IBM SPSS 中国区主要经销商(自称独家发行商)」。
- **断言 17**:「我们不是在跟 **¥1999/年** 竞争」中的 ¥1999/年 本轮**仍未取到任何一手来源**(mairuan 首页无年费标价)。与正文第九节自陈的「置信度低」一致,**建议正文直接删掉这个数字**,只保留「跟 0 元竞争」的定性。文中所引 CSDN「别再用盗版了」一文本轮未在检索头部复现,属可有可无的修辞,建议删。

### 四、UNVERIFIABLE(查不到一手来源,不应作为论据)

- **断言 12 的 IBM 引文**「Pivot table rows, columns, and cells become Excel rows, columns, and cells」——ibm.com/docs 直取 403,r.jina.ai 代理取到的是空壳(正文 JS 渲染),对该整句做精确短语检索 **DDG / DDG-Lite 双双零结果**。该句**无法确认为 IBM 原文**,建议改为不带引号的转述,或删除引号只保留「导出 Excel 时表格结构保留、格式丢失」这一可由 spss-tutorials 佐证的说法。
- **断言 18 的「淘宝 1000+ 相关商品」** —— 未取到商品数计数页面,属典型易编造数字。¥500 那句知乎口径是硬的,**建议只保留价格区间与知乎原话,删掉「1000+」**。
- **断言 19 的「2026-04 起 Excel 在 Copilot 工作流内原生支持 Python」** —— 唯一支撑是 learn.microsoft.com 一条 Q&A 的**页面时间戳 2026-04-01**,取证工具本身即标注该时间戳为 data anomaly,不构成发布日期。「advanced analysis 模式 opens a new sheet and inserts Python code as refreshable Python cells」这半句有 MS Q&A 支撑,**但日期必须删**。
- **断言 21 的 JMP 商业 $1,250/user/年** —— 同 R-2,仅第三方聚合站,官网无。
- **断言 1 的「连 IBM 自己都判断用户最大卡点在读结果不在跑分析」** —— 这是从产品形态**反推**的动机归因,IBM 从未如此表述。作为分析可以,**不能写成 IBM 的判断**。
- **断言 13 的「8–15 张表 / 2–4 小时纯手工」** —— 正文已自陈是估算未计时,维持 UNVERIFIABLE,**建议在正文里也保留这个自陈标注**(目前正文该处标注偏弱)。

### 五、核查结论

23 条被查断言中:**14 条完全 CONFIRMED**(且多条是逐字级对上,取证质量高于同类报告平均水平);**4 条 REFUTED 需改写**(pingouin 引文归属、JMP $29.95、MedCalc 无订阅、竞品「表单驱动」推断);**6 条次要偏差**;**6 处 UNVERIFIABLE 数字/引文需从论据降为背景**。

**风险最高的一条是 R-4**:「三家中国竞品都是表单驱动、都要用户自己选检验」是全节推导出「agent 的唯一差异化机会」的**唯一支点**,而它是本节唯一未经实测的推断,且 ChatSPSS 首页文案与之直接冲突。**在实际注册试用 ChatSPSS / SPSSPRO 之前,不应把这条当成已确立的市场空隙。**
