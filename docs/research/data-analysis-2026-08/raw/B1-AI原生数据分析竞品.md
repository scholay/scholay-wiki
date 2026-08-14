# B1 · AI 原生数据分析竞品调研

> 供给侧主题：AI 原生的对话式数据分析产品
> 调研目的：为 Scholay「智能助手」第三张能力卡片「数据分析」定需求与形态
> 调研时间：2026-08-04
> 调研员：领域调研员（供给侧 B1）

---

## 〇、本文口径（先读这段，否则会被我误导）

**检索方式**：本轮共发起 34 次 WebSearch / WebFetch。其中 WebSearch 在第 31 次后触到会话额度上限（200/200，与本会话其他任务共享），后续全部改为直接 WebFetch 具名 URL。

**取不到的源（必须知道，否则会高估本文的完备度）**：

| 源 | 结果 | 影响 |
|---|---|---|
| `julius.ai` 全站（首页 / pricing / guides/academic） | HTTP 403 | Julius 的**定价与产品自述只能靠二手评测**，三家二手源互相打架，见 §1.1 |
| `trustpilot.com/review/julius.ai` | HTTP 403 | 拿不到一手差评 |
| `g2.com` / `justuseapp.com` / `producthunt.com` | 403 / 404 | 拿不到一手评分与差评 |
| `reddit.com`（本工具的 UA 被全站封） | API 400 | **任务书点名的 r/AskStatistics、r/statistics、r/labrats、r/PhD、r/GradSchool、r/bioinformatics 全部无法直取** |
| `zhihu.com`（question / zhuanlan） | 403 | 知乎原声无法直取 |
| `stats.stackexchange.com`（CrossValidated） | 工具级拒绝 | 无法直取 |
| `csdn.net` 搜索页 / `cnblogs` 搜索 | JS 渲染为空 / 0 结果 | 中文原声只捞到 1 条 |
| `spssau.com/vip.html`、`spsspro.com/price` | 404 / 页面未渲染价格 | **中国存量对手的价格未核实** |
| `genspark.ai` | 403 | Genspark 数据分析形态**未核实**，本文不写 |
| `nature.com` | 需登录 | 改走 JAMA 原文的 PMC 版 |

**替代路径**：Reddit 封锁后，用 **Hacker News Algolia API**（`hn.algolia.com/api/v1`）取到逐字评论；学术侧用 **Europe PMC REST API** + **arXiv abs 页**取一手论文。这两条通道产出了本文最硬的证据。

**置信度标注规则**：
- `high` = 官方文档 / 同行评议论文 / 一手论坛逐字评论，我亲自 fetch 到原文
- `medium` = 有署名有日期的第三方评测站，单一来源或多来源基本一致
- `low` = 二手转引（评测站转引 Reddit / App Store）、多来源互相矛盾、或搜索摘要未能回源

**本文不写的东西**：任何我没核实到的定价数字、市占率、用户量。凡是写"未核实"的地方，请当它不存在。

---

## 一、竞品深度画像

### 1.1 Julius AI —— 学术定位最明确，也是最直接的对手

