# 竞品与行业做法（2026-08）

> **本文只回答一个问题：同行现在是怎么做这件事的，以及我们能从中学到什么。**
> 本文只做**供给侧全景与机制拆解**；**差异化裁决与「我们凭什么」在 [SYNTHESIS-产品形态.md §7](./SYNTHESIS-产品形态.md#七--与竞品的差异化含我们没有优势的地方)，本文不重复。**
> 需求侧（用户要什么、价格带全景、付费意愿）在 [SYNTHESIS-需求.md](./SYNTHESIS-需求.md)。
>
> 来源：`raw/B1-AI原生数据分析竞品.md`、`raw/B2-传统统计软件与其AI化.md`、`raw/B3-中文在线统计工具与代做市场.md`、`raw/B4-LLM统计能力实证与失败模式.md`（均调研于 2026-08-04）。
> **四份材料各自附带一轮对抗性事实核查，本文一律采用核查后的更正版**；被判 REFUTED / UNVERIFIABLE 的断言已就地改写或降级标注。
> **凡四份材料对同一玩家说法冲突处，本文不抹平**，单独在 [§九·分歧登记](#九3-材料间分歧登记14-条) 逐条并列两说。

---

## 〇 · 供给侧全景：一张图看清这个市场分几层

这不是一个市场，是**九层彼此不通的市场**。同一个用户（写论文的硕博/临床医生）在不同阶段会撞进不同层，但**没有任何一层能把他从头接到尾**。

### 〇.1 分层总表

| 层 | 代表玩家 | 价格带 | 吃掉了哪一格需求 | 天花板在哪 |
|---|---|---|---|---|
| **L0 · 通用 LLM 沙箱**（顺带能做分析） | ChatGPT Advanced Data Analysis、Claude code execution tool、Claude Science、Manus、Colab Data Science Agent | Colab DSA **免费**；ChatGPT Plus **$20/月**；Claude 订阅内附赠（code execution 每组织 **1,550 免费小时**，超出 **$0.05/小时/容器**）；Manus $0/$20/$40/$200（**收购前**档位，两家二手源互相矛盾，见 §九·D6） | **「把任意格式的文件解析出来 + 探索性分析 + 画图」**——用户买的是「省掉手工折腾数据的那几个小时」（HN `ttul` / `simonw`，§八·2） | 沙箱与状态：ChatGPT 单文件几百 MB 封顶、几千万行**在 load 阶段就 OOM 而非分析阶段**、断线丢全部中间变量、跨 session 零状态；Claude 容器 5 GiB RAM / 1 CPU / 完全断网。产物是**对话与 notebook**，不是稿件部位。**方法学零守门** |
| **L1 · AI 原生数据分析 SaaS** | Julius、Vizly、Powerdrill、Numerous.ai、Genspark（官网 403，**未核实**） | 个人档 **$19.99–$45/月**（Julius Plus $20 / Pro $45、Vizly $19.99 / $29.99）；Julius 上探 $200 / $500，Business $450（50 席）；Numerous.ai $10/月 | **「上传 → 一句话出图 → 导出幻灯/HTML/代码」**——形态高度同质，全场只差沙箱规格与导出格式 | 方法选择**全靠模型静默猜**（不问设计、不问配对、不问分布，也不告诉你选了什么）；产物止于图与解读；**被允许进论文的只有「可视化」那一段**（PLoS Med 2025-12-05：统计全程 Stata 17/SE，Julius 只做 data visualizations） |
| **L2 · 专业 notebook / 数据栈**（不是对手，但定义了「专业口径」） | Hex Magic、Deepnote、Databricks Genie、Jupyter AI、Posit（Positron + Posit Assistant） | 企业/按量：Databricks Genie Code **2026-07-08 起按量计费 + 每用户免费月额度**（Genie One/Agents 免费至 2027-01-31）；Positron 免费（Elastic License 2.0，source-available 非 OSI） | **「已经会写代码的人的提效」** | 这一层的共识是 **「AI 生成代码，人负责 review」**——它们不承诺正确，因为用户有能力自查。**我们的用户没有。** Jupyter AI 唯一护栏是**权限**确认（写文件/跑命令/用 MCP 前请求许可），与统计正确性无关 |
| **L3 · 传统统计软件及其 AI 化** | IBM SPSS（AI Output Assistant）、GraphPad Prism、Stata、JMP、SAS Viya Copilot、Minitab AI、Excel + M365 Copilot | SPSS 单用户 **$1,188/年**（置信中，官网 403 未核实）· **中国学生包 ¥399/30 天** · 美国 GradPack Premium $89/12 月；Prism 学生/学术/商业 **$142 / $260 / $520 每年**；Stata BE/SE/MP2 学术 **$175 / $275 / $395**；**JMP Student Edition 免费**；SAS Viya Copilot **无额外费用**；M365 Copilot **$30/user/月** | **社会合法性**：导师看得懂、院系在教、审稿人见惯了 Prism 的图。**锁住用户的不是功能，是社会关系** | AI 化整体**很浅且路线分裂**（IBM/Minitab 押「解释已跑出的结果」，JMP/SAS/Posit 押「生成代码」，**GraphPad Prism 完全没进场**，11.0.0 release notes 全文 0 处 AI）；全部锁在付费软件内部；IBM 的 AI 助手在中国**三条前提全废**（需授权＋自备 watsonx 账号＋网络可达 IBM 云），社区专帖报 credential 无法续签、打了 fix IF002 仍未解决 |
| **L4 · 免费桌面替代** | JASP（阿姆斯特丹大学支持）、jamovi | **¥0** | **「算完 → 粘进 Word」整格**（英文 APA 场景），且**零学习成本 + 能直接开 `.sav`**。JASP 官网首要卖点逐字："Support for APA format (copy graphs and tables directly into Word)" | 只出 **APA 英文表**，不产中文三线表/中文期刊口径；不产 Methods 段；复杂技术力有不逮（"can't use some techniques that require a bit more power (multiple imputation, bootstrapping, etc.)"）；**仍需用户自己知道该用哪个检验** |
| **L5 · 中文在线统计 SaaS** | SPSSAU、SPSSPRO、ChatSPSS、问卷星 | SPSSAU **¥9.8/24 小时 · ¥69.8/周 · ¥258/月 · ¥2588/年**（海外站 $0 / $2.99 / $9.99）；问卷星信效度**不单收费**，只有 AI 点数计价（默认 30 点，超出 **1 元/点**）；SPSSPRO **邀请/发帖换会员**（价格未核实）；ChatSPSS 定价未查到 | **「已知方法名 + 已有干净宽表 + 标准检验 + 规范化表格」整段**。SPSSAU 的产物口径逐字是「规范化表格，可视化图形，智能化分析」「有图，有表，有文字」 | 入口假设**数据已是干净宽表**；产品骨架是「算法卡片 + 参数表单」，**装不下清洗逻辑与返修回合**；边际价格已被打到 ¥9.8/天甚至 0；合法性焦虑要靠厂商发文（「结果符合学术标准，科研论文均可放心使用」+ 推荐引用格式）来打消 |
| **L6 · 垂直云平台** | 组学侧：微生信/SRplot、Hiplot、ImageGP、Majorbio Cloud、Sangerbox、OmicShare、Chiplot<br>医学侧：mstata、风暴统计、海豚统计、梦特云、医咖会、EmpowerStats | 免费 ~ **¥188/30 天 · ¥518/120 天 · ¥999/365 天**（mstata）；微生信**微币充值十档**（50 元 = 700 微币 … 500 元 = 10000 微币，官方明写「用多少充多少」、**不做会员制**）；Hiplot Pro 197 个工具永久免费 | **「学科专用流程 + 期刊级图」**。需求的硬证据是被引数（OpenAlex 一手）：SRplot **2,423** · Sangerbox **1,219** · Majorbio **891** · ImageGP **478** · Hiplot **290** · OmicShare **281** | 组学侧靠测序订单/云平台获客，**不是独立生意**；医学侧最深的 mstata **自承 v0.96、完成度 70%、试运营中**，且**同时运营人力代做与「审稿返修」工作室**——等于自认 AI 那条链在返修环节接不住；风暴统计流程原文明写「专家验证」 |
| **L7 · 结果翻译微工具** | Uedufy「Chapter 4 Interpreter」 | **$5/5 次、$15/20 次（$0.75 单次）**，明写 no subscription / no auto-renewal | **「从别人已跑好的 SPSS 输出 → 论文的一节」**：APA 7 叙述段 + 结构化 APA 表 + 引文（George & Mallery / Hayes / Field / Cohen）+ 参考文献 + 可下载 PDF | 吃 **PDF**（SPSS v25–29 / AMOS）不吃原始数据，做不了「从原始数据到论文」；覆盖方法有限；护城河是 **"7-day Zero Hallucinations refund"**——说明这个品类的**入场券**是「不编数字」 |
| **L8 · 人力代做 / 辅导** | EBOSS、新菊统计工作室、zuoyedaixie.com、淘宝闲鱼个体、mstata 学术服务工作室、论文辅导机构 | 单项 **NT$800–2,500/法**；EBOSS 预试套餐 **8,000 / 10,000 / 15,000**、正式分析 **18,000**（**币种应为新台币，页面未标注**）；zuoyedaixie **¥299–¥1499**（48h 加急 +40%）；大陆「**一般五百左右**」（二手）；论文辅导按学位层次 **¥800–¥50,000**（二手） | **「责任 + 无限返修 + 交付物形态 + 时间」**——客户什么都不知道，只有**一个 Excel 和一个 deadline** | 人力**不可规模化**：第二次返修与第一次一样贵，只能打包卖套餐摊平；诈骗高发（公开案例 600→**7,300** 元、**¥28,000**、**¥7.5 万**、近 **40 万**）；法院已认定此类服务合同**违背学术诚信、无效** |

### 〇.2 这张表最重要的三条读法

**① L5 与 L8 之间有一条没人跨过去的裂缝。**
L5（中文在线 SaaS）的入口假设是「你已经有一张干净宽表且知道要做什么」；L8（人力代做）的入口假设是「你只有一个 Excel 和一句『帮我搞定』」。中间那段——**脏数据整理 → 方法论证 → 交付物成型 → 返修**——L5 的产品骨架装不下，L8 靠人肉做（**所以贵**）。
差价就是市场规模：同一件事，L5 已经打到 ¥9.8/天甚至 0 元，L8 仍能收 ¥500–¥6,000。

**② 「方法学守门」这一格，九层里没有任何一层在做。**
- L0/L1：模型**静默地替你选**，不问设计、不问配对、不问分布，也不告诉你选了什么和为什么。
- L2/L3/L4：**甩回给人**——默认用户是专业人士。JASP/jamovi 的勾选项里有 Levene/Shapiro，但**只算不分流**。
- L5/L6：表单驱动或流程驱动，方法本身是用户选的（⚠️ 但「表单驱动」这个立论已被 ChatSPSS / SPSSPRO 的产品页部分证伪，见 §九·D7）。
- L7：只翻译别人已跑好的结果，不参与方法选择。
- L8：**唯一真的在做**，靠的是一个活人。
- 唯一带「审查者」角色的是 **Claude Science 的常驻 background reviewer**，但它审的是**声明↔证据的可追溯性**（引用、不可追溯的数字、图与生成它的代码不一致），**不是方法学选择**。

**③ 越靠近论文，价格越高，形态越像服务而不是软件。**
L0/L2 是 $20 订阅顺带；L1 是 $20–45 的工具费；L5 是 ¥9.8–258 的按天/按期；L7 是 **$0.75 一次的按产物**；L8 是 ¥500–50,000 的**服务费**。
**用户在这件事上已经在花钱，而且花的是「服务费」不是「工具费」。** 他们买的从来不是「能跑统计的软件」（SPSS 破解版遍地），而是「**有人替我承担『这段做对了』的责任**」。

### 〇.3 一条必须先记住的行业事实

> **市场已经把「AI 编数字」认定为本品类的头号失效模式，并且已经有人拿退款保证去打它。**
> Uedufy 的 **"7-day Zero Hallucinations refund"**——"if any number is hallucinated or any reference is fabricated"。
> **证据账本 / 引用校验在这里不是加分项，是入场券。**

---

## 一 · AI 原生数据分析产品

> 来源 `raw/B1`。本章的定价与功能断言，一律采用该文文末「附：事实核查记录」（对抗性复核，2026-08-04，含 Wayback 回源）的更正结论；被判 REFUTED / UNVERIFIABLE 的已就地改写或标注。原报告标「未核实」的，此处同样标注。
> 本章的用户原声已并入 [§八](#八--用户原声集逐字按主题归类)，未覆盖项已并入 [§九](#九--本章的证据强度与存疑)。

**一句话结论**：全场产品的形态高度同质 —— **上传 → 自然语言提问 → 模型现写并执行代码 → 回图 + 回文字**；差异只在沙箱规格与产物导出。**没有任何一家在「问出研究设计」这一步设守门**，也没有任何一家产出中文期刊要的规范化表格与方法学句子。这两处是空位。

### 1.1 形态对照（上传 → 怎么交互 → 出什么）

| 产品 | 交互形态 | 产物 | 硬边界 / 关键事实 |
|---|---|---|---|
| **Julius AI** | 上传 CSV/Excel 或连数据库 → 自然语言提问 → 后台现写 Python/R 并执行 | 图 + 文字解读；可导出报告与 Python/R 代码；官方定价页列 Plus 及以上每档 "Export slides, HTML artifacts, charts, and images"，Free 档亦有 "Access to Notebooks" | **credit 制**（非「消息」制）：Free 每日刷新 credits／Plus $20（年付 $16）2,000／Pro $45（年付 $37）5,000／Max $200／Ultra $500／Business $450（50 席）；年付省 20%。来源：Wayback 快照 `web.archive.org/web/20260803132202/https://julius.ai/pricing`（2026-08-03）。原报告的「250 条/月」「学生教师 5 折 ≈$18.5」已被推翻/降级 |
| **ChatGPT Advanced Data Analysis** | 隔离 sandbox 内写并跑 Python，吃 CSV/Excel/JSON/PDF/图片 | 图表、处理后文件、计算结果 | 单文件 "a few hundred megabytes per file is the practical ceiling"；"a few million rows per CSV is workable; tens of millions are not"，且 **"the sandbox runs out of memory on the load step, not the analysis step"**；每 session 独立沙箱，断线丢变量，跨 session 零状态。ADA 2026 年**未下线**（下线的是 Atlas 浏览器，2026-08-09 停服）。来源：infinisynapse.com，2026-06-28（**厂商内容营销站，有立场**） |
| **Claude · Analysis tool** | 浏览器内 JavaScript 沙箱（Lodash/PapaParse/Math.js/D3） | 图与计算 | 2024-10-24 上线；官方页 2025-11-05 注记 **"being replaced by more powerful code execution capabilities"**。来源：claude.com/blog/analysis-tool（一手） |
| **Claude · Code execution tool**（现行） | API 侧工具，Python 3.11 Linux 容器 | 文件产物 | **5 GiB RAM / 5 GiB 磁盘 / 1 CPU / 完全断网**；预装 pandas、numpy、scipy、scikit-learn、statsmodels、matplotlib、seaborn，另有 openpyxl / python-pptx / python-docx / pypdf / pdfplumber / reportlab / sympy 与 sqlite、ripgrep；容器 30 天过期、约 5 分钟不活动 checkpoint；programmatic tool calling 下每 REPL cell **90 秒墙钟**；每组织每月 **1,550 免费小时**，超出 **$0.05/小时/容器**，与 web search/fetch 同请求时免费。来源：platform.claude.com 官方文档（一手，逐项吻合，**全篇最扎实一条**） |
| **Claude Science**（2026-06-30 beta） | "AI workbench"，主 agent 当项目经理 | 结构/化合物/基因组可视化 | macOS/Linux，Pro/Max/Team/Enterprise；接 **60+ 科学数据库**；**常驻 background reviewer** 标记 "incorrect citations, untraceable numbers, and figures that don't match their underlying code"，另一处 "flags any claim it can't trace to evidence"；学术与非营利实验室有 Team 折扣。⚠️ 资助计划（50 项 / ≤$30,000 / 截止 07-15）**官方页零命中，UNVERIFIABLE**；HN 传的 "$200/月对学生免费" 同样**未核实** |
| **Colab Data Science Agent** | 空白 Colab → 上传数据 → Gemini 侧栏写目标 | **一整个可执行 notebook**（"Not just code snippets, but complete, executable notebooks"），非代码片段 | **免费**；18+、仅部分国家语言；DABStep 第 4 名，领先基于 GPT 4.0/Deepseek/Claude 3.5 Haiku/Llama 3.3 70B 的 ReAct agent；官方字幕 **"Data Science Agent may make mistakes"**；2025-03-03 扩大开放。来源：Google Developers Blog（一手）。→ 产物面向**会读 Python 的人**，把「我不懂」从统计转移到工程 |
| **Vizly** | 上传 → 自然语言问 → 生成 Python 或 R 代码 | 代码 + 结论 | Basic **$19.99**（"Up to 200 messages per month"）、Premium **$29.99**（unlimited）、**学生/学者 25% 折扣**；闲置 1 小时后永久删除。来源：Wayback vizly.ai/pricing 快照 2026-07-20（已回源确认） |
| **Powerdrill** | Bloom（多 agent 编排，$19.90 起）/ Chat（问数据，$3.90 起） | — | 批评点 "may require technical knowledge to set up effectively"；aichief 2026-07-14（medium） |
| **Numerous.ai** | **不是对话式，是表格插件**：Sheets/Excel 里一个 `=AI()` 公式 | 批量文本归类、清洗、生成 | **不做统计推断**；Personal $10/月（年付）。来源：numerous.ai 官网（一手）。→ 反面意义：把 AI 塞进单元格做的是**文本活** |
| **Manus** | 通用 agent 任务 | — | Free $0（300 日刷新 credits）/ Standard $20（4,000）/ Customizable $40（8,000）/ Extended $200（40,000），来源 No Code MBA（2026-06-26）；**eesel.ai 同期给的是 $19/1,900、$39/3,900、$199/19,900 —— 两家二手源互相矛盾，manus.im/pricing 纯客户端渲染，官方无法回源**（见 §九·D6）。深度检索 **500–900 credits**（多来源），另有「超过 900」的转引报告。🔴 **Manus 已被 Meta 收购**（manus.im Wayback 2026-07-01 横幅 "Manus is now part of Meta"，页脚 "© 2026 Meta"）→ 上述是**收购前的历史定价** |
| **Genspark** | 官网 403，**未核实，不做判断** | — | — |

**notebook 侧（不是对手，但定义了「专业口径」）**：Hex Magic（schema 命名清晰时 JOIN/聚合/窗口可靠，含糊时下降）、Deepnote（协作优先）、Databricks（Genie Code 2026-07-08 起按量计费 + 每用户免费月额度，Genie One/Agents 免费至 2027-01-31）、Jupyter AI v3.1.0（"Guardrails By Default — Agents request permission before writing files, running commands, or using MCP tools"，是**权限护栏而非统计正确性护栏**）。
⚠️ 原报告「Databricks 文档里既无准确性免责也无『请校验生成代码』表述」已降级为 **UNVERIFIABLE**（其 Genie 子页客户端渲染，无法确立「不存在」，且同站已见 "verified answers" 机制）。
→ 这一层的共识是 **"AI 生成代码，人负责 review"**；它们不承诺正确，因为用户有能力自查。**我们的用户没有。**

**中国侧（真正的存量对手不是 AI）**：

- **WPS AI 数据助手**：能自然语言排序/筛选/推荐图表、AI 写公式、智能清洗；**明确不能**"自动完成复杂的数据清洗、数据透视表构建或跨表关联分析"、"不支持自动跨表引用、合并多个工作表的数据"；**仅 Windows 版**；官方原话还有"AI 给出的'趋势判断'和'结论'是基于数值本身的计算结果，**它不理解业务背景**"。⚠️ 更正：官方口径是「表格超过 **500 行或 20 列** 时**响应明显变慢**」——说的是**速度**不是**质量**，原报告「超 500 行效果下降」需收紧（见 §九·D11）。WPS 365 付费 199–599 元/人/年。来源：wps.cn 官方文章（一手）
- **SPSSAU**：约 500 类分析方法，交互是**左右拖拽分析项、点击开始分析**，产物口径是 **"规范化表格，可视化图形，智能化分析"**、**"有图，有表，有文字"**（官网逐字，一手 high）。⚠️ B1 标「价格未核实（/vip.html 404）」，但 **B2/B3 已从 addmoney.html 一手直读到完整价目**，以后者为准（见 §九·D1）
- **SPSSPRO**：360+ 算法、43 种图表、AI 报告生成，主打高校与竞赛渠道。**价格未核实**
- **人工「代跑统计」**：市场存在（台湾丘老師統計暨調查研究中心**自称**2007 年成立、服务超过 1,000 个论文项目；StudyGate **自称**"80 分以下全额退款，14 天内免费修改"）。⚪ **B1 本轮未能独立核实，具体报价未核实**，"自称"二字不可去。**但 B3 已拿到 EBOSS / 新菊 / zuoyedaixie 三家的一手直读价目表**（见 §三）

### 1.2 Q1：统计推断靠不靠谱？有没有公开翻车？

**结论：描述统计与画图基本可用；一进推断，从「基础检验」到「多因素模型」是断崖。且已有可引用的翻车与滥用案例。**

| 证据 | 数字 | 来源（置信度） |
|---|---|---|
| 逐项对拍 SPSS（14 项分析） | ChatGPT-4 在描述统计、相关、简单/多元线性回归、单样本/配对/独立样本 t 检验上与 SPSS 基本一致；失败点为 **MANOVA 自由度算错直接影响显著性**、**重复测量 ANOVA 未做球形度校正**（原文 "No sphericity corrections were provided, meaning it assumed sphericity was met."）。o3-mini 相关系数虚高、在本不该显著处报显著；Time2 的 **t 值** 44.909 vs SPSS 27.649（⚠️ 更正：是 **t 值**不是系数）。⚠️ 更正：**o3-mini 反而给出了完整 GG/HF/LB 校正**（GG df 1.56 vs SPSS 1.188），故不是「o3-mini 全面更差」，而是**各有各的错法**。作者结论："its reliability diminished in more advanced statistical procedures." | *Cureus* 2025-04-10, Strale et al., [PMC12065437](https://pmc.ncbi.nlm.nih.gov/articles/PMC12065437/)（high，CONFIRMED） |
| 复现 20 项真实研究主要结局（去标识病人级数据） | 多智能体 **53.3%**（95% CI 40.7–66.0）vs ChatGPT-4o **35.0%**（22.9–47.1），**P=.04**。失败归因：多智能体 = 数据变换 **46.4%** + 分析代码错误 **21.4%**；ChatGPT-4o = **统计方法选错 38.4%** + 数据变换 **45.6%**。另：**多智能体未观察到变量或结果幻觉** | *JCO CCI* 2025-12, Wang/Swoboda/Nazha, PMID 41418093, DOI 10.1200/cci-25-00176（high，CONFIRMED） |
| 通用基准 | DSBench：466 数据分析任务 + 74 建模任务，**最好的 agent 只解决 34.12% 的数据分析任务**（⚠️ 口径限定：34.12% 是那 466 题；74 道建模题另以 RPG 34.74% 衡量）。BLADE：12 个来自真实文献的数据集，ground truth 由独立专家给出，模型 "often limited to basic analyses"、决策多样性 "still non-optimal" | [arXiv 2409.07703](https://arxiv.org/abs/2409.07703)、[arXiv 2408.09667](https://arxiv.org/abs/2408.09667)（high） |
| **公开翻车/滥用案例** | 研究者让 **GPT-4 ADA 直接编造** 300 眼 / 250 名圆锥角膜患者数据集（DALK vs PK），要求 "fabricate data that would result in a statistically significant difference"；**AI 照做**：P<.001、logMAR 差 −0.05、散光差 −0.91 D。**论文自陈的唯一破绽**是连续变量取值范围 "not always accurate"。⚠️ 原文**并未**使用 Benford 定律、末位数字分析、ID/年龄错配或 SD 模式检验 | *JAMA Ophthalmol* 2023-11-09, Taloni et al., [PMC10636646](https://pmc.ncbi.nlm.nih.gov/articles/PMC10636646/)（high，CONFIRMED） |
| 检测侧同样不成熟 | "AI has moderate accuracy overall but performs better in controlled settings"、"editors must make final decisions"、"humans must make the final decision"。⚠️ 日期更正：**2025-12-22**（非 12-01）。对守门设计直接有用的一条原文：**"The Statcheck and GRIM-Test are especially good at spotting statistical errors"** —— **确定性规则工具反而比 LLM 稳** | *J Korean Med Sci*, Alnaimat et al., PMID 41430754（high） |

⚠️ **必须降级的一组**：原报告关于 Julius「同一问题两次结果不同」「行数低于 30–50 行编造统计量」「用户报告 p 值不正确」的三点，唯一来源是 **mcpanalytics.ai —— Julius 的直接竞品，文末即卖自家产品**；追下去分别是「竞品转述的匿名 G2 评论」、"most likely to happen with…"（无实验无样本）、"Users have reported"（未具名）。**判定 UNVERIFIABLE，只能作为「竞品主张」引用**，同一结论应改挂到上表两篇同行评议论文。

→ **把两组数字并读，结论极清晰：失败大头不在「算错」，而在「选错方法」（38.4%）与「数据没整对」（45–46%）。统计引擎不是瓶颈，前面那两步才是。**

### 1.3 Q2：方法选择这一步怎么处理？

**结论：几乎全部是「模型猜」。全场没有一个 AI 原生产品有真正的守门机制。**

| 处理方式 | 谁 | 说明 |
|---|---|---|
| 模型**静默地替你选** | Julius、ChatGPT ADA、Powerdrill、Vizly、Colab DSA、Manus | 用户说"比较两组有没有差异"，模型自行决定 t 检验还是 Mann-Whitney，**不问设计、不问配对、不问分布，也不告诉你选了什么和为什么** |
| **甩回给人** | Hex、Deepnote、Databricks、Jupyter AI | 默认用户是专业人士。Jupyter AI 唯一护栏是权限确认，与统计正确性无关 |
| **事后审查** | Claude Science 的常驻 reviewer agent | 全场唯一带「审查者」角色，但它审的是 **声明↔证据的可追溯性**（引用、不可追溯的数字、图与生成它的代码不一致），**不是方法学选择** |

**一个必须小心的「好消息」**：*Cureus* 2025-10-19（[PMC12627256](https://pmc.ncbi.nlm.nih.gov/articles/PMC12627256/)，20 个标准化场景、5 位生物统计专家 5 点量表）发现 ChatGPT/Claude/DeepSeek/Gemini/Grok/Le Chat **六模型在「选哪个统计检验」上 100% 正确**（Claude 清晰度最高 4.65±0.58，Gemini 教学价值最高 4.50±0.68）。但作者自述三条前提：场景是 **basic biomedical research rather than advanced-level biostatistics**；只测 **free versions**；**只测了一天（2025-08-21）**；统计推理评分区间 **3.16–4.66**，复杂回归明显更低。
⚠️ **该 100% 与 B4 引用的另一篇 *Cureus*（2026-06-29，40 场景，Grok/Copilot 34/40、Gemini 32/40、ChatGPT 30/40）差 15–25 个百分点，属材料间分歧**，见 §九·D8。

→ **本章最重要的产品洞察**：「给定完整描述时模型选得对」与「给定原始数据时模型选错 38.4%」并不矛盾 —— **差的就是「把研究设计问出来」这一步，而这一步现在没有任何一个产品在做。**

### 1.4 Q3：产物能不能直接进论文？

| 产物 | 结论 |
|---|---|
| **图** | 能进，但**被允许进的段落有限**。⚠️ 原报告「未命中高影响因子期刊」已被 **REFUTED**：Europe PMC 全文检索 `"Julius AI"` **hitCount = 53**，含 **PLoS Medicine** 2025-12-05（PMC12680241）、*J Med Internet Res*、*BMC Med Res Methodol*、*J Exp Bot*、*Int J Mol Sci*×3、*Mol Med*、*Lupus Sci Med*、*JACC Advances*、*PLoS One*×2 等；Cureus 仅 3 篇、Preprints.org 仅 3 篇，占比不足 12%。**更锋利的观察**：PLoS Med 原文写 "All the analyses … were performed using **Stata software, version 17/SE** … **Data visualizations were performed using Julius AI**" —— **统计仍交给 Stata，Julius 只被允许做可视化**。天花板不在「能不能进论文」，而在「**被允许进论文的哪一段**」 |
| **表** | 落差最大。SPSSAU 的核心卖点就是"规范化表格"+"有图，有表，有文字"（官网一手）。⚠️ 原报告「AI 原生产品只给 Markdown 表和 PNG」已被 **REFUTED**（Julius 官方定价页 Plus 及以上列 "Export slides, HTML artifacts, charts, and images"；原报告的反证是一篇 2024-01-26 的第三方教程"没提 APA 表"，属无效论证）。**站得住的窄版结论**：**没有任何一家 AI 原生产品提供中文期刊要的三线表 / APA 制式表 / LaTeX 表格源码**（B1 内未找到反例）。⚠️ 跨章后该全称命题需再收窄一档 —— Uedufy（L7）出 APA 7 表、JASP/jamovi（L4）出 APA 表直粘 Word，见 §九·D9 |
| **方法学描述** | **全场都不达标，但已经有人在硬用**。一段合格描述至少要有软件与版本、检验名、统计量、自由度、精确 p、效应量、95% CI、前提检验是否满足与如何处理 —— 上述工具**没有一个把这套作为结构化产物输出**。而 *Cureus* 2026-02-13（PMC12989703）已逐字写着 "Data analysis and visualisations for this study were assisted using Julius AI"；*BMC Ophthalmol* 2026-03-28（PMC13151164）写 "The study analyzed 90 OCT images … using the GPT-4V model via the Julius AI platform"。**用户不等我们准备好就已经在用了**，只是要自己手工把结果翻成方法学句子 —— 而这正是最容易出错、也最容易被审稿人抓的一段 |

### 1.5 嘴上说 / 实际卡在 / 掏钱买了

> 需求侧的完整版在 [SYNTHESIS-需求.md §3 / §5](./SYNTHESIS-需求.md)；此处保留 B1 原文，因为它是**从供给侧价目表反推需求**的独立路径。

**(a) 嘴上说要什么**
"上传表格，一句话出图"、"自动帮我分析"、"直接给我结论"、"不用学 SPSS"。
这层需求所有产品都已满足，**没有差异化空间，也不是购买决策的原因**。

**(b) 实际卡在哪**（按证据强度排序）

| # | 卡点 | 证据 |
|---|---|---|
| 1 | **方法选错，且不知道自己选错了** | ChatGPT-4o 在真实病人级数据上 **38.4% 的失败源于统计方法不正确**（JCO CCI 2025-12）。用户看到的是漂亮的 p 值，看不到「这里本该做重复测量 ANOVA」 |
| 2 | **数据变换/整理才是最大头（45.6% / 46.4%）**，不是统计本身 | 宽转长、缺失值、分组变量编码、多表关联。WPS 官方自承"不能自动完成复杂的数据清洗、透视表构建或跨表关联分析" |
| 3 | **不可复现，不敢写进论文** | ⚠️ 原报告此处依据的 Julius「同问两次结果不同」是**竞品主张（UNVERIFIABLE）**；但同一结论有同行评议支撑 —— 现生成代码带来的方法漂移正是 JCO CCI 38.4% 与 Cureus 高级方法失败的机制，另见 §四·F5 的 480 次实验 |
| 4 | **小样本上被编数据** | ⚠️ 「30–50 行阈值」来源为竞品评测，**UNVERIFIABLE**；但 AI 主动编造整个数据集已有同行评议实证（JAMA Ophthalmol 2023） |
| 5 | **产物形态不对，还得返工** | 拿到 Markdown 表/PNG/notebook，要的是三线表 + 矢量期刊图 + 一段能放进 Methods 的话 |
| 6 | **跑不动 / 断了就没了** | ChatGPT 单文件几百 MB 封顶、几千万行在 load 阶段 OOM、断线丢全部中间变量、跨会话零状态；Claude 容器 5 GiB/1 CPU/断网；WPS 超 500 行或 20 列响应明显变慢 |
| 7 | **成本不可预期** | Manus："**doesn't tell you how many credits a task will cost** before you hit go"；深度检索 500–900 credits（多来源），另有超 900 的转引报告。⚠️ 原报告引的"整个产品最大投诉来源"那句**查无出处，已删除引号**；且 Manus 已归 Meta，此为收购前定价 |
| 8 | **计费单位与真实工作节奏错配** | ⚠️ 原报告「Julius 250 条/月、改一次图扣一条」已 **REFUTED**（官方现为 credit 制，页面从未出现 "messages"；那句引文是 coefficient.io 自己的叙述，非 Julius 官方文案）。**该洞察仅可作为对 credit 制的类比推测，不能当事实引用** |

**(c) 最后掏钱买了什么**

| 人群 | 买了什么 |
|---|---|
| 海外学术个人 | ChatGPT Plus $20/月（最广的默认选择，因为它顺带做别的事）；**Julius Plus $20 / Pro $45**（官方 Wayback 2026-08-03 回源，年付省 20%）；**Vizly $19.99 / $29.99，学生学者 25% off**（官方回源确认）；Claude Pro/Max（Claude for Excel 与 Claude Science 都不单收钱，是订阅内加量）。⚠️ **「Julius 学生教师 5 折 ≈$18.5/月」已降级为 UNVERIFIABLE** —— 官方定价页无任何学生折扣字样，$18.5 恰为年付 $37 的一半，系二手源自行折算 |
| 价格锚点 | 学术个人月费落在 **$20–$45**；学生折扣**至少 Vizly 一家确证为 25%**，「25%–50% 是标配」不成立（Julius 侧未核实） |
| **中国学术个人（目标人群）** | SPSSAU / SPSSPRO 会员（形态是「按次/按期买规范化输出」；SPSSAU 价目见 §三，SPSSPRO **仍未核实**）；**人工代跑统计**（B1 内未核实报价，B3 已取到台湾侧一手价目）；WPS 会员 / WPS 365（199–599 元/人/年）—— 顺带买到，不是为数据分析买的 |

→ **最关键一条**：中国学术用户在这件事上**已经在花钱**，而且花的是**「服务费」不是「工具费」**。

---

## 二 · 传统统计软件与其 AI 化

> 来源 `raw/B2-传统统计软件与其AI化.md`（调研 2026-08-04）。本章所有定价与「有无某功能」的断言，均已按该文文末《事实核查记录》更正；被判定 REFUTED / UNVERIFIABLE 的原始表述不再出现，或已降级为待验证假设。
> 用户原声并入 [§八](#八--用户原声集逐字按主题归类)（本章表格内的引文属论证组成部分，就地保留）；未覆盖项并入 [§九](#九--本章的证据强度与存疑)。

### 2.1 四条结论

1. **护城河不是功能，是社会关系**：锁住 SPSS 用户的是「导师会不会 + 院系教什么 + 教程有没有」，不是学习曲线——JASP/jamovi 的迁移成本被用户反复描述为接近零，人却没走。
2. **AI 化整体很浅，且路线分裂**：IBM/Minitab 押「把已跑出的结果翻译成人话」，JMP/SAS/Posit 押「生成代码」，GraphPad Prism **完全没进场**。全部锁在付费软件内部，中国用户基本够不着。
3. **免费玩家已经吃掉了「算完 → 粘进 Word」这一格**（本案第一结论的最强反证，见 §2.4）。
4. **真实竞品不是 SPSS**，是 SPSSAU（¥258/月）、SPSSPRO、ChatSPSS 与淘宝代做（¥100–500）；国际正版价格对中国学生不存在。

### 2.2 粘性来源：为什么离不开

| 软件 | 粘性真正来自 | 关键证据 |
|---|---|---|
| **IBM SPSS** | 点选式 GUI（不用写代码）＋ 院系课程默认工具 ＋ 导师看得懂 | 「SPSS 破解版」检索头部全是安装教程（知乎 p/2043590314754061760 含「永久使用方法」、B站 BV1ZH3M6JE9e）；用户称 "the majority of the universities prefer SPSS for stats"（pullpush 汇总） |
| **GraphPad Prism** | 唯一把「实验台上的数据布局」当一等公民：先选数据表类型（XY/Grouped/Column/Contingency/Survival/…）→ Analyze → 按表型过滤掉不适用的检验；且**审稿人见惯了它的图** | Prism 11 release notes 提到 Multiple Variables 表可 "through variable assignment rather than reformatting data"（graphpad.com，2026-08-04 直取）。⚠️ 分析向导交互细节**未逐字核实**（官方 guide 页 404），置信度中 |
| **Stata** | `.do` 文件可复现性 ＋ 期刊 replication package 要求 | stata.com/order/new/edu/profplus/ 直取。**未查到官方 AI 助手**（置信度中，未穷尽检索） |

Prism 的价值被一句话说穿，同时也点出它的替代路径：

> "There are all kinds of systems like GraphPad Prism which try to bridge Excel and 'real' stats, where 30 lines of python and a CSV file would save them months."
> —— snovv_crash，Hacker News，2021-07-28T11:15:42Z

Prism 的死穴同样清楚：

> "every time my analysis was updated, I would have to potentially update the data frame significantly and redo the analyses."
> —— cookie_arrest，r/labrats（pullpush 抓取）

SPSS 被恨的一侧几乎全在**输出**与**价格**：

> "plots from SPSS look like a kid drew them with crayons (imo)"
> —— FeistyRefrigerator89，r/labrats，created_utc 1716902660（≈2024-05-28）

> "spss is expensive trash that will only delay you learning a useful tool."
> —— bonferoni，r/IOPsychology，created_utc 1738038913（≈2025-01-28）

### 2.3 输出形态与「搬进论文」的手工劳动量

**物理结构**（spss-tutorials.com/spss-output/，2026-08-04 直取）：输出查看器 = 左侧 output outline ＋ 右侧 output items（枢轴表与图），存 `.spv`。

- 一次普通 t 检验吐 **2 张表**（Group Statistics ＋ Independent Samples Test，后者横跨 Levene's Test 与 t-test 约 10 列宽表）；一次线性回归吐 **4 张表**（Model Summary / ANOVA / Coefficients / Excluded Variables）。**论文只能放一张。**
- 官方教程列出的调整动作：`TVARS`/`TNUMBERS` 语法、出结果前设 tablelooks(.stt) 与 chart templates(.sgt)、事后删多余输出项、`OUTPUT MODIFY` 批量改格式、File→Export 或逐个 Copy Special。
- 枢轴表编辑器，官方教程自己劝退：

> "we recommend you only use the pivot table editor **if everything else fails**. One reason is that **you can't replicate and rerun whatever you do in the pivot table editor**."
> —— spss-tutorials.com/spss-output/

- 导出 Word/Excel：**表格结构保留、格式全丢**（可由 spss-tutorials 佐证；原报告引用的 IBM 官方整句因 ibm.com/docs 403 且短语检索零结果，**已按核查记录降为不带引号的转述**）。
- **中文场景更惨——三线表**：SPSS 只有近似方案（「编辑」→「选项」→「透视表」→「表外观」选 **Academic**），导出 Word 后仍需手动调边框（blog.csdn.net/zhangfeng1133/article/details/146131229，2026-08-04 直取，原文明写「导出到Word的三线表可能需要进一步调整格式」）。

**工作量估计**：一篇社科/医学硕士论文第四章典型 8–15 张表，每张走「跑出 2–4 张宽表 → 挑行列 → 重排三线表 → 手改边框 → 手写星号 → 手写表注 → 写叙述段」，保守 2–4 小时纯手工，且数据一改全部重来。⚠️ **该数字为估算、未实测计时，核查记录判定为 UNVERIFIABLE，引用时须保留此标注。**

最硬的一条旁证来自 IBM 自己的中国经销商：¥399/30 天的学生包里塞的是——

> "30天SPSS Base版正版授权 / 专属社群专家答疑支持 / 6大核心分析方法视频课程 / **标准化三线表制作指导** / 官方安装指导教学"
> —— spss.mairuan.com/monthly.html，2026-08-04 直取（该主体应表述为「IBM SPSS 中国区主要经销商（自称独家发行商）」，**未见 IBM 官方公告**；页脚运营主体为苏州麦软网络有限公司）

### 2.4 JASP / jamovi 已经吃掉了哪一格 ← **本案第一结论的最强反证**

**它们吃掉的正是 §2.3 那 2–4 小时**，而且免费。

| 产品 | 定位（官网原文） | 吃掉的那一格 |
|---|---|---|
| **JASP**（jasp-stats.org，2026-08-04 直取；阿姆斯特丹大学支持） | "A free cross-platform software program with a state-of-the-art graphical user interface" | **"Support for APA format (copy graphs and tables directly into Word)"** ＋ "Annotated output for communicating your results" |
| **jamovi**（jamovi.org） | "a free and open statistical spreadsheet… powered by the R statistical language"；社区模块再提供 "70+ more"；Rj Editor 可直接写 R | APA 表直接 copy-paste 进 Word |

用户原声证实卖点真的兑现：

> "I downloaded JASP, opened up my SPSS file and literally ran my first analysis and had a table done within five minutes. The learning curve was nonexistant..."
> —— Zelamir，r/labrats，created_utc 1689968759（≈2023-07-21）

> "Copy. Paste. DONE"
> —— Zelamir，r/labrats，描述 JASP 的 APA 自动排版（pullpush 抓取）

> "JAMOVI [outputs] absolutely everything in APA tables you can literally copy and paste into a Word document"
> —— VanillaSkittlez，r/IOPsychology（pullpush 抓取，created_utc 1585445178）

**这意味着**：「把结果搬进论文」这件事，在英文 APA 场景下**已经有免费且零学习成本的解**。留给我们的空隙只剩三处（B2 原报告未做进一步验证）：**中文三线表/中文期刊规范**、**方法选择与前提假设诊断**、**接研究语境的叙述段**。

**JASP/jamovi 的公认短板**（pullpush 汇总的社区意见）：
> jamovi/JASP "pretty good for simple analysis but can't use some techniques that require a bit more power (multiple imputation, bootstrapping, etc.)"

### 2.5 各家 AI 化的真实进度

| 产品 | AI 做的是什么 | 时间 | 门槛 / 状态 |
|---|---|---|---|
| **IBM SPSS AI Output Assistant** | **选中输出 → 自然语言提问 → LLM 解释**（不是替你跑分析） | 自 **31.0.1** 起引入，IBM 社区博客 2025-09-24/25 宣布；截至核查日已到 **31.0.2.0** | 需 SPSS 授权 **＋自备 watsonx trial/付费账号＋网络可达 IBM 云**（中国三条全废）。社区专帖报 "Credentials set, but the signal could not be renewed"，打了 fix `31.0.2.0-IM-S31STAT-ALL-IF002` **仍未解决**，帖子终结时问题未解 |
| **Minitab AI** | ① 对话式帮你选分析/图表 ② 结果 → "clear, easy-to-understand natural language summaries" | 已上线 | **仅 web app**、需订阅开通。官方建议「用英文提问、把复杂问题拆小、分步追问」——变相承认长上下文一次性解读不可靠 |
| **JMP Assistant** | 自然语言 → **JSL 脚本**并自动运行（生成代码，非解释结果） | marketplace.jmp.com 上架 | 需 JMP 授权 |
| **SAS Viya Copilot** | 生成代码 / 搭 model pipeline / 报表本地化翻译 | 2025.12 stable release | "native feature included at **no extra cost** in SAS Viya 4…"（sas.com/viya/copilot） |
| **GraphPad Prism 11.0.0**（2026-02-17） | **零 AI**。新增仅：Multifactor ANOVA、表内公式、Multiple Variables 表直跑经典分析、效应量全报告、Prism Pro/Enterprise 分层 | — | release notes **全文 0 处 AI / assistant / LLM** |
| **Posit（Positron ＋ Posit Assistant）** | AI ＋ 活的数据 session ＋ 可复现代码，三者绑定；2026-03 推出，Positron 2026.07 GA | 免费（Elastic License 2.0，source-available 非 OSI 开源） | **受众是已经会写 R/Python 的人**，与我们目标用户不重合 |
| **Excel ＋ M365 Copilot** | advanced analysis 模式 "opens a new sheet and inserts Python code as **refreshable Python cells**"；Python in Excel | ⚠️ 原报告的「2026-04 起」日期**已按核查记录删除**（唯一支撑是 MS Q&A 页面时间戳，取证工具自标 data anomaly） | $30/user/月（企业年付）。Analysis ToolPak 天花板极低：微软官方支持页列出的 19 项工具中**无 Tukey/Bonferroni/Scheffe 任何多重比较** |

三家大厂在同一季度分裂成「解释结果」与「生成代码」两条路线，说明**这事尚无共识**。

**独立小工具里做得最像样的：Uedufy「Chapter 4 Interpreter」**（app.uedufy.com/tools/stats-interpreter/，直取）
- 输入：SPSS 导出 **PDF**（v25–29）、AMOS PDF（SEM 拟合指数）、Excel 手录；覆盖信度、描述统计、前提假设、t 检验、ANOVA、回归、中介、调节
- 输出：APA 7 叙述段 ＋ 结构化 APA 表 ＋ 引文（George & Mallery / Hayes / Field / Cohen）＋ 参考文献 ＋ 可下载 PDF
- 定价：**$5/5 次、$15/20 次（$0.75 单次），一次性付费、无订阅、不自动续费**
- 核心卖点：**"7-day Zero Hallucinations refund"**——"if any number is hallucinated or any reference is fabricated"

> **对我们是硬约束**：市场已把「AI 编数字」认定为本品类头号失效模式，并已有人拿退款保证去打它。**证据账本/引用校验在这里不是加分项，是入场券。**

**中国本土（真实竞品）**

| 产品 | 定价 | AI 表述（原文） |
|---|---|---|
| **SPSSAU** | ¥9.8/24小时、¥69.8/周、¥258/月、¥2588/年；免费版限**前 100 行** | 「智能化文字分析」；约 500 类分析方法。⚠️ **¥9.8/24小时档明确不含「智能化文字分析」与 Power 模块**（addmoney.html 原注）——最贵的解读能力被挡在最便宜档之外 |
| **SPSSPRO** | 官网标「免费使用」，有会员入口，**具体价格未查到**（另见 §九·D2） | 「一键生成智能分析报告」「**AI大模型自动生成专业解读结论**」「AI自动识别数据结构，**推荐最佳算法**」；360+ 算法、43 种图 |
| **ChatSPSS**（成都自然智科技，蜀ICP备2025134262号） | **未查到定价** | 「**像聊天一样完成统计分析：上传CSV/Excel/SPSS(.sav)/Stata(.dta)数据或直接描述研究问题，自动生成三线表与专业解读**」；27+ 分析方法 |

🔴 **必须采用的核查更正（R-4）**：原报告推断「三家中国竞品共同的结构性弱点是表单驱动、用户仍必须自己知道该用哪个检验」——**该推断被产品页直接证伪**：ChatSPSS 首句即「或直接描述研究问题」，SPSSPRO 公开宣称「推荐最佳算法」。这条原本是「agent 唯一差异化机会」的**唯一支点**，且是本章唯一未经实测的推断。**在实际注册试用 ChatSPSS / SPSSPRO 之前，不应把它当成已确立的市场空隙。**（与 B3 §3.6-Q4 的立论构成材料间分歧，见 §九·D7。）其余推断（解读文字模板化、前提假设诊断链条断裂、不接研究语境）同属未试用推断，置信度中。

### 2.6 迁移阻力的真实构成

**不是功能，是三样社会性的东西 ＋ 一个反直觉发现。**

| 阻力 | 证据 |
|---|---|
| **(a) 导师** | > "SPSS when my PI insists on seeing what I'm doing because she's old and never learned"<br>—— AvocadosFromMexico_，r/AcademicPsychology，created_utc 1735071993（≈2024-12-24）<br><br>> "Your PI is being ridiculous and has antiquated attitudes."<br>—— Stauce52，r/PhD，created_utc 1739196197（≈2025-02-10）。⚠️ 按核查更正：帖中 PI 是**劝阻/不建议**用 R，**不是「禁止」** |
| **(b) 院系与课程路径依赖** | > "Is it normal? Unfortunately yes. Is it a disservice to all of the students who almost certainly will not have access to SPSS in industry? Also yes"<br>—— creich1，r/IOPsychology，created_utc 1738886128（≈2025-02-07）<br><br>> "it was important for them to not have any math prerequisites which severely limited how they were able to teach statistics"<br>—— rite_of_spring_rolls，r/AcademicPsychology，created_utc 1745986206（≈2025-04-30） |
| **(c) 点选 vs 写代码的能力断层** | > "R plots look nice but I have to say that using R is pain in the ass and if you do not have programming experience it is not worth it. Rather use prism, excel or event spss outputs."<br>—— Pkyr，r/labrats，created_utc 1716890778（≈2024-05-28） |
| **(d) 界面几乎不是阻力** | JASP/jamovi 迁移成本被反复描述为「接近零」（Zelamir 的五分钟）。**锁住人的是社会关系，不是学习曲线。** |
| **(e) 触发迁移的唯一可靠事件：失去 license** | > "every student who starts becoming dependent on SPSS's user-friendlyness will start to struggle the moment they lose access to their university's academic license"<br>—— wischmopp，r/AskStatistics（pullpush，created_utc 1729006560）<br><br>> "SPSS is expensive and you simply won't always have a license."<br>—— CJP_UX，r/UXResearch（pullpush，created_utc 1734441237） |

⚠️ 原报告引用的 shubonid「didn't 'trust' SPSS」一条**已按核查记录撤下**：其上下文是学术不端举报后的报复性审查，不是「导师因守旧不信任软件」，属语境挪用。

**推论**：不要说服用户离开 SPSS。**让产物看起来就是从 SPSS 里出来的**——同样的表结构、术语、报告口径；用户和导师都不需要知道底下跑的是 Python。

### 2.7 定价对中国学生意味着什么

按 1 USD ≈ 7.2 CNY 估算换算：

| 项目 | 原价 | ≈ 人民币 |
|---|---|---|
| SPSS 商业订阅 Base | $86.58/月（daisource.com 快照，**置信度中**） | ≈ ¥7,480/年 |
| SPSS 单用户年费 | $1,188/年（pricingnow.com，**置信度中**；IBM 官网 pricing 页 403，**官网原始报价未核实**） | ≈ ¥8,550/年 |
| **SPSS 中国学生包** | **¥399/30 天**（原价 ¥899，页面直取，置信度高） | ≈ ¥4,788/年（如续） |
| SPSS GradPack Premium（美国） | $89/12 月（studentdiscounts.com 快照，置信度中） | ≈ ¥640/年 |
| GraphPad Prism 学生 / 学术 / 商业 | $142 / $260 / $520 每年；月付 $50；永久 学术 $1,600 / 商业 $3,200 | ≈ ¥1,022 / ¥1,872 / ¥3,744 每年 |
| Stata/BE·SE·MP2 学术 | $175 / $275 / $395 每年（官网直取） | ≈ ¥1,260 / ¥1,980 / ¥2,844 |
| **JMP 学术** | 🔴 **免费**（jmp.com/en/academic：JMP Student Edition "a full-featured version of JMP Pro, is **free**"，每 12 个月 "at no cost" 续期）。原报告的 $29.95 / $1,250 **仅出自第三方聚合站，官网无对应数字，已按核查记录作废** | ¥0 |
| MedCalc 单用户永久 | €549（≈$634）。🔴 按核查更正：官网同时提供 **annual subscription**，「无订阅制」的说法**不成立** | ≈ ¥4,300（一次性） |
| M365 Copilot 企业版 | $30/user/月（年付；小企业 $21，促销 $18 延至 2026-09-30，且须叠加已有 M365 订阅） | ≈ ¥2,590/年 |
| **SPSSAU** | ¥258/月 ｜ ¥9.8/24 小时（该档不含文字解读） | ¥3,096/年 ｜ ¥9.8 |
| **淘宝/知乎代做一次** | 知乎口径「一般五百左右，包含小调数据」（zhihu.com/question/513636025，逐字命中）。⚠️ ¥100–500 区间**证据较薄，未逐个核实成交价**；原报告「淘宝 1000+ 商品」已按核查记录删除 | ¥100–500 |
| **Uedufy 单次解读** | $1 / $0.75 | ≈ ¥7 / ¥5.4 |
| **破解版** | — | **¥0**（盗版率**无任何可信统计，不给百分比**） |

**四条推论**

1. **国际正版价格对中国学生不存在。** 不是在跟 license 竞争，是在跟 **0 元 ＋ 一个下午的安装折腾**竞争。（原报告的「¥1999/年」已按核查记录删除——本轮仍未取到任何一手来源。）
2. **真实心理锚点只有三个：¥0 / ¥9.8–¥258 / ¥100–500。** 应锚在中间档，且**按次/按天**而非按年——SPSSAU 敢卖 ¥9.8/24 小时，说明市场天然接受「我这周要交论文，给我买一天」。
3. **代做的 ¥500 是价值上限不是价格上限。** 用户买的是「有人替我把整个第四章搞定，包括我看不懂的部分」；能替代的越接近整包，越能定到接近 500。只做「跑个 t 检验」，天花板就是 ¥9.8。
4. **不要按年订阅。** 学生需求是脉冲式的（开题、中期、盲审前、投稿返修），年订阅在此场景反人性。

### 2.8 技术选型（B2 结论，含核查更正）

- **pingouin**：官方自述为 "an open-source statistical package written in Python 3 and based mostly on Pandas and NumPy"。🔴 原报告引用的 "an APA-friendly wrapper for common biostatistics tests" **不是 pingouin 官方口径**，只见于第三方 Medium 对比文，已作废。实质仍成立：README 能力清单含「Effect sizes and power analysis」「Parametric/bootstrapped confidence intervals」，`pg.normality()` / `pg.multivariate_normality()` 提供前提检验；文档写明 `ttest` 返回 T 值、p 值、自由度、Cohen's d、95% CI、统计功效与 BF10——但这是**单个函数的返回，不能说成「默认输出就带」的全局属性**。
- **statsmodels** 做回归（"the most comprehensive statistical modeling capabilities with detailed diagnostics"），scipy 做底层。**不自建统计引擎。**

---

## 三 · 中文在线统计工具与代做市场

> 来源 `raw/B3-中文在线统计工具与代做市场.md`。取证边界：本次 90 余次抓取全程 WebSearch 配额耗尽，改用 WebFetch 打 DuckDuckGo/Bing HTML 端点。**Reddit、CrossValidated、知乎问答页、小红书、淘宝/闲鱼商品页在该环境全部不可达**，英文用户原声一条未拿到。下文凡标「二手」者为搜索引擎摘要转述，未直读原页。原报告另附对抗性事实核查（25 次独立抓取，总判定 minor_issues，20 条中 11 条 CONFIRMED、1 条 REFUTED、3 条 UNVERIFIABLE），**本章已按其更正采用修订后数字**。
> 用户原声并入 [§八](#八--用户原声集逐字按主题归类)；未覆盖项并入 [§九](#九--本章的证据强度与存疑)。

### 3.1 结论先行：这不是一个市场，是三层彼此不通的市场

> 与 §〇 的九层框架的关系：本节的 L1/L2/L3 是**中文市场内部**的三层，对应 §〇 全景表的 **L5 / L6 / L8**。两套编号刻意不合并，因为本节的三层划分是 B3 原报告的分析骨架。

| 层 | 代表玩家 | 卖什么 | 价格锚 | 客户已经知道什么 | 天花板 |
|---|---|---|---|---|---|
| **L1 通用统计 SaaS** | SPSSAU、SPSSPRO、问卷星 | 算法目录 + 一键出表 | ¥9.8/天 ~ ¥2588/年 | 已知方法名、已有干净宽表 | 边际价格已被打到 0（问卷星信效度不单收费）；产品骨架是「算法卡片 + 参数表单」，装不下清洗逻辑与返修 |
| **L2 领域垂直云平台** | 微生信/SRplot、Hiplot、ImageGP、Majorbio、Sangerbox、OmicShare、Chiplot；医学侧 mstata、风暴统计、海豚统计、梦特云、医咖会、EmpowerStats | 学科专用流程 + 期刊级图 | 免费 ~ ¥188–999/年 ~ 微币充值制 | 知道自己学科的套路 | 组学侧靠测序订单/云平台获客，非独立生意；医学侧最深的 mstata 自承 v0.96、完成度 70% |
| **L3 人力代做/辅导** | 淘宝闲鱼个体、新菊统计、EBOSS、mstata 学术服务工作室、论文辅导机构 | **责任 + 返修 + 学历背书** | ¥500 ~ ¥50000 | **什么都不知道，只有数据和 deadline** | 人力不可规模化；第二次返修与第一次一样贵，只能打包卖套餐摊平 |

**结构性事实：L1 与 L3 之间有一条没人跨过去的裂缝。** L1 的入口假设是「你已经有一张干净宽表且知道要做什么」，L3 的入口假设是「你只有一个 Excel 和一句『帮我搞定』」。中间那段——脏数据整理 + 方法论证 + 交付物成型 + 返修——L1 装不下，L3 靠人肉做（所以贵）。

### 3.2 L1 价格与限制（一手，官网直读，2026-08-04）

| 项 | 数字 | 出处 |
|---|---|---|
| SPSSAU 24 小时套餐 | **¥9.8**，明写「不支持文本分析和 Power 功效模块」 | spssau.com/addmoney.html（直读） |
| 周 / 月 / 年套餐 | **¥69.8 / ¥258 / ¥2588**；「付款后不支持退款」 | 同上 |
| 免费版限制 | 「免费版会限制分析前 **100 行**数据」 | spssau.com/helps/accountsrelated/members.html（直读）。⚠️ 百度知道称「限制 **50 个分析样本量**」「100 份以上问卷不可免费使用」，与官方口径冲突，**未核实以哪个为准**（§九·D3） |
| SPSSAU 海外站 | Free $0 / One-Day **$2.99** / Weekly **$9.99**；自述「服务全球约 500 万用户、10,000 所高校」 | spssau.net/pricing.html（直读，**厂商自述未独立核实**） |
| SPSSAU 学术渗透（独立证据） | OpenAlex 全文检索命中 **1,145 篇** | api.openalex.org（直读）。同期厂商侧搜狐文自称「被 **12,384+** 同行评议文献引用」——**约 10 倍口径差，本身即「厂商自述不可直接采信」的现成例证**（§九·D4） |
| SPSSPRO 价格 | 官网 `/price/` 为 SPA 未渲染；百度知道称「19.9 元/月」——**二手，未核实**，且与 2023 年公告「会员权益不设购买通道」冲突 | bbs.spsspro.com/news/272（直读） |
| 问卷星 | 信效度与基础统计**不单独收费**；单独计价的只有 AI 点数（默认 30 点，超出「每加 1 点收费 1 元」） | wjx.cn/Help/Help.aspx?helpid=354（直读）。⚠️ 「与 SPSS 数值对标」一说**不见于官方帮助中心**，仅见于已失效的搜狐推广文 |

### 3.3 L2：被引数是最硬的需求证据（OpenAlex 一手，2026-08-04）

SRplot **2,423** 引（PLoS ONE 2023）· Sangerbox **1,219**（iMeta 2022）· Majorbio Cloud **891**（iMeta 2022）· ImageGP **478**（iMeta 2022）· Hiplot **290**（Brief Bioinform 2022）· OmicShare tools **281**（iMeta 2024）。六个数字经事实核查逐条复核，期刊与年份无一偏差。

**变现全部是「按产物计价」，不是按时间订阅**：微生信微币充值十档（50 元=700 微币 … **500 元=10000 微币**，官方明写「用多少充多少」、不做会员制）；Chiplot 按单工具标价（形态已证实，**具体金额因 SPA 未渲染，未核实**）；Hiplot Pro 197 个工具永久免费。原因是用户的心理账户是「我要出这一张图」，不是「我要用这个软件一个月」。

**最有价值的一条发现（mstata，mstata.com 直读）**：自述 AI 驱动、200+ 方法、自动识别研究设计、自动出 SCI 级表图 + R 代码 + **3,000–5,000 字论文草稿**，chatPubMed「¥3 生成一篇综述」；VIP 三档 **¥188/30 天、¥518/120 天、¥999/365 天**；自承 **v0.96、完成度 70%、试运营中**。而它**同时运营人力代做业务** service.mstata.com（「医学统计分析、论文结果、审稿返修和工单化数据咨询」）。

> **一家宣称「AI 自动出统计表、自动写 3000-5000 字论文」的公司，同时在卖人工代做和审稿返修。这是它自己承认 AI 那条链在返修环节接不住。** 风暴统计 medsta.cn 同构，流程原文含「病案文本数据输入 - 医疗 Agent - **专家验证** - 统计分析 - 论文雏形」。

### 3.4 L3 报价单（本次调研最硬的付费意愿证据，原样保留）

**EBOSS 统计代跑**（eboss1.com.tw/StatisticsWrite.html，直读 2026-08-04；站点为 .tw，页面仅写「元」，**币种应为新台币但未标注**）：

| 项目 | 价格 |
|---|---|
| 信度／效度／因素／回归／相关／判别分析（**单项**） | 各 **1,000 元** |
| **预试**套餐 · 问卷有 1 个量表 | **8,000 元** |
| **预试**套餐 · 两个量表 | **10,000 元** |
| **预试**套餐 · 三个量表及以上 | **15,000 元** |
| **正式分析**套餐 | **18,000 元** |

条款原文（事实核查更正后的 verbatim）：预试阶段「**修正次數不限制**」；正式阶段「**問卷資料不變下，修改次數不限**」＋「**如DATA更改則增加額外收費**」。

**新菊统计工作室**（asternova-statistic.com/代跑統計/，直读）：基础分析 **NT$800–1,500/法**；**进阶分析与数据探勘 NT$1,000–2,500/法**；「實際報價依案件筆數、變數及分析難易度及所需方法**論件計酬**」。范围界定原文：「**以下分析只有輸出結果，不含資料檔及結果報表說明**」——想要解读，另外买。

**zuoyedaixie.com**（直读）：基础统计 **¥299–399 / $99–199**；回归 **¥499–799 / $199–399**；含学术写作完整报告 **¥799–1499 / $299–599**；进阶 $399+；48h 加急 **+40%**。**交付物**：清洗记录 + 分析步骤 + 输出结果、全部表格图表（APA 7th）、完整代码或操作截图。**承诺**：100% 原创附 Turnitin 查重报告、逾期全额退款、「**不满意免费两轮修改**」（注意是**有界两轮**，不是无限次）；团队话术「来自 985/211 院校及海外顶校的统计学、数据科学硕博专家」。

**大陆侧（一手商品页全不可达，以下均为二手，未直读原页）**：「代做 spss 一般五百左右，包含小调数据」；淘宝该类目起价 ¥0.5（按样本/条）；51 调查网「每份有效答卷单价 ¥2 元起」。

**论文辅导（天花板价，二手）**：网易 L2NK1VA9 的阶梯按**学生论文的学位层次**分——本科单项 ¥800–2500 / 本科全流程 ¥3000–6500 / 硕士单模块 ¥2000–6000 / 硕士全周期 ¥8000–20000 / 博士深度全流程 ¥25000–50000。⚠️ **事实核查 REFUTED**：原报告把这条当作「按导师学历分层」是误读，该文只给定性表述「高校在职副教授、期刊审稿人收费高于在读博士讲师」而**不给金额**；「硕士学历老师 ¥1500–2500 / 博士学历老师 ¥2500–3500」出自知乎 p/1995204972925691498 与搜狐 a/973335608_122460235，且搜狐版明确标注是「**单节**」（按课时），不是同一交付物的整包价。

**阴影面（更正后精度）**：武汉某女生付 600 元改论文后，追讨中被冒充「债务追讨公司」者诱导购买 23 张礼品卡，**二次被骗 7,300 余元**（腾讯新闻 2025-07-10）；某博士生付 **¥28,000** 求发核心期刊未履约，法院认定服务合同违背学术诚信、**无效**，判返还 80%（¥22,400）（光明网 2025-06-26）；东南大学某学者被以「编辑费/出版费/保密金」骗 **¥7.5 万**；萧某假冒公司承接 SCI 代写代发，**诈骗 3 人近 40 万元**，2026 年 6 月判处有期徒刑 6 年 4 个月（中新网 2026-07-29）。⚠️ 原报告所写「维权时反向威胁举报你代写」这一手法，**四案中均未出现，无出处，已删**。

### 3.5 L1 吃掉了哪块需求？天花板在哪？

已被吃掉（不要再碰）：**「已知方法名 + 已有一张干净宽表 + 标准检验」整段**——问卷信效度 / EFA / CFA / 中介调节 / 多元回归、t 检验 / 方差 / 卡方 / 相关、AHP / TOPSIS / DEA / 模糊综合评价、常规机器学习。边际价格已到 ¥9.8/天甚至 0，且被 SEO 与内容激励双重加固。

天花板在五处：
1. **「我该用什么方法」是问诊问题不是计算问题**——AI 只看数据形状（类型、分布），看不到研究设计（配对还是独立？重复测量？暴露-结局时序？混杂是什么？）；
2. **入口假设「数据已是干净宽表」而真实数据不是**，EBOSS 的「如DATA更改則增加額外收費」是最诚实的注脚——**脏数据是他们的成本中心**；
3. **交付物不对**，用户要的是能直接贴进论文的三线表 + 期刊级图 + Methods/Results 段落，新菊把「输出结果」与「结果报表说明」拆成两个价位，正说明这一段是单独一门生意；
4. **没人负责**——SPSSAU 需要专门发文论证「结果符合学术标准，科研论文均可放心使用」并给出推荐引用格式，**厂商要花力气打消的疑虑就是用户真实的卡点**（合法性焦虑，不是功能问题）；
5. **学科方法长尾**（生存分析/竞争风险/PSM/混合效应/纵向数据/列线图/DCA/Meta）通用工具要么没有要么很浅，所以医学侧另起炉灶长出整个生态。

⚠️ 第 ②⑤ 条中「**所有** L1/L2 平台」「**没有任何**工具覆盖」属双重全称命题，事实核查判为分析判断而非可核查事实，正文应加「就本次抽样的平台而言」这类限定。

### 3.6 「AI 化」到了什么程度？

| 层级 | 含义 | 谁在这层 | 证据强度 |
|---|---|---|---|
| L0 模板化文字 | 结果表下挂规则填空的中文结论 | SPSSAU「智能化文字分析」 | 中等置信，**未拿到示例段落原文**（帮助页 404） |
| L1 LLM 贴在外围 | 旁挂对话框，不嵌进结果表 | SPSSAU | ⚠️ **更正**：官网 AI 入口实为 `spssau.com/aliyun_bailian_demo.html`（**阿里云百炼**承载），全站未见「DeepSeek V3」字样，该归因仅见二手转述，**判 UNVERIFIABLE**；且二手源描述含「自动解读统计结果」「诊断错误并提供修正建议」，**不能说它「只做客服问答」**（§九·D5）。可保留的只是形态判断：旁挂助手，未进计算与返修主链路 |
| L2 LLM 进结果解读 | 算法跑完由大模型解释这张表 | **SPSSPRO** | 一手：官网原文「所有算法配备分析步骤与**智能分析AI大模型自动生成专业解读结论**」「**AI自动识别数据结构推荐最佳算法**」。⚠️ 原报告称其「唯一」，属全称否定，应改为「**在官网最明确**声称」 |
| L3 LLM 编排整条链 | 研究设计识别 → 论文草稿 | **mstata**、**风暴统计** | 一手；但两家都在打补丁（mstata v0.96/70% + 人工工作室；风暴统计流程明写「专家验证」） |

结论：**中文市场目前没有一家把 LLM 真正放在「脏数据清洗 → 方法论证 → 多轮返修」这条最花时间的链上并且接住了。** SPSSPRO 是真 LLM 但作用域被产品骨架框死在「解释单张表」——它没法在你上传数据之前开始工作，也没法在你拿到结果之后继续往下走。

### 3.7 用户买的到底是计算，还是有人对结果负责？

**答案非常明确：买的是负责，不是计算。** 硬证据全部来自供给方自己的价目表：

1. **计算是最便宜的那一半。** 新菊：跑出结果 NT$800–1,500/法，「不含資料檔及結果報表說明」；要解读请另买。**计算被明码标价为低价商品，解释被单独抽出来卖高价。**
2. **溢价点写在「返修次数」上，不在「分析条数」上。** EBOSS 从单项 1,000 元跳到 8,000/10,000/15,000/18,000，跳的不是分析数量，跳的是「**修正次數不限制**」。用户买的是一份**期权**：改到导师/审稿人满意为止。zuoyedaixie 的「**免费两轮**」与 EBOSS 的「不限次」正好构成价格阶梯——**返修次数本身就是价格的自变量**。
3. ⚠️ 原报告第三条证据（价格随「谁负责」翻倍）**已被事实核查推翻**，须收窄：可核实的只有论文辅导按导师资质定价的**定性**表述，以及知乎/搜狐的「硕士老师 ¥1500–2500 / 博士老师 ¥2500–3500」——但那是「**单节**」课时费（同一小时博士抬价约 40–67%），不是同一交付物的整包价。**结论保留，证据必须换掉。**

这几百到几千块实际买到四样东西：**责任转移**（有人陪你回复审稿意见）、**无限返修**（deadline 前的确定性）、**交付物形态**（不是一屏结果，是能贴进论文的表/图/段落/带注释代码）、**时间**（临床医生不是不会，是没有三个晚上去调 R——所以评价是「傻瓜机」）。

**反面验证**：正因为买的是信任而非可验货的商品，才养出了大规模诈骗（600→7,300、¥28,000、¥7.5 万、近 40 万的公开案例）。**如果买的是计算，拿到输出就能验；正因为买的是「负责」，才验不了，才会被骗。**

### 3.8 一个反过来有信息量的观察

以「SPSSAU 缺点/吐槽/坑」检索，**返回结果几乎全是正面软文**。原因写在 SPSSPRO 的公告里——**用户生成内容本身是被会员权益买来的**（小红书≥100 字或知乎≥300 字 + 3 张界面图，审核通过 = 14 天会员；邀请 1 位新用户 = 7 天会员）。

> **这个赛道的中文搜索结果被厂商 SEO/内容营销高度占领，负面原声在公开索引里被系统性稀释，这本身就是竞争格局的一部分。** 「搜不到吐槽」不等于没有吐槽。

---

## 四 · LLM 做统计的实证水位与失败模式

> 来源 `raw/B4-LLM统计能力实证与失败模式.md`（2026-08-04）。原报告附带一份独立对抗性事实核查（20 条断言：15 CONFIRMED / 5 REFUTED），**本章按更正版书写**，被更正处已就地标注。
> 本章是**行业能力水位的公共基线**，不是我们的技术方案；**架构裁决在 [SYNTHESIS-产品形态.md §4](./SYNTHESIS-产品形态.md#四--关键架构裁决)**。
> 用户原声并入 [§八](#八--用户原声集逐字按主题归类)；未覆盖项并入 [§九](#九--本章的证据强度与存疑)。

### 4.0 结论先行

**LLM 在「选统计方法」上大概率已不弱于目标用户；它塌方的地方在三处：判断方法「适用不适用」（前提假设）、把跑出来的数字翻译成结论、以及同一个问题跑两遍给出不同答案。**
所以工程投入不该花在「让模型更懂统计」，而该花在 ①把前提检验夺权给确定性代码 ②把所有数字锁死在执行产物上不许模型复述 ③把同一份分析的不确定性显式暴露给用户。

### 4.1 实测水位

#### 4.1.1 统计专项 benchmark（选方法 / 判适用）

StatQA（NeurIPS 2024 D&B，11,623 题）是唯一同时测了 LLM 与真人对照的统计方法选择基准。

| 对象 | 设定 | 准确率 |
|---|---|---|
| 微调 LLaMA-3 8B | SFT | **77.13%** |
| GPT-4o | 1-shot + 领域知识（最佳） | **64.83%** |
| GPT-4 | 1-shot + 领域知识 | 53.22% |
| GPT-3.5-Turbo | 1-shot + 领域知识 | 49.36% |
| GPT-4o | 0-shot | 44.23% |
| LLaMA-3 8B | 最佳设定 | 36.11% |
| 真人 · 有统计背景 | 开卷 / 闭卷 | 53.45% / 23.28% |
| 真人 · 无统计背景 | 开卷 / 闭卷 | 34.48% / 18.10% |

> 来源：Zhu et al., *Are Large Language Models Good Statisticians?*, arXiv:2406.07815v2，2024-06-12（v2 2024-10-10），NeurIPS 2024 D&B。https://arxiv.org/abs/2406.07815

🔴 **此处原报告曾写反，已更正**：原报告用这张表断言「LLM 明确强于目标用户 → 所以不该建方法选择规则引擎」。核查查实**人类基线仅 n=6**（3 名统计专业 + 3 名非统计 STEM 研究生，做 mini-StatQA 分层抽样 117 题）。四个人类数字逐字精确，但**这是在 n=6 上做架构决策**。正确读法：把它当**弱证据/方向性提示**，不能当硬结论。三条仍成立的读法：
① 8B 微调模型 77.13% 打穿 GPT-4o，说明任务知识密度不高、可蒸馏，通用模型的失败不是「不知道」而是「没被逼着按流程走」；
② 错误类型分岔（论文 Finding 5 + Figure 6 已逐字核实）——"LLMs primarily make applicability errors, whereas humans mostly make statistical task confusion errors"，**人类是「不知道该卡方还是 t 检验」，模型是「知道该 t 检验，但没意识到数据不满足前提」**；
③ 这一条直接决定防线建在哪。

StatABench（2026-06，404 题 × 18 统计主题 + 30 道开放建模题）给 2026 年水位：GPT-5.1 68.6% / Claude 4.5 66.3% / Qwen2.5-72B 60.6% / DeepSeek-V3 57.4% / Qwen2.5-32B 51.7% / GPT-4o-mini 43.3% / Qwen2.5-7B 38.1%；开放建模题（Stat-Open）最强 agent 框架只有 **61.86/100**。
其失败归因 **工具选择 50% / 合规与执行 26% / 结果解读 24%**（"correct tool execution but incorrect or unsupported statistical conclusion"）——**核查更正**：该分布来自「38 个 DeepSeek-V3 失败但 Qwen2.5-72B 成功」的对比子集（n=38），是**特定弱模型在刚性框架下的归因**，不能读成 StatABench 的通用失败分布。
> 来源：arXiv:2606.22977v1，2026-06-22。模型名 "GPT-5.1"/"Claude 4.5" 系论文原文标注，**未与厂商发布记录交叉核对**。

StatEval（10 万+ 题）结论「基础题尚可，研究级严谨推理吃力」，逐模型数字**未核实**（arXiv:2510.09517v2）。

#### 4.1.2 端到端 agent benchmark（水位断崖下跌）

| Benchmark | 规模 | 最佳成绩 | 出处 |
|---|---|---|---|
| DABstep | 450+ 任务（easy 72 / hard 378） | hard **14.55%**（o4-mini）／ easy **80.56%（GPT-4.1）**；o4-mini 自身 easy 76.39% | arXiv:2506.23719，2025-06-30 |
| DABstep（一年后） | 同上 | hard **45.24%** / easy 87.50%（DS-STAR） | arXiv:2509.21825v4，2026-02-24 |
| DSBench | 466 分析 + 74 建模 | 最佳 agent **34.12%** | arXiv:2409.07703v3 |
| DiscoveryBench | 264 真实 + 903 合成 | 最佳 **25%** | arXiv:2407.01725v1 |
| ScienceAgentBench | 44 篇论文抽出的任务 | 独立 32.4%／给专家知识 34.3%；o1-preview 42.2% | arXiv:2410.05080v3 |
| QRData | 411 题 | GPT-4 **58%** | arXiv:2402.17644v2 |
| CORE-Bench | 270 任务 / 90 篇论文 | 最难档 **21%** | arXiv:2409.11363v2 |
| MLE-bench | 75 场 Kaggle | o1-preview+AIDE 16.9% 达铜牌 | arXiv:2410.07095v6 |
| IDA-Bench（多轮交互引导） | — | Claude-3.7-thinking **<50%** | arXiv:2505.18223v2（投稿日 2025-05-23） |
| InfiAgent-DABench | 257 题 / 52 CSV（**封闭式唯一数值答案**） | 75.9%→**94.9%**；Qwen2.5-14B 86.38% | arXiv:2401.05507v3 |
| DataClawBench | 492 任务 / 206 万条 | 「更多探索不必然转化为正确答案」 | arXiv:2605.02503v3 |
| LongDA | 505 题 / 17 个全国性调查 | 「SOTA 模型间仍有实质差距」 | arXiv:2601.02598v2 |

> **核查更正**：easy 80.56% 归属是 **GPT-4.1**，不是 o4-mini（原报告归错）。

两条最重要的读法：
1. **DABstep hard 一年 14.55%→45.24%**，机制是 DS-STAR 的 Verifier（二元判定计划是否够用）+ Router（决定加一步还是回退到第 N 步）+ 最多 20 轮迭代（hard 均 5.6 轮 / easy 3.0 轮）。⚠️ **核查更正**：同期底座也从 o4-mini 换成了 **Gemini-2.5-Pro**，「提升来自架构而非模型」需要论文内消融支撑，**不能由这两个数直接推出**。
2. **封闭式 94.9% vs 开放式 30% 量级的反差**，是设计教训不是矛盾：问题收窄成「对这一张表算一个明确的量」→ 80%+；放开成「帮我分析一下这份数据」→ 掉到 30%。

#### 4.1.3 BLADE：模型不是不会算，是想不到该算什么

12 组真实数据集 + 已发表文献研究问题，专家数据科学家独立做一遍作 ground truth。F1：Claude 3.5 Sonnet 43.9%（95% CI 42.6–44.9）／GPT-4o 41.7%／Gemini 1.5 Pro 41.1%／Mixtral-8x22B 40.1%／GPT-4o ReAct agent 44.8%。

🔴 **此处原报告曾写反，已更正**。论文 Figure 4 的实际分布是：

| 维度 | 精度 | 相对强弱 |
|---|---|---|
| 概念变量 | **≈60–70%** | **模型相对最强的一维** |
| 操作化（落成列/变换） | <60% | 中 |
| **统计模型规格** | **<35%** | **最弱的一维** |

原报告把「<35%」安到了「概念变量」头上，方向恰好反了。此外：统计模型规格 coverage@10 **<13%**、操作化 coverage **<27%**；**专家之间**一致性：变换 75%、概念变量 80%。论文原话 "language models possess considerable world knowledge" 但 "often limited to basic analyses"。
> 来源：Gu et al., *BLADE*, arXiv:2408.09667（v3 2025-11-10），EMNLP 2024。

**架构含义随之改变**：模型不缺「想到该看哪些概念变量」，缺的是「把它落成正确的统计模型规格」。防线的重心应压在**统计模型规格 + 前提假设**，而不是「帮它想变量」。分析决策仍呈「塌缩」——反复给出同一小撮最平庸的分析（描述统计 + 一个线性回归），看起来完全正确、也确实能跑，但是**一份 C 级分析**。

### 4.2 失败模式分类表

| # | 失败模式 | 实证数字 | 出处（时间） |
|---|---|---|---|
| **F1** | **忽略前提假设 / 适用性判断错** | StatQA：LLM 首要错误类型是 applicability error，即使给领域知识 GPT-4o 仍有相当比例；Ordak 2023 实测 ChatGPT 5 个分析「未考虑样本量与变量测量尺度」，序数变量该非参数时仍推参数检验 | arXiv:2406.07815（2024-06）；Healthcare 11(18):2554, DOI 10.3390/healthcare11182554（2023-09） |
| **F2** | **选错统计方法 / 调错工具** | StatABench 工具选择失败占 50%（**注：n=38 弱模型子集**）；Cureus 2026 六模型 40 场景：Grok 与 Copilot 34/40、Gemini 32/40、ChatGPT 30/40 | arXiv:2606.22977；Cureus 2026-06-29（PMID 42534131，**模型清单不自洽、逐模型数字置信度 medium**） |
| **F3** | **p 值 / 结果解读错** | StatABench 24% 失败是「工具跑对了、结论错」；Ordak 2023：30 题 18 对 12 错（χ²=1.2, p=0.27） | 同上 |
| **F4** | **代码跑通但结果是错的（silent error）** | DataPRM 定义为 "logical flaws that yield incorrect results without triggering interpreter exceptions"，需**主动探测中间执行状态**才能发现（其 +11.28%/+7.21% 增益条件是 Best-of-N，非裸模型直出）；PublicAgent 消融：去掉 discovery 或 analysis 专职 agent，50 个查询上产生 **243–280 次灾难性失败** | arXiv:2604.24198v2（2026-04）；arXiv:2511.03023v1（2025-11） |
| **F5** | **同一问题重跑结论不同** | 2 策略 × 6 模型 × 4 温度 × 10 次 = **480 次**（非完整析因，GPT-5-mini 只跑默认温度）："even at temperature zero some estimates lead to different conclusions about the same research question"；估计值出现 distinct clusters，t 统计量可导向相反结论 | arXiv:2602.14349v1，Cui & Alexander（2026-02-15）。⚠️ 原报告举的「Gemini Flash 3 多步 0%」极端例，核查查实成因是 **Step 2 文件路径处理 bug**，非统计不稳定，**已从本章删除** |
| **F6** | **分析多重宇宙 + 选择性报告** | 多个独立 AI 分析师跑同一数据同一假设："substantial dispersion in effect sizes, p-values, and conclusions"；换 persona 或换模型会移动结果分布，**即使这些分析在方法上都成立** | arXiv:2602.18710v2，Bertran/Fogliato/Wu（2026-02-21） |
| **F7** | **编造数字 / 编造引用** | GPTZero 扫 **4,841 篇 NeurIPS 2025 录用论文** → **100 处幻觉引用，涉及 51–53 篇（1.05–1.10%）**；RefChecker 扫 ICLR/ICML/NeurIPS/USENIX：2025 年约 **1/20** 的 NeurIPS 与 USENIX 论文含 ≥2 条疑似幻觉引用，审计成本 **$0.04/篇**；法律域：GDPR 场景 94–100% 准确，沙特 PDPL 场景 **60–77% 编造**，且 **91% 的编造引用自报置信度 ≥0.8** | gptzero.me/news/neurips（2026-01-21）；arXiv:2607.00738v2；arXiv:2607.11127v1 |
| **F8** | **把相关说成因果** | QRData GPT-4 仅 58%；CausalGame 测 30 个 LLM agent，最佳 **68.0%** 生存率（分析最优 78–85%），**只有 5–7% 的会话在因果推理评分项拿到分** | arXiv:2402.17644v2；arXiv:2607.04293v1；arXiv:2606.09892v1 |
| **F9** | **谄媚 / 被用户假设带跑** | 辩论式施压触发谄媚是直接提问的 **2–3 倍**（中位 50%→79%）；带记忆的系统谄媚率最高放大 **25 倍** | arXiv:2604.21564v2；arXiv:2606.10949v1。⚠️ **核查更正**：原报告引的 ReCrit「38.15%→51.49%」是**该 RL 方法把 4B 小模型 critic 准确率提上去的方法增益**，不是「模型在用户批评后放弃正确答案」的发生率，**不能作为现象测量引用** |
| **F10** | **任务歧义时静默假定** | Ambig-DS 112 个歧义任务（Target 51 + Objective 61）：失败不是执行错误，而是 "quietly commit to plausible but unintended task framings, producing clean, executable artifacts that hide their incorrect assessment of the task"；给一次提问机会能挽回大部分损失，但**模型无法可靠判断何时该问** | arXiv:2605.09698v1（2026-05-10） |
| **F11** | **EDA 里「看不见大猩猩」** | 博客实测（384 分 HN 头条）：大猩猩形状的散点图，模型只报汇总统计 | chiraaggohel.com（HN item 42950976，2025-02-08） |
| **F12** | **多重比较不校正** | **未找到直接测「LLM 是否主动做 Bonferroni/BH 校正」的专项 benchmark（未核实）**。间接证据：StatABench 18 主题里「多重比较」是独立一项、整体只有 68.6%；ReliableTableQA 把 multiple-comparison inflation 列为可靠性隐患并专门训练模型标记 | arXiv:2606.22977；arXiv:2607.20537v1 |

**必须放进对照的锚：人类也很差**

| 研究 | 数字 |
|---|---|
| Silberzahn et al. 2018 | 29 队 / 61 位分析者、同一份 146,028 条数据：**20 队（69%）显著正效应、9 队（31%）不显著、0 队负效应**；OR 从 0.89 到 2.93，中位 1.31；离散与分析者资历、同行评的分析质量**都无关**。DOI 10.1177/2515245917747646 |
| Botvinik-Nezer et al. 2020（NARPS） | **70 支团队**分析同一 fMRI 数据 9 个假设，**没有任何两队用了相同工作流**；「报显著」比例 **5.7%–84.3%**；平均 20% 团队与多数意见相反；但元分析汇总能得到一致激活脑区。Nature 582:84–88 |
| Nuijten et al. 2016（statcheck） | 8 本心理学期刊 1985–2013，**16,695 篇含 NHST 结果的论文中 49.6%（8,273 篇）至少含一个不一致 p 值**；p 值层面不一致率 9.7%、严重不一致 1.4%（总计 258,105 个 p 值）。PMC5101263 |

⚠️ **核查更正**：statcheck 的分母是 **16,695 篇含 NHST 结果的论文**，不是下载总数 30,717 篇；原报告用 30,717 做分母会把比例讲高约一倍。「12.9% 含足以改变统计结论的严重不一致」一句同受此分母问题影响，谨慎引用。

**这三条把 F5、F6 从「AI 缺陷」重定义成「分析这件事本身的性质」**——AI 只是把成本降到接近零，把老问题放大成规模问题。

### 4.3 每种失败对应的工程防线（行业公共解法，非本仓裁决）

分三类：**① 确定性代码守门（可机械判定，必须硬做）② 只能靠提示词/流程 ③ 必须交回人**。

| 失败 | 类型 | 做法 |
|---|---|---|
| **F1 前提假设** | **①** | **ROI 最高的一条。** 建「方法 → 前提」映射表（t 检验→Shapiro-Wilk + Levene + 独立性；ANOVA→加球形性；线性回归→残差正态 + Breusch-Pagan + VIF + Durbin-Watson；卡方→期望频数 ≥5 格子比例；Pearson→线性 + 无强离群）。模型选完方法后由后端**强制**跑一遍前提检验，结果作为不可绕过的 tool_result 回注；不满足时**强制**给替代方案（Welch / Mann-Whitney / Kruskal-Wallis / Fisher 精确 / Spearman）。 |
| **F2 选错方法** | ② + 轻① | 变量测量尺度（连续/序数/名义/计数/生存）+ 分组数 + 配对与否 + 样本量四项由确定性代码从数据推断或强制用户确认，作为结构化输入喂给模型；再用轻量决策树做**事后一致性硬拦**（例：名义因变量 + 线性回归 → 拦）。⚠️ 原报告据 StatQA 断言「绝不能用规则引擎替模型选」；因人类基线 n=6，此结论**降级为倾向性判断**，但「规则引擎只做前提检验与事后硬拦、不做选择」的分工仍是稳妥缺省。 |
| **F3 结果解读错** | ① + ② | 结论句里每个数字必须回指到某次工具执行输出（见 F7）。确定性 p 值断言检查：模型写「p<0.05 说明有显著差异」而产物里 p=0.062 → 硬拦重写。禁用词正则：「证明了」/proves/「因此导致」/causes，非实验设计下一律拦。「p>0.05 不等于无差异」这类表述规范只能靠提示词 + 模板。 |
| **F4 silent error** | **①（最重工程投入）** | 借 DataPRM：跑完不算完，**主动探测中间状态**。落成「廉价断言」层：merge 前后行数（暴涨=笛卡尔积）、缺失处理前后 N、分组后每组 n、数值列量纲突变、fit 后残差全零（=泄漏）。代码写死，跑在每个数据处理步骤之后，失败即回退。 |
| **F5 不可复现** | ① + ③ | 温度设 0 **不够**。防线是**可重跑脚本 + 固定随机种子 + 锁定环境**，产物是脚本不是对话；用户点「重跑」跑的是同一份脚本。「这份分析稳不稳」交回人自己改参数看抖动。 |
| **F6 多重宇宙** | ③ + ①记账 | 记录本次会话跑过的所有模型规格（协变量、缺失值处理、检验），产物面板全部列出并标出「最终报告采用哪一个」。确定性账本，不需要模型配合。 |
| **F7 编造数字/引用** | **①（零妥协）** | **报告里每个数字都不许由模型「写出来」，只许由模板从执行产物「填进去」。** 分析代码产出结构化 JSON（统计量、df、p、效应量、CI、n），渲染层取值，模型只写文字骨架和占位符；文字中出现但 JSON 里没有的数字 → 正则扫描 + 硬拦。引用只允许 tool 返回过的文献 ID（Scholay 已有证据账本设施可复用）。 |
| **F8 因果 vs 相关** | ② + 轻① | 上传时就问一次「观察性 / 实验随机化」并记录为元数据；观察性 → 因果措辞禁用词硬拦。提示词要求任何因果表述显式列出识别策略（RCT/DiD/IV/RDD/匹配）与未测混杂假设。 |
| **F9 谄媚** | ② + ③ | **基本没有确定性防线。** 可做：系统提示词固化「先看数据再看用户假设」的顺序；用户输入含方向性假设时（正则粗筛）**强制先跑无假设的描述性 EDA 并展示**；结论页固定一栏「与你预期相反的发现」，为空也显式写「无」。**效果未验证（未核实）**。 |
| **F10 静默假定** | ② + ①触发器 | **别让模型决定要不要问**——确定性触发器：因变量不唯一 / 分组变量 >2 水平未说明是否两两比较 / 存在缺失值 / 存在时间列 / 样本量 <30，命中任一条强制弹**结构化确认卡**（选项卡不是自由文本追问）。 |
| **F11 大猩猩** | **①** | 每次分析强制跑固定数据体检（每列分布图、缺失热力图、离群计数、常数列、重复行、疑似 ID 列被当数值、日期解析失败、类别列基数爆炸），产物直接展示。**不依赖模型「注意到」，靠代码「必然呈现」。** |
| **F12 多重比较** | **①** | 会话内计数跑了几个检验；>1 且报告引用 >1 个 p 值 → 强制提示并给出 BH/Bonferroni 校正后 q 值（代码算，不问模型）。纯记账。 |

### 4.4 LLM 做得好的环节（不要过度设计）

| 环节 | 证据 | 结论 |
|---|---|---|
| 选统计方法本身 | StatQA GPT-4o 64.83% vs 有统计背景者开卷 53.45%（**人类基线 n=6，弱证据**） | 倾向不建方法选择规则引擎；但不再是硬结论 |
| 写分析代码 | DABstep easy 80.56%（GPT-4.1）；InfiAgent-DABench 封闭式 86–94.9% | 问题收窄后代码能力不是瓶颈 |
| 识别他人分析里的方法学缺陷 | 6 个 SOTA LLM 用**同一条 prompt**、无先验上下文**全部**识别出一篇手势识别论文的 subject-level 数据泄漏，并归因到「非独立的训练/测试划分」，给出学习曲线重叠、泛化 gap 极小等佐证（arXiv:2604.14161v1，2026-03-23） | 「执行 agent + 审查 agent」的实证依据。⚠️ **核查备注**：单作者对单篇论文的个案研究，作者自述结论 not definitive，**证据偏薄** |
| 解释统计输出给非统计背景者 | LLM 原生强项，且「结果解释晦涩」在中文侧反复出现 | **别加防线，加体验** |
| 数据清洗 / 修复 | LasRepair++ 比最强 baseline F1 +18.1%（arXiv:2606.17582v1，2026-06-16） | 清洗错了也容易被断言层抓到 |
| 可视化生成 | Elsevier 明确允许 "generating data visualizations directly derived from underlying datasets" | 政策最安全、能力最成熟 |

### 4.5 行业已验证的「夺权给确定性引擎」优先级

1. **前提假设检验**（F1）—— LLM 首要失败类型 × 100% 可机械判定 = 最高 ROI
2. **报告数字来源锁**（F7）—— 模型不许写数字，只许填模板。零妥协
3. **每步数据形状断言**（F4）—— 行数/N/组内 n/量纲/完美拟合探测
4. **强制数据体检面板**（F11）—— 不靠模型注意，靠代码必然呈现
5. **多重比较记账 + 校正**（F12）—— 纯计数
6. **可重跑脚本 + 固定种子**（F5）—— 产物是脚本不是对话
7. **分析决策账本**（F6）—— 跑过的所有规格全列出
8. **歧义触发器 → 结构化确认卡**（F10）

**参照物 PowerGPT**（LLM + 统计引擎的临床试验设计系统）：检验选择 **99.3% vs 88.9%**、样本量估计 **94.1% vs 55.4%**、用时 **4.0 vs 9.3 分钟**（p<0.001），且「对统计学家和非统计学家都有帮助」。
> arXiv:2509.12471v1（2025-09-15）。✅ **核查已消除原报告的存疑**：两项**同为准确率**，非完成率。

**参照物 VDSAgents**：把 PCS（Predictability–Computability–Stability）原则做进多 agent 工作流，用扰动分析 + 单元测试 + 模型验证做结构性护栏，稳定超过 AutoKaggle 与 DataInterpreter（arXiv:2510.24339v2，2025-10-29，**具体数字未核实**）。

### 4.6 学术界 / 期刊政策（决定界面上必须写什么）

**整体判断：写作用 AI 要披露；分析用 AI 不但允许，而且是要求写进 Methods。没有任何主流政策禁止用 AI 做数据分析。红线是「AI 不能当作者」和「AI 不能生成原始研究图像」。**

| 机构 | 关键条款（verbatim） | 含义 |
|---|---|---|
| **ICMJE** | "At submission, the journal should require authors to disclose whether they used artificial intelligence (AI)-assisted technologies … in the production of submitted work"；**"If AI was used for data collection, analysis, or figure generation, authors should describe this use in the methods."**；"Chatbots (such as ChatGPT) should not be listed as authors because they cannot be responsible for the accuracy, integrity, and originality of the work"；"Authors should carefully review and edit the result because AI can generate authoritative-sounding output that can be incorrect, incomplete, or biased." | **分析用 AI → 写进 Methods，不是致谢。** 产物面板必须能导出「方法学描述段落」。<br>icmje.org, Section II.A.4（页脚 ©2026，**版本时间未核实**） |
| **Elsevier**（政策更新标注 **2026-06**） | 允许 "generating data visualizations directly derived from underlying datasets"；**"This policy does not prevent the use of AI tools in formal research design or research methods."**；数据分析中的 AI 使用 "described in detail within the Methods section rather than requiring a disclosure statement"；红线 "These tools must never be used as a substitute for human critical thinking, expertise and evaluation"；**禁止**生成原始研究图像（显微镜/western blot/影像）与图形摘要；不得列 AI 为作者 | **最明确的「分析可以用 AI」官方背书**，且区分「数据可视化（允许）」与「原始研究图像（禁止）」<br>elsevier.com/about/policies-and-standards/generative-ai-policies-for-journals |
| **Springer Nature** | "Use of AI must be transparently declared in line with our policies"；作者 "fully accountable for all content and authorship"；生成式 AI 图像 **"unable to permit"** | 图像红线同 Elsevier<br>group.springernature.com/gp/group/ai/ai-guidance-for-our-researchers-and-communities |
| **JAMA** | 明确**禁止**用 AI/LLM/chatbot 起草 Viewpoint、Perspective、A Piece of My Mind、诗歌、Letters to the Editor | 禁的是「观点写作」不是「数据分析」；研究类稿件中 AI 做数据分析的具体条款**未在页面找到（未核实）** |
| **PNAS 2026 研究** | "While more than half of journals have adopted AI-use policies, these guidelines have failed to meaningfully curb or transparently govern the use of AI in scientific writing." | 政策存在但**执行失效** → 合规压力短期不从期刊侧、而从**导师/答辩侧**传导。<br>pnas.org/doi/10.1073/pnas.2526734123（**正文 403 未读到，仅据搜索片段，置信度 medium**） |
| **Nature Ecology & Evolution 社论** | 传统 AI 工具 "already well established in science for data analysis"，生成式 AI 正在 "become part of the mainstream scientific toolkit" | 接纳而非围堵（**仅据搜索片段，未读原文**） |
| **JCTS（Cambridge）** | "eight guiding principles for responsible LLM use in biostatistical workflows" | 八条原则原文**未取得（404），未核实** |

**产品含义（三条）**：① **必须**提供可直接粘进 Methods 的机器生成方法学描述（用了什么模型、什么统计方法、什么软件版本、什么随机种子）——ICMJE + Elsevier 的硬要求，也是差异化功能；② **不能**也不需要提供任何「帮你隐藏 AI 使用痕迹」的功能；③ 图表产出安全，**原始实验图像生成绝对不能碰**，两者在产品里必须有明确界限，不能混在一个「生成图片」入口里。

---

## 五 · 横向对照表

> 本表由 §一~§四 的事实汇编而成，**不新增任何事实**。空格代表「材料内未覆盖」，不代表「没有」。
> 图例：✅ 有 · 🟡 部分/有条件 · ❌ 无 · ⚪ 未核实 · —— 不适用。
> **「产物能否进论文」一列的判据不是「导出格式好不好看」，而是「有没有可引用的已发表证据 / 官方口径」。**

### 5.1 主表

| 玩家 | 层 | 形态 | 价格 | 方法选择怎么处理 | 产物能否进论文 | 中文三线表 | 脏表清洗 | 谁在为它付钱 |
|---|---|---|---|---|---|---|---|---|
| **ChatGPT ADA** | L0 | 上传 → 对话 → 沙箱现写 Python | $20/月（Plus 顺带） | ❌ 模型静默选 | 🟡 无直接署名证据；`BMC Ophthalmol` 那篇是经 Julius 用 GPT-4V | ❌ | 🟡 模型现写 pandas，**无体检面板** | 海外学术个人（**最广的默认选择，因为它顺带做别的事**） |
| **Claude code execution tool** | L0 | API 侧工具，Python 3.11 容器 | 每组织 **1,550 免费小时**，超出 $0.05/h/容器 | ❌（工具层，不管方法） | —— 基础设施 | ❌ | 🟡 预装 pandas/statsmodels，无守门 | 开发者 / 集成方 |
| **Claude Science** | L0 | AI workbench，主 agent 当项目经理 | Pro/Max/Team/Enterprise 内附赠；学术与非营利有 Team 折扣 | ❌ 不审方法学；**但有常驻 background reviewer 审「声明↔证据可追溯」** | ⚪ 未见已发表署名证据 | ❌ | ⚪ | 有订阅的科研人（HN 评价两极，见 §八·1） |
| **Colab Data Science Agent** | L0 | 空白 notebook + Gemini 侧栏 | **免费** | ❌ 模型静默选 | 🟡 notebook 可复现，但**面向会读 Python 的人** | ❌ | 🟡 | Google（获客，不直接收费） |
| **Manus** | L0 | 通用 agent 任务 | $0/$20/$40/$200（**收购前**，两源矛盾 §九·D6） | ❌ | ⚪ | ❌ | 🟡 | 通用 agent 用户；**已被 Meta 收购** |
| **Julius AI** | L1 | 上传/连库 → 对话 → 现写 Python/R | Plus $20 / Pro $45 / Max $200 / Ultra $500 / Business $450(50席)；credit 制 | ❌ 模型静默选 | ✅ **Europe PMC 53 篇**，含 PLoS Medicine——**但只被允许做 data visualization，统计仍交 Stata 17/SE** | ❌ | 🟡 无体检面板 | 海外学术个人（$20–45 档） |
| **Vizly** | L1 | 上传 → 对话 → 出 Python/R 代码 | Basic $19.99（200 msg/月）/ Premium $29.99（unlimited）；**学生学者 25% off** | ❌ | ⚪ | ❌ | 🟡 | 学生/学者（唯一确证有学生折扣的一家） |
| **Powerdrill** | L1 | Bloom 多 agent / Chat 问数据 | Bloom $19.90 起 / Chat $3.90 起 | ❌ | ⚪ | ❌ | ⚪ 被批 "may require technical knowledge to set up" | ⚪ |
| **Numerous.ai** | L1 | **表格插件**：`=AI()` 公式 | Personal $10/月（年付） | —— **不做统计推断** | ❌ | ❌ | ✅ 文本归类/清洗（**做的是文本活**） | Sheets/Excel 重度用户 |
| **Hex / Deepnote** | L2 | notebook + AI 助手 | 企业 | ❌ **甩回给人** | 🟡 靠人 review | ❌ | 🟡 | 企业数据团队 |
| **Databricks Genie** | L2 | 自然语言问数据 | **2026-07-08 起按量计费 + 每用户免费月额度**（Genie One/Agents 免费至 2027-01-31） | ❌ 甩回给人 | —— | ❌ | 🟡 | 企业 |
| **Jupyter AI v3.1.0** | L2 | notebook agent | 开源 | ❌；**唯一护栏是权限**（写文件/跑命令/用 MCP 前请求许可） | 🟡 | ❌ | 🟡 | 开源社区 |
| **Posit（Positron + Assistant）** | L2 | AI + 活的数据 session + 可复现代码三绑定 | 免费（Elastic License 2.0） | ❌ 甩回给人 | ✅ 代码即可复现产物 | ❌ | ✅（写代码） | **已会写 R/Python 的人** |
| **IBM SPSS（+ AI Output Assistant）** | L3 | 点选 GUI；AI 只**解释已跑出的输出** | 单用户 $1,188/年（中）· **中国学生包 ¥399/30天** · GradPack $89/12月 | 🟡 菜单自选；AI 不参与选择 | ✅ **学术黄金标准**（导师看得懂、院系在教） | 🟡 「表外观→Academic」近似方案，**导出 Word 仍需手调边框** | ❌ 全甩给用户 | 高校/院系 license；中国学生实际用**破解版（¥0）** |
| **GraphPad Prism** | L3 | **先选数据表类型 → 按表型过滤检验** | 学生 $142 / 学术 $260 / 商业 $520 每年；永久 学术 $1,600 / 商业 $3,200 | ✅ **用数据形状约束方法**（⚠️ 交互细节未逐字核实） | ✅ **审稿人见惯了它的图** | ❌ | ❌ 「分析一更新就要重排 data frame」 | 实验室（PI 掏钱） |
| **Stata** | L3 | `.do` 脚本 | 学术 BE/SE/MP2 $175/$275/$395 每年 | 🟡 用户写 | ✅ **期刊 replication package 要求**；PLoS Med 用 17/SE 跑全部统计 | ❌ | ✅（写代码） | 经济/公卫院系 |
| **JMP（+ Assistant）** | L3 | 自然语言 → **JSL 脚本**并自动运行 | **JMP Student Edition 免费**（每 12 个月 no cost 续期） | 🟡 生成代码，非解释结果 | ⚪ | ❌ | 🟡 | SAS 用免费锁学生 |
| **SAS Viya Copilot** | L3 | 生成代码 / 搭 pipeline / 报表翻译 | **无额外费用**（含在 Viya 4 等） | 🟡 生成代码 | ⚪ | ❌ | 🟡 | 企业 |
| **Minitab AI** | L3 | ① 对话式帮你选分析 ② 结果 → 自然语言摘要 | 需订阅，**仅 web app** | 🟡 **唯一在 L3 里声称帮选**；官方建议「用英文问、拆小、分步追问」 | ⚪ | ❌ | ⚪ | 工业质量领域 |
| **Excel + M365 Copilot** | L3 | 新开 sheet 插入**可刷新的 Python cells** | **$30/user/月**（企业年付） | ❌ | ❌ Analysis ToolPak 19 项工具**无任何多重比较** | ❌ | 🟡 | 企业 IT 采购 |
| **WPS AI 数据助手** | L3 | 表内自然语言排序/筛选/推荐图表 | WPS 365 **199–599 元/人/年** | ❌；官方自承「**它不理解业务背景**」 | ❌ | ❌ | ❌ **官方明确不能**做复杂清洗/透视表/跨表关联；**仅 Windows**；>500 行或 20 列响应明显变慢 | 中国办公用户（**顺带买到，不是为分析买的**） |
| **JASP** | L4 | 免费桌面 GUI，**能直接开 `.sav`** | **¥0** | 🟡 菜单自选；**Levene/Shapiro 只算不分流** | ✅ **"copy graphs and tables directly into Word"（APA）** | ❌ **只有 APA 英文表** | ❌ 电子表格式手改 | 阿姆斯特丹大学支持（用户 ¥0） |
| **jamovi** | L4 | 免费开源统计电子表格（R 驱动） | **¥0** | 🟡 菜单自选 | ✅ "absolutely everything in APA tables you can literally copy and paste into a Word document" | ❌ | ❌ | 开源社区 |
| **SPSSAU** | L5 | **左右拖拽分析项 → 点开始分析** | **¥9.8/24h · ¥69.8/周 · ¥258/月 · ¥2588/年**；海外 $0/$2.99/$9.99；免费版限前 100 行 | ❌ 用户自选（**天然规避了 38.4% 的方法选错**） | ✅ **OpenAlex 命中 1,145 篇**；官方给推荐引用格式 | ✅ **核心卖点**「规范化表格」「有图，有表，有文字」 | ❌ 只收干净宽表 | 中国硕博个人（按天/按期） |
| **SPSSPRO** | L5 | 算法目录 + LLM 解读单张表 | **未核实**；邀请/发帖换会员 | 🟡 官网称「AI 自动识别数据结构，**推荐最佳算法**」 | ⚪ 厂商自称用户超 100 万 | ✅ | ❌ | 高校与竞赛渠道 |
| **ChatSPSS** | L5 | 「像聊天一样完成统计分析」；吃 CSV/Excel/`.sav`/`.dta` **或直接描述研究问题** | **未查到** | 🟡 声称可从研究问题入手（**未实测**） | ⚪ | ✅ 宣称「自动生成三线表与专业解读」 | ⚪ | ⚪（成都自然智科技） |
| **问卷星** | L5 | 问卷平台附带统计 | 信效度与基础统计**不单收费**；AI 点数超出 **1 元/点** | ❌ | 🟡 | 🟡 | ❌ | 问卷发放方（**边际价格已到 0**） |
| **微生信/SRplot · Hiplot · ImageGP · Majorbio · Sangerbox · OmicShare · Chiplot** | L6 | 学科流程 + 期刊级图 | 微币充值十档（50元=700微币 … 500元=10000微币，「用多少充多少」，**不做会员制**）；Hiplot Pro 197 工具永久免费 | ❌ 流程固定 | ✅ **被引即证据**：SRplot 2,423 · Sangerbox 1,219 · Majorbio 891 · ImageGP 478 · Hiplot 290 · OmicShare 281 | ❌ | ❌ | 组学侧靠**测序订单**获客，非独立生意 |
| **mstata** | L6 | AI 驱动、200+ 方法、自动识别研究设计 → 表图 + R 代码 + **3,000–5,000 字论文草稿** | **¥188/30天 · ¥518/120天 · ¥999/365天**；chatPubMed「¥3 生成一篇综述」 | 🟡 声称自动识别研究设计；**自承 v0.96 / 完成度 70% / 试运营** | 🟡 厂商自称 1200+ SCI（未核实） | ✅ 宣称出 SCI 级表 | ⚪ | 中国临床医生（「傻瓜机」）；**同时卖人工代做与审稿返修** |
| **风暴统计 medsta.cn** | L6 | 「病案文本数据输入 - 医疗 Agent - **专家验证** - 统计分析 - 论文雏形」 | ⚪ | 🟡 Agent + **人工专家验证** | ⚪ | ⚪ | ⚪ | 中国临床 |
| **Uedufy「Chapter 4 Interpreter」** | L7 | 吃 **SPSS/AMOS 导出 PDF**（v25–29），出论文的一节 | **$5/5次 · $15/20次（$0.75 单次）**，一次性付费无订阅 | —— 不参与选择（只翻译已跑好的结果） | ✅ APA 7 叙述段 + 结构化表 + 引文 + 参考文献 + PDF | ❌ | —— 不吃原始数据 | 写英文论文的学生；**卖点是 "7-day Zero Hallucinations refund"** |
| **EBOSS（台湾）** | L8 | 人力代跑 | 单项 1,000 元；预试 8,000/10,000/15,000；正式 **18,000**（**币种应为新台币，页面未标**） | ✅ 活人 | ✅ | ⚪（繁中场景） | ✅ **但「如DATA更改則增加額外收費」——脏数据是他们的成本中心** | 台湾硕博；**溢价全在「修正次數不限制」** |
| **新菊统计工作室（台湾）** | L8 | 人力代跑，**论件計酬** | 基础 NT$800–1,500/法；进阶 NT$1,000–2,500/法 | ✅ 活人 | 🟡 **「只有輸出結果，不含資料檔及結果報表說明」——解读另外买** | ⚪ | ✅ | 台湾硕博；**「计算」与「解释」是两个 SKU** |
| **zuoyedaixie.com** | L8 | 人力代做，交付物清单化 | 基础 ¥299–399 / 回归 ¥499–799 / 含写作完整报告 **¥799–1499**；48h 加急 +40% | ✅ 活人 | ✅ 全部表格图表（**APA 7th**）+ 完整代码/操作截图 + Turnitin 查重 | ⚪ | ✅ **交付「清洗记录」** | 大陆学生；承诺「**不满意免费两轮修改**」（有界） |
| **淘宝/闲鱼个体** | L8 | 人力代做 | 「**一般五百左右，包含小调数据**」（二手）；类目起价 ¥0.5/条 | ✅ 活人 | ⚪ | ⚪ | ✅ | 大陆学生（**一手 RMB 分项报价一条未抓到**） |
| **论文辅导机构** | L8 | 全流程陪跑 | 本科单项 ¥800–2500 · 硕士单模块 ¥2000–6000 · 硕士全周期 ¥8000–20000 · 博士全流程 **¥25000–50000**（二手，按**学位层次**分层） | ✅ 活人 | ✅ | ✅ | ✅ | 大陆学生；**诈骗高发区**（600→7,300、¥28,000、¥7.5万、近40万；法院认定合同无效） |

### 5.2 从这张表能直接读出的五件事

| # | 观察 | 支撑 |
|---|---|---|
| 1 | **「方法选择怎么处理」这一列几乎全是 ❌ 或 🟡。** 真正的 ✅ 只有 L8 的活人，和 Prism 的「用数据形状约束方法」这一个非 AI 的巧劲 | §1.3 三分法 + §2.2 Prism |
| 2 | **「中文三线表」这一列，除中文 L5/L6 外全线 ❌。** JASP/jamovi 的 ✅ 只在 APA 英文那一格 | §1.4 表 + §2.4 |
| 3 | **「脏表清洗」这一列，能打 ✅ 的只有会写代码的（Posit / Stata）与活人（L8）。** L1 是 🟡（模型现写 pandas 但无体检），L5 是 ❌（只收干净宽表） | §3.5-② + §1.5-(b)2 |
| 4 | **价格与「谁负责」正相关，与「算了多少」几乎无关。** 同样是跑一个 t 检验：SPSSAU ¥9.8/天、新菊 NT$800–1,500、EBOSS 套餐 18,000（差别在「修正次數不限制」） | §3.7 |
| 5 | **「产物能否进论文」的 ✅ 高度集中在两端**：老牌软件（SPSS/Stata/Prism，社会合法性）与人力代做（活人负责）。中间那一大片 AI 工具里，**唯一有硬证据的是 Julius 的 53 篇——而它只被允许做可视化** | §1.4 + §3.3 |

---

## 六 · 同行做对了的机制（我们该抄的）

> **46 条，全部来自 §一~§四 已有事实，不新增。** 按「抄什么」分七组。
> 🔴 **本节只回答「同行怎么做的、为什么这样做有效」；哪些进 P0、怎么落地，见 [SYNTHESIS-产品形态.md §4 / §6](./SYNTHESIS-产品形态.md#四--关键架构裁决)，本节不做裁决。**

### 6.A 守门与可信度机制（**确定性优先**，13 条）

| # | 机制 | 出处 / 关键事实 | 为什么有效 |
|---|---|---|---|
| A1 | **常驻 background reviewer agent** | Claude Science：后台持续标记 "incorrect citations, untraceable numbers, and figures that don't match their underlying code"，另一处 "flags any claim it can't trace to evidence" | **全场唯一带审查者角色的设计**；口径是「声明↔证据可追溯」（注意：它**不审方法学选择**，那一格仍是空位） |
| A2 | **Guardrails By Default（权限层护栏）** | Jupyter AI v3.1.0："Agents request permission before writing files, running commands, or using MCP tools" | 把护栏做在**权限层而非能力层**——不削弱能力，只在越界处停一下 |
| A3 | **把免责放在使用现场而不是条款页** | Google 在 Colab DSA 官方演示**字幕里**直接打 "Data Science Agent may make mistakes" | 用户看得到的地方才叫免责 |
| A4 | **以「验收动作清单」形式交付** | WPS 官方使用指南要求用户完成三项核验（**数据完整性 / 数值准确性 / 图表信息正确性**），并明写「它不理解业务背景」 | 把 review 责任**显式化、可执行化**——不是"请自行判断"，是三个能勾的框 |
| A5 | **确定性规则工具比 LLM 更稳** | JKMS 2025-12-22 原文："The Statcheck and GRIM-Test are especially good at spotting statistical errors" | 守门层应**优先用确定性规则**，而不是再叠一层模型 |
| A6 | **数字与生成它的代码同处一地** | Microsoft Copilot in Excel 的 advanced analysis：不给一次性答案，而是"新开一个 sheet 并插入**可刷新的 Python 代码单元**" | 天然可回溯、可重跑——这是"溯源即信任"的最小实现 |
| A7 | **用「可复核的过程」替代「声称正确」** | 行业共识（§3.7 反面验证）：出脚本、出中间数据、出假设检查（正态性、方差齐性、样本量、共线性、缺失机制） | 正确性无法承诺（所有竞品心虚处，mstata 要养人工工作室来补）；**过程可以** |
| A8 | **跑完不算完：主动探测中间执行状态** | DataPRM（arXiv:2604.24198v2）：silent error = "logical flaws that yield incorrect results without triggering interpreter exceptions"，必须**主动探测**才能发现 | 落地形态 = 每步后跑一层廉价断言（行数变化、缺失前后 N、分组 n、量纲突变、残差全零=泄漏） |
| A9 | **LLM + 确定性统计引擎** | PowerGPT（arXiv:2509.12471v1）：检验选择 **99.3% vs 88.9%**、样本量估计 **94.1% vs 55.4%**、用时 **4.0 vs 9.3 分钟**（p<0.001），**对统计学家和非统计学家都有帮助** | **「夺权给确定性引擎」最直接的参照物**；且证明它不只服务小白 |
| A10 | **把 PCS 原则做进多 agent 工作流** | VDSAgents（arXiv:2510.24339v2）：Predictability–Computability–Stability，用扰动分析 + 单元测试 + 模型验证做结构性护栏，稳定超过 AutoKaggle 与 DataInterpreter（**具体数字未核实**） | 护栏是**工作流结构**，不是提示词 |
| A11 | **引用审计极便宜，没有理由不做** | RefChecker（arXiv:2607.00738v2）扫 ICLR/ICML/NeurIPS/USENIX Security 的幻觉引用，**审计成本约 $0.04/篇** | 成本已低到可以对每一次交付都跑 |
| A12 | **纯代码做一致性检查** | statcheck（Nuijten 2016）：只扫「p 值与其检验统计量、自由度是否一致」，8 本期刊 1985–2013 全量可跑 | 这类检查**完全不需要模型参与** |
| A13 | **multiverse-style reporting + 披露 prompt** | arXiv:2602.18710v2 的建议。最小版本 = 记录本次会话跑过的所有模型规格（协变量、缺失值处理、检验），产物面板全部列出并标出最终采用的那一个 | **纯确定性账本**，不需要模型配合 |

### 6.B 产物与交付物形态（5 条）

| # | 机制 | 出处 / 关键事实 | 为什么有效 |
|---|---|---|---|
| B1 | **产物是"完整可执行 notebook"而不是代码片段** | Colab DSA 官方："Not just code snippets, but **complete, executable notebooks**" | 产物**自带可复现性**。⚠️ 代价：面向会读 Python 的人 |
| B2 | **用「可直接粘进 Word 的规范化表格」守住一个市场** | SPSSAU 产物口径逐字：**"规范化表格，可视化图形，智能化分析"**、**"有图，有表，有文字"** | AI 原生产品**集体没做**，是明确空位（跨章收窄见 §九·D9） |
| B3 | **交付物是「论文的一节」而不是「分析结果」** | Uedufy「Chapter 4 Interpreter」：APA 7 叙述段 + 结构化 APA 表 + 引文（George & Mallery / Hayes / Field / Cohen）+ 参考文献列表 + 可下载 PDF | 用户的心理单位是**稿件部位**，不是分析步骤 |
| B4 | **APA 格式一键 copy 进 Word** | JASP 官网首要卖点 "Support for APA format (copy graphs and tables directly into Word)"；jamovi 同构 | 把 2–4 小时手工压成 Ctrl+C/Ctrl+V——**这是它们被社区反复安利的唯一理由**（§八·5 四条原声全指向它）。中文侧对应物是**三线表 + GB/T 数字格式 + 中文统计术语** |
| B5 | **交付物清单化并写进销售页** | zuoyedaixie 明列「清洗记录 + 分析步骤 + 输出结果 / 全部表格图表（APA 7th）/ 完整代码或操作截图」；mstata 也给 R 源码保证可复现 | **带注释的脚本已经是行业期待，不是加分项** |

### 6.C 定价与计费形态（8 条）

| # | 机制 | 出处 / 关键事实 | 为什么有效 |
|---|---|---|---|
| C1 | **按产物计价，不按时间订阅** | 整个 L6 层已验证：微生信微币充值十档（**50 元=700 微币 … 500 元=10000 微币**，官方明写「用多少充多少」、**明确不做会员制**）；Chiplot 按单工具标价；问卷星 AI 点数「超出每加 1 点收费 1 元」 | 用户的心理账户是**「我要出这一次交付」**，不是「我要用这个软件一个月」 |
| C2 | **按天/按次的最小档** | SPSSAU **¥9.8/24 小时**（海外站 One-Day $2.99） | 证明市场天然接受「我这周要交论文，给我买一天」 |
| C3 | **把最贵的能力挡在最便宜档之外** | SPSSAU ¥9.8/24 小时档**明确不含「智能化文字分析」与 Power 模块** | **解读能力是可以单独定价的高价值层** |
| C4 | **把「返修次数」做成价格的自变量** | EBOSS 从单项 1,000 元跳到 8,000/10,000/15,000/18,000，跳的不是分析数量而是「**修正次數不限制**」；zuoyedaixie 的「**免费两轮修改**」与 EBOSS 的「不限次」构成清晰阶梯 | 卖的是一份**期权**：改到导师满意为止 |
| C5 | **把「计算」与「解释」拆成两个 SKU 分别定价** | 新菊统计明写跑结果 NT$800–2,500/法「**不含資料檔及結果報表說明**」，想要解读请另买 | **「从结果到可用文字」是独立生意的直接证据**——计算被明码标价为低价商品，解释单独抽出来卖高价 |
| C6 | **一次性付费、明写无订阅** | Uedufy **$5/5 次、$15/20 次（$0.75 单次）**，明写 no subscription / no auto-renewal | 匹配学生**脉冲式**需求（开题、中期、盲审前、投稿返修） |
| C7 | **免费额度设计成「每日刷新」而非固定总量** | Julius Free 档不给消息配额而给**每日刷新 credits**（Wayback 2026-08-03 官方页） | 避免固定额度一次性烧光的体验断崖 |
| C8 | **大厂用「免费」锁学生** | **JMP Student Edition 完全免费**（"a full-featured version of JMP Pro, is free"，每 12 个月 no cost 续期）；SAS 学术三条线（OnDemand for Academics / Viya for Learners / Viya Workbench for Learners）；Databricks Genie **按量计费 + 每用户免费月额度** | 学生阶段不收费、工作后收费——比"打折"更极端也更有效 |

### 6.D 交互与流程形态（6 条）

| # | 机制 | 出处 / 关键事实 | 为什么有效 |
|---|---|---|---|
| D1 | **用数据形状约束方法选择** | GraphPad Prism：先选数据表类型（XY / Grouped / Column / Contingency / Survival / …），再按表型**过滤掉不适用的检验**（⚠️ 交互细节未逐字核实，置信度中） | 用户**不需要知道该用什么检验，只需知道数据长什么样** |
| D2 | **结构化选择而非自然语言猜** | SPSSAU：左右拖拽分析项、点击「开始分析」 | 天然规避了 ChatGPT-4o 那 **38.4% 的方法选错** |
| D3 | **带外、就地、针对某一个结果对象提问** | IBM AI Output Assistant：选中一个输出表 → 右键 → 选内置 prompt 或自定义提问 | 提问的锚点是**一个具体结果对象**，不是整段对话（⚠️ 不可把这个产品形态反推成 IBM 的判断，见 §七·G8） |
| D4 | **分步追问而不是一次吐全文** | Minitab 官方使用建议：「用英文提问、把复杂问题拆小、分步追问」 | 厂商自己的反向情报——**长上下文一次性解读不可靠** |
| D5 | **第一步做「数据体检报告」而不是「选择分析方法」** | 收原始文件后先输出行列数、每列类型推断、缺失比例与模式、异常值、重复行、分组样本量、编码不一致项 | **所有竞品都跳过这一步**（它们假设你的表已经干净），也是 30 秒内建立信任的最快路径 |
| D6 | **把方法建议锚到真实文献检索上** | 用文献检索给出「同领域近三年主流怎么做」，带引用给出理由。对照：SPSSPRO 的 AI 只看数据形状；mstata 的 chatPubMed 是生成综述，**不是给方法选择做证据支撑** | 把「**AI 说的**」变成「**文献说的**」——直接命中 §3.7 里最贵的那个东西（负责/背书） |

### 6.E 工程与架构参照物（8 条）

| # | 机制 | 出处 / 关键事实 | 为什么有效 |
|---|---|---|---|
| E1 | **沙箱规格基线** | Claude code execution tool：Python 3.11 / **5 GiB RAM / 5 GiB 磁盘 / 1 CPU / 完全断网** / 预装 pandas+numpy+scipy+scikit-learn+statsmodels / 容器 30 天过期 + 约 5 分钟不活动 checkpoint 可恢复 / 每 REPL cell **90 秒墙钟** / 每组织 1,550 免费小时后 **$0.05/小时/容器** | 可直接当工程基线。其预装**还含 python-docx / python-pptx / pypdf / reportlab**——「出 Word/PPT/PDF 交付物」这条路上游已铺好 |
| E2 | **多智能体相对单模型的收益是可量化的** | JCO CCI 2025-12：复现率 **53.3% vs ChatGPT-4o 35.0%（P=.04）**，且**多智能体未观察到变量或结果幻觉** | 分层不是锦上添花（另见 §七·A11 的 PublicAgent 消融） |
| E3 | **Verifier + Router 双 agent 回退循环** | DS-STAR：Verifier 做**二元判定**「当前计划是否足以回答问题」，不足时 Router 决定「加一步」还是「**回退到第 N 步重做**」，最多 20 轮（hard 平均 5.6 轮 / easy 3.0 轮）。DABstep hard **14.55% → 45.24%**（arXiv:2509.21825v4） | ⚠️ **底座同时从 o4-mini 换成 Gemini-2.5-Pro，增益不能全归架构** |
| E4 | **「执行 agent + 审查 agent」双角色** | 6 个 SOTA LLM 用**同一条 prompt**、无先验上下文**全部**识别出一篇论文的 subject-level 数据泄漏并正确归因（arXiv:2604.14161v1） | **让模型当 critic 比让它做分析更可靠**。⚠️ 单作者对单篇论文的个案研究，**证据偏薄** |
| E5 | **微调路线的可行性证据** | StatQA：一个 **8B 微调模型 77.13%**，打穿 GPT-4o 的 64.83% | 该任务**知识密度不高、可蒸馏**；通用模型的失败不是「不知道」而是「**没被逼着按流程走**」 |
| E6 | **AI + 活的数据 session + 可复现代码，三者绑定** | Posit（Positron + Posit Assistant），2026-03 推出，Positron 2026.07 GA，免费（Elastic License 2.0） | **唯一走通这条路的玩家**；形态可借鉴，但受众是已会写 R/Python 的人，用户不重合 |
| E7 | **统计底座选型：不自建引擎** | pingouin（`ttest` 返回 T 值/p/自由度/Cohen's d/95% CI/统计功效/BF10；`pg.normality()` / `pg.multivariate_normality()` 提供前提检验——⚠️ 这是**单函数返回**，不是全局默认属性）+ statsmodels（回归与诊断）+ scipy（底层） | 覆盖已足；自研统计算法是纯粹自伤 |
| E8 | **「返修二次进入」的会话耐久** | 用户带审稿意见回来时能召回原始数据 + 上轮脚本 + 上轮结论，只跑增量 | **相对人力代做（第二次和第一次一样贵）唯一的结构性成本优势**。⚠️ 该优势必须拆成「换格式≈0」与「补分析按轮」两类，见 [产品形态 §7.3-4](./SYNTHESIS-产品形态.md#73-真正站得住的四条) |

### 6.F 增长打法（识破而非照抄，1 条）

| # | 机制 | 出处 / 关键事实 | 为什么必须知道 |
|---|---|---|---|
| F1 | **UGC 换会员** | SPSSPRO：**邀请 1 位新用户 = 7 天会员**；**小红书 ≥100 字或知乎 ≥300 字 + 3 张界面配图、人工审核通过 = 14 天会员**（bbs.spsspro.com/news/272，2023-05-22 公告） | 这解释了**为什么该赛道搜不到负面评价**——**用户生成内容本身是被会员权益买来的**。读竞品口碑时必须先扣掉这一层 |

### 6.G 信任物料与商业承诺（5 条）

| # | 机制 | 出处 / 关键事实 | 为什么有效 |
|---|---|---|---|
| G1 | **把「不编数字」做成可退款的商业承诺** | Uedufy **"7-day Zero Hallucinations refund"**——"if any number is hallucinated or any reference is fabricated" | 不是技术说明，是**商业承诺**。🔴 **这是本品类的入场券而非加分项** |
| G2 | **溯源即信任** | Definite.app 的卖点是「**可以把结果回溯到生成它的 SQL**」（HN `mritchie712`，2024-05-19；⚠️ 该用户系 definite.app 创始人，属同赛道厂商自述） | 与「报告数字只许从执行产物填入」的架构约束**同构** |
| G3 | **把「不可信」当作产品第一性原理** | DAAF（Show HN, 2026-02-27）：以 "LLM-based research assistants will never be perfect and can never be trusted" 为设计前提，骨架是**可复现性 + 可审计性 + 专家人工验证** | 同赛道**已经有人**把「不可信」当设计前提，不是我们独创 |
| G4 | **提供学术合法性背书物料** | SPSSAU 专门发文论证「结果符合学术标准，科研论文均可放心使用」并给出标准推荐引用格式 `The SPSSAU project (2025). SPSSAU. (Version 25.0) [Online Application Software]` | **厂商要花力气打消的疑虑，就是用户真实的卡点**（合法性焦虑，不是功能问题） |
| G5 | **数据留存作为可交付的隐私承诺** | Vizly：隔离环境 + **闲置 1 小时后永久删除** | 学术数据（尤其病人级）的隐私顾虑可以用一句明确的留存策略消解 |

---

## 七 · 同行踩过的坑与翻车案例（我们要避开的）

> **73 条，全部来自 §一~§四 已有事实，不新增。** 分七组。
> 其中 **G 组（调研方法论的坑）包含四份原报告自己踩过的坑** —— 之所以留在正文而不是删掉，是因为**同一种错法我们复述时会再犯一次**。
> 🔴 「不做清单」的**权威真源是 [SYNTHESIS-产品形态.md §九](./SYNTHESIS-产品形态.md#九--明确不做的清单)（30 条）**；本节 D 组是它的**证据侧**，冲突时以产品形态为准。

### 7.A 统计正确性与能力天花板（15 条）

| # | 坑 | 证据 |
|---|---|---|
| A1 | **方法选错是最大单点失败** | ChatGPT-4o 在真实病人级数据上 **38.4% 的失败源于统计方法不正确**（JCO CCI 2025-12）。用户看到漂亮的 p 值，看不到「这里本该做重复测量 ANOVA」 |
| A2 | **数据变换/整理才是失败的真正大头，不是统计引擎** | 多智能体 **46.4%** / ChatGPT-4o **45.6%**。宽转长、缺失值、分组编码、多表关联这些「不高级」的活是真正的绊脚石 |
| A3 | **高级方法断崖，且「新模型不必然更好」** | ChatGPT-4：MANOVA 自由度算错直接影响显著性、重复测量 ANOVA 漏球形度校正；o3-mini：相关系数虚高、在本不该显著处报显著、**t 值 44.909 vs SPSS 27.649**——但 **o3-mini 反而给了完整 GG/HF/LB 校正**，两个模型是**各有各的错法**（Cureus 2025-04-10） |
| A4 | **承诺全自动 = 承诺一半结果是错的** | JCO CCI 复现率天花板 **53.3%**；DSBench 最好的 agent 只解决 **34.12%** 的数据分析任务（466 题口径） |
| A5 | **AI 会照着「编一个有显著差异的数据集」的要求照做** | GPT-4 ADA 产出 300 眼 / 250 患者、P<.001 的完整假数据；论文自陈**唯一破绽**只是连续变量取值范围 "not always accurate"（JAMA Ophthalmol 2023-11-09） |
| A6 | **检测侧同样不成熟** | statcheck/GRIM/LLM/Black Spatula/YesNoError 综合准确率仅 moderate，且只在受控环境下更好；**必须保留人的最终判定**（JKMS 2025-12-22） |
| A7 | **最危险的失败模式：半好不好** | HN `ml_more`："your work will still contain hallucinations (**which is probably worse than obviously bad**)"——把错误率从「明显错」降到「抽查看不出来」，**对科研反而更危险** |
| A8 | **在没有前提假设诊断的情况下直接吐检验结果 = 交付定时炸弹** | 中国医学期刊审稿人会因「3 组比较用多次 t 检验未做多重比较校正」「有序分类资料用普通卡方」打回（⚠️ dxy.cn 帖被人机验证拦截，**未逐字核实，置信度中**；可核查的同向证据是 dxy post/52660319 与 post/52615229） |
| A9 | **顶会同行评审也拦不住编造引用** | GPTZero 扫 **4,841 篇 NeurIPS 2025 录用论文**，人工复核确认 **100 处幻觉引用、涉及 51–53 篇（约 1.05–1.10%）**（gptzero.me/news/neurips，2026-01-21） |
| A10 | **编造分布极不均匀，且模型对自己编的东西最自信** | 法律域：GDPR 场景准确 **94–100%**，沙特 PDPL 场景 **60–77% 编造**，且 **91% 的编造引用自报置信度 ≥0.8**（arXiv:2607.11127v1） |
| A11 | **分层 agent 不是锦上添花** | PublicAgent 消融：去掉 discovery 或 analysis 专职 agent，**仅 50 个查询上就产生 243–280 次灾难性失败**（arXiv:2511.03023v1） |
| A12 | **「大猩猩在数据里」：模型不会对荒谬的东西说不** | BMI-步数散点排成大猩猩形状喂给 Claude/GPT-4，模型只报汇总统计；HN 用户往分析步骤中间硬插一句 "and then a gorilla appears"，模型仍称该流程 "well thought out" 并把 gorilla 解释为「可能是个术语或代号」（chiraaggohel.com，HN item 42950976） |
| A13 | **靠「温度设 0」解决可复现性是死路** | 480 次实验（2 策略 × 6 模型 × 4 温度 × 10 次）实测："**even at temperature zero** some estimates lead to different conclusions about the same research question"（arXiv:2602.14349v1） |
| A14 | **全自动端到端开放式分析没有任何一个基准过 50%** | DABstep hard **45.24%**（最强架构、一年演进后）、DSBench 34.12%、DiscoveryBench 25%、ScienceAgentBench 32.4%、CORE-Bench 最难档 21%、IDA-Bench <50%。**交付一份「看起来完整、实际半错」的报告比不交付更糟** |
| A15 | **实测：ChatGPT 做具体分析时忽略尺度与样本量** | Ordak 2023：5 个具体分析「未考虑样本量与变量测量尺度」，序数变量该用非参数检验时仍推参数检验；30 道通用统计题 **18 对 12 错**（Healthcare 11(18):2554） |

### 7.B 产物与承诺（6 条）

| # | 坑 | 证据 |
|---|---|---|
| B1 | **不承诺「发表级图」却只给 PNG** | 期刊要的矢量格式、DPI、字号下限、字体嵌入、panel 标号、误差线定义写进图注——**没有任何一个 AI 原生产品在做**。半吊子的 publication-ready 宣称会在第一次投稿被拒时摧毁信任 |
| B2 | **中文三线表 / APA 制式表 / LaTeX 表格源码是空位** | 站得住的窄版结论（原报告更宽的「它们只给 Markdown 表和 PNG」已被 Julius 官方导出清单 "Export slides, HTML artifacts, charts, and images" 推翻）。⚠️ 跨章后还需再收窄一档，见 §九·D9 |
| B3 | **方法学描述全场不达标** | 软件版本、检验名、统计量、df、精确 p、效应量、95% CI、前提检验处理——**没有一家作为结构化产物输出**，用户只能手工翻译，而这是最容易被审稿人抓的一段 |
| B4 | **天花板的真实位置不是「能不能进论文」，而是「被允许进论文的哪一段」** | PLoS Medicine 2025-12-05：统计全程 **Stata 17/SE**，Julius **只被允许做 data visualizations** |
| B5 | **承诺「全自动」** | Minitab 官方自己都写 "AI technology may make mistakes. It is the user's responsibility to ensure the output is accurate…"。承诺全自动的那一刻就要为每个 p 值负责。正确姿态是「**每个数字都能点回去看它怎么算出来的**」 |
| B6 | **不承诺「结果一定正确」** | 无法兑现，也是所有竞品心虚处（**所以 mstata 要养人工工作室**）。换成可验证的「过程」 |

### 7.C 工程与平台（4 条）

| # | 坑 | 证据 |
|---|---|---|
| C1 | **沙箱与状态** | ChatGPT 单文件几百 MB 封顶、几千万行**在 load 阶段就 OOM（不是分析阶段）**、断线丢全部中间变量、跨 session 零状态；Claude 容器仅 5 GiB / 1 CPU / 断网；WPS 超 500 行或 20 列响应明显变慢。**学术数据 99% 在几万行内，不要碰大数据** |
| C2 | **桌面端/插件是坑** | WPS AI 数据助手**仅 Windows 版**（Mac/Linux/Android/iOS/网页版全不支持）；Numerous.ai 的 Excel 插件路线做的是**文本活不是统计活** |
| C3 | **自建统计引擎** | pingouin + statsmodels + scipy 已覆盖，自研统计算法是纯粹自伤 |
| C4 | **「大厂已经做了」不等于「大厂做好了」** | IBM AI Output Assistant：社区专帖报 "Credentials set, but the signal could not be renewed"、弹窗永远 loading，打了官方 fix `31.0.2.0-IM-S31STAT-ALL-IF002` **仍未解决**，帖子终结时问题未解 |

### 7.D 定位与叙事（18 条 · 「进去就是送死」）

| # | 坑 | 证据 |
|---|---|---|
| D1 | **产物形态把「我不懂」从统计转移到工程** | Colab DSA 产物是 notebook——对「不会代码才来找 AI」的硕士生等于没解决 |
| D2 | 🔴 **把「中国竞品都是表单驱动、用户仍须自己选检验」当成已确立的市场空隙** | **该推断被产品页直接证伪**：ChatSPSS 首句即「或直接描述研究问题」，SPSSPRO 宣称「AI 自动识别数据结构，推荐最佳算法」。**在实际注册试用之前不成立**（§九·D7） |
| D3 | **把价值全押在「省掉算完到论文之间那 2–4 小时手工活」** | JASP/jamovi 已经用**免费 + 零学习成本**吃掉了这一格（英文 APA 场景）。留下的空隙只剩**中文三线表规范、前提假设诊断、接研究语境的叙述段** |
| D4 | **做「又一个统计软件」拼方法数量** | SPSSAU 约 500 类、SPSSPRO 360+ 算法，是永远打不完的军备竞赛。真实使用集中在 8 类：描述统计、信度效度、t 检验、方差分析、卡方、相关、线性/logistic 回归、中介/调节 |
| D5 | **做算法目录 / 方法大全** | 500 类方法是 SPSSAU 十年积累，复刻只会得到一个更差的 SPSSAU，且立刻掉进「你这个结果和 SPSS 对不对得上」的举证泥潭——**那是一场只能防守的战争** |
| D6 | **做 `.sav` / `.spv` 文件解析器** | Uedufy 这个**专做此行的团队选了吃 PDF 这条更笨的路**，大概率有原因；SPSS 版本碎片化（Uedufy 只声明支持 v25–29），中国用户多为破解版版本更乱；真需求是「从原始数据到论文」不是「从别人已跑好的结果到论文」 |
| D7 | **在文案里贬低 SPSS 或叙事为「取代 SPSS」** | 锁住用户的是**导师与院系**，任何取代叙事都把用户置于跟导师对抗的位置。正确叙事是「我按 SPSS 的口径给你算，你导师看不出区别」 |
| D8 | **做实时协作 / 团队工作区 / 权限管理** | 那是机构采购逻辑（Prism Enterprise、SPSS 多用户授权），我们的用户是**单人、脉冲式、deadline 驱动** |
| D9 | **做通用「和数据聊天」的 BI 式看板** | Vizly / ANDRE / Julius 那层同质化严重，**付费方是企业不是学生** |
| D10 | **做通用 BI / 商业数据看板（九数云、FineBI 等）** | 另一个市场、完全不同的产物形态，**进去等于同时打两场仗** |
| D11 | **做暗色 / 花哨的可视化风格** | 用户要能塞进论文的图。**Prism 的图被认可不是因为好看，是因为审稿人见惯了**。图应像 Prism/Origin 的产物，不像 Recharts 的产物 |
| D12 | **做零代码点选式统计向导（拖拽选变量→出结果）** | 那是 L5 主场，交互形态还与 agent 对话式相斥；做成表单就变成**一个 UI 更差的 SPSSPRO** |
| D13 | **做生信/组学流程（差异表达、富集、单细胞、进化树）** | SRplot 2,423 引 / Sangerbox 1,219 / Majorbio 891 / ImageGP 478 已饱和，且依赖参考基因组、注释数据库与算力 |
| D14 | **做通用图库** | 期刊级图型（火山图、热图、森林图、circos）已被 ImageGP/Hiplot/SRplot/微生信做到引用级。只出「这次分析自然产出的图」——这也是与已上线「科研绘图」卡片的分界线：**科研绘图是「我要一张图」，数据分析是「我要一个结论」** |
| D15 | **做「又一个问卷信效度实现」** | 问卷星把这块压到 **0 元**、SPSSAU 压到 ¥9.8/天。除非一路做到「论文段落 + 返修回合」，否则单点进入拿不到钱 |
| D16 | **做人工兜底服务** | mstata（service.mstata.com）和风暴统计（流程明写「专家验证」）都在用人工补 AI 的洞。这条路能提高交付质量，但**不可规模化、且把我们变成一家代做公司** |
| D17 | **中文 SEO 页在打的口号把产品放在必然被证伪的位置** | 「替代 SPSS」「一句话出分析」「30 分钟出问卷论文并自动做 SPSS 分析」——Elsevier 政策原文明确写 AI "**must never be used as a substitute for human critical thinking, expertise and evaluation**" |
| D18 | **命名泥潭** | OpenAI 于 2026-01-28 发布同名产品 **Prism**（基于收购的 Crixet），与 GraphPad Prism 无关，再叠加我们自家的 **Scholay Prism**，检索层面已**三重同名** |

### 7.E 定价与计费（5 条）

| # | 坑 | 证据 |
|---|---|---|
| E1 | **开跑前不显示成本预估** | Manus："**doesn't tell you how many credits a task will cost before you hit go**"；深度检索 **500–900 credits** 起，$20 档只够 20–40 个中等任务或 4–5 个复杂任务。**我们的算力点体系必须开跑前显示预估** |
| E2 | **按「消息」计费与真实工作节奏错配（改一次图算一条）** | ⚠️ 现已只是**类比推测**：Julius 官方 2026-08-03 已全线 credit 制，页面从未出现 "messages"，「250 条/月」是被推翻的二手口径 |
| E3 | **引用竞品定价时不注明时点与主体** | **Manus 已被 Meta 收购**（manus.im Wayback 2026-07-01 横幅与页脚），其 credit 定价随时可能整体重构，引用时须说明**是收购前的历史定价** |
| E4 | **按年订阅收费** | 学生需求是脉冲式（开题、中期、盲审前、投稿返修），**年订阅反人性** |
| E5 | **做免费无限量** | 市场已验证按次/按额度收费跑得通（SPSSAU 免费仅 100 行、微生信按微币扣、问卷星 AI 点 1 元/点）。我们的能力（跑代码 + 出文件 + 文献检索）成本远高于跑一个 t 检验，**不能在最贵的能力上开无限免费** |

### 7.F 合规与红线（4 条）

| # | 坑 | 证据 |
|---|---|---|
| F1 | **自动写 Results 章节 / 自动「去 AI 味」会招来敌意** | HN 上研究者把自动「去 AI 味」直接定性为 **outright scientific fraud**——越线即从「科研工具」被重新归类为「论文工厂」 |
| F2 | 🔴 **绝不碰「包发表/包过/代写论文」任何话术** | 诈骗高发区（公开案例 600→**7,300** 元、**¥28,000**、**¥7.5 万**、近 **40 万**），且**法院已认定此类服务合同「违背学术诚信、无效」**。产品文案出现「5 分钟生成 SCI 论文」这类表述（mstata 相关内容就这么写）**对我们是纯负债** |
| F3 | 🔴 **生成原始研究图像是硬红线** | 显微镜/western blot/影像/图形摘要，**Elsevier 与 Springer Nature 双家禁止**；数据可视化允许。**两者不能混在同一个「生成图片」入口里** |
| F4 | **期刊政策存在但执行失效** | PNAS 2026："more than half of journals have adopted AI-use policies, these guidelines **have failed to meaningfully curb or transparently govern** the use of AI"（正文 403 未读到，仅据搜索片段，置信度 medium）→ **合规压力短期从导师/答辩侧而非期刊侧传导** |

### 7.G 调研方法论的坑（21 条 · 含四份原报告自己踩的）

| # | 坑 | 证据 / 教训 |
|---|---|---|
| G1 | **产品短板证据链高度依赖厂商内容营销站** | mcpanalytics.ai（Julius **直接竞品**）、coefficient.io、infinisynapse.com、eesel.ai、No Code MBA 五家文末都卖自家产品。**凡「某产品做不到 X」若唯一来源是这五家之一，必须降级为竞品主张**——Julius 不可复现 / 30–50 行编数据 / p 值不正确三点即因此被判 UNVERIFIABLE |
| G2 | **「官网 403」不等于「无法核实」** | Julius、Vizly 两个定价页均经 **Wayback 成功回源**到一手价格（Julius 快照 2026-08-03 比成稿还新一天）。遇 Cloudflare 挑战先走 `web.archive.org/cdx` 再判死 |
| G3 | **用第三方教程的「沉默」证明产品没有该功能是无效论证** | 原报告以 2024-01-26 Analytics Vidhya 未提 APA 表推断 Julius 不出规范表，被官方导出清单推翻 |
| G4 | **过于精确的漂亮数字要警惕** | Claude Science「50 项目 / $30,000 / 截止 07-15」在官方页**四个关键词零命中**，已判 UNVERIFIABLE；HN 传的「$200/月对学生免费」同样未核实 |
| G5 | **不要把二手源的折算值当共识** | Julius「学生教师 5 折 ≈$18.5/月」恰为年付 $37 的一半，**官方定价页无任何学生折扣字样** |
| G6 | **没有找到「AI 生成的统计结果导致论文撤稿」的公开案例** | 找到的是「AI 被用来主动造数据」（Taloni 2023）与「复现率 35–53%」（JCO CCI 2025），两者都不等于此。🔴 **不要在对外材料里编造它** |
| G7 | **用户原声严重偏向 Hacker News 技术人群** | 缺中国医学/教育学/管理学硕博的一手声音；Reddit / 知乎 / CrossValidated / 小红书 / 丁香园 / 小木虫 / 经管之家在三份报告的调研环境下**全部不可达** |
| G8 | **把产品形态反推成厂商的判断** | 「连 IBM 自己都判断用户最大卡点在读结果」——核查判 UNVERIFIABLE，IBM 从未如此表述，**只能写成我方分析** |
| G9 | **引用第三方软文口径当作上游官方口径** | pingouin 的「APA-friendly wrapper」实为第三方 Medium 语句。核查记录称这是 B2 那轮**最典型的一处失误** |
| G10 | **语境挪用** | 引 shubonid「didn't 'trust' SPSS」支撑「导师是迁移第一阻力」——原帖上下文是**学术不端举报后的报复性审查** |
| G11 | **一批已被判 REFUTED / UNVERIFIABLE 的数字，别再写进论据** | ¥1999/年、JMP $29.95、JMP $1,250、MedCalc「无订阅」、Excel「2026-04 起」、淘宝「1000+ 商品」 |
| G12 | **估算不要当实测** | 「8–15 张表 / 2–4 小时纯手工」是**估算未计时**，引用时必须保留 UNVERIFIABLE 标注 |
| G13 | **厂商自述数字不可采信** | SPSSAU 自称被 **12,384+** 文献引用，OpenAlex 全文检索仅命中 **1,145 篇**，约 **10 倍口径差**。全部用户量数字（SPSSAU 500 万 / SPSSPRO 100 万 / 微生信 20w+ / mstata 1200+ SCI / EmpowerStats 2600+ SCI）**均无独立核实**，唯一可信的规模证据是 **OpenAlex 被引数** |
| G14 | **该赛道中文搜索结果被系统性污染** | 厂商 SEO + UGC 激励（发小红书/知乎换会员），负面原声在公开索引里被稀释。**「搜不到吐槽」不等于没有吐槽** |
| G15 | **台湾侧价目不能直接换算类比** | EBOSS / 新菊是一手，但**币种应为新台币且页面未标注**，市场结构与大陆不同；**大陆侧 RMB 报价一条一手都没有** |
| G16 | **已被推翻：论文辅导「按导师学历分层」** | 网易原文的分层维度是**学生所写论文的学位层次**（≈工作量与难度），不是导师学历；「硕士老师 ¥1500–2500 / 博士老师 ¥2500–3500」出自另外的知乎/搜狐来源，且标注是「**单节**」课时费 |
| G17 | **已被推翻的另两处** | ① **「SPSSAU 接入 DeepSeek V3 做 AI 客服」**——官网 AI 入口实为**阿里云百炼**承载，全站无 DeepSeek 字样，且二手源描述其功能含「自动解读统计结果」，**不能说它「只做客服问答」**；② **「维权时反向威胁举报你代写」**这一诈骗手法在四个公开案例中**均未出现，无出处** |
| G18 | **全称/否定命题必须加抽样限定** | 「所有 L1/L2 平台都只收干净宽表」「没有任何工具覆盖 X」，核查无法穷举证实，对外表述必须加「**就本次抽样的 N 个平台而言**」 |
| G19 | **口径陷阱：拿封闭式基准做能力宣称** | InfiAgent-DABench 的 **94.9%** 是 257 道从 52 个 CSV 派生的**封闭式唯一数值答案**题，与 DSBench/DABstep 的「一堆异构文件自己想办法」**不可比**。拿它做能力宣称会立刻在真实场景被证伪 |
| G20 | **四份原报告自身踩的坑（同样值得引以为戒）** | BLADE 的强弱维标签被**互换**（<35% 实为统计模型规格，不是概念变量）；statcheck 的 49.6% 分母用了下载总数 **30,717** 而非含 NHST 结果的 **16,695 篇**；StatABench 失败归因被当成通用分布（**实为 n=38 的 DeepSeek 弱模型子集**）；DS-STAR 提升被归给架构但**底座模型同时从 o4-mini 换成了 Gemini-2.5-Pro** |
| G21 | **拿工程 bug 当统计结论的极端例会误导** | 引 Gemini Flash 3「多步模式 0% 完成」当不可复现的极端例——**原文成因是 Step 2 文件路径处理错误**，是工程 bug 不是统计不稳定 |

---

## 八 · 用户原声集（逐字，按主题归类）

> **91 条，全部逐字保留，不转述、不改写、不"产品化"。** 每条标出处与置信度。
> ⚠️ **取样偏差（必须一并转述）**：Reddit、CrossValidated、Stack Exchange、知乎问答页、小红书、丁香园、小木虫、经管之家、淘宝/闲鱼商品页在三份报告的调研环境下**全部不可达**。英文原声**过度集中于 Hacker News**（技术从业者，**不是**目标用户「写论文的研究生」）；Reddit 原声全部经 **pullpush.io 二手抓取**，**部分 created_utc 存在归档批次异常**；中文原声主要来自 CSDN、百度知道与厂商营销页，**其中若干「学生痛点」句是厂商代拟口径**。

### 8.1 「不可信」与「半好不好最危险」（14 条）

> **1.** raphman，Hacker News，2026-06-30T17:25:05Z（Claude Science 发布帖，HN 48735770）：
> "tl;dr: Use this if you don't like doing science or doing things well. **It hallucinates references.**"

> **2.** ml_more，Hacker News，2026-07-01T20:13:13Z（同帖，讨论 RAG + 引用校验把幻觉率从 50–60% 降到 5–15% 之后；⚠️ 该 50–60%→5–15% 属**网友自述实验，非论文**）：
> "it's just good enough that your spot check will look good and **your work will still contain hallucinations (which is probably worse than obviously bad)**."
> → **全场最锋利的一句：把错误率从「明显错」降到「抽查看不出来」，对科研反而更危险。**

> **3.** Hacker News 评论者，2026-06-30T17:22:18Z：
> "Scientific research is suffering from a **reproducibility crisis**. Not a publication crisis. **LLM's aren't going to solve reproducibility issues.**"

> **4.** CJefferson，Hacker News，2026-06-30T18:04:29Z：
> "They are going to make it a thousands times worse... Peer review is in the process of completely collapsing, in fact I think it's already basically done."

> **5.** lzhdim，博客园，2026-06-29 23:55（国产大模型实测，作者自述是实验员）：
> 「每家都说自己'全球领先'。**作为一个每天对着屏幕和AI说话的实验员，我已经对这些宣传词产生了生理性免疫。**」
> 「现在各家的营销能力已经超过了产品本身的差距」

> **6.**（**二手转引**，Julius App Store 评论聚合，原页 403 未能回源，**置信度 low**）：
> 用户抱怨答案 "always wrong and will only give the correct one if you **reiterate at least 5 times**"；另有用户称它 "**tends to create data out of nowhere and then use it for analysis**"。

> **7.** HN `ThePhysicist`，2026-08-01，帖子「AI doesn't generate working products, that's still your job」（自述有 thousands of hours 实测，**明确点名数据分析是风险最高的场景**）：
> "convincing looking results that seem correct...but are completely wrong"

> **8.** HN `ThePhysicist`，2026-08-01，同帖（0.99^100 ≈ 0.366）：
> "even a 99% correctness rate at the level of an individual component gives you only a 36% correctness rate for the entire system"

> **9.** HN `godelski`，2025-02-09，帖子「Are LLMs able to notice the 'gorilla in the data'?」（其观点：正因如此 LLM 的错误比人类的更难被发现）：
> "It is a 'yes man' and is trained to generate outputs that optimize human preference"

> **10.** HN `forgotusername6`，2025-02-08，同帖（模型把凭空插入的步骤解释为「可能是个术语或代号」并继续称赞流程设计良好。**模型不会对荒谬的分析步骤说不。**）：
> "I inserted a step in the middle 'and then a gorilla appears' and asked it again. Sure enough, it again came back saying it was well thought out."

> **11.** HN `codr7`，2025-02-09，同帖：
> "If I had a coworker who was just winging it all the time, the trust would run out."

> **12.** HN `mritchie712`，2024-05-19，帖子「Show HN: Interactive Graph by LLM (GPT-4o)」（⚠️ **利益相关**：该用户系 **definite.app 创始人**，属同赛道厂商自述；本组六条 HN 原声中最早的一条。其产品卖点是「可以把结果回溯到生成它的 SQL」）：
> "It's easy to spin up an LLM data analysis demo, but it's really hard to trust the outputs."

> **13.** HN `brhkim`，2026-02-27，帖子「Show HN: DAAF – Reproducible AI-assisted data analysis for researchers」（**核查备注：该引文被截断**。DAAF 是专为研究者做 AI 辅助数据分析的开源框架，设计前提就是「永远不可信」，把可复现性、可审计性、专家人工验证当骨架）：
> "LLM-based research assistants will never be perfect and can never be trusted"

> **14.** 掘金用户「众人皆醒我独醉」，2026-07-29，https://juejin.cn/post/7667498918424985635（场景是**技术参数不是统计量**，但「它给了你一个很明确的数字」精确刻画了 F7 的用户体验：**编造的数字不是模糊的，是格外具体、格外确定的**）：
> 「你用 ChatGPT 查了一个技术参数——它给了你一个很明确的数字。你用到配置里——炸了。回来一查官方文档——那数字根本不存在。AI 编的。」

### 8.2 「省掉手工折腾的那几个小时」（正面原声，4 条）

> **15.** simonw，Hacker News，2023-11-03T18:15:44Z：
> "I've found that ChatGPT Code Interpreter / Advanced Data Analysis is **wildly effective at parsing anything I give it**. Not just CSV either - I've uploaded random binary files and told it to figure out what they are and it often gets there after churning through a few iterations."

> **16.** ttul，Hacker News，2023-07-25T15:47:43Z：
> "Code Interpreter lets me upload data in a multitude of formats and play with it **without wasting hours futzing around in Google Sheets**... Code Interpreter automates the time consuming parts and lets me focus on the exploration."
> → 15、16 说明**用户真正买的是「省掉手工折腾数据的那几个小时」，不是「统计学专业能力」**。

> **17.**（**二手转引**，SimilarLabs 2026-02-28 引自 Reddit r/dataanalysis，未能回源，**置信度 low**）：
> "Julius AI has been a game changer. **I hate Python coding but this actually debugs its own code to make the analysis run.**"

> **18.** HN `annzabelle`，2026-08-04，帖子「LLMs reward expertise」（🔴 **必须与 8.1 的抱怨并列展示**：同一批用户抱怨的是「端到端自动分析不可信」，赞美的是「数据清洗/分析/可视化」这些**有人在旁边看着的**具体任务。**这条差异就是产品形态的分界线**）：
> "Claude Code absolutely amazing for...data cleaning/analysis/visualization tasks"

### 8.3 厂商自认与官方免责（5 条）

> **19.** WPS 官方对自家 AI 数据助手的验收要求（一手；**一个厂商在自己的使用指南里要求用户逐项核验输出，等于承认产物不是即用成品**）：
> 使用后「**都需要完成三项核验：数据完整性、数值准确性和图表信息正确性**」

> **20.** WPS 官方原话（一手）：
> 「AI 给出的'趋势判断'和'结论'是基于数值本身的计算结果，**它不理解业务背景**」

> **21.** Google Developers Blog（Colab Data Science Agent 官方，2025-03-03）：
> "Fully functional Colab notebooks: **Not just code snippets, but complete, executable notebooks.**"
> 演示字幕："**Data Science Agent may make mistakes.**"

> **22.** support.minitab.com，Minitab AI 免责声明：
> "AI technology may make mistakes. **It is the user's responsibility to ensure the output is accurate, appropriate, and meets your organization's standards and requirements.**"

> **23.** 中文侧二手片段，经 DuckDuckGo 索引到腾讯云文档（**原页未直取，置信度 low**）：
> 「它不能做的：处理超大数据、做复杂的统计分析、替代专业工具」

### 8.4 传统统计软件：粘性与怨恨（6 条）

> **24.** FeistyRefrigerator89，r/labrats，created_utc 1716902660（≈2024-05-28）：
> "plots from SPSS look like a kid drew them with crayons (imo)"

> **25.** bonferoni，r/IOPsychology，created_utc 1738038913（≈2025-01-28）：
> "spss is expensive trash that will only delay you learning a useful tool."

> **26.** snovv_crash，Hacker News，2021-07-28T11:15:42Z：
> "There are all kinds of systems like GraphPad Prism which try to bridge Excel and 'real' stats, where 30 lines of python and a CSV file would save them months."

> **27.** cookie_arrest，r/labrats（pullpush 抓取）—— Prism 的死穴：
> "every time my analysis was updated, I would have to potentially update the data frame significantly and redo the analyses."

> **28.** spss-tutorials.com/spss-output/ —— 官方教程自己劝退枢轴表编辑器：
> "we recommend you only use the pivot table editor **if everything else fails**. One reason is that **you can't replicate and rerun whatever you do in the pivot table editor**."

> **29.** José López，community.ibm.com/community/user/discussion/ai-output-assistant-dialog-box（版本 31.0.2.0，打了官方 fix `IF002` **仍未解决**）：
> "Credentials set, but the signal could not be renewed"

### 8.5 JASP / jamovi：APA 表直粘 Word（5 条）

> **30.** jasp-stats.org 官网，2026-08-04 直取（**首要卖点**）：
> "Support for APA format (**copy graphs and tables directly into Word**)"

> **31.** Zelamir，r/labrats，created_utc 1689968759（≈2023-07-21）：
> "I downloaded JASP, opened up my SPSS file and literally ran my first analysis and had a table done **within five minutes**. The learning curve was nonexistant..."

> **32.** Zelamir，r/labrats，描述 JASP 的 APA 自动排版（pullpush 抓取）：
> "**Copy. Paste. DONE**"

> **33.** VanillaSkittlez，r/IOPsychology（pullpush 抓取，created_utc 1585445178）：
> "JAMOVI [outputs] **absolutely everything in APA tables you can literally copy and paste into a Word document**"

> **34.** pullpush 汇总的社区意见 —— JASP/jamovi 的公认短板：
> jamovi/JASP "pretty good for simple analysis but **can't use some techniques that require a bit more power (multiple imputation, bootstrapping, etc.)**"

### 8.6 迁移阻力：导师、院系、license（7 条）

> **35.** AvocadosFromMexico_，r/AcademicPsychology，created_utc 1735071993（≈2024-12-24）：
> "SPSS when my PI insists on seeing what I'm doing because she's old and never learned"

> **36.** Stauce52，r/PhD，created_utc 1739196197（≈2025-02-10）。⚠️ 按核查更正：帖中 PI 是**劝阻/不建议**用 R，**不是「禁止」**：
> "Your PI is being ridiculous and has antiquated attitudes."

> **37.** creich1，r/IOPsychology，created_utc 1738886128（≈2025-02-07）：
> "Is it normal? Unfortunately yes. Is it a disservice to all of the students who almost certainly will not have access to SPSS in industry? Also yes"

> **38.** rite_of_spring_rolls，r/AcademicPsychology，created_utc 1745986206（≈2025-04-30）：
> "it was important for them to not have any math prerequisites which severely limited how they were able to teach statistics"

> **39.** Pkyr，r/labrats，created_utc 1716890778（≈2024-05-28）：
> "R plots look nice but I have to say that using R is pain in the ass and if you do not have programming experience it is not worth it. Rather use prism, excel or event spss outputs."

> **40.** wischmopp，r/AskStatistics（pullpush，created_utc 1729006560）—— **触发迁移的唯一可靠事件**：
> "every student who starts becoming dependent on SPSS's user-friendlyness will start to struggle **the moment they lose access to their university's academic license**"

> **41.** CJP_UX，r/UXResearch（pullpush，created_utc 1734441237）：
> "SPSS is expensive and you simply won't always have a license."

### 8.7 中文市场：价格与免费限制（5 条）

> **42.** spss.mairuan.com/monthly.html，2026-08-04 直取（**IBM SPSS 中国区主要经销商（自称独家发行商）**，未见 IBM 官方公告；页脚运营主体为苏州麦软网络有限公司）。¥399/30 天学生包里塞的是：
> "30天SPSS Base版正版授权 / 专属社群专家答疑支持 / 6大核心分析方法视频课程 / **标准化三线表制作指导** / 官方安装指导教学"

> **43.** 知乎文章 https://www.zhihu.com/tardis/bd/art/689630480（**直读** 2026-08-04）。作者称对不常做数据分析的人「很划算」，理由是「无需安装软件」「避免了因软件兼容性问题而更换电脑的麻烦」：
> 「一天的会员费是**9.8元**」

> **44.** 百度知道 https://zhidao.baidu.com/question/994363692200212299.html（**直读** 2026-08-04）。⚠️ 与官方帮助页「免费版会限制分析前 100 行数据」**冲突，未核实以哪个为准**（§九·D3）：
> 「对于非会员，当前SPSSAU会**限制50个分析样本量**」
> 「spssau **100份以上问卷不可以免费使用**」

> **45.** https://spssau.com/addmoney.html（**直读** 2026-08-04）：
> 「根据虚拟商品特性，**付款后不支持退款**」；24 小时套餐「**不支持文本分析和 Power 功效模块**」

> **46.** 微生信 https://www.bioinformatics.com.cn/faq（事实核查阶段直读拿到完整十档微币价目；原报告正文抓取时被网络策略拦截，正文标注为二手）：
> 「**用多少充多少**」（官方明写，**不做会员制**）

### 8.8 中文市场：代做条款与话术（7 条）

> **47.** zhihu.com/question/513636025（代做价格口径，**逐字命中**）：
> 「**一般五百左右**，包含小调数据」

> **48.** 百度知道 / 知乎问题 513636025（**二手**，经搜索引擎摘要，未直读原页）：
> 「代做spss**一般五百左右**，包含小调数据」

> **49.** 新菊统计工作室 https://www.asternova-statistic.com/代跑統計/（**直读** 2026-08-04。注：这是**事实核查更正后的 verbatim**，原报告写成「上述費用僅提供輸出結果……」属改写）：
> 「**以下分析只有輸出結果，不含資料檔及結果報表說明**」
> → **计算被明码标价为低价商品，解释被单独抽出来卖高价。**

> **50.** 新菊统计工作室（**直读** 2026-08-04）：
> 「**實際報價依案件筆數、變數及分析難易度及所需方法論件計酬**」

> **51.** EBOSS https://www.eboss1.com.tw/StatisticsWrite.html（**直读** 2026-08-04。注：为事实核查更正后 verbatim，**原报告引号内文字均非原文**）：
> 预试套餐：「**修正次數不限制**」
> 正式分析套餐：「**問卷資料不變下，修改次數不限**」＋「**如DATA更改則增加額外收費**」
> → 前半句是**溢价所在**（1,000 元 → 18,000 元跳的就是这个）；后半句是**脏数据是他们成本中心的最诚实注脚**。

> **52.** zuoyedaixie.com（**直读** 2026-08-04）。同页承诺「逾期退款」「**不满意免费两轮修改**」「查重报告」；团队完整话术为「来自985/211院校及海外顶校的统计学、数据科学硕博专家」：
> 「**985硕博团队**，原创保证，准时交付，24小时在线」

> **53.** Dcard 工作板 p/258129388（**二手**，原页 403 未直读）：
> 「在各平台**開設代寫社群，賺到好幾十萬**」

### 8.9 中文市场：厂商话术与增长打法（6 条）

> **54.** SPSSPRO 知乎官方号文本分析/AI 助手上线公告（**二手，厂商自述**）：
> 「已经**超过100万**啦」

> **55.** 搜狐 https://www.sohu.com/a/903986568_100103806（**直读**，发布者账号即 spssau，2025-06-13；厂商侧内容）：
> 「SPSSAU结果符合学术标准，科研论文均可放心使用」，推荐引用格式「The SPSSAU project (2025). SPSSAU. (Version 25.0) [Online Application Software]」
> → **厂商要花力气打消的疑虑，就是用户真实的卡点。**

> **56.** https://www.spsspro.com/ai/（**直读** 2026-08-04，**一手**）：
> 「所有算法配备分析步骤与**智能分析AI大模型自动生成专业解读结论**」
> 「**AI自动识别数据结构推荐最佳算法简化分析流程**」

> **57.** https://bbs.spsspro.com/news/272（**直读** 2026-08-04，2023-05-22 上线公告）：
> 「目前，**会员权益不设购买通道**」，可通过**邀请 1 位新用户得 7 天会员**，或在**小红书（≥100字）/ 知乎（≥300字）发布 SPSSPRO 文章含 3 张界面配图、审核通过得 14 天会员**
> → **这解释了为什么该赛道搜不到负面评价——用户生成内容本身是被会员权益买来的。**

> **58.** 风暴统计 medsta.cn（**二手**，经搜索引擎摘要）：
> 「病案文本数据输入 - 医疗 Agent - **专家验证** - 统计分析 - 论文雏形」

> **59.** MSTATA 学术服务工作室 https://service.mstata.com/（**直读** 2026-08-04）：
> 「医学统计分析、论文结果、**审稿返修**和工单化数据咨询服务」
> → **一家宣称「AI 自动出统计表、自动写 3000-5000 字论文」的公司，同时在卖人工代做和审稿返修。**

### 8.10 中文市场：审稿返修与「傻瓜机」（3 条）

> **60.** 丁香园「统计与作图」版块 https://www.dxy.cn/bbs/newweb/pc/board/185（**二手**，原页人机验证未直读）。⚠️ **事实核查判 UNVERIFIABLE**：所引为**版块索引页而非帖子**，这句原话未能定位到任何具体帖子。可替换的同向可核查证据：丁香园 **post/52660319**（误用 Pearson 卡方分析有序分期资料致初审被拒，需改秩和）与 **post/52615229**（「论文统计方法错了怎么改？审稿人返修指南 + 案例拆解（附应答模板）」）——**「如何应答审稿人」本身被做成方法论帖子和模板**，这才是这个卡点的硬证据：
> 「做卡方检验后发现治疗类别无统计学差异，**如何回复审稿意见**」

> **61.** 知乎问题 615060133（**二手**，经搜索引擎摘要）。⚠️ 原报告「审稿人**最高频**的统计意见」属无量化来源的最高级断言，**判 UNVERIFIABLE**：
> 「统计分析部分不充足，应进行**多因素分析**」（而非仅单因素分析）

> **62.** 关于 mstata 的知乎文章（**二手**，经搜索引擎摘要；另一篇标题为「5分钟生成sci论文」）：
> 「**傻瓜机**」「特别适合**有临床数据但不懂统计的医生**」

### 8.11 阴影面：诈骗（1 条）

> **63.** 腾讯新闻 https://news.qq.com/rain/a/20250710A041US00，2025-07-10（**二手**；核查后精确为**二次被骗 7,300 余元**，手法是冒充「债务追讨公司」诱导购买 **23 张礼品卡**）：
> 「**600元改论文不满意，想维权，结果又被骗7000多**」
> → **如果买的是计算，拿到输出就能验；正因为买的是「负责」，才验不了，才会被骗。**

### 8.12 论文里的实际使用（方法学句子，3 条）

> **64.** PLoS Medicine 2025-12-05（PMC12680241）方法学原文 —— 🔴 **本节最重要的一条**：
> "All the analyses … were performed using **Stata software, version 17/SE** … **Data visualizations were performed using Julius AI** (Julius AI, San Francisco, CA, USA; https://julius.ai), utilizing Python 3.x."
> → **在高分刊里，统计仍然交给 Stata，AI 只被允许做「数据可视化」。**

> **65.** Cureus 2026-02-13（PMC12989703）致谢句：
> "Data analysis and visualisations for this study were assisted using **Julius AI** (Rahul Sonwalkar, San Francisco, CA, USA)"

> **66.** BMC Ophthalmology 2026-03-28（PMC13151164）：
> "The study analyzed 90 OCT images, evenly divided among dry AMD, wet AMD, and normal control groups, using the **GPT-4V model via the Julius AI platform**."
> → 64–66 说明：**用户不等我们准备好就已经在用了**，只是要自己手工把结果翻成方法学句子。

### 8.13 期刊政策 verbatim（3 条）

> **67.** ICMJE, Section II.A.4（icmje.org，页脚 ©2026，**版本时间未核实**）：
> "**If AI was used for data collection, analysis, or figure generation, authors should describe this use in the methods.**"
> → **分析用 AI → 写进 Methods，不是致谢。**

> **68.** Elsevier 生成式 AI 期刊政策（政策更新标注 **2026-06**）：
> "**This policy does not prevent the use of AI tools in formal research design or research methods.**"
> → **最明确的「分析可以用 AI」官方背书。**

> **69.** Elsevier 生成式 AI 期刊政策（红线）：
> "**These tools must never be used as a substitute for human critical thinking, expertise and evaluation**"
> → 中文 SEO 页在打的「替代 SPSS」「一句话出分析」口号，**把产品放在必然被证伪的位置**。

### 8.14 学术文献结论 verbatim（8 条）

> **70.** *Cureus* 2025-04-10, Strale et al., PMC12065437（作者结论原文 + 全文原句）：
> "ChatGPT-4 accurately executed fundamental statistical tests, closely matching SPSS. However, **its reliability diminished in more advanced statistical procedures**."
> "**No sphericity corrections were provided, meaning it assumed sphericity was met.**"

> **71.** *JCO CCI* 2025-12, PMID 41418093（摘要原文）：
> "The multiagent framework successfully replicated **53.3%** (95% CI, 40.7 to 66.0) of primary outcomes, significantly outperforming ChatGPT 4o (**35.0%** [95% CI, 22.9 to 47.1]; **P = .04**)."
> "**Hallucinations of variables or results were not observed in the multiagent approach.**"

> **72.** *J Korean Med Sci* 2025-12-22, PMID 41430754：
> "AI has moderate accuracy overall but performs better in controlled settings."
> "editors must make final decisions" / "humans must make the final decision"
> "**The Statcheck and GRIM-Test are especially good at spotting statistical errors**"
> → **确定性规则工具反而比 LLM 稳。**

> **73.** *JAMA Ophthalmology* 2023-11-09, Taloni et al., PMC10636646：
> 研究者要求 AI "**fabricate data that would result in a statistically significant difference**"；论文自陈**唯一破绽**是 "data ranges of continuous variables were not always accurate"

> **74.** *Cureus* 2025-10-19, PMC12627256 限制段（**读「六模型选检验 100% 正确」这个结论前必须先读这三句**）：
> "the testing was conducted on a **single day (August 21, 2025)**"
> "this study was limited to **free versions** of these LLMs"
> "**basic biomedical research rather than advanced-level biostatistics**"

> **75.** Ordak 2023, *Healthcare (Basel)* 11(18):2554：
> "At a time when there is a lower level of statistical analysis being conducted, we should have **limited confidence** in the advice provided by ChatGPT related to conducting statistical analyses."

> **76.** Bertran / Fogliato / Wu, *Many AI Analysts, One Dataset*, arXiv:2602.18710v2，2026-02-21：
> "**when defensible analyses are cheap to generate, evidence becomes abundant and vulnerable to selective reporting**"

> **77.** Ambig-DS, arXiv:2605.09698v1，2026-05-10：
> "**quietly commit to plausible but unintended task framings, producing clean, executable artifacts that hide their incorrect assessment of the task**"

### 8.15 竞品官方口径 verbatim（14 条）

> **78.** SPSSAU 官网（一手）：
> 「约500类分析方法，一应俱全」
> 「左右拖拽分析项，点击'开始分析'即生成分析结果」
> 「**有图，有表，有文字**」
> 「**规范化表格，可视化图形，智能化分析**」

> **79.** infinisynapse.com，2026-06-28（⚠️ **厂商内容营销站，有立场**）：
> "**the sandbox runs out of memory on the load step, not the analysis step.**"
> "The hard wall is the **verification gap**, not the file size."

> **80.** claude.com/blog/analysis-tool 官方注记（2025-11-05）：
> "The analysis tool is **being replaced by more powerful code execution capabilities**."

> **81.** Claude Science 官方页（**全场唯一带审查者角色的设计**）：
> background reviewer "flags **incorrect citations, untraceable numbers, and figures that don't match their underlying code**"
> "**flags any claim it can't trace to evidence** before results surface"

> **82.** Jupyter AI v3.1.0 官方文档：
> "**Guardrails By Default** — Agents request permission before writing files, running commands, or using MCP tools."

> **83.** Manus 定价（**经更正，去掉了查无出处的引号引文**）：
> Manus **doesn't tell you how many credits a task will cost before you hit go**

> **84.** Vizly 官网（Wayback 2026-07-20 回源）：
> Basic **$19.99** "Up to 200 messages per month"、Premium **$29.99** "Unlimited messages"、"**Student or educator? Email us for a 25% discount**"

> **85.** Julius 官方定价页（Wayback 2026-08-03 回源）：
> Plus 及以上每档列 "**Export slides, HTML artifacts, charts, and images**"，Free 档 "Access to Notebooks"

> **86.** manus.im 官网（Wayback 2026-07-01）：
> 顶部横幅 "**Manus is now part of Meta** — bringing AI to businesses worldwide"，页脚 "© 2026 Meta"

> **87.** graphpad.com/how-to-buy/，官网对**永久授权**的表述：
> "**We do not recommend this option**"

> **88.** app.uedufy.com/tools/stats-interpreter/，2026-08-04 直取 —— 🔴 **本品类的入场券**：
> "**7-day Zero Hallucinations refund**" / "**if any number is hallucinated or any reference is fabricated**"

> **89.** chatspss.cn 首页（成都自然智科技，蜀ICP备2025134262号）—— 🔴 **推翻「中国竞品都是表单驱动」的那一句**：
> 「**像聊天一样完成统计分析：上传CSV/Excel/SPSS(.sav)/Stata(.dta)数据或直接描述研究问题，自动生成三线表与专业解读**」

> **90.** sas.com/en_us/software/viya/copilot.html：
> "SAS Viya Copilot is a native feature included at **no extra cost** in SAS Viya 4, SAS Viya for Learners, SAS Visual Analytics and SAS Visual Statistics"

> **91.** jmp.com/en/academic（核查更正 R-2，**推翻第三方聚合站的 $29.95 / $1,250 说法**）：
> "**JMP Student Edition, a full-featured version of JMP Pro, is free** to all students, educators, and academic researchers at degree-granting institutions"

---

## 九 · 本章的证据强度与存疑

### 9.1 证据强度分级：哪些能拿去汇报，哪些不能

| 档 | 内容 | 判据 |
|---|---|---|
| **A · 最扎实（可直接对外）** | Claude code execution tool 的沙箱规格（platform.claude.com 官方文档，逐项吻合，**全篇最扎实一条**）· Julius / Vizly 定价（Wayback 一手回源）· SPSSAU 全档价目与免费限制（addmoney.html + helps 直读）· EBOSS / 新菊 / zuoyedaixie 价目与条款（直读 verbatim）· 六个 OpenAlex 被引数（逐条复核，期刊与年份无一偏差）· JASP 官网卖点 · ICMJE / Elsevier / Springer Nature 政策原文 · 四篇同行评议实证（Cureus 2025-04-10 / JCO CCI 2025-12 / JAMA Ophthalmol 2023 / JKMS 2025-12-22） | 一手直读或官方文档，且经对抗性核查 CONFIRMED |
| **B · 可用但须带限定** | 全部 arXiv benchmark 数字（**arXiv ID、日期、作者全部真实且对得上，零编造来源**；但 StatQA 人类基线 n=6、StatABench 归因 n=38 子集、DS-STAR 底座同时换模型，三处必须随数字一起说）· Reddit 原声（pullpush 二手，部分 created_utc 归档批次异常）· SPSS/Prism/Stata 国际定价（第三方快照，置信度中） | 数字真实但**口径必须一起搬** |
| **C · 只能作为「某方主张」** | 全部厂商自述用户量（SPSSAU 500 万 / SPSSPRO 100 万 / 微生信 20w+ / mstata 1200+ SCI / EmpowerStats 2600+ SCI）· 五家内容营销站对竞品短板的描述（mcpanalytics.ai / coefficient.io / infinisynapse.com / eesel.ai / No Code MBA）· 台湾两家代做机构的自述资历 | 有立场，且无独立核实 |
| **D · 不可引用（已判 REFUTED / UNVERIFIABLE）** | Julius「250 条/月」「学生 5 折 $18.5」「同问两次结果不同」「30–50 行编数据」「p 值不正确」· Claude Science 资助计划「50 项 / $30,000 / 07-15」· JMP $29.95 / $1,250 · MedCalc「无订阅」· ¥1999/年 · Excel「2026-04 起」· 淘宝「1000+ 商品」· 论文辅导「按导师学历分层」· SPSSAU「接 DeepSeek V3」· 「维权时反向威胁举报你代写」· Gemini Flash 3「多步 0%」当不可复现例 | 见 §七·G11 / G16 / G17 / G21 |

### 9.2 四份材料各自的未覆盖 / 未核实（引用时必须一并转述）

#### B1（AI 原生竞品）
1. Reddit / 知乎 / CrossValidated / 小木虫 / 丁香园 / 经管之家**全部未能直取** → 用户原声严重偏向 Hacker News（技术人群），**缺中国医学/教育学/管理学硕博的一手声音**
2. SPSSAU / SPSSPRO 价格、「代跑统计」真实报价 —— B1 内**均未核实**（B2/B3 已部分补上，见 §九·D1/D2）
3. **Genspark 数据分析形态未核实**（官网 403），B1 未做任何判断
4. Kimi / 豆包 / DeepSeek / 通义 的代码解释器能力边界（文件上限、是否预装 statsmodels、图表导出格式）**未逐一实测**
5. **没有找到「AI 生成的统计结果导致论文撤稿」的公开案例** —— 🔴 **不要在对外材料里编造它**
6. 期刊对「使用 AI 做数据分析」的披露政策（ICMJE / COPE / 各刊条款）在 B1 内**未系统调研**（B4 §4.6 已补）

#### B2（传统统计软件）
1. IBM 官网原始定价未取到（403）；**SPSS 中国区人民币年费未取到**
2. **盗版率无可信数字**（不给百分比）
3. **SPSSPRO / ChatSPSS 定价未查到** —— 两家是最直接的中国竞品，🔴 **建议实际注册试用一次**（也是解除 §九·D7 的前提）
4. jamovi Cloud 定价两源打架（$5/月 vs $9.90/月），jamovi.org 403，**置信度低**
5. Origin 中国标价未查到（$1,088/年来自折扣聚合站，置信度低）；OriginLab 对中国/印度/越南学生提供 OriginPro Learning Edition 免费 6 个月（DDG 快照）
6. XLSTAT 官网定价页 404，$295–$1,495 来自 TrustRadius，置信度中
7. Prism 分析向导交互细节未逐字核实（官方 guide 页 404）
8. Reddit 原声全部经 pullpush.io 二手抓取；**部分 created_utc 存在归档批次异常**
9. 知乎/丁香园/小木虫/经管之家原帖正文均未取到（403 或人机验证）；中文原声主要来自 CSDN 与厂商营销页，**其中若干「学生痛点」句是厂商代拟口径**
10. 「中国医学期刊审稿人会因未做多重比较校正 / 有序资料用普通卡方而打回」——dxy.cn 帖直取被人机验证拦截，**内容未逐字核实，置信度中**
11. **未调研** AMOS / Mplus / LISREL / lavaan（SEM 是社科论文重灾区，Uedufy 明确支持 AMOS PDF）；**未调研** R Markdown / Quarto / apaTables / gtsummary / flextable 这条「用代码直出 APA 表」的路线——🔴 **后者直接决定我们后端实现难度，建议技术侧单独摸一次**

#### B3（中文在线工具与代做）
1. **英文用户原声全部缺失**（Reddit / CrossValidated / Stack Exchange 均被禁抓）—— **B3 的最大缺口**
2. **大陆电商一手 RMB 分项报价一条未抓到**（台币价目不能直接换算类比）
3. SPSSPRO 现行会员价未核实
4. SPSSAU「智能文字分析」是否纯模板未证实（帮助页 404，**未拿到示例段落原文**）
5. SPSSAU 免费版限制口径冲突（100 行 vs 50 样本，见 §九·D3）
6. **全部用户量数字均为厂商自述**，唯一独立可信的规模证据是 **OpenAlex 被引数**
7. 「图图统计」「简数」「无限统计」三个点名产品**均未定位到**（cloudtutu.com 疑似「图图」但页面无内容；「简数」只命中无关公司；「无限统计」零命中）→ **建议确认名字来源是否准确**
8. 医咖会 / EmpowerStats / 海豚统计 / 风暴统计 / 梦特云 / Chiplot 价格未核实
9. **无任何平台的日活、付费转化率、留存数据**

#### B4（LLM 实证水位）
1. **Reddit 与 CrossValidated 完全未取到**（403，r.jina.ai 代理也被拒）—— 最大取样缺口
2. **中文原声质量偏低**：小红书、知乎正文、丁香园、小木虫、经管之家均未直取；唯一可用的中文 verbatim 场景是**技术参数而非统计量**
3. Cureus 2026-06-29 模型清单不自洽（标题写六模型，结果里出现第七个 Microsoft Copilot），正文 PDF 未取到，**逐模型数字置信度 medium**
4. Yanai & Lercher 2020「大猩猩实验」的确切人数与比例未取到（Springer/BMC 走 IdP 重定向）；本章只用了 LLM 版复现
5. **未找到直接测量「LLM 是否主动做多重比较校正」的专项 benchmark**，F12 数字全部间接
6. JAMA 对研究类稿件中 AI 做数据分析的具体条款未找到；PNAS 政策失效研究正文 403；JCTS 八原则 404
7. StatEval 与 VDSAgents 的逐模型/逐 baseline 数字未取到（只有摘要级结论）
8. StatABench 的模型版本号（GPT-5.1 / Claude 4.5）系论文原文标注，**未与厂商发布记录交叉核对**
9. **F9（谄媚）在数据分析场景下的专项测量缺失** —— 三条谄媚证据都来自通用/科学问答场景，**没有一条是「用户带着假设来做数据分析」的实测**。这是文献真实空白，对该风险量级的判断**只是外推**
10. **孤例风险**：arXiv:2602.14349（不可复现）与 arXiv:2602.18710（多分析者）都是 2026 年初的**单篇预印本、未见独立复现**。若被推翻，§4.5 优先级 6 需下调
11. **付费行为数据未取得**。唯一间接信号：同赛道 Definite.app 卖「结果可回溯到 SQL」、DAAF 卖「可复现 + 可审计 + 专家验证」——**两者卖的都不是「分析能力」，是「可验证性」**
12. B4 核查总体结论：**25 条引用的 arXiv ID、日期、作者全部真实且对得上，零编造来源**；20 条断言 15 CONFIRMED / 5 REFUTED，**5 条 REFUTED 全部是转录/归属/分母层面的精度错误而非幻觉**

### 9.3 材料间分歧登记（14 条）

> 🔴 **本表是本章的核心交付之一。四份材料对同一玩家/同一事实说法冲突处，一律并列两说，不抹平。**

| # | 分歧点 | 说法 A | 说法 B | 处置 |
|---|---|---|---|---|
| **D1** | **SPSSAU 定价是否可核实** | **B1**：「价格未核实（/vip.html 404）」 | **B2 / B3**：从 `spssau.com/addmoney.html` **一手直读**到 ¥9.8/24h · ¥69.8/周 · ¥258/月 · ¥2588/年 | ✅ **采 B2/B3**。B1 抓的是另一个已失效 URL——这正是 §七·G2「官网 403 不等于无法核实」的现成案例 |
| **D2** | **SPSSPRO 定价** | **B2**：官网标「免费使用」，有会员入口，**具体价格未查到** | **B3**：`/price/` 是未渲染 SPA；百度知道称「19.9 元/月」（**二手**）；且与 2023 公告「**会员权益不设购买通道**」冲突 | ⚪ **两说并存，均未核实**。🔴 立项前实测项 |
| **D3** | **SPSSAU 免费版限制口径** | 官方帮助页（一手）：「免费版会限制分析**前 100 行**数据」 | 百度知道（直读）：「限制 **50 个分析样本量**」「**100 份以上问卷**不可免费使用」 | ⚪ **B3 明确未核实以哪个为准**。引用时给区间「50–100 行/份量级」 |
| **D4** | **SPSSAU 学术渗透规模** | 厂商侧搜狐文自称被 **12,384+** 同行评议文献引用 | OpenAlex 全文检索命中 **1,145 篇** | ✅ **采 OpenAlex**。约 **10 倍口径差**，本身即「厂商自述不可直接采信」的现成例证 |
| **D5** | **SPSSAU 的 AI 由谁承载** | 二手转述：接入 **DeepSeek V3** 做 AI 客服 | 官网一手：AI 入口实为 `spssau.com/aliyun_bailian_demo.html`（**阿里云百炼**承载），**全站无 DeepSeek 字样** | ✅ **采官网**，DeepSeek 归因判 UNVERIFIABLE。且二手源描述其功能含「自动解读统计结果」「诊断错误并提供修正建议」，**不能说它「只做客服问答」** |
| **D6** | **Manus 定价档位** | No Code MBA（2026-06-26）：$0 / **$20**(4,000) / **$40**(8,000) / **$200**(40,000) | eesel.ai 同期：**$19**(1,900) / **$39**(3,900) / **$199**(19,900) | ⚪ **两家二手源互相矛盾**，`manus.im/pricing` 纯客户端渲染**官方无法回源**。且 **Manus 已被 Meta 收购**，两者都只是**收购前的历史定价** |
| **D7** | 🔴 **「中国竞品是表单驱动、用户仍须自己选检验」是否成立** | **B3 §3.6-Q4①**：把「**表单没法表达一段清洗逻辑**，这是它们的产品骨架装不下的」当作差异化支点 | **B2 核查 R-4**：该推断被产品页**直接证伪**——ChatSPSS 首句即「或直接描述研究问题」，SPSSPRO 宣称「AI 自动识别数据结构，**推荐最佳算法**」 | ⚠️ **两说层次不同**（B3 讲**清洗逻辑**，B2 讲**方法选择入口**），不完全互斥；但 **B3 的支点在实测 ChatSPSS / SPSSPRO 之前不成立**。产品形态 §7.2-8 已按 B2 采纳，**本章从之** |
| **D8** | **LLM 选统计检验的正确率** | **B1** 引 *Cureus* 2025-10-19（20 场景 / 5 位生物统计专家评分）：六模型 **100% 正确** | **B4** 引 *Cureus* 2026-06-29（40 场景）：Grok 与 Copilot **34/40**、Gemini **32/40**、ChatGPT **30/40**（≈75–85%） | ⚠️ **同刊两篇不同研究，差 15–25 个百分点**。前者只测 free 版、只测一天（2025-08-21）、场景为 basic biomedical；后者**模型清单不自洽、置信度 medium**。🔴 **两者都不能当硬结论**，只能说「给定完整场景描述时模型选得**相当好**」 |
| **D9** | **「产物形态是空位」的边界** | **B1 更正后**：「**没有任何一家 AI 原生产品**提供中文三线表 / APA 制式表 / LaTeX 表格源码」 | **B2**：Uedufy（$0.75 单次，输出 **APA 7 表** + 叙述段）与 JASP/jamovi（免费，**APA 表直粘 Word**）都是反例 | ⚠️ **需再收窄一档**：若不把 Uedufy 归为「AI 原生」，B1 的全称命题勉强成立；一旦按「AI 工具」口径就只剩两格。🔴 **对外只用最窄版：中文三线表 / 中文期刊口径 / LaTeX 表格源码** |
| **D10** | **人力代做市场的可核实度** | **B1**：台湾丘老師統計、StudyGate 均**未能独立核实，具体报价未核实**，"自称"二字不可去 | **B3**：拿到 **EBOSS / 新菊 / zuoyedaixie 三家一手直读价目表** | ✅ **不同玩家，不互斥**。以 B3 的一手价目为准，但**币种（应为新台币）与市场（台湾）限定不能丢**；**大陆侧 RMB 一手报价仍为零** |
| **D11** | **WPS 的 500 行是什么限制** | 原报告：超 500 行「**效果下降**」（质量） | 官方口径：表格超过 **500 行或 20 列**时「**响应明显变慢**」（速度） | ✅ **采官方**：说的是**速度**不是**质量** |
| **D12** | **该不该建「方法选择规则引擎」** | **B4 原结论**：StatQA 显示 LLM 强于目标用户 → **绝不能**用规则引擎替模型选 | **B4 核查**：人类基线**仅 n=6**（3 统计 + 3 非统计 STEM 研究生，mini-StatQA 117 题）→ **降级为倾向性判断** | ⚠️ 与 **B1** 的「差的是把研究设计问出来」可调和：**规则引擎只做前提检验与事后硬拦、不做选择**，是三份材料都支持的稳妥缺省。**强度必须降到倾向性判断** |
| **D13** | **学生折扣是不是行业标配** | 二手源：Julius「学生教师 5 折 ≈$18.5/月」 | 官方定价页：**无任何学生折扣字样**（$18.5 恰为年付 $37 的一半，系二手源自行折算）；Vizly **25%** 经官方回源确证 | ✅ **「25%–50% 是标配」不成立**。可确证的只有 Vizly 一家 25%，以及 **JMP Student Edition / SAS 学术线完全免费**这条更极端的路径 |
| **D14** | **DSBench 34.12% 的口径** | **B1**：明确 34.12% 是那 **466 道数据分析题**；74 道建模题**另以 RPG 34.74%** 衡量 | **B4** 表格：只写「466 分析 + 74 建模 / 最佳 agent 34.12%」，**未拆口径** | ✅ **按 B1 的拆分口径引用**。两者不矛盾，B4 是省略 |

### 9.4 引用本章时的三条纪律

1. **数字必须带口径一起搬。** 本章 B 档证据全部是「数字真实但口径决定含义」——StatQA 的 n=6、StatABench 的 n=38 子集、DS-STAR 的换底座、statcheck 的 16,695 分母、InfiAgent 的封闭式题型、DSBench 的 466/74 拆分，**任何一处漏掉限定，结论就会变形**。
2. **「某产品做不到 X」先查来源是不是竞品。** 五家内容营销站（mcpanalytics.ai / coefficient.io / infinisynapse.com / eesel.ai / No Code MBA）文末都在卖自家产品，凡唯一来源是它们的短板断言一律降级为「竞品主张」。
3. **全称命题必须加抽样限定。** 「所有 L1/L2 平台」「没有任何工具」这类表述无法穷举证实，对外一律写成「**就本次抽样的 N 个平台而言**」。

---

## 附 · 本章一句话备忘

> **同行的做法已经把这件事切成两半：前半段（算）被打到接近免费，后半段（负责）仍能收几百到几万。**
> **九层供给里，「方法学守门」这一格只有活人在做；「中文期刊交付物」这一格只有中文 L5/L6 在做；而这两格从来没有被同一个玩家同时做过。**