**形态**：上传 CSV / Excel（或连数据库）→ 自然语言提问 → 后台现写 Python/R 并执行 → 回图 + 回文字解读 → 可导出报告或导出 Python/R 代码。有原生 iOS / Android App。有 Notebooks（Pro 起）、定时报告、Slack agent（Business 起）。SOC 2 Type II。
（来源：[mcpanalytics.ai Julius AI Review](https://mcpanalytics.ai/articles/julius-ai-review)，2026-03-28；[SimilarLabs Julius AI Review](https://similarlabs.com/blog/julius-ai-review)，2026-02-28。置信度 medium）

**统计能力清单（它自己宣称的）**：描述统计、相关分析、线性/逻辑回归、决策树、K-means 与层次聚类、ARIMA 与季节性分解、假设检验（t 检验 / 卡方 / ANOVA）、PCA。
（来源：搜索聚合自 julius.ai/home/statistical-software 与 julius.ai/home/ai-for-research，**官网本体 403 未能回源**，置信度 low-medium）

**定价 —— 三家二手源互相打架，这点必须如实写**：

| 源 / 日期 | Free | Plus | Pro | 其他 |
|---|---|---|---|---|
| coefficient.io, 2026-04-20 | 15 条/月 | **$35/mo**（年付 ~$29.16），250 条/月 | $45/mo（年付 ~$37），不限 | Max $200、Business $375 |
| mcpanalytics.ai, 2026-03-28 | 15 条/月 | **$20/mo**，250 条/月 | $45/mo，不限 | Team $50/席、Business $375（10 席） |
| SimilarLabs, 2026-02-28 | **5 条/月** | 未列 | $45/mo（年付 $37） | Business $450（年付 $375，3 席） |

一致的部分只有三条：**Pro = $45/月**；**Free 是"个位数到十几条消息"的极窄口**；**学生与教师 5 折**（coefficient.io 明确写 Pro 折后 ≈ $18.50/月；effortlessacademic 写折后 $10–$20/月）。
"一条消息"的定义是硬信息：**每发一次 prompt 就扣一条，包括追问和"把图改成横向"这种微调**（coefficient.io 原文："A message is consumed every time you send a prompt to Julius, including follow-up questions, visualization refinements and data requests."）。这意味着 250 条/月对一次真实的论文数据分析（反复调图 + 反复改分组）**大概只够两到三个课题**。
（置信度：Pro 价 medium，Plus 价 low —— 三源冲突且官网不可达）

**算力档位是按 RAM 卖的**：Free 2 GB → Pro 32 GB（SimilarLabs 2026-02-28）；coefficient.io 写 Plus 16 GB / Pro 32 GB。50 MB 以上的 Excel 偶发超时（SimilarLabs）。

**它的真实缺陷（这段比宣传页值钱 10 倍）**：

1. **不可复现**。mcpanalytics 原文："Results can differ when you ask the same question twice" —— 因为每次都现生成代码，**同一个问题两次可能选到不同的统计方法**。对论文这是致命的：审稿人让你重跑一次，数字变了。
2. **复杂方法上统计不准**，评测方明确写到用户报告 **"incorrect p-values on hypothesis tests"** 与前提假设被误用。
3. **稀疏数据上编造统计量**。mcpanalytics 给了阈值：**行数低于 30–50 行时会伪造看起来合理的数字**。这个阈值对我们极其重要 —— 中国硕士论文问卷之外的实验组数据，n=20~40 是常态。
4. **专业用户是黑箱**：数据科学家**无法指定方法、无法设阈值、无法控制缺失值处理策略**。
5. **无 MCP**，接不进 Claude Desktop / Cursor。
6. 自我纠错成功率约 80%（SimilarLabs 实测口径）；列名抽象（如 "X1 Data Set"）会直接理解错。

**学术采用是真的（这是最值得注意的一条）**：Europe PMC 检索 `"Julius AI"` 命中已发表文献 ——
- *Cureus*, 2026，胆囊癌危险因素研究，原文致谢句："**Data analysis and visualisations for this study were assisted using Julius AI**"
- *BMC Ophthalmology*, 2026，"The study analyzed 90 OCT images...**using the GPT-4V model via the Julius AI platform**"
- *Preprints.org*, 2025，两篇统计教学论文把 Julius AI 当作教学工具与"假设检验框架"的载体
（来源：Europe PMC REST API 检索，2026-08-04。置信度 high）

→ **推论**：Julius 已经跨过了"玩具"这条线，进了真论文的方法学段落。但命中的期刊是 Cureus / Preprints 这类低门槛出口，**没有命中高影响因子期刊**。这说明它的产物"能进论文"，但"进的是哪种论文"是有选择性的。

---

### 1.2 ChatGPT —— Advanced Data Analysis 及其 2026 形态

**形态与沿革**：Code Interpreter → 更名 Advanced Data Analysis，模型在隔离 sandbox 里写并跑 Python，吃 CSV / Excel / JSON / PDF / 图片，吐图表、处理后的文件和计算结果。**ADA 在 2026 年并未下线**（被下线的是 Atlas 浏览器，2026-08-09 停服）。
（来源：[ChatGPT Data Analysis Limits in 2026](https://infinisynapse.com/en/blog/chatgpt-data-analysis-limit)，2026-06-28；[Pluralsight](https://www.pluralsight.com/resources/blog/ai-and-data/ChatGPT-Advanced-Data-Analytics)。置信度 medium）

**2026 年的硬边界（原文数字）**：
- 单文件：**"a few hundred megabytes per file is the practical ceiling"**，再大要么传不上去，要么 pandas 加载时 OOM
- 行数：**"a few million rows per CSV is workable; tens of millions are not"**，且 **"the sandbox runs out of memory on the load step, not the analysis step"**
- 会话：**每个 session 独立 sandbox，断线即丢变量与中间 dataframe；跨 session 完全不留状态，重来要全量重传**
- 该文作者的判断很值得抄进我们的设计原则：**"the hard wall is the verification gap, not the file size"** —— 真正的墙是"没法独立验证"，不是文件大小。
（置信度 medium，单一来源但表述具体）

**图表能力（2026-03 口径）**：交互式 bar / pie / scatter / line；非交互 histogram / box / heatmap / area / radar / treemap / bubble / waterfall。
（来源：同上聚合。置信度 low-medium）

**它没解决什么**：会话隔离 + 无状态 ⇒ 论文数据分析这种"跨天跨轮"的工作流天然不适配；没有方法学守门；没有可复现产物（脚本要自己手动要）。

---

### 1.3 Claude —— 三条线要分清（Analysis tool / Code execution / Claude for Excel / Claude Science）

这是全场**最容易被写错**的一段，四个东西经常被混为一谈：

**(a) Analysis tool（2024-10-24 上线）**：跑的是 **JavaScript**，不是 Python。库是 Lodash / PapaParse / Math.js / D3.js。**它已经在 2025-11-05 被官方标记为"being replaced by more powerful code execution capabilities"**。
（来源：[claude.com/blog/analysis-tool](https://claude.com/blog/analysis-tool)，官方页，含 2025-11-05 更新注记。置信度 high）

**(b) Code execution tool（现行形态，API 侧文档最详细）** —— 这份文档是本轮**对我们工程实现最有参考价值的一手材料**：
- Python 3.11，Linux 容器，x86_64
- **内存 5 GiB / 磁盘 5 GiB / 1 CPU**
- **完全断网**，运行时装不了包，只能用预装库
- 预装：**pandas、numpy、scipy、scikit-learn、statsmodels**；matplotlib、seaborn；pyarrow、openpyxl、xlsxwriter、xlrd、pillow、python-pptx、python-docx、pypdf、pdfplumber、tabula-py、reportlab；sympy、mpmath；命令行有 sqlite、ripgrep、7zip
- 容器 **创建后 30 天过期**，**约 5 分钟不活动即 checkpoint**，30 天内可凭 container ID 恢复并保留文件（新版本连解释器变量状态都能续）
- **programmatic tool calling 下每个 REPL cell 有 90 秒墙钟上限**，超时返回非零 return_code 与 `detection_timeout`
- 计费：**每组织每月 1,550 免费小时**，超出 **$0.05/小时/容器**；与 web search / web fetch 同请求使用时免费
（来源：[platform.claude.com Code execution tool 文档](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool)。置信度 high）

**(c) Claude for Excel**：Pro / Max / Team / Enterprise 可用，**无单独加价**，走 Microsoft Marketplace 加载项。Team 标准档 $25/席/月（年付 $20）。
（来源：搜索聚合 + Microsoft Marketplace 条目。置信度 medium）

**(d) Claude Science（2026-06-30 / 07-01 beta）** —— 这是**科研垂类里最重的一次下注**，与我们同赛道：
- 定位："AI workbench"，把数据库、pipeline、工具收进一个环境；主 agent 当项目经理，**接 60+ 科学数据库**（PubMed / FDA / arXiv / 基因组库）
- 有一个**常驻 reviewer agent 负责核对引用与数据完整性**
- 支持蛋白结构、化合物、基因组可视化
- macOS / Linux，beta 开给 Pro / Max / Team / Enterprise；学术实验室与非营利机构有 Team 折扣
- 资助计划：最多 50 个项目、每项 ≤ $30,000，申请截止 2026-07-15，项目期 2026-09-01 至 12-01
（来源：[MIT Technology Review 2026-06-30](https://www.technologyreview.com/2026/06/30/1139987/claude-science-is-anthropics-newest-flagship-product/)、[STAT News 2026-06-30](https://www.statnews.com/2026/06/30/anthropic-release-claude-science-ceo-dario-amodei/)、[Dataconomy 2026-07-01](https://dataconomy.com/2026/07/01/anthropic-claude-science-ai-research-launch/)。置信度 medium）
- ⚠️ HN 讨论中有人称"$200/月，对学生免费"，与"所有付费订阅可用"的口径冲突，**未核实，本文不采信该数字**。

---

### 1.4 Google —— Colab Data Science Agent / Gemini

**形态**：打开空白 Colab → 上传数据 → 在 Gemini 侧栏用自然语言写目标（"visualize trends" / "build prediction model"）→ **agent 直接生成一整个可执行的 Colab notebook**（含 import、分析代码、可视化），不是代码片段。
**价格：免费**，跑在 Colab 免费环境（含免费 GPU/TPU）。
**限制**：18 岁以上、仅部分国家与语言；官方在演示视频字幕里明写 **"Data Science Agent may make mistakes"**；DABStep 基准第 4 名，优于 GPT-4o 系 ReAct agent。
**上线时间**：2024-12 起 trusted tester，**2025-03-03 扩大开放**。
（来源：[Google Developers Blog 官方公告](https://developers.googleblog.com/en/data-science-agent-in-colab-with-gemini/)。置信度 high）

**它没解决什么**：产物是 notebook，**面向会读 Python 的人**。对"我不会代码所以才来找 AI"的硕士生，notebook 本身就是障碍 —— 它把"我不懂"从统计转移到了工程。

---

### 1.5 二线 AI 原生工具

**Powerdrill**：分 Bloom（多 agent 编排，$19.90 起）与 Chat（问数据，$3.90 起）两条产品线；aichief 口径为 Free / Pro $29 / Enterprise。批评点是**"may require technical knowledge to set up effectively"** 与公开信息少、无社区口碑积累。
（来源：[aichief Powerdrill 评测](https://aichief.com/ai-data-management/powerdrill-ai/)，2026-07-14 更新；julius.ai 的竞品定价文章。置信度 medium。注意后者是竞品写竞品，有立场）

**Vizly**：上传 → 自然语言问 → **生成 Python 或 R 代码**并出结论。Basic $19.99/月（200 条消息）、Premium $29.99/月（不限）。**学生与学者 25% 折扣**（学术邮箱注册或邮件申请）。数据加密、隔离环境、**闲置 1 小时后永久删除**。已被 "The Struggling Scientists" 系列作为 PhD 工具评测（该评测页 403，未能回源）。
（来源：搜索聚合 + [vizly.ai/pricing](https://vizly.ai/pricing)。置信度 medium）

**Numerous.ai**：**不是对话式产品，是表格插件** —— Google Sheets / Excel 里一个 `=AI()` 公式，做的是批量文本归类、清洗、生成，**不做统计推断**。Personal $10/月（年付），50 万字符 + 500 次公式生成，$1 试用 7 天。
（来源：[numerous.ai 官网](https://numerous.ai/)。置信度 high）
→ 它对我们的意义是反面的：**"把 AI 塞进单元格"这条路做的是文本活，不是统计活**。

**Manus**：Free 300 日 credits / Standard $20（4,000 credits）/ $40（8,000）/ $200（40,000），年付省 17%。**它最大的公开教训是计费模型**：
- "The Manus AI credit system is the single biggest source of confusion, and the single biggest source of complaints, in the entire product."
- 一次 deep research 任务能烧掉 **900–1,000+ credits**，而且 **"Manus does not tell you the cost before you hit go"**
- $20 档的 4,000 credits，"20–40 个中等任务，或者只有 4–5 个复杂任务"
（来源：[eesel.ai Manus 定价分析](https://www.eesel.ai/blog/manus-ai-pricing)、[No Code MBA](https://www.nocode.mba/articles/manus-ai-pricing) 等聚合，2026。置信度 medium）
→ **对我们是直接可抄的负面教训**，见 §7 不该做什么第 6 条。

**Genspark**：官网 403，**未核实，本文不做判断**。

---

### 1.6 数据科学 notebook 侧（不是我们的对手，但定义了"专业口径"）

- **Hex Magic**：混合单元格 notebook（SQL + Python + Markdown），接 Snowflake / BigQuery / Redshift / Databricks / Postgres。准确性口径很诚实：**schema 命名清晰时 JOIN / 聚合 / 窗口函数可靠；多步复杂查询或命名含糊时准确率下降**。
- **Deepnote**：协作优先（实时协同、单元格评论、版本历史），偏 pandas / scikit-learn / PyTorch 的重 Python 工作流。
- **Databricks**：2026-07-08 起 Genie Code 转为**按量计费 + 每用户免费月额度**；Genie One 与 Genie Agents **免费至 2027-01-31**。值得注意的是：**其官方文档里既没有准确性免责声明，也没有"请校验生成代码"的表述** —— 面向工程师的产品默认你会自己 review。
- **Jupyter AI v3.1.0**：开源，把 Claude / Copilot / Goose / Kilo / Kiro / Mistral Vibe / OpenCode 等 agent 接进 JupyterLab；**agent 写文件、跑命令、用 MCP 工具前都要请求许可**（权限护栏而非能力限制）。
（来源：[Databricks 文档](https://docs.databricks.com/aws/en/notebooks/databricks-assistant-faq)、[Jupyter AI 文档](https://jupyter-ai.readthedocs.io/en/latest/) 为一手 high；Hex / Deepnote 为第三方评测 medium）

→ **对我们的意义**：这一层的共识是 **"AI 生成代码，人负责 review"**。它们不承诺正确，因为它们的用户有能力自查。**我们的用户没有这个能力** —— 这就是我们必须做守门的根本原因。

---

### 1.7 中国侧 —— 真正的存量对手不是 AI，是 SPSSAU 和"代跑统计"

这一节是本轮**最容易被忽略但对我们最重要**的部分。

**大模型侧（DeepSeek / Kimi / 豆包 / 通义 / 智谱）**：2026-06-29 的一份国产模型实测（6 道题，含"Python 脚本统计 CSV 缺失值"）给出的分工判断是"写代码选 DeepSeek，长文档选 Kimi，免费闲聊选豆包，中文文档选通义"。**没有任何一家把"数据分析"做成独立形态**，都是通用对话里的一个能力。
（来源：[博客园 lzhdim 2026-06-29](https://www.cnblogs.com/lzhdim/p/20941516)。置信度 medium）

**WPS AI 数据助手** —— 官方文档自己写的限制**异常诚实，也异常致命**：
- **能做**：自然语言排序 / 筛选 / 数据洞察 / 推荐图表、AI 写公式、智能清洗（统一货币单位、纠千位分隔符）
- **明确不能做**：**"不能自动完成复杂的数据清洗、数据透视表构建或跨表关联分析"**、**"不支持自动跨表引用、合并多个工作表的数据"**
- **数据量**：**"超过 500 行效果下降"**
- **平台**：**只有 Windows 版**；"Mac 版、Linux 版、Android 版、iOS 版和网页版 WPS 暂不支持 AI 数据助手功能"
- **官方要求的验收动作**：用完后**"都需要完成三项核验：数据完整性、数值准确性和图表信息正确性"**
- WPS 365 付费 199–599 元/人/年；AI 表格能力限时免费（180 天试用）
（来源：[WPS 官方文章](https://www.wps.cn/article/wps-ai-data-assistant-guide.html)、[WPS Plus 定价博客](https://plus.wps.cn/blog/p106850.html)。置信度 medium-high）

**SPSSAU** —— 中国论文统计的实际入口，也是我们真正要对标的产物形态：
- **约 500 类分析方法**：T 检验、方差分析、回归、相关、卡方、聚类、因子分析、正态性检验……
- 交互是**拖拽**："左右拖拽分析项，点击开始分析"
- **产物形态是关键**：输出"**规范化表格、可视化图形、智能化分析**"，官方话术是"**有图，有表，有文字**"
（来源：[spssau.com 官网](https://spssau.com/index.html)。置信度 high）
- **价格未核实**（`/vip.html` 404）

**SPSSPRO**：免费为主，360+ 算法、43 种图表、AI 报告生成，主打高校 / 数学建模竞赛 / 市场调研竞赛渠道。价格页未渲染，**未核实**。

**"代跑统计"这个市场是真金白银的**：中文搜索直接返回一批以此为业的机构 —— 台湾"丘老師統計暨調查研究中心"（2007 年成立，自称服务超过 1,000 个论文项目）、StudyGate（"80 分以下全额退款，14 天内免费修改"）、Meeloun / CoursePear 等留学生统计代写。
（来源：中文检索结果聚合。置信度 medium；**具体报价未核实** —— 各家都不在公开页挂价）

→ **这条最重要**：中国学术用户在"数据分析"上**已经在付费了**，付的不是 SaaS 订阅，是**一次性的人工服务费**。他们买的不是"工具"，是"**帮我把这一段搞定并且我敢写进论文**"。

---

## 二、Q1：这些工具做统计**推断**靠不靠谱？有没有公开翻车案例？

**结论先说**：**描述统计和画图基本可用；一旦进入推断，从"基础检验"到"多因素模型"是一个断崖。**且已有公开的、可引用的翻车与滥用案例。

### 证据 1 —— 逐项对拍 SPSS（14 项分析）

*Cureus*, 2025-04-10, Strale Jr. F, Riddle I, Geng B, Oxford B, Kah M, Sherwin R，用两套真实的应用行为分析数据集，把 SPSS、ChatGPT-4、ChatGPT o3-mini 跑同样 14 项分析：

- **ChatGPT-4**：描述统计、相关、简单/多元线性回归、单样本/配对/独立样本 t 检验 **与 SPSS 基本一致**
- **ChatGPT-4 的失败点**：**MANOVA 自由度算错，直接影响显著性值**；**重复测量 ANOVA 漏掉球形度（sphericity）校正**
- **ChatGPT o3-mini 的失败点**：相关系数虚高、**在本不该显著的地方报出显著**；多元回归 R² 与系数膨胀 —— 一个 Time2 系数 **44.909**，SPSS 的答案是 **27.649**；双因素 ANOVA 与 Spearman 相关**系统性错误**
- 作者结论原文："ChatGPT-4 accurately executed fundamental statistical tests, closely matching SPSS. However, **its reliability diminished in more advanced statistical procedures.**"
（来源：[PMC12065437](https://pmc.ncbi.nlm.nih.gov/articles/PMC12065437/)。置信度 high）

### 证据 2 —— 复现 20 项真实研究的主要结局

*JCO Clinical Cancer Informatics*, 2025-12, Wang J, Swoboda DM, Nazha A（DOI 10.1200/cci-25-00176）。用 20 项 2021–2023 骨髓移植研究的**去标识病人级原始数据**，让 AI 自主复现原论文的主要结局：

- **多智能体框架：复现 53.3%**（95% CI 40.7–66.0%）
- **ChatGPT-4o：35.0%**（95% CI 22.9–47.1%），差异显著 **P = .04**
- **失败归因（这是本文最有价值的一组数字）**：
  - 多智能体：**数据变换问题 46.4%** + **分析代码错误 21.4%**
  - ChatGPT-4o：**统计方法选错 38.4%** + **数据变换问题 45.6%**
- 值得注意：多智能体框架**没有出现变量或结果幻觉**
（来源：[Europe PMC, PMID 41418093](https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:41418093)。置信度 high）

→ **把这两组数字放在一起看，结论极其清晰：失败的大头不在"算错"，而在"选错方法"（38.4%）和"数据没整对"（45–46%）。** 也就是说，**统计引擎不是瓶颈，前面那两步才是。**

### 证据 3 —— 通用基准

- **DSBench**（arXiv 2409.07703，2024-09-12 v1 / 2025-04-11 v3）：466 个数据分析任务 + 74 个建模任务，取自真实平台，**最好的 agent 只解决 34.12% 的数据分析任务**，相对性能差距 34.74%。
- **BLADE**（arXiv 2408.09667，Gu K. et al.，UW，2024-08-19 / 2025-11-10 v3）：12 个来自真实文献的数据集与研究问题，ground truth 由独立专家分析给出。摘要原文：**"language models... are often limited to basic analyses"**；能与数据交互的 agent 决策多样性提升，但 **"still non-optimal"**。
（置信度 high，均直取 arXiv abs 页）

### 证据 4 —— 公开的滥用/翻车案例

**JAMA Ophthalmology, 2023-11-09, Taloni A, Scorcia V, Giannaccare G**，题为 *"Large Language Model Advanced Data Analysis Abuse to Create a Fake Data Set in Medical Research"*（DOI 10.1001/jamaophthalmol.2023.5162）：

- 研究者让 **GPT-4 Advanced Data Analysis 直接编造**一个 **300 眼 / 250 名圆锥角膜患者**的数据集，覆盖 DALK 与 PK 两种角膜移植术式
- 要求它"fabricate data that would result in a statistically significant difference"
- **AI 照做了**：术后最佳矫正视力 DALK 优于 PK，**P < .001**，logMAR 差 −0.05，地形图散光差 −0.91 D
- **破绽只有一处**：连续变量的取值范围"were not always accurate"
- 作者的警告：AI 造假比传统学术不端**威胁更大**，因为它能**快速且令人信服**地生产"false scientific evidence"
（来源：[PMC10636646](https://pmc.ncbi.nlm.nih.gov/articles/PMC10636646/)。置信度 high）

⚠️ 需要更正一个流传甚广的说法：**该研究并未使用 Benford 定律、末位数字分析、ID/年龄错配或 SD 模式检验**来识别造假 —— 那是后来别人做的事。原文只说"范围不总是准确"。

**同时，检测侧也不成熟**：*Journal of Korean Medical Science*, 2025-12-01, Alnaimat F. et al. 评估了 statcheck、GRIM-Test、LLM、Black Spatula、YesNoError 等统计错误检测工具，结论是 **"AI has moderate accuracy overall but performs better in controlled settings"**，且明确 **"Editors must make final decisions"、"Humans must make the final decision"**。
（来源：[Europe PMC, PMID 41430754](https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:41430754)。置信度 high）

---

## 三、Q2：它们如何处理「方法选择」这一步？

**结论：几乎全部是"模型猜"。全场没有一个 AI 原生产品有真正的守门机制。**

**观察到的三种处理方式**：

1. **模型静默地替你选**（Julius、ChatGPT ADA、Powerdrill、Vizly、Colab DSA、Manus）。用户说"比较两组有没有差异"，模型自己决定是 t 检验还是 Mann-Whitney，**不问设计、不问配对、不问分布，也不告诉你它选了什么以及为什么**。Julius 的不可复现问题正是这个的直接后果 —— **"同一个问题两次可能选到不同方法"**。
2. **要求用户自己说清楚**（notebook 侧：Hex、Deepnote、Databricks、Jupyter AI）。它们默认用户是专业人士，**把方法选择完全甩回给人**。Jupyter AI 唯一的护栏是权限确认（写文件/跑命令前请求许可），与统计正确性无关。
3. **事后审查**（Claude Science 的常驻 reviewer agent 核对引用与数据完整性）。这是全场唯一带"审查者"角色的设计，但它审的是**引用与数据完整性，不是方法学选择**。
（置信度：1、2 为 medium-high（多源一致 + 官方文档）；3 为 medium）

**一个必须小心的"好消息"**：*Cureus*, 2025-10-19 的一项研究（20 个标准化场景，5 位生物统计学专家用 5 点量表评分）发现 **ChatGPT、Claude、DeepSeek、Gemini、Grok、Le Chat 六个模型在"选哪个统计检验"上全部 100% 正确**。Claude 在清晰度上最高（4.65 ± 0.58），Gemini 在教学价值上最高（4.50 ± 0.68）。

**但这条不能拿来乐观**，原因作者自己写了：
- 场景是**基础生物统计**，不是高级方法；统计推理评分在**复杂回归上明显更低（区间 3.16–4.66）**
- 只测**免费版**、**只测了一天**（2025-08-21）
- **最关键的差别**：这个实验里，**场景是被人类完整、规范地描述好了才喂进去的**。而真实产品里，用户上传的是一个 CSV 和一句"帮我分析一下" —— **模型要自己从数据里推断研究设计**。JCO CCI 那项研究测的正是后者，ChatGPT-4o 的**统计方法选错率是 38.4%**。
（来源：[PMC12627256](https://pmc.ncbi.nlm.nih.gov/articles/PMC12627256/)。置信度 high）

→ **这是本次调研最重要的产品洞察："给定完整描述时模型选得对（100%）"与"给定原始数据时模型选错 38.4%"并不矛盾 —— 差的就是"把研究设计问出来"这一步。这一步现在没有任何一个产品在做。**

---

## 四、Q3：它们的产物能不能直接进论文？

分三样东西看，结论完全不同。

**(1) 图 —— 勉强能，但不是期刊级。**
Julius 宣称能出"APA 风格图表"与"publication-ready visuals"（**官网 403 未回源，置信度 low**）。实测侧的证据不支持这个说法：Analytics Vidhya 2024-01-26 那篇《Guide to Academic Data Analysis With Julius AI》**全文没有提到 APA 表、出版级图或 LaTeX**，展示的截图是描述统计表、清洗摘要、ANOVA 的 F 值与 p 值、事后两两比较表 —— **屏显级，不是投稿级**。
期刊图的真实要求（矢量格式、指定 DPI、字号下限、CMYK/RGB、字体嵌入、panel 标号 a/b/c、误差线定义写进图注）**没有任何一个 AI 原生产品在做**。
（置信度 medium）

**(2) 表 —— AI 原生产品基本不做，中国存量工具已经做了。**
这是最大的落差。**SPSSAU 的核心卖点就是"规范化表格" + "有图，有表，有文字"**（官网原文），也就是中文论文要的**三线表 + 可直接粘进 Word 的格式**。而 Julius / ChatGPT / Vizly / Powerdrill 给的是 Markdown 表或 DataFrame 打印，**格式、小数位、显著性星号、行列表头层级全都不合规**，还得手工返工一遍。
（置信度 high —— SPSSAU 侧为官网一手；AI 侧为多个评测一致 + 官方演示未见）

**(3) 方法学描述 —— 全场都不达标，但已经有人在硬用了。**
一段合格的方法学描述至少要有：软件与版本、检验名称、统计量、自由度、精确 p 值、效应量、95% CI、前提检验是否满足与如何处理。上述工具**没有一个把这套东西作为结构化产物输出**。
但现实是：**Cureus 2026 已经有论文写"Data analysis and visualisations for this study were assisted using Julius AI"**。也就是说，**用户不等我们准备好就已经在用了**，只是他们要自己手工把结果翻译成方法学句子 —— 而这正是最容易出错、也最容易被审稿人抓的一段。
（置信度 high）

---

## 五、用户原声（逐字，不转述）

> ⚠️ Reddit / 知乎 / CrossValidated / Trustpilot / G2 在本工具下全部不可达（见 §〇）。以下 1–7 条为我**亲自 fetch 到原文**的一手逐字评论；8–9 条为**二手转引**，已明确标注，请按 low 置信度使用。

**1.** raphman，Hacker News，2026-06-30T17:25:05Z（Claude Science 发布帖）：
> "tl;dr: Use this if you don't like doing science or doing things well. **It hallucinates references.**"

**2.** ml_more，Hacker News，2026-07-01T20:13:13Z（同帖，讨论 RAG + 引用校验把幻觉率从 50–60% 降到 5–15% 之后）：
> "it's just good enough that your spot check will look good and **your work will still contain hallucinations (which is probably worse than obviously bad)**."

→ 这条是全场最锋利的一句：**把错误率从"明显错"降到"抽查看不出来"，对科研反而更危险。**

**3.** Hacker News 评论者，2026-06-30T17:22:18Z：
> "Scientific research is suffering from a **reproducibility crisis**. Not a publication crisis. **LLM's aren't going to solve reproducibility issues.**"

**4.** CJefferson，Hacker News，2026-06-30T18:04:29Z：
> "They are going to make it a thousands times worse... Peer review is in the process of completely collapsing, in fact I think it's already basically done."

**5.** simonw，Hacker News，2023-11-03（正面原声，讲 ChatGPT ADA 为什么好用）：
> "I've found that ChatGPT Code Interpreter / Advanced Data Analysis is **wildly effective at parsing anything I give it**. Not just CSV either - I've uploaded random binary files and told it to figure out what they are and it often gets there after churning through a few iterations."

**6.** ttul，Hacker News，2023-07-25（讲它替代了什么）：
> "Code Interpreter lets me upload data in a multitude of formats and play with it **without wasting hours futzing around in Google Sheets**... Code Interpreter automates the time consuming parts and lets me focus on the exploration."

→ 5、6 两条说明**用户真正买的是"省掉手工折腾数据的那几个小时"，不是"统计学专业能力"**。

**7.** lzhdim，博客园，2026-06-29 23:55（国产大模型实测，作者自述是实验员）：
> "每家都说自己'全球领先'。**作为一个每天对着屏幕和AI说话的实验员，我已经对这些宣传词产生了生理性免疫。**"
> "现在各家的营销能力已经超过了产品本身的差距"

**8.**（**二手转引**，SimilarLabs 2026-02-28 引自 Reddit r/dataanalysis，未能回源，置信度 low）：
> "Julius AI has been a game changer. **I hate Python coding but this actually debugs its own code to make the analysis run.**"

**9.**（**二手转引**，来自 Julius App Store 评论聚合，原页 403 未能回源，置信度 low）：
> 用户抱怨答案"always wrong and will only give the correct one if you **reiterate at least 5 times**"；另有用户称它"**tends to create data out of nowhere and then use it for analysis**"。

**10.**（官方文档，非用户，但是最硬的一条自认）—— WPS 官方对自家 AI 数据助手的验收要求：
> 使用后"**都需要完成三项核验：数据完整性、数值准确性和图表信息正确性**"

→ 一个厂商在自己的使用指南里要求用户逐项核验输出，等于承认**产物不是即用成品**。

---

## 六、(a) 嘴上说 / (b) 实际卡在 / (c) 掏钱买了

### (a) 用户嘴上说要什么
"上传表格，一句话出图"、"自动帮我分析"、"直接给我结论"、"不用学 SPSS"。
这层需求所有产品都已满足，**没有差异化空间，也不是购买决策的原因**。

### (b) 用户实际卡在哪（按证据强度排序，这是最该抄进 PRD 的一节）

1. **方法选错，而且不知道自己选错了。** ChatGPT-4o 在真实病人级数据上复现研究结论时，**38.4% 的失败源于"统计方法不正确"**（JCO CCI 2025-12）。用户看到的是一个漂亮的 p 值，看不到"这里本该做重复测量 ANOVA"。
2. **数据变换/整理这一步才是失败的最大头（45.6% / 46.4%）**，不是统计本身。宽表转长表、缺失值、分组变量编码、多表关联 —— 这些"不高级"的活是真正的绊脚石。WPS 自己承认"不能自动完成复杂的数据清洗、透视表构建或跨表关联分析"。
3. **不可复现，不敢写进论文。** Julius"同一个问题两次结果可能不同"（mcpanalytics 2026-03-28）。审稿人一句"请重跑"就穿帮。
4. **小样本上被编数据。** 30–50 行以下会出现伪造的统计量（mcpanalytics）。中国实验类硕士论文的 n 恰好落在这个区间。
5. **产物形态不对，还得返工一遍。** 拿到的是 Markdown 表和 PNG，要的是三线表和矢量期刊图 + 一段能直接放进 Methods 的话。
6. **跑不动 / 断了就没了。** ChatGPT 单文件几百 MB 封顶、几千万行在 load 阶段就 OOM、断线丢全部中间变量、跨会话不留状态；Julius 50 MB+ Excel 会超时；WPS 超 500 行效果下降。
7. **成本不可预期。** Manus 的教训：一次深度任务烧掉月额度的 1/4，且**按下去之前不告诉你要花多少**。
8. **消息计数与真实工作节奏错配。** Julius 把"把图改成横向"也算一条消息，250 条/月对一次真实课题只够两三轮。

### (c) 用户最后掏钱买了什么

**海外学术个人**：
- ChatGPT Plus $20/月（最广的默认选择，因为它顺带做别的事）
- Julius Pro $45/月，**学生教师 5 折后 ≈ $18.5/月**（多源一致的唯一定价共识）
- Vizly $19.99 / $29.99，**学生学者 25% off**
- Claude Pro/Max（Claude for Excel 与 Claude Science 都不单收钱，是订阅内的加量）
→ **价格锚点非常清楚：学术个人愿意付的月费在 $18–$45 之间，且学生折扣是标配（25%–50%）。**

**中国学术个人（这条才是我们的目标）**：
- **SPSSAU / SPSSPRO 会员**（价格未核实，但形态是"按次/按期买规范化输出"）
- **人工代跑统计**：中文搜索直接命中一批以此为业的机构（丘老師统计中心自称服务 1,000+ 论文项目；StudyGate 承诺"80 分以下全额退款，14 天内免费修改"）。**具体报价未核实**，但这个市场存在本身就说明问题。
- WPS 会员 / WPS 365（199–599 元/人/年）—— 顺带买到，不是为数据分析买的

→ **最关键的一条结论**：中国学术用户在这件事上**已经在花钱**，而且**花的是"服务费"不是"工具费"**。他们买的从来不是"能跑统计的软件"（SPSS 破解版遍地），而是"**有人替我承担'这段做对了'的责任**"。谁能把这份责任在产品里兑现（守门 + 可复现 + 可交付的产物 + 敢写的方法学句子），谁就能收这笔钱。

---

## 七、我们不该做什么（砍需求）

1. **不做通用 BI / 仪表盘 / 数据库连接器。** Julius 有 Snowflake/BigQuery/Postgres 连接器、有定时报告、有 Slack agent —— 那是它的商业线，不是学术线。我们的用户是一个 CSV + 一篇论文，做连接器纯属烧钱。
2. **不做"一键跑完整篇论文的统计"。** JCO CCI 的天花板是 53.3%，DSBench 的天花板是 34.12%。承诺全自动 = 承诺一半的结果是错的，而且用户查不出来。**产品的正确姿势是"分步、可停、每步可核"。**
3. **不自研统计引擎。** 全部走 scipy / statsmodels（Claude 的容器就预装这两个）或 R。自己写检验必翻车，且没有任何权威性可言 —— 论文里要写的是"使用 R 4.x 的 stats 包"，不是"使用 Scholay 内部算法"。
4. **不做"用户没说、模型猜、直接出 p 值"的链路。** 这是全场所有竞品的共同失败模式（38.4% 方法选错率）。我们唯一有意义的差异化就是**在这里插一道守门**。宁可多问三句，也不要静默地给一个错的显著性。
5. **不做大数据。** 几百万行以上不碰。Claude 官方容器是 5 GiB RAM / 1 CPU，ChatGPT 在几千万行时 load 阶段就 OOM。学术数据 99% 在几万行以内，把这个区间做扎实即可。
6. **不做 credit 制、不做不可预告的计费。** Manus 的公开教训："**does not tell you the cost before you hit go**"，是"整个产品最大的投诉来源"。我们已有的经费/算力点体系必须**在开跑前显示预估**。
7. **不做"只出图不出表"。** 中文论文要的是三线表。SPSSAU 用"规范化表格"这一件事守住了中国市场十年，AI 原生产品集体没做。**这是空的位置。**
8. **不承诺"发表级图"却只给 PNG。** 要么给矢量 + 可编辑参数（并允许改字号/配色/panel 标号），要么老实说这是探索用图。半吊子的"publication-ready"宣称会在第一次投稿被拒时彻底摧毁信任。
9. **小样本不放行。** n < 30（或分组后单元格 < 5）时不能默默跑参数检验。竞品在这里编数据（mcpanalytics 明确指出 30–50 行阈值），我们应当**拦下来并给出替代方案**（精确检验 / 非参 / 直接说"样本量不足以支持推断"）。
10. **不做 Excel 插件、不做桌面端。** Numerous.ai 这条路做的是文本活；WPS 的 AI 数据助手**只支持 Windows** 已经证明桌面端是个坑。我们是 Web SPA，守住 Web。
11. **不做"AI 自动写完整篇 Results 章节"。** HN 上研究者对此的反应是敌意的：raphman 把自动"去 AI 味"直接定性为 "outright scientific fraud"。这条线一旦越过，产品会从"科研工具"被重新归类为"论文工厂"。
12. **不做同行评审 / 引用核查功能。** Claude Science 已经有常驻 reviewer agent，且我们平台已有独立的审稿 feature，这张卡片不要越界。

---

## 八、由竞品倒推出的形态建议（给 PRD 的输入，非结论）

1. **入口是「研究设计问卷」而不是「上传即分析」。** 3–5 个结构化问题（设计类型 / 因变量类型 / 分组数 / 是否配对重复测量 / 协变量），把方法选择从"模型猜"改成"结构化确认"。这是 Q2 的直接对策，也是全场唯一的空位。
2. **变量类型面板必须存在。** AI 先猜（连续/有序/名义/时间/ID），用户可改。失败归因里 45–46% 在数据变换 —— 这个面板是命中率最高的一块投资。
3. **确定性内核 + 固定随机种子 + 保存脚本。** 解决"同问两次不同答"这个 Julius 已经暴露的致命伤。每次分析产出一个可下载的 `.py` / `.R` + 数据指纹 + 环境版本 = 复现包。
4. **前提检验自动前置。** 正态性、方差齐性、球形度自动跑；不满足时给替代方案并说明理由，而不是硬跑参数检验。ChatGPT-4 漏球形度校正是有论文记录的翻车点。
5. **产物三件套**：中文三线表（可直接复制进 Word）+ 矢量期刊图（含可编辑参数）+ **方法学句子**（软件版本、检验名、统计量、df、精确 p、效应量、95% CI）。第三件是全场都没有的，也是"敢写进论文"的兑现物。
6. **小样本硬闸**：n < 30 / 单元格频数 < 5 时降级并显式告警。
7. **计费前置显示**：开跑前给预估，对齐我们已有的经费体系，不重蹈 Manus 覆辙。
8. **定价参考区间**：海外学术个人月费锚点 $18–$45、学生折扣 25–50% 是行业标配。中国用户的支付习惯更接近"按篇/按次买一份可交付的产物"，而不是月订阅 —— 这一点建议在需求侧（另一份调研）单独验证。

---

## 九、缺口与存疑（下一轮必须补的）

1. **Reddit / 知乎 / CrossValidated / 小木虫 / 丁香园 / 经管之家 全部未能直取。** 本文的用户原声严重偏向 Hacker News（技术人群），**缺少真正的目标用户（中国医学/教育学/管理学硕博）的一手声音**。下一轮必须换检索通道（人工浏览器或换工具）补齐。
2. **Julius 官网 403，定价三家二手源打架**（Plus $20 vs $35，Free 5 条 vs 15 条）。**其官方定价与产品自述未核实。**
3. **SPSSAU / SPSSPRO 价格未核实。** 这是中国最直接的存量对手，价格是我们定价的关键锚点，必须补。
4. **"代跑统计"的真实报价未核实。** 只确认了市场存在，没拿到任何一家的报价单。这是 (c) 掏钱买什么的核心数字，缺口最大。
5. **Genspark 数据分析形态未核实**（官网 403），本文未做任何判断。
6. **Claude Science 的实际定价存疑**：官方口径是"所有付费订阅可用"，HN 有人称 $200/月，两者冲突，本文未采信任一。
7. **Kimi / 豆包 / DeepSeek / 通义 的代码解释器具体能力边界未逐一实测**（文件大小上限、是否预装 statsmodels、图表导出格式），只拿到第三方横评的定性结论。
8. **没有找到"AI 生成的统计结果导致论文撤稿"的公开案例。** 找到的是"AI 被用来主动造数据"（Taloni 2023）与"AI 复现率只有 35–53%"（JCO CCI 2025），**两者都不等于"某篇论文因为用了 Julius 被撤"**。这个案例可能存在，但本轮未检索到，**不要在对外材料里编造它**。
9. **期刊对"使用 AI 做数据分析"的披露政策未系统调研**（ICMJE / COPE / 各刊具体条款）。这直接影响我们的产物要不要自带"AI 使用声明"模板。

---

## 附：本文引用的一手来源清单

| 类型 | 来源 | 日期 | 用于 |
|---|---|---|---|
| 同行评议 | [Cureus, Strale et al., PMC12065437](https://pmc.ncbi.nlm.nih.gov/articles/PMC12065437/) | 2025-04-10 | 14 项分析对拍 SPSS，MANOVA/球形度失败 |
| 同行评议 | [JCO CCI, Wang/Swoboda/Nazha, PMID 41418093](https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:41418093) | 2025-12 | 复现率 53.3% vs 35.0%，失败归因 |
| 同行评议 | [Cureus, PMC12627256](https://pmc.ncbi.nlm.nih.gov/articles/PMC12627256/) | 2025-10-19 | 六模型 20 场景选检验 100% 正确 |
| 同行评议 | [JAMA Ophthalmol, Taloni et al., PMC10636646](https://pmc.ncbi.nlm.nih.gov/articles/PMC10636646/) | 2023-11-09 | GPT-4 ADA 编造 300 眼数据集 |
| 同行评议 | [JKMS, Alnaimat et al., PMID 41430754](https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=EXT_ID:41430754) | 2025-12-01 | 统计错误检测工具准确率有限 |
| 预印本 | [BLADE, arXiv 2408.09667](https://arxiv.org/abs/2408.09667) | 2024-08-19 / 2025-11-10 | agent 分析决策"limited to basic analyses" |
| 预印本 | [DSBench, arXiv 2409.07703](https://arxiv.org/abs/2409.07703) | 2024-09-12 / 2025-04-11 | 最好 agent 只解 34.12% |
| 官方文档 | [Claude Code execution tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool) | 现行 | 5GiB/1CPU/断网/预装库/1550h+$0.05h |
| 官方文档 | [claude.com/blog/analysis-tool](https://claude.com/blog/analysis-tool) | 2024-10-24，2025-11-05 更新 | JS sandbox 被 code execution 取代 |
| 官方文档 | [Google Developers Blog, Colab DSA](https://developers.googleblog.com/en/data-science-agent-in-colab-with-gemini/) | 2025-03-03 | 免费、生成完整 notebook、"may make mistakes" |
| 官方文档 | [Databricks Genie Code FAQ](https://docs.databricks.com/aws/en/notebooks/databricks-assistant-faq) | 2026-07-08 起计费 | 按量 + 免费额度，无准确性免责 |
| 官方文档 | [Jupyter AI](https://jupyter-ai.readthedocs.io/en/latest/) | v3.1.0 | 开源、权限护栏 |
| 官方文档 | [SPSSAU 官网](https://spssau.com/index.html) | 2026-08 访问 | 500 类方法、"有图有表有文字"、规范化表格 |
| 官方文档 | [WPS AI 数据助手指南](https://www.wps.cn/article/wps-ai-data-assistant-guide.html) | 2026 | 仅 Windows、500 行、三项核验 |
| 官方文档 | [numerous.ai](https://numerous.ai/) | 2026-08 访问 | 表格插件形态、$10/月 |
| 一手论坛 | [HN 48735770（Claude Science）](https://news.ycombinator.com/item?id=48735770) | 2026-06-30 起 | raphman / ml_more / CJefferson 逐字 |
| 一手论坛 | [HN 41943662（Claude analysis tool）](https://news.ycombinator.com/item?id=41943662) | 2024-10-25 | thenaturalist / willsmith72 |
| 一手论坛 | HN Algolia API 评论检索 | 2023–2026 | simonw / ttul 逐字 |
| 中文社区 | [博客园 lzhdim 国产模型实测](https://www.cnblogs.com/lzhdim/p/20941516) | 2026-06-29 | 实验员逐字吐槽 |
| 第三方评测 | [mcpanalytics Julius 评测](https://mcpanalytics.ai/articles/julius-ai-review) | 2026-03-28 | 不可复现、30–50 行编数据、定价 |
| 第三方评测 | [coefficient.io Julius 定价](https://coefficient.io/julius-ai-pricing) | 2026-04-20 | message 定义、学生 5 折 |
| 第三方评测 | [SimilarLabs Julius 评测](https://similarlabs.com/blog/julius-ai-review) | 2026-02-28 | RAM 档位、50MB 超时、80% 自纠 |
| 第三方评测 | [Effortless Academic Julius 评测](https://effortlessacademic.com/julius-ai-in-depth-review/) | — | 学术视角、学生折后价 |
| 第三方评测 | [infinisynapse ChatGPT 数据分析上限](https://infinisynapse.com/en/blog/chatgpt-data-analysis-limit) | 2026-06-28 | 文件/行数/会话硬边界 |
| 第三方评测 | [eesel.ai Manus 定价](https://www.eesel.ai/blog/manus-ai-pricing) | 2026 | credit 投诉、不预告成本 |
| 第三方评测 | [aichief Powerdrill](https://aichief.com/ai-data-management/powerdrill-ai/) | 2026-07-14 | 形态与定价 |
| 学术检索 | Europe PMC `"Julius AI"` 全文检索 | 2026-08-04 | Cureus 2026 致谢句等 4 篇 |

---

## 附：事实核查记录

> 对抗性复核，2026-08-04。默认怀疑，目标是推翻而非确认。
> 本轮 WebSearch 额度已耗尽，全部核查改用**直连一手源**：Europe PMC REST API、arXiv API、
> HN Algolia API、官方文档站，以及 **Wayback Machine**（这一条是关键 —— 正文里判为
> "julius.ai 403 无法回源" 的官网定价页，在 Wayback 有 **2026-08-03** 的快照，可直接回源）。
> 共 20+ 次独立核查。

### 结论速览

| # | 断言主题 | 判定 |
|---|---|---|
| 1 | JCO CCI 多智能体 53.3% vs GPT-4o 35.0% | ✅ CONFIRMED（全部数字逐字吻合） |
| 2 | Cureus 对拍 SPSS 14 项分析 | ✅ CONFIRMED（一处措辞需改：t 值≠系数） |
| 3 | 6 模型 20 场景 100% 选对 + 三条前提 | ✅ CONFIRMED（全部逐字吻合） |
| 4 | JAMA Ophthalmol 造假数据集 | ✅ CONFIRMED（含"未用 Benford"这一条） |
| 5 | DSBench 34.12% / BLADE | ✅ CONFIRMED（口径需补一句） |
| 6 | Julius 不可复现 / 伪造统计量 | ⚠️ **UNVERIFIABLE —— 唯一来源是直接竞品的营销页** |
| 7 | Julius 进了论文方法学段落 | 🔶 引文 ✅；"未命中高影响因子期刊" ❌ **REFUTED** |
| 8 | Julius/Vizly 定价 | 🔶 Pro $45 ✅、Plus $20 ✅、Vizly ✅；Free 档"5/15 条" ❌ |
| 9 | Julius 按"消息"计费、250 条/月 | ❌ **REFUTED —— 官网现为 credit 制，且引文非 Julius 原文** |
| 10 | Claude analysis tool / code execution 规格 | ✅ CONFIRMED（逐项吻合，含 Python 3.11） |
| 11 | Claude Science | 🔶 产品面 ✅；**资助计划（50 项 / $30,000 / 7-15）UNVERIFIABLE** |
| 12 | ChatGPT 数据分析硬边界 | ✅ CONFIRMED（四处引文逐字吻合） |
| 13 | Colab Data Science Agent | ✅ CONFIRMED（全部吻合） |
| 14 | WPS AI 数据助手自述限制 | ✅ CONFIRMED（"500 行"口径需补"或 20 列 / 是变慢"） |
| 15 | SPSSAU 产物形态 | 🔶 SPSSAU 侧 ✅；"它们只给 Markdown 表和 PNG" ❌ **REFUTED** |
| 16 | 中文统计代跑机构 | ⚪ UNVERIFIABLE（本轮未能独立核实，正文已自标） |
| 17 | Manus credit 制 | 🔶 档位数字 ✅；**那句"最大投诉来源"引文查无出处** ❌ |
| 18 | HN 对 Claude Science 的两条原声 | ✅ CONFIRMED（逐字吻合） |
| 19 | simonw / ttul 两条 HN 原声 | ✅ CONFIRMED（逐字吻合） |
| 20 | JKMS AI 查错工具综述 | ✅ CONFIRMED（**日期错：12-01 应为 12-22**） |
| 21 | notebook 侧共识 | 🔶 Jupyter AI ✅、Databricks 计费 ✅；**"文档里没有免责"UNVERIFIABLE** |

---

### 逐条依据

**#1 ✅ CONFIRMED。** Europe PMC `resultType=core` 直取（`DOI:"10.1200/cci-25-00176"`，hitCount=1）。
PMID 41418093、*JCO Clin Cancer Inform* 2025-12、e2500176、Wang J/Swoboda DM/Nazha A 全部吻合。
摘要原文："The multiagent framework successfully replicated 53.3% (95% CI, 40.7 to 66.0) of primary
outcomes, significantly outperforming ChatGPT 4o (35.0% [95% CI, 22.9 to 47.1]; *P* = .04)."
以及 "The agent framework's failures were predominantly due to data transformation issues (46.4%)
and analysis code errors (21.4%). In contrast, ChatGPT 4o failures largely stemmed from incorrect
statistical method application (38.4%) and data transformation (45.6%)"。
另附一条正文可用的加分事实：**"Hallucinations of variables or results were not observed in the
multiagent approach."** —— 多智能体框架在该研究中未观察到变量/结果幻觉。

**#2 ✅ CONFIRMED（一处措辞要改）。** 全文经 Europe PMC `PMC12065437/fullTextXML` 取得。
- 44.909 vs 27.649 **确实存在**，但看 Table 原始列头（`t | p-value | B | SE | β`），
  这两个数是 **t 值**，不是"系数"：SPSS Time2 `t=27.649, B=1.141`；o3-mini Time2 `t=44.909, B=0.987`。
  → 正文"一个 Time2 系数给出 44.909"应改为"**t 值**给出 44.909"。
- 球形度：全文原句 "The ChatGPT-4 results reported only the main effect: F(2,184) = 55.70104,
  p = 1.22E-19... **No sphericity corrections were provided, meaning it assumed sphericity was met.**" ✅
  ⚠️ 但同一张表显示 **o3-mini 反而给出了完整的 GG/HF/LB 校正**（虽然 GG df=1.56 与 SPSS 的 1.188 不符）。
  即"o3-mini 全面更差"在这一项上不成立，宜写成"各有各的错法"。

**#3 ✅ CONFIRMED。** PMC12627256 = **PMID 41267722**，*Cureus* 2025-10-19，Shukla M 等。
限制段逐字："the testing was conducted on a single day (**August 21, 2025**)"、
"this study was limited to **free versions** of these LLMs"、
"the scenarios are based upon the usual biostatistical analysis/statistical test done in
**basic biomedical research rather than advanced-level biostatistics**"。
"Statistical reasoning exhibited variation ranging from **3.16 to 4.66**, with complex regression
methods receiving lower ratings" ✅。三条前提全部属实。

**#4 ✅ CONFIRMED。** PMC10636646 / PMID 37943569 / DOI 10.1001/jamaophthalmol.2023.5162。
原文逐字："300 eyes belonging to 250 patients with keratoconus who underwent deep anterior lamellar
keratoplasty (DALK) or penetrating keratoplasty (PK)"、"−0.05 [0.15] logMAR [95% CI, −0.08 to −0.03]"、
"−0.91 [1.00] diopters [95% CI −1.08 to −0.76]"、"data ranges of continuous variables were
**not always accurate**"。在线发表日期 **November 9, 2023** ✅（Europe PMC 记的 2023-12-01 是纸刊期次）。
**"未使用 Benford / 末位数字分析"属实** —— 作者提出的识别思路是
"looking for peculiar statistical patterns in the data sets, similar to technology that detects
AI-generated text"。惟"唯一破绽"宜改为"**论文自陈的唯一破绽**"（后续独立法证复核不在该文范围内）。

**#5 ✅ CONFIRMED（补一句口径）。** arXiv API 直取。
DSBench 2409.07703，2024-09-12 / v3 2025-04-11，摘要逐字 "466 data analysis tasks and 74 data
modeling tasks"、"the best agent solving only **34.12% of data analysis tasks** and achieving a
**34.74% Relative Performance Gap (RPG)**"。→ 34.12% 是**数据分析那 466 题**的口径，
74 道建模题另用 RPG 34.74% 衡量，正文说"最好的 agent 只解决 34.12%"宜补上限定词。
BLADE 2408.09667（EMNLP 2024，Ken Gu … Jeffrey Heer, Tim Althoff，UW），2024-08-19 / v3 2025-11-10，
"12 datasets and research questions drawn from existing scientific literature, with ground truth
collected from independent analyses by expert data scientists"、"often limited to basic analyses"、
"improved, but still non-optimal, diversity in their analytical decision making" —— 全部逐字吻合 ✅。

**#6 ⚠️ UNVERIFIABLE —— 这条的问题不在数字，在来源资格。**
`mcpanalytics.ai/articles/julius-ai-review` 全文读完后可确认：**该站是 Julius 的直接竞品**，
文章结尾即为自家产品软文（"MCP Analytics takes the opposite approach to Julius…
Same data in, same results out, every time"、"Snapshot $2 · Brief $5 · Deck $25"）。
逐条追下去，正文引用的三点**都没有一手证据**：
- "Results can differ when you ask the same question twice" —— 原文写的是
  "**G2 reviewers have noted this issue. One wrote that** 'results can differ when you ask the
  same question twice.'" → 这是**竞品转述的匿名 G2 评论**，不是 Julius 文档、也不是实测。
- "行数低于 30-50 行时会伪造统计量" —— 原文 "This is **most likely to happen with** datasets
  under 30-50 rows"，无实验、无样本、无截图。
- "用户报告过 hypothesis test 的 p 值不正确" —— 原文 "**Users have reported** incorrect p-values"，未具名。
→ 结论本身可能是对的（LLM 现生成代码确实带来不确定性），但**不能按"已核实事实"写**。
必须降级为"竞品评测的主张"，或改用 #1/#2 这两篇同行评议论文作支撑（它们说的是同一件事且有数据）。

**#7 🔶 引文 ✅ / 推论 ❌ REFUTED。**
两条引文经 Europe PMC 全文逐字复核，**完全属实**：
- PMC12989703（*Cureus* 2026-02-13，胆囊癌）："Data analysis and visualisations for this study were
  assisted using Julius AI (Rahul Sonwalkar, San Francisco, CA, USA)" ✅
- PMC13151164（*BMC Ophthalmol* 2026-03-28）："The study analyzed 90 OCT images, evenly divided among
  dry AMD, wet AMD, and normal control groups, using the GPT-4V model via the Julius AI platform." ✅
**但"没有命中高影响因子期刊"被直接推翻。** Europe PMC 全文检索 `"Julius AI"` **hitCount = 53**，
按发表日排序后命中包括：
- **PLoS Medicine** 2025-12-05（PMC12680241）—— 方法学原文：
  "All the analyses … were performed using **Stata software, version 17/SE** … **Data visualizations
  were performed using Julius AI** (Julius AI, San Francisco, CA, USA; https://julius.ai),
  utilizing Python 3.x."
- **J Med Internet Res** 2026-03-31、**BMC Med Res Methodol** 2026-04-07、**J Exp Bot** 2025-10-01、
  **Int J Mol Sci**（3 篇）、**Mol Med** 2026-02-10、**Lupus Sci Med** 2026-03-12、
  **JACC Advances** 2024-10-25、**PLoS One**（2 篇）、**Hernia**、**Org Biomol Chem** 等。
Cureus 仅 3 篇、Preprints.org 仅 3 篇，占比不足 12%。
→ 反而有一条**更锋利、且对我们更有利**的观察：在 PLoS Med 这种高分刊里，
**统计仍然交给 Stata，Julius 只被允许做"数据可视化"**。天花板不在"能不能进论文"，
而在"**被允许进论文的哪一段**"。

**#8 🔶 部分 REFUTED —— 且"官网无法回源"这个前提本身不成立。**
julius.ai 实测确为 Cloudflare 挑战（`cf-mitigated: challenge`），但
**Wayback 有 2026-08-03 的 200 快照**：`web.archive.org/web/20260803132202/https://julius.ai/pricing`。
回源后的官方档位（2026-08-03）：

| 档 | 月付 | 年付/月 | 额度 |
|---|---|---|---|
| Free | $0 | $0 | "Free daily credits"（**无消息数**） |
| Plus | **$20** | $16 | 2,000 credits/月 |
| Pro | **$45** | $37 | 5,000 credits/月 |
| Max | $200 | $166 | 25,000 credits/月 |
| Ultra | $500 | $416 | 70,000 credits/月 |
| Business | $450 | $375 | 60,000 credits/月，最多 50 席 |

- "Pro $45/月" ✅ CONFIRMED。
- "Plus 档 $20 vs $35 打架" → **已裁定：官方 $20**，coefficient.io 的 $35 是错的。
- "Free 档 5 条 vs 15 条" → **两个数都不成立**：官方 Free 档根本没有消息配额，是"每日刷新 credits"。
- **年付折扣是 20%（"SAVE -20%"），不是 coefficient 说的 15%。**
- "学生教师 5 折后约 $18.5/月" → **官方定价页无任何学生折扣字样**，Wayback 中也找不到
  julius.ai 的 student/education 页。$18.5 恰为**年付价 $37 的一半**（不是 $45 的一半），
  说明这个数是二手源自己折算出来的。→ 降级为 UNVERIFIABLE。
- Vizly ✅ CONFIRMED（Wayback 2026-07-20 快照官网原文）：Basic **$19.99**"Up to 200 messages per
  month"、Premium **$29.99**"Unlimited messages"、"Student or educator? Email us for a **25% discount**"。

**#9 ❌ REFUTED（两处都错）。**
1. **计费单位错**：截至 2026-08-03 官方定价页，Julius 全线是 **credit 制**（2,000 / 5,000 /
   25,000 / 70,000 credits per month），**页面上没有出现过一次 "messages"**，也不存在"250 条/月"这一档。
   "按消息计费"是 2026 年上半年二手评测的口径，已经过时。
2. **引文归属错**：`"A message is consumed every time you send a prompt to Julius, including
   follow-up questions, visualization refinements and data requests."` —— 这句是
   **coefficient.io 文章正文自己的叙述**，出现在其 "How Julius AI Messages and Credits Work" 小节，
   **不是 Julius 官方文案**。正文写成"Julius 原文"属误标。
→ "把图改成横向也扣一条"这个洞察本身仍有价值，但现在只能作为**对 credit 制的类比推测**，
不能再当事实引用。

**#10 ✅ CONFIRMED（逐项吻合，是全篇最扎实的一条）。**
- `claude.com/blog/analysis-tool`：原发布 **October 24, 2024**；弃用注记逐字
  "**The analysis tool is being replaced by more powerful code execution capabilities.
  (November 5, 2025)**"；沙箱语言 JavaScript ✅。
- `platform.claude.com` Code execution tool 官方文档逐字：
  "**Python version:** 3.11"、"**Memory:** 5 GiB RAM"、"**Disk space:** 5 GiB workspace storage"、
  "**CPU:** 1 CPU"、"**Internet access:** Completely disabled for security"、
  "**Expiration:** Containers expire 30 days after creation"、
  "After about **5 minutes of inactivity** a container is checkpointed"、
  "each REPL cell also has a **90-second wall-clock limit**"、
  预装 "**Data science:** pandas, numpy, scipy, scikit-learn, statsmodels"、
  "**Visualization:** matplotlib, seaborn"、
  "Each organization receives **1,550 free hours** of usage per month"、
  "billed at **$0.05 USD per hour, per container**"。全部命中，无一处偏差。
- 可补两条正文没写但对我们有用的：① **与 web search / web fetch 同请求时 code execution 免费**；
  ② 预装还包含 openpyxl / python-pptx / python-docx / pypdf / pdfplumber / reportlab / sympy 与
  sqlite、ripgrep 等命令行工具 —— 也就是"出 Word/PPT/PDF 交付物"这条路在 Anthropic 侧已经铺好了。

**#11 🔶 产品面全对，资助计划查无实据。**
经 `claude.com/product/claude-science`（含 Wayback 2026-07-01 快照）逐字核对：
- "The Claude Science app is in beta for **macOS and Linux** on **Pro, Max, Team, and Enterprise plans**." ✅
- "can query **60+ scientific databases**" ✅
- "Is there a discount for academic or nonprofit labs? **Yes.** The discounted Claude Team plan for
  research labs includes access to the Claude Science app" ✅
- 上线时间：该页在 Wayback 的**首个快照为 2026-06-30 17:17 UTC**，与 HN 发帖 2026-06-30 17:07 UTC 吻合 ✅
- reviewer agent 原文是 "A background reviewer flags **incorrect citations, untraceable numbers,
  and figures that don't match their underlying code**"，另一处 "flags **any claim it can't trace
  to evidence** before results surface"。
  → 正文"审的是引用与数据完整性"**漏了第三项（图与生成它的代码不一致）**，且整体口径是
  "**声明↔证据的可追溯性**"。核心结论（不审统计方法选择）依然成立，但描述要补全。
- ❌ **资助计划（最多 50 个项目 / 每项 ≤$30,000 / 截止 2026-07-15 / 项目期 2026-09-01 至 12-01）
  在官方页面完全不存在**，`$30,000`/`50 projects`/`July 15`/`September` 四个关键词在整页 HTML 中均 0 命中。
  另查到 Anthropic 确有一个 **"AI for Science" 计划（anthropic.com/news/ai-for-science-program，
  2025-05-05）**，但它提供的是 **free API credits**，且**未公布金额、项目数与截止日期**，
  与 Claude Science 无明示关联。→ 这组数字**必须降级为 UNVERIFIABLE**（属典型的"过于精确的漂亮数字"）。

**#12 ✅ CONFIRMED。** infinisynapse 原文逐字："Published 2026-06-28 · Last verified 2026-06-28"、
"A few hundred megabytes per file is the practical ceiling"、
"A few million rows per CSV is workable; tens of millions are not. **The sandbox runs out of memory
on the load step, not the analysis step.**"、"**The hard wall is the verification gap, not the file size.**" ✅
⚠️ 提醒：该站与 mcpanalytics、coefficient 一样是**厂商内容营销站**，正文引用时宜标明立场。

**#13 ✅ CONFIRMED。** Google Developers Blog 原文：公告日 **March 3, 2025**；免费（18+，部分国家/语言）；
"**Fully functional Colab notebooks: Not just code snippets, but complete, executable notebooks.**"；
"**4th place on the DABStep**: Data Agent Benchmark for Multi-step Reasoning on HuggingFace,
ahead of ReAct agents based on GPT 4.0, Deepseek, Claude 3.5 Haiku, Llama 3.3 70B."；
免责字幕 "**Data Science Agent may make mistakes.**" 全部吻合。

**#14 ✅ CONFIRMED（一处口径要收紧）。** WPS 官方文章核对：
"仅支持 Windows 版 WPS Office"（Mac/Linux/Android/iOS/网页版均不支持）✅；
不能自动完成复杂数据清洗、数据透视表构建、跨表关联/多表合并 ✅；
三项核验（数据完整性 / 数值准确性 / 图表信息正确性）✅；
另有官方原话 "AI 给出的'趋势判断'和'结论'是基于数值本身的计算结果，**它不理解业务背景**"（可直接引用）。
⚠️ **"超过 500 行效果下降"要改**：官方原文口径是"表格超过 **500 行或 20 列** 时**响应明显变慢**"，
说的是**速度**不是**质量**；几千行则建议先手工筛选。

**#15 🔶 SPSSAU 侧全对，对比结论被 Julius 官网推翻。**
spssau.com 首页逐字：**"约500类分析方法，一应俱全"**、"约500类智能分析方法及检验，全部都有"、
"左右拖拽分析项，点击'开始分析'即生成分析结果"、**"有图，有表，有文字"**、
**"规范化表格，可视化图形，智能化分析"** —— 全部命中 ✅。
❌ 但"它们只给 Markdown 表和 PNG"**不成立**：Julius 官方定价页（2026-08-03）在
**Plus 及以上每一档**都列着 "**Export slides, HTML artifacts, charts, and images**"，
Free 档也有 "Access to Notebooks"。且正文自认的唯一反证是
"Analytics Vidhya **2024-01-26** 那篇教程全文未提 APA 表" —— 用一篇**两年半前的第三方教程的"沉默"**
去证明"产品没有该功能"，是无效论证。
→ 真正站得住的窄版结论是：**没有任何一家 AI 原生产品提供中文期刊要的三线表 / APA 制式表 / LaTeX 表格源码**
（这一条我未找到反例，可保留），而不是"它们只会出 Markdown 和 PNG"。

**#16 ⚪ UNVERIFIABLE。** 本轮未能独立核实（检索额度耗尽，且各家均不公开挂价）。
正文已自标"未核实"，处理得当。惟"自称 2007 年成立、服务超过 1,000 个论文项目"是**机构自述营销文案**，
引用时须保留"自称"二字，不可去掉。

**#17 🔶 档位数字对，两处要改，另有一条重大遗漏。**
- 档位 ✅：No Code MBA（**Last Updated: June 26, 2026**）逐字给出
  Free $0（"300 daily refresh credits that reset every day"）/ **Standard $20（4,000）**/
  **Customizable $40（8,000）**/ **Extended $200（40,000）**。正文数字与该源一致。
  （注：eesel.ai 同期给的是 Basic $19/1,900、Plus $39/3,900、Pro $199/19,900 —— **两家二手源互相矛盾**，
  而 manus.im/pricing 是纯客户端渲染，Wayback 快照里也取不到价格文本，**官方无法回源**。）
- ❌ **"一次 deep research 能烧 900–1,000+ credits" 属上修**：No Code MBA 原文是
  "**Deep research with multiple sources: 500-900 credits**"；eesel 说的是"a single, moderately
  complex task can blow through **over 900 credits**"（且是转引 lindy.ai）。
  → 应改为"**500–900 credits（多来源深度检索），复杂任务有超过 900 的报告**"。
- ❌ **那句引号里的话查无出处**：
  `"The Manus AI credit system is the single biggest source of confusion, and the single biggest
  source of complaints, in the entire product."`
  —— 在 eesel.ai 全文中 `single biggest` / `biggest source` **命中 0 次**，No Code MBA 亦无。
  eesel 的实际措辞是 "complaints about a surprisingly expensive and confusing credit-based pricing
  model" 与 "the biggest problem people are running into is how unpredictable this whole model is"。
  **这句引文必须删除或改写为无引号的转述。**
- ⚠️ 另注："Manus does not tell you the cost before you hit go" 的原文是
  "Manus **doesn't tell you how many credits a task will cost** before you hit go"。
- 🔴 **重大遗漏（正文完全没提）**：manus.im 官网（Wayback 2026-07-01）顶部横幅
  "**Manus is now part of Meta** — bringing AI to businesses worldwide"，页脚 "**© 2026 Meta**"。
  **Manus 已被 Meta 收购**，其 credit 定价随时可能整体重构 —— 把它当"可直接抄的负面教训"时，
  应说明这是**收购前的历史定价**。

**#18 ✅ CONFIRMED（逐字）。** HN Algolia `items/48735770`，story = "Claude Science"，
url = claude.com/product/claude-science，created 2026-06-30T17:07:41Z。
- **ml_more, 2026-07-01T20:13:13Z**（正文写 20:26 的那条是同作者另一条短评，应更正为 **20:13:13Z**）：
  "…this is way better. On the other hand **it's just good enough that your spot check will look good
  and your work will still contain hallucinations (which is probably worse than obviously bad)**."
  同一条还有一个**比正文引的更有用**的数字：该用户称此类 RAG+校验做法可把引用编造率
  "from the base rate 50-60% for regular models … to 5-15%"（**属网友自述实验，非论文，须标注**）。
- **raphman, 2026-06-30T17:25:05Z**：
  "tl;dr: Use this if you don't like doing science or doing things well. It hallucinates references." ✅ 逐字吻合。

**#19 ✅ CONFIRMED（逐字）。** HN Algolia 全文检索命中唯一原帖：
- **simonw, 2023-11-03T18:15:44Z**（story: *GPT-4 Update: 32K Context Window Now for All Users*）：
  "I've found that ChatGPT Code Interpreter / Advanced Data Analysis is **wildly effective at parsing
  anything I give it**. Not just CSV either - I've uploaded random binary files and told it to figure
  out what they are and it often gets there after churning through a few iterations." ✅
- **ttul, 2023-07-25T15:47:43Z**（story: *What we know about LLMs*）：
  "Code Interpreter lets me upload data in a multitude of formats and play with it **without wasting
  hours futzing around in Google Sheets** or pulling my hair out with Pandas confusion. … Code
  Interpreter **automates the time consuming parts and lets me focus on the exploration**." ✅

**#20 ✅ CONFIRMED，但日期错。** Europe PMC `EXT_ID:41430754`：
*J Korean Med Sci*，Alnaimat F, AlSamhori ARF, El Sharu H, Othman L, Oralbek A, Zimba O，
DOI 10.3346/jkms.2025.40.e342，PMC12722777。
**firstPublicationDate = 2025-12-22，不是 2025-12-01。**
摘要逐字："**AI has moderate accuracy overall but performs better in controlled settings.**"、
"…so **editors must make final decisions**"、"**humans must make the final decision** and utilize
AI responsibly"，工具清单 Statcheck / GRIM-Test / LLMs / Black Spatula / YesNoError ✅。
可补一条更锋利的原文："The Statcheck and GRIM-Test are **especially good at spotting statistical
errors**" —— 即**确定性规则工具反而比 LLM 稳**，这一点对我们的守门设计直接有用。

**#21 🔶 两条可核实的都对，一条"不存在"的核不了。**
- Jupyter AI ✅：官方文档首页逐字 "🛡️ **Guardrails By Default** — Agents request permission
  before writing files, running commands, or using MCP tools."，版本 **v3.1.0** ✅。
  确为权限护栏而非统计正确性护栏 ✅。
- Databricks 计费 ✅：docs.databricks.com/aws/en/genie/ 逐字
  "**Starting July 8, 2026 at 00:00 UTC, Genie Code is billed following a pay-as-you-go pricing
  model** that includes a per-user free monthly allowance."、
  "**Genie One and Genie Agents usage by users is free through January 31, 2027.**" ✅
- ⚠️ "Databricks 文档里**既没有**准确性免责**也没有**'请校验生成代码'的表述" → **UNVERIFIABLE**。
  docs.databricks.com 的 Genie 子页是**客户端渲染**（`/genie/code` 无 JS 抓取仅得 731 字符文本），
  用这种方式**无法确立"不存在"**。而且同一站已可见 "**verified answers**" 这一质量机制。
  → 建议删除这个否定式断言，或改写为"未在其公开文档中找到显式的统计正确性免责声明（**未能穷尽核查**）"。

---

### 方法论层面的两条系统性提醒

1. **本报告 §1 的产品短板证据链高度依赖厂商内容营销站** —— mcpanalytics.ai（Julius 的直接竞品）、
   coefficient.io、infinisynapse.com、eesel.ai、No Code MBA 五家，都在文末卖自家产品。
   它们对竞品的"缺陷描述"天然是**销售论点**。凡是"某产品做不到 X"的结论，
   若唯一来源是这五家之一，都应降级为"竞品主张"。**同一结论若能改挂到 #1/#2/#3/#5 这四篇同行评议
   论文上，说服力高一个数量级且不会被推翻。**
2. **"官网 403 / 取不到" 不等于 "无法核实"** —— 本轮把 §0 里判为无法回源的 julius.ai/pricing、
   manus.im/pricing、vizly.ai/pricing 三个页面全部尝试 Wayback，**其中两个成功回源到一手价格**
   （Julius 快照日期 2026-08-03，比报告成稿还新一天）。以后遇到 Cloudflare 挑战，
   先走 `web.archive.org/cdx/search/cdx?url=…` 再判死。
