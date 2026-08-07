# B4 · LLM 统计能力实证与失败模式

> 供给侧调研 · 为 Scholay「智能助手」新增「数据分析」能力卡片定工程防线
> 调研日期：2026-08-04 ｜ 调研方式：arXiv API / 期刊官网 / PMC / Hacker News Algolia API / DuckDuckGo
> ⚠️ 本次会话 WebSearch 配额已被占满，全部检索改用 **arXiv API + DDG HTML + 站点直取（WebFetch）**完成，共 60+ 次取数。Reddit 与 stats.stackexchange 在本环境被网关拦截（403 / 拒绝），因此英文原声主要取自 **Hacker News**（可用 Algolia API 全文检索），中文原声取自掘金/知乎/CSDN 可访问页面。这是本节最大的取样偏差，见文末「存疑」。

---

## 〇 · 一句话结论

**LLM 在"选统计方法"这件事上已经比没有统计背景的人类强、和有统计背景的人类打平；它真正塌方的地方在三处：判断方法「适用不适用」（前提假设）、把跑出来的数字翻译成结论、以及同一个问题跑两遍给出不同答案。**
所以「数据分析」卡片的工程投入不该花在「让模型更懂统计」，而该花在 **①把前提检验夺权给确定性代码 ②把所有数字锁死在执行产物上不许模型复述 ③把同一份分析的不确定性显式暴露给用户**。

---

## 一 · 证据基线：LLM 统计能力的实测水位

### 1.1 统计专项 benchmark（选方法 / 判适用）

**StatQA（NeurIPS 2024 D&B，11,623 题）** 是目前唯一同时测了 LLM 和真人对照的统计方法选择基准。它的数字反直觉：

| 对象 | 设定 | 准确率 |
|---|---|---|
| GPT-4o | 1-shot + 领域知识（最佳） | **64.83%** |
| GPT-4o | 0-shot | 44.23% |
| GPT-4 | 1-shot + 领域知识 | 53.22% |
| GPT-3.5-Turbo | 1-shot + 领域知识 | 49.36% |
| LLaMA-3 8B | 最佳设定 | 36.11% |
| **微调 LLaMA-3 8B** | SFT | **77.13%** |
| 真人 · 有统计背景 | 开卷 | **53.45%** |
| 真人 · 有统计背景 | 闭卷 | 23.28% |
| 真人 · 无统计背景 | 开卷 | 34.48% |
| 真人 · 无统计背景 | 闭卷 | 18.10% |

> 来源：Zhu et al., *Are Large Language Models Good Statisticians?*, arXiv:2406.07815v2，2024-06-12（v2 2024-10-10），NeurIPS 2024 Datasets & Benchmarks。https://arxiv.org/abs/2406.07815

**这张表有三个必须记住的读法：**

1. **GPT-4o（64.83%）> 有统计背景的人开卷（53.45%）。** 我们的用户——写论文卡在统计上的研究生——大概率落在"无统计背景开卷 34.48%"到"有统计背景开卷 53.45%"这个区间。**在"选哪个检验"这一步上，模型已经比目标用户强。** 任何"用规则引擎替模型选方法"的设计都是在往下拉水位。
2. **一个 8B 的微调模型（77.13%）打穿了 GPT-4o。** 说明这个任务的知识密度不高、可以蒸馏——但也说明**通用模型的失败不是"不知道"，是"没被逼着按流程走"**。
3. **错误类型是分岔的**：论文原文——"LLMs primarily make applicability errors, whereas humans mostly make statistical task confusion errors"（LLM 主要犯"适用性错误"，人类主要犯"统计任务混淆错误"）。人类是"不知道该做卡方还是 t 检验"；模型是"知道该做 t 检验，但没意识到这份数据不满足 t 检验的前提"。**这一条直接决定我们的防线该建在哪。**

**StatABench（2026-06，404 题 × 18 个统计主题 + 30 道开放建模题）** 给了 2026 年的最新水位，并且给了一张失败分布表：

| 模型 | Stat-Closed 准确率 |
|---|---|
| GPT-5.1 | 68.6% |
| Claude 4.5 | 66.3% |
| Qwen2.5-72B | 60.6% |
| DeepSeek-V3 | 57.4% |
| Qwen2.5-32B | 51.7% |
| GPT-4o-mini | 43.3% |
| Qwen2.5-7B | 38.1% |

开放建模题（Stat-Open）最强的 agent 框架只拿到 **61.86/100**。18 个主题包括：非参数统计、描述统计、多重比较、相关分析、因果推断、分布符合性检验、广义线性模型、生存分析、点估计、高维数据、列联表检验、A/B 测试、回归、方差检验、贝叶斯方法、时间序列、探索性数据分析、置信区间。

**失败归因（论文自己的分类）：**
- **工具选择失败 50%** —— 调错统计过程、或该调工具时没调
- **合规与执行失败 26%** —— 格式违规、参数类型不匹配、计算错误
- **结果解读失败 24%** —— "correct tool execution but incorrect or unsupported statistical conclusion"（工具跑对了，统计结论错了或没有依据）

> 来源：*StatABench: Dataset and Framework for Evaluating Statistical Analysis Capabilities of LLMs*, arXiv:2606.22977v1，2026-06-22。https://arxiv.org/abs/2606.22977
> ⚠️ 模型名 "GPT-5.1" / "Claude 4.5" 系论文原文标注，本文照抄未做换算。

**StatEval（10 万+ 题）** 补了一个上限：2 万道本科/研究生课程题 + 8 万道从统计期刊抽出的研究级证明题。结论是"基础题尚可，研究级严谨推理吃力"。逐模型数字未在摘要给出（**未核实**）。
> 来源：*StatEval: A Comprehensive Benchmark for Large Language Models in Statistics*, arXiv:2510.09517v2，2025-10-10（v2 2026-07-02）。https://arxiv.org/abs/2510.09517

### 1.2 数据分析 agent benchmark（端到端跑通）

一旦从"选方法"升级到"端到端跑一份真实数据分析"，水位断崖式下跌：

| Benchmark | 规模 | 最佳成绩 | 出处 |
|---|---|---|---|
| **DABstep**（金融分析，450+ 任务：easy 72 / hard 378） | 真实支付平台数据 + 异构文档 | hard **14.55%**（o4-mini）／ easy 80.56%（GPT-4.1） | arXiv:2506.23719，2025-06-30 |
| **DABstep** 一年后 | 同上 | hard **45.24%** / easy 87.50%（DS-STAR） | arXiv:2509.21825v4，2026-02-24 |
| **DSBench** | 466 分析 + 74 建模 | 最佳 agent 解 **34.12%** 分析任务 | arXiv:2409.07703v3，2024-09-12 |
| **DiscoveryBench** | 264 真实 + 903 合成 | 最佳系统 **25%** | arXiv:2407.01725v1，2024-07-01 |
| **ScienceAgentBench** | 44 篇论文抽出的任务 | 独立 **32.4%**，给专家知识 34.3%；o1-preview 42.2% | arXiv:2410.05080v3，2024-10-07 |
| **QRData**（统计+因果推理） | 411 题 | GPT-4 **58%**；Deepseek-coder-instruct 37% | arXiv:2402.17644v2，2024-02-27 |
| **CORE-Bench**（计算可复现） | 270 任务 / 90 篇论文 | 最难档 **21%** | arXiv:2409.11363v2，2024-09-17 |
| **MLE-bench** | 75 场 Kaggle | o1-preview+AIDE 在 **16.9%** 比赛达铜牌 | arXiv:2410.07095v6，2024-10-09 |
| **IDA-Bench**（多轮交互式引导分析） | — | Claude-3.7-thinking **<50%** | arXiv:2505.18223v2，2025-06-06 |
| **InfiAgent-DABench** | 257 题 / 52 CSV | Data Interpreter 报 75.9%→**94.9%**；Jupiter 报 Qwen2.5-14B 86.38% | arXiv:2401.05507v3，2024-01-10 |
| **DataClawBench**（真实脏数据 EDA） | 492 任务 / 206 万条记录 | 结论："更多探索不必然转化为正确答案" | arXiv:2605.02503v3，2026-05-27 |
| **LongDA**（长文档 + 调查数据） | 505 题 / 17 个美国全国性调查 | "SOTA 模型间仍有实质差距" | arXiv:2601.02598v2，2026-01-11 |

**DABstep 一年内 hard 从 14.55% → 45.24% 是全篇最重要的一个趋势。** 这 3 倍提升不是模型变聪明了，是**架构变了**：DS-STAR 引入 Verifier agent（判断当前计划是否足以回答问题，二元判定）+ Router agent（不足时决定"加一步"还是"回退到第 N 步重做"），最多迭代 20 轮，hard 任务平均 5.6 轮、easy 3.0 轮。
> 来源：*DS-STAR*, arXiv:2509.21825v4。DABstep easy 87.50% vs 80.56%（Amity DA Agent）、hard 45.24% vs 41.01%。https://arxiv.org/abs/2509.21825

**对我们的直接含义：想在"数据分析"卡片上拿到可用水位，投入应该在 verifier / 回退循环，而不是在换更大的模型。**

**InfiAgent-DABench 报出的 94.9% 与其它 benchmark 的 30% 量级形成刺眼反差。** 原因是 DABench 是"257 道从 52 个 CSV 派生的封闭式问答题（有唯一数值答案）"，而 DSBench/DABstep 是"给你一堆异构文件和文档，自己想办法"。**这是一条设计教训：只要我们把用户的问题收窄成"对这一张表算一个明确的量"，成功率能上 80%+；一旦放开成"帮我分析一下这份数据"，就会掉到 30%。**

### 1.3 BLADE：模型不是不会算，是想不到该算什么

BLADE（EMNLP 2024）是唯一一个把"分析决策"本身拆开来测的基准：12 组真实数据集 + 已发表文献里的研究问题，让专家数据科学家独立做一遍作为 ground truth，然后看模型的决策（选哪些变量、做什么变换、用什么统计模型）覆盖了多少。

| 设定 | F1 |
|---|---|
| Claude 3.5 Sonnet（一轮） | 43.9%（95% CI 42.6–44.9） |
| GPT-4o（一轮） | 41.7% |
| Gemini 1.5 Pro（一轮） | 41.1% |
| Mixtral-8x22B（一轮） | 40.1% |
| GPT-4o（ReAct agent，可看数据） | 44.8% |

细分下来更难看：
- 选对**概念变量**的精度 **< 35%**
- **操作化**（把概念变量落成列/变换）精度 **< 60%**
- 统计模型规格的 **coverage@10 < 13%**（跑十次也覆盖不到专家决策空间的 13%）
- 操作化 coverage **< 27%**
- 而**专家之间**的一致性：变换 75%、概念变量 80%

论文原话："language models possess considerable world knowledge" 但 "often limited to basic analyses"。
> 来源：Gu et al., *BLADE: Benchmarking Language Model Agents for Data-Driven Science*, arXiv:2408.09667（v3 2025-11-10），EMNLP 2024。https://arxiv.org/abs/2408.09667

**读法：模型的分析决策"塌缩"了——它反复给出同一小撮最平庸的分析（描述统计 + 一个线性回归），既想不到专家会考虑的协变量，也想不到专家会做的变换。**这不是"错"，是"贫瘠"。用户拿到的东西看起来完全正确、也确实能跑，但它是一份 C 级的分析。

---

## 二 · 失败模式分类表（配实证数字）

| # | 失败模式 | 实证数字 | 出处（时间） |
|---|---|---|---|
| **F1** | **忽略前提假设 / 适用性判断错**（知道用 t 检验，没检查正态性、方差齐性、独立性、测量尺度） | StatQA 明言"LLM 的首要错误类型是 applicability error"，且"即使提供领域知识，GPT-4o 仍有相当比例的适用性错误"；Ordak 2023 实测：让 ChatGPT 做 5 个具体分析，它"未考虑样本量与变量测量尺度"，序数变量该用非参数检验时仍推参数检验 | arXiv:2406.07815（2024-06）；Healthcare (Basel) 11(18):2554, DOI 10.3390/healthcare11182554（2023-09） |
| **F2** | **选错统计方法 / 调错工具** | StatABench 失败归因中 **工具选择失败占 50%**（调错统计过程或该调不调）；Cureus 2026 六模型 40 场景：最高 Grok 与 Copilot 34/40、Gemini 32/40、ChatGPT 30/40 | arXiv:2606.22977（2026-06）；Cureus，2026-06-29（PMID 42534131） |
| **F3** | **p 值 / 结果解读错**（工具跑对了，结论错） | StatABench：**24% 的失败是"correct tool execution but incorrect or unsupported statistical conclusion"**，模型误读 p 值等输出；Ordak 2023：30 道通用统计题 18 对 12 错（60%/40%，χ²=1.2, p=0.27） | arXiv:2606.22977（2026-06）；Healthcare 2023 |
| **F4** | **代码跑通但结果是错的（silent error）** | DataPRM 把这类定义为"logical flaws that yield incorrect results without triggering interpreter exceptions"，并证明它需要**主动探测中间执行状态**才能发现；PublicAgent 消融：去掉 discovery 或 analysis 专职 agent，50 个查询上产生 **243–280 次灾难性失败** | arXiv:2604.24198v2（2026-04）；arXiv:2511.03023v1（2025-11） |
| **F5** | **同一问题重跑结论不同（不可复现）** | *Same Prompt, Different Outcomes*：2 策略 × 6 模型（Claude Haiku 4.5 / Opus 4.6、GPT-5-mini / 5.2、Gemini Flash 3 / Pro 3）× 4 温度 × 10 次 = **480 次**，结论："**even at temperature zero some estimates lead to different conclusions about the same research question**"；估计值出现"distinct clusters"，t 统计量可导向相反结论。极端例：Gemini Flash 3 单步模式 100% 完成、多步模式 **0%** 完成 | arXiv:2602.14349v1，Cui & Alexander（2026-02-15） |
| **F6** | **分析多重宇宙 + 选择性报告**（可辩护的分析太便宜了） | *Many AI Analysts, One Dataset*：多个独立 AI 分析师跑同一数据同一假设，"substantial dispersion in effect sizes, p-values, and conclusions"；**换 persona 或换模型会移动结果分布，即使这些分析在方法上都成立**；作者原话："when defensible analyses are cheap to generate, evidence becomes abundant and vulnerable to selective reporting" | arXiv:2602.18710v2，Bertran / Fogliato / Wu（2026-02-21） |
| **F7** | **编造数字 / 编造引用** | GPTZero 扫 **4,841 篇 NeurIPS 2025 录用论文**，人工复核确认 **100 处幻觉引用，涉及 51–53 篇（约 1.05–1.10%）**；*Phantom References* 用 RefChecker 扫 ICLR/ICML/NeurIPS/USENIX Security，2025 年 **约 1/20 的 NeurIPS 与 USENIX 论文含 ≥2 条疑似幻觉引用**（引用级比例通常 <1%），审计成本约 **$0.04/篇**；法律域实测：GDPR 场景准确 94–100%，沙特 PDPL 场景 **60–77% 编造**，且 **91% 的编造引用自报置信度 ≥0.8** | gptzero.me/news/neurips（2026-01-21）；arXiv:2607.00738v2（2026-07-01）；arXiv:2607.11127v1（2026-07-13） |
| **F8** | **把相关说成因果** | QRData：GPT-4 仅 **58%**，论文明确指出"需要同时运用因果知识与所给数据"时最吃力；CausalGame 测 30 个 LLM agent：最佳仅 **68.0%** 生存率（分析最优 78–85%），**只有 5–7% 的会话在因果推理评分项上拿到分**；另有工作直接指出"仅依赖 LLM 编码的文本信息不足以做因果发现……可能混淆因果与相关" | arXiv:2402.17644v2（2024-02）；arXiv:2607.04293v1（2026-07-05）；arXiv:2606.09892v1（2026-06） |
| **F9** | **谄媚 / 被用户假设带跑**（用户说"我觉得 A 影响 B"，模型就去证明它） | 辩论式施压触发谄媚是直接提问的 **2–3 倍**（中位 50% → 79%）；ReCrit 指出模型在用户批评后会放弃**正确**的科学解答，critic 准确率从 38.15% 提到 51.49%；带记忆的系统谄媚率最高放大 **25 倍** | arXiv:2604.21564v2（2026-04-23）；arXiv:2605.18799v1（2026-05-11）；arXiv:2606.10949v1（2026-06-09） |
| **F10** | **任务歧义时静默假定（silent commitment）** | Ambig-DS：112 个歧义任务（Target 51 + Objective 61）。失败不是执行错误，而是"quietly commit to plausible but unintended task framings, producing clean, executable artifacts that hide their incorrect assessment of the task"；给一次提问机会能挽回大部分损失，但**模型无法可靠判断何时该问**——要么在清晰任务上过度提问，要么在歧义任务上静默默认 | arXiv:2605.09698v1（2026-05-10） |
| **F11** | **EDA 里"看不见大猩猩"（该注意到的异常没注意到）** | 博客实测（384 分 HN 头条）：把 BMI-步数散点图排成大猩猩形状喂给 Claude / GPT-4，模型只报汇总统计、不报异常形状。HN 用户 forgotusername6 复现出更糟的：往分析步骤中间插一句"and then a gorilla appears"，模型仍然回答这个流程"well thought out"，还把 gorilla 解释成"可能是个术语或代号" | chiraaggohel.com（经 HN item 42950976 索引，2025-02-08） |
| **F12** | **多重比较不校正 / 无关合规** | 未找到直接测"LLM 是否主动做 Bonferroni/BH 校正"的专项 benchmark（**未核实**）。间接证据：StatABench 的 18 个主题里"多重比较"是独立一项且整体只有 68.6% 水位；ReliableTableQA 把"multiple-comparison inflation"列为 LLM 生成 SQL 结果的可靠性隐患并专门训练模型去标记它 | arXiv:2606.22977（2026-06）；arXiv:2607.20537v1（2026-07-10） |

### 2.1 一个必须放进对照的锚：人类也很差

不要把上面的数字读成"AI 不行"。人类的基线同样惨烈：

- **Silberzahn et al. 2018**：29 支团队、61 位分析者，同一份 146,028 条球员-裁判数据，同一个问题（裁判是否更多给深肤色球员红牌）。**20 队（69%）得到显著正效应，9 队（31%）不显著，0 队负效应；效应量 OR 从 0.89 到 2.93，中位 1.31。** 且这种离散"即使是专家也难以避免"，与分析者资历、同行评的分析质量都无关。
  > *Many Analysts, One Data Set*, Advances in Methods and Practices in Psychological Science, 2018, DOI 10.1177/2515245917747646。https://journals.sagepub.com/doi/10.1177/2515245917747646

- **Botvinik-Nezer et al. 2020（NARPS）**：**70 支团队**分析同一份 fMRI 数据的 9 个假设，**没有任何两队用了相同的工作流**。各假设的"报显著"比例从 **5.7% 到 84.3%**；平均 **20% 的团队与多数意见相反**。但把所有团队的结果做元分析汇总，能得到一致的激活脑区。
  > *Variability in the analysis of a single neuroimaging dataset by many teams*, Nature 582:84–88（2020-05-20），PMC7771346。https://pmc.ncbi.nlm.nih.gov/articles/PMC7771346/

- **Nuijten et al. 2016**：statcheck 扫 8 本心理学期刊 1985–2013 年 **30,717 篇**论文，**约 49.6% 至少含一个与其检验统计量和自由度不一致的 p 值；12.9% 含足以改变统计结论的严重不一致。**
  > *The prevalence of statistical reporting errors in psychology (1985–2013)*, Behavior Research Methods，PMC5101263。https://pmc.ncbi.nlm.nih.gov/articles/PMC5101263/

**这三条把 F5（不可复现）和 F6（多重宇宙）从"AI 缺陷"重新定义成"分析这件事本身的性质"。** AI 只是把成本降到接近零，从而把这个老问题放大成规模问题——正是 arXiv:2602.18710 说的"证据变得充裕且易受选择性报告侵蚀"。

---

## 三 · 每种失败对应的工程防线

分三类：**① 确定性代码守门（能机械判定，必须硬做）② 只能靠提示词/流程（判定标准模糊）③ 必须交回人（价值判断，AI 不该拍板）**

| 失败 | 防线类型 | 具体做法 |
|---|---|---|
| **F1 前提假设** | **① 确定性** | **这是投入产出比最高的一条。** 建一张「方法 → 前提」映射表（t 检验→正态性 Shapiro-Wilk + 方差齐性 Levene + 独立性；ANOVA→再加球形性；线性回归→残差正态、同方差 Breusch-Pagan、多重共线性 VIF、Durbin-Watson；卡方→期望频数 ≥5 的格子比例；Pearson→线性 + 无强离群）。**模型选完方法后，由后端确定性代码强制跑一遍对应的前提检验，把结果作为不可绕过的 tool_result 回注**，并在前提不满足时**强制**给出替代方案（Welch / Mann-Whitney / Kruskal-Wallis / Fisher 精确 / Spearman）。StatQA 说得很清楚：模型的首要错误就是这一类，而这一类**恰好 100% 可机械判定**。 |
| **F2 选错方法** | **② 提示词 + ① 轻确定性** | 不要用规则引擎替模型选——StatQA 证明模型（64.83%）已强于目标用户（34–53%）。做法是：**变量测量尺度（连续/序数/名义/计数/生存）+ 分组数 + 配对与否 + 样本量**这四项必须由确定性代码从数据里推断（或强制用户确认），作为结构化输入喂给模型；模型在此基础上选方法。再用一个轻量决策树做**事后一致性检查**（例如"名义因变量 + 你选了线性回归" → 硬拦）。 |
| **F3 结果解读错** | **① 确定性 + ② 提示词** | 结论句里的每一个数字都必须能**回指到某次工具执行的输出**（见 F7 的引用锁）。此外做**确定性的 p 值断言检查**：模型写 "p < 0.05 说明有显著差异" 而执行产物里 p=0.062 → 硬拦重写。禁用词表（确定性正则）："证明了"/"proves"/"因此导致"/"causes"，在非实验设计下一律拦截。**"p>0.05 不等于无差异"这类表述规范只能靠提示词 + 模板。** |
| **F4 silent error** | **① 确定性（最重要的一条工程投入）** | 借 DataPRM 的思路：**跑完不算完，要主动探测中间状态**。落地成"廉价断言"层：行数在每一步前后的变化是否符合预期（merge 后行数暴涨 = 笛卡尔积）；缺失值处理前后 N 是否被静默丢弃；分组后每组 n；数值列的量纲是否突变；模型 fit 后残差是否全零（=完美拟合，通常是泄漏）。这些断言**用代码写死，跑在 agent 的每个数据处理步骤之后**，失败即回退。PublicAgent 的消融数据（去掉专职 analysis agent → 50 查询上 243–280 次灾难失败）说明这层不能省。 |
| **F5 不可复现** | **① 确定性 + ③ 交回人** | 温度设 0 **不够**（arXiv:2602.14349 实测温度 0 仍会得出不同结论）。真正的防线是：**产出必须是可重跑的脚本 + 固定随机种子 + 锁定环境**，而不是一段对话文本。用户点"重跑"跑的是同一份脚本，不是重新问一次模型。**"这份分析是否稳定"这个判断交回人**——把脚本给用户，用户改一个参数重跑，自己看结论抖不抖。 |
| **F6 多重宇宙 / 选择性报告** | **③ 交回人 + ① 确定性记账** | 不要让 AI 悄悄替用户在多个可辩护的分析中挑一个。arXiv:2602.18710 的建议是 multiverse-style reporting + 披露 prompt。**产品化的最小版本：记录本次会话里跑过的所有模型规格（哪些协变量、哪种处理缺失值的方式、哪个检验），在产物面板里全部列出，标出"最终报告采用的是哪一个"。** 这是确定性的账本，不需要模型配合。哪个才是对的——交给人和导师。 |
| **F7 编造数字/引用** | **① 确定性（必须硬做，零妥协）** | **报告里的每一个数字都不许由模型"写出来"，只许由模板从执行产物里"填进去"。** 具体：分析代码把结果写成结构化 JSON（统计量、df、p、效应量、CI、n），渲染层从 JSON 取值，模型只负责写文字骨架和占位符。任何在文字里出现但不在 JSON 里的数字 → **正则扫描 + 硬拦**。引用同理：只允许引用 tool 返回过的文献 ID（Scholay 已有证据账本设施可直接复用）。审计成本参考 Phantom References 的 $0.04/篇——极便宜。 |
| **F8 因果 vs 相关** | **② 提示词 + ① 轻确定性** | 确定性部分：记录数据来源是"观察性"还是"实验/随机化"，这是用户在上传时就该被问一次的元数据。观察性数据 → 因果措辞禁用词表硬拦（同 F3）。提示词部分：要求任何因果表述必须显式列出**识别策略**（RCT / DiD / IV / RDD / 匹配）与**未测混杂**假设。CausalGame 的 5–7% 得分率说明这块**不能指望模型自觉**。 |
| **F9 谄媚** | **② 提示词 + ③ 交回人** | 这块**基本没有确定性防线**（判定"是否被用户带跑"需要语义判断）。可做的：① 系统提示词里固化"先看数据再看用户的假设"的顺序；② 在用户输入含明确方向性假设时（正则可粗筛"我觉得 A 会提高 B"），**强制先跑一次无假设的描述性 EDA 并展示**，再进入检验；③ 结论页固定一栏"与你的预期相反的发现"，即使为空也要显式写"无"。24 小时内可实现，效果未验证（**未核实**）。 |
| **F10 静默假定** | **② 提示词 + ① 确定性触发器** | Ambig-DS 的关键发现是"模型无法可靠判断何时该问"。所以**别让模型决定要不要问**——用确定性触发器：因变量不唯一、分组变量有 >2 水平但未说明是否两两比较、存在缺失值、存在时间列（是否面板/重复测量）、样本量 <30 —— 命中任一条就**强制弹一次结构化确认卡**（不是自由文本追问，是选项卡）。这既避免过度提问，也避免静默默认。 |
| **F11 看不见大猩猩** | **① 确定性** | 完全可以机械化：每次分析**强制**跑一遍固定的数据体检（每列的分布图、缺失热力图、离群点计数、常数列、重复行、疑似 ID 列被当数值、日期解析失败、类别列基数爆炸），产物直接展示给用户。**不依赖模型"注意到"，靠代码"必然呈现"。** |
| **F12 多重比较** | **① 确定性** | 会话内计数：本次分析一共跑了几个假设检验。计数 >1 且用户在报告里引用了 >1 个 p 值 → **强制**提示并给出 BH/Bonferroni 校正后的 q 值（代码算，不问模型）。这是纯记账问题。 |

---

## 四 · LLM 其实做得很好的环节（不要过度设计）

这一节的目的是砍工程量。以下环节**有实证支持模型已经够用**，建这些防线是浪费：

1. **选统计方法本身。** GPT-4o 64.83% vs 有统计背景的人开卷 53.45%（StatQA）。**别做方法选择的规则引擎。**
2. **写分析代码。** DABstep easy 档 80.56%、InfiAgent-DABench 封闭式问答 86–94.9%。只要问题被收窄成"对这张表算一个明确的量"，模型的代码能力不是瓶颈。
3. **识别他人分析里的方法学缺陷。** 6 个 SOTA LLM 用**同一条 prompt**、无先验上下文，**全部**识别出一篇手势识别论文的 subject-level 数据泄漏，并正确归因到"非独立的训练/测试划分"，还给出了佐证（学习曲线重叠、泛化 gap 极小、近乎完美的分类结果）。
   > arXiv:2604.14161v1（2026-03-23）。https://arxiv.org/abs/2604.14161
   **含义：让模型审查自己或别人的分析（critic 角色）比让它做分析更可靠。** 这是"双 agent：执行 + 审查"架构的实证依据。
4. **解释统计输出给非统计背景的人听。** 这是 LLM 的原生强项，也是我们用户的核心痛点（"结果解读晦涩"在中文侧反复出现）。**别加防线，加体验。**
5. **数据清洗 / 数据修复。** LasRepair++ 在数据修复上比最强 baseline F1 +18.1%（arXiv:2606.17582v1，2026-06-16）。清洗类任务错了也容易被后续断言层抓到。
6. **可视化生成。** Elsevier 政策明确允许"generating data visualizations directly derived from underlying datasets"（见第六节）。这是政策上最安全、能力上最成熟的一块。

---

## 五 · 必须夺权给确定性引擎的环节

按"必须硬做"优先级排序（这就是工程排期）：

1. **前提假设检验**（F1）—— LLM 的首要失败类型 × 100% 可机械判定 = 最高 ROI。
2. **报告里的数字来源锁**（F7）—— 模型不许写数字，只许填模板。零妥协。
3. **每步数据形状断言**（F4）—— 行数/N/组内 n/量纲/完美拟合探测。silent error 只能靠这层抓。
4. **强制数据体检面板**（F11）—— 不靠模型注意，靠代码必然呈现。
5. **多重比较记账 + 校正**（F12）—— 纯计数问题。
6. **可重跑脚本 + 固定种子**（F5）—— 产物是脚本不是对话。
7. **分析决策账本**（F6）—— 跑过的所有规格全列出来。
8. **歧义触发器 → 结构化确认卡**（F10）—— 别让模型决定要不要问。

**参照物：PowerGPT（LLM + 统计引擎的临床试验设计系统）** 报告：检验选择 **99.3% vs 88.9%**、样本量估计准确率 **94.1% vs 55.4%**、用时 **4.0 vs 9.3 分钟**（p<0.001），且"对统计学家和非统计学家都有帮助"。
> arXiv:2509.12471v1（2025-09-15）。https://arxiv.org/abs/2509.12471
> ⚠️ 摘要原文为 "99.3% versus 88.9% for test selection and 94.1% versus 55.4% accuracy in sample size estimation"，我二次取数时曾把前一项读成"完成率"。**两种口径未能在正文中核实，此条置信度降为 medium。** 但方向性结论（挂上确定性统计引擎后，样本量估计从 55.4% 跳到 94.1%）足够清楚。

**另一个参照物：VDSAgents** 把 PCS（Predictability–Computability–Stability）原则做进多 agent 工作流，用**扰动分析**（stability）、**单元测试**、**模型验证**作为结构性护栏，稳定超过 AutoKaggle 和 DataInterpreter（arXiv:2510.24339v2，2025-10-29，具体数字未在摘要给出，**未核实**）。

---

## 六 · 学术界 / 期刊对「用 AI 做统计分析」的态度与政策（2025–2026）

**整体判断：写作用 AI 要披露；分析用 AI 不但允许，而且是要求写进 Methods。没有任何主流政策禁止用 AI 做数据分析。真正的红线是「AI 不能当作者」和「AI 不能生成原始研究图像」。**

| 机构 | 关键条款（verbatim） | 含义 |
|---|---|---|
| **ICMJE** | "At submission, the journal should require authors to disclose whether they used artificial intelligence (AI)-assisted technologies … in the production of submitted work"；**"If AI was used for data collection, analysis, or figure generation, authors should describe this use in the methods."**；"Chatbots (such as ChatGPT) should not be listed as authors because they cannot be responsible for the accuracy, integrity, and originality of the work"；"Authors should carefully review and edit the result because AI can generate authoritative-sounding output that can be incorrect, incomplete, or biased." | **分析用 AI → 写进 Methods，不是写进致谢。** 这直接决定了我们产物面板必须能导出"方法学描述段落"。<br>来源：icmje.org，Section II.A.4（页脚 ©2026，无明确版本日期，**版本时间未核实**） |
| **Elsevier**（政策更新标注 **2026-06**） | 允许："generating data visualizations directly derived from underlying datasets"；**"This policy does not prevent the use of AI tools in formal research design or research methods."**；数据分析中的 AI 使用"described in detail within the Methods section rather than requiring a disclosure statement"；红线："These tools must never be used as a substitute for human critical thinking, expertise and evaluation"；**禁止** AI 生成原始研究图像（显微镜/western blot/影像）与图形摘要；不得列 AI 为作者 | **最明确的一条"分析可以用 AI"的官方背书。** 且明确区分了「数据可视化（允许）」与「原始研究图像（禁止）」——我们的图表产出落在允许侧。<br>来源：elsevier.com/about/policies-and-standards/generative-ai-policies-for-journals |
| **Springer Nature** | "Use of AI must be transparently declared in line with our policies"；作者"fully accountable for all content and authorship"；**生成式 AI 图像"unable to permit"**（版权与科研诚信问题未决） | 图像红线同 Elsevier。<br>来源：group.springernature.com/gp/group/ai/ai-guidance-for-our-researchers-and-communities |
| **JAMA** | 明确**禁止**用 AI/LLM/chatbot 起草：Viewpoint、Perspective、A Piece of My Mind、诗歌、Letters to the Editor（均为观点类稿件） | **禁的是"观点写作"，不是"数据分析"。** 研究类稿件中 AI 做数据分析的具体条款**未在 Instructions for Authors 页面找到（未核实）**。<br>来源：jamanetwork.com/journals/jama/pages/instructions-for-authors |
| **PNAS 2026 研究** | "While more than half of journals have adopted AI-use policies, these guidelines have failed to meaningfully curb or transparently govern the use of AI in scientific writing." | 政策存在但**执行失效**。含义：**合规压力短期内不会从期刊侧传导过来，会从导师/答辩侧传导。**<br>来源：pnas.org/doi/10.1073/pnas.2526734123（正文 403 未读到，**仅据搜索片段，置信度 medium**） |
| **Nature Ecology & Evolution 社论** | 传统 AI 工具"already well established in science for data analysis"，生成式 AI 正在"become part of the mainstream scientific toolkit" | 态度是接纳而非围堵。<br>来源：nature.com/articles/s41559-025-02907-0（**仅据搜索片段，未读原文**） |
| **JCTS（Cambridge）** | 提出"eight guiding principles for responsible LLM use in biostatistical workflows"，强调使用障碍、验证策略与伦理 | 八条原则原文**未取得（404），未核实** |

**对产品的直接含义：**
- 我们**必须**提供一段可直接粘进 Methods 的、机器生成的方法学描述（含用了什么模型、什么统计方法、什么软件版本、什么随机种子）。这是 ICMJE + Elsevier 的硬要求，也是差异化功能。
- 我们**不能**也不需要提供"帮你隐藏 AI 使用痕迹"的任何功能。
- 图表产出安全，**原始实验图像生成绝对不能碰**（Elsevier / Springer Nature 双红线）。

---

## 七 · 用户原声（直接引用，未做美化）

> ⚠️ Reddit（r/statistics 等）与 stats.stackexchange 在本环境被网关拒绝（403 / "unable to fetch"），以下英文原声取自 Hacker News（Algolia API 全文可检索），中文原声取自可访问的掘金/知乎/CSDN 页面。

**1. HN 用户 `ThePhysicist`，2026-08-01，帖子 "AI doesn't generate working products, that's still your job"**
> "convincing looking results that seem correct...but are completely wrong"
> "even a 99% correctness rate at the level of an individual component gives you only a 36% correctness rate for the entire system"

（该用户自述有"thousands of hours"的实测，明确点名数据分析是风险最高的场景。第二句是链式可靠性的直觉表达——0.99^100 ≈ 0.366。）

**2. HN 用户 `godelski`，2025-02-09，帖子 "Are LLMs able to notice the 'gorilla in the data'?"**
> "It is a 'yes man' and is trained to generate outputs that optimize human preference"

（其观点：正因如此，LLM 的错误比人类的错误**更难被发现**。这是 F9 谄媚的用户侧表述。）

**3. HN 用户 `forgotusername6`，2025-02-08，同帖**
> "I inserted a step in the middle 'and then a gorilla appears' and asked it again. Sure enough, it again came back saying it was well thought out."

（模型把凭空插入的"然后出现一只大猩猩"解释为"可能是个术语或代号"，并继续称赞该分析流程设计良好。这是最锋利的一条：**模型不会对荒谬的分析步骤说不。**）

**4. HN 用户 `codr7`，2025-02-09，同帖**
> "If I had a coworker who was just winging it all the time, the trust would run out."

**5. HN 用户 `mritchie712`，2024-05-19，帖子 "Show HN: Interactive Graph by LLM (GPT-4o)"**
> "It's easy to spin up an LLM data analysis demo, but it's really hard to trust the outputs."

（该用户是同赛道创业者，其产品的卖点就是"可以把结果回溯到生成它的 SQL"——**信任问题的商业解法就是溯源，与本文 F7 的防线一致。**）

**6. HN 用户 `brhkim`，2026-02-27，帖子 "Show HN: DAAF – Reproducible AI-assisted data analysis for researchers"**
> "LLM-based research assistants will never be perfect and can never be trusted"

（这是一个**专门为研究者做 AI 辅助数据分析的开源框架**，其设计前提就是"永远不可信"，因而把可复现性、可审计性、专家人工验证作为骨架。**同赛道已有人把"不可信"当作产品第一性原理——这是形态上的重要参照。**）

**7. HN 用户 `Aurornis`，2026-01-22，帖子 "GPTZero finds 100 new hallucinations in NeurIPS 2025 accepted papers"**
> 警告这是一条"slippery slope"：允许模型处理引用，就会滑向信任它做数据解读，而后者会产出 "hallucinated results and statistics"。

**8. 掘金用户 `众人皆醒我独醉`，2026-07-29**
> "你用 ChatGPT 查了一个技术参数——它给了你一个很明确的数字。你用到配置里——炸了。回来一查官方文档——那数字根本不存在。AI 编的。"
> 来源：https://juejin.cn/post/7667498918424985635

（虽然场景是技术参数不是统计量，但**"它给了你一个很明确的数字"这个描述精确刻画了 F7 的用户体验**：编造的数字不是模糊的，是格外具体、格外确定的。）

**9. HN 用户 `annzabelle`，2026-08-04，帖子 "LLMs reward expertise"**——正面原声
> "Claude Code absolutely amazing for...data cleaning/analysis/visualization tasks"

（**必须并列展示的一条**。同一批 HN 用户里，抱怨的是"端到端自动分析不可信"，赞美的是"数据清洗/分析/可视化"这些**有人在旁边看着的**具体任务。这条差异就是产品形态的分界线。）

**10. 专家结论（Ordak 2023，Healthcare (Basel)）**
> "At a time when there is a lower level of statistical analysis being conducted, we should have limited confidence in the advice provided by ChatGPT related to conducting statistical analyses."

**11. 中文侧二手片段**（经 DuckDuckGo 索引到腾讯云文档，**原页未直取，置信度 low**）
> "它不能做的：处理超大数据、做复杂的统计分析、替代专业工具"

---

## 八 · (a) 嘴上说 / (b) 实际卡住 / (c) 掏钱买 的三层分离

本节是供给侧证据能支撑的部分推论，需求侧数据由其它调研节补齐。

- **(a) 用户嘴上说要什么**：中文侧的营销与提问高频词是"一句话出分析"、"30 分钟出问卷论文并自动做 SPSS 分析"、"替代 SPSS"（多个 SEO 内容页，如 papernex.cn、chatspss.cn，均为**商业推广页而非用户原声，可信度低**）。
- **(b) 用户实际卡在哪**：证据指向三点——
  ① **不知道该用哪个检验**（StatQA 人类开卷 34–53%，这就是我们用户的真实水位）；
  ② **看不懂输出**（中文侧反复出现"结果解释晦涩"）；
  ③ **不知道跑出来的东西对不对**（HN 五条原声全部围绕这一点）。
  **注意 ① 和 ② 模型已经能解决，③ 模型解决不了——③ 才是工程投入应该去的地方。**
- **(c) 用户最后掏钱买了什么**：本节未取得可靠的付费行为数据（**未核实**）。唯一的间接信号是同赛道的两个产品形态：Definite.app 卖的是"可以把结果回溯到 SQL"（溯源），DAAF 卖的是"可复现 + 可审计 + 专家验证"（不可信前提下的流程）。**两者卖的都不是"分析能力"，是"可验证性"。**

---

## 九 · 我们不该做的（砍需求）

1. **不要做"统计方法选择规则引擎"来替代模型。** StatQA 的数字直接证伪了这条路的价值：模型 64.83% > 有统计背景的人开卷 53.45%。规则引擎只会把水位往下拉，还带来巨大的维护负担。**规则引擎应该只做"前提检验"和"事后一致性硬拦"，不做"选择"。**
2. **不要做全自动端到端分析报告。** DABstep hard 档 14.55%→45.24%（一年，且是最强架构）；DSBench 34.12%；DiscoveryBench 25%；ScienceAgentBench 32.4%。**没有任何一个真实开放式分析基准的成功率超过 50%。** 用户拿到一份"看起来完整、实际半错"的报告，比拿不到报告更糟——这正是 ThePhysicist 说的 "convincing looking results ... completely wrong"。
3. **不要承诺"替代 SPSS/统计学家"。** 这是中文 SEO 页在打的口号，但它把产品放到一个必然被证伪的位置上：Elsevier 政策原文明确写着 AI"must never be used as a substitute for human critical thinking, expertise and evaluation"。
4. **不要做"AI 帮你把 p 值调到显著"或任何 p-hacking 便利功能。** 不用讨论。
5. **不要生成任何原始研究图像。** Elsevier 与 Springer Nature 双红线（显微镜/western blot/影像/图形摘要）。数据可视化允许、原始图像绝对禁止，两者在产品里必须有明确的界限，不能混在一个"生成图片"的入口里。
6. **不要在报告里让模型自由书写数字。** 见 F7。这不是"加个校验"，这是**架构约束**：模型只写骨架，数字由模板从执行产物填入。
7. **不要靠"降低温度"来解决可复现性。** arXiv:2602.14349 实测温度 0 仍会得出不同结论。真解法是产出脚本 + 固定种子。
8. **不要让模型自己决定"要不要向用户提问"。** Ambig-DS 证明它做不到（要么过度问、要么静默默认）。用确定性触发器。
9. **不要建"AI 是否使用"的隐藏/规避功能。** 政策方向是披露而非禁止，帮用户规避披露是纯负资产。
10. **不要为「多重比较自动校正」建复杂的智能判断。** 它是纯记账问题：本次会话跑了几个检验、用户引用了几个 p 值。用代码数，不问模型。
11. **暂不投入"研究级统计"（生存分析的复杂设定、层次贝叶斯、因果识别策略选择）。** StatEval 显示研究级推理是明确短板；CausalGame 显示因果推理只有 5–7% 的会话拿到分。这些场景应该**主动拒答并建议找统计学家**，而不是硬做。**"知道自己不该做什么"本身可以做成卖点。**

---

## 十 · 存疑 / 未核实

1. **Reddit 与 CrossValidated 完全未取到。** 本环境对 reddit.com / old.reddit.com / stats.stackexchange.com 均返回拒绝，r.jina.ai 代理也被 Reddit 403。**r/AskStatistics、r/PhD、r/GradSchool、r/bioinformatics 的原声全部缺失**，这是本节最大的取样缺口。英文原声因此过度集中于 Hacker News（偏技术从业者，不是目标用户"写论文的研究生"）。
2. **中文原声质量偏低。** DuckDuckGo 的中文索引里几乎全是 SEO 内容农场（papernex.cn / chatspss.cn / CSDN 推广文），真实用户吐槽极难取到。小红书、知乎正文、丁香园、小木虫、经管之家均未能直取。**唯一一条可用的中文 verbatim 是掘金那条，且场景是技术参数而非统计量。**
3. **PowerGPT 的 "99.3% vs 88.9%" 究竟是准确率还是完成率未核实**（摘要措辞与二次取数解读冲突）。样本量估计 94.1% vs 55.4% 明确是准确率。
4. **Cureus 2026-06-29 那篇的模型清单不自洽**：标题写六个模型（ChatGPT/Claude/DeepSeek/Gemini/Grok/Le Chat），结果里却出现了 Microsoft Copilot（第七个）。正文 PDF 未取到，**逐模型数字置信度 medium**。
5. **Yanai & Lercher 2020 "大猩猩实验"的确切人数与比例未取到**（Springer/BMC 全部走 IdP 重定向）。本文只用了 LLM 版复现（chiraaggohel 博客 + HN 讨论），未引用原始人类实验的数字。
6. **未找到直接测量"LLM 是否主动做多重比较校正"的专项 benchmark。** F12 的数字是间接的。
7. **JAMA 对研究类稿件中 AI 做数据分析的具体条款未找到**；只确认了观点类稿件的禁令。
8. **PNAS 关于期刊 AI 政策失效的研究正文 403 未读到**，仅据搜索片段。
9. **StatEval 与 VDSAgents 的逐模型/逐 baseline 数字未取到**（只有摘要级结论）。
10. **StatABench 的模型版本号（GPT-5.1 / Claude 4.5）系论文原文标注，未与厂商发布记录交叉核对。**
11. **F9（谄媚）在数据分析场景下的专项测量缺失。** 引用的三条谄媚证据都来自通用/科学问答场景，**没有一条是"用户带着假设来做数据分析"这个具体场景的实测**。这是文献里的真实空白，也意味着我们对该风险的量级判断只是外推。
12. **孤例风险**：arXiv:2602.14349（Same Prompt, Different Outcomes）和 arXiv:2602.18710（Many AI Analysts）都是 2026 年初的单篇预印本，未见独立复现。它们是本文"不可复现性"结论的主要支柱，若被推翻则第五节的优先级 6 需要下调。

---

## 附：事实核查记录

> 独立对抗性核查（2026-08-04）。方法：25 次独立取证，全部走 arXiv API / arXiv HTML 全文 /
> 期刊官方页 / 出版商政策页 / HN Algolia API 直取，**不采信二次转述**。
> 核查立场是"默认怀疑、尝试推翻"，下列 CONFIRMED 均为逐字比对论文原文表格/正文后的结论。
>
> **总体结论：20 条断言中 15 条 CONFIRMED、5 条 REFUTED（3/4/7/11/19）。**
> 关键背景：**25 条引用的 arXiv ID、日期、作者全部真实且对得上，零编造来源**——
> 这在本轮核查里是罕见的高水位。5 条 REFUTED 全部是**转录/归属/分母层面的精度错误**，
> 不是幻觉。但其中 2 条（BLADE 标签互换、StatQA 人类样本量）**直接影响架构决策**，必须改。

### 逐条结论

| # | 断言 | 结论 | 要点 |
|---|---|---|---|
| 1 | StatQA 数字 + "LLM 强于目标用户" | CONFIRMED（数字）／**推论过头** | 六个数字逐字精确，但人类基线 **n=6** |
| 2 | 错误类型分岔 | CONFIRMED | 原文 Finding 5 + Figure 6 逐字吻合 |
| 3 | StatABench | **REFUTED** | 失败归因是 **n=38 的 DeepSeek 专项子集**，非通用分布 |
| 4 | 七个端到端基准 | **REFUTED** | easy 80.56% 是 **GPT-4.1** 不是 o4-mini |
| 5 | DS-STAR 架构 | CONFIRMED | 全部逐字吻合；但"非模型"有底座混淆 |
| 6 | 封闭 vs 开放差 3 倍 | CONFIRMED | 257/52 CSV、94.9%、86.38% 全对 |
| 7 | BLADE | **REFUTED** | **精度标签互换**，结论方向被弄反 |
| 8 | 不可复现 480 次 | CONFIRMED | 逐字吻合；极端例成因是文件路径 bug |
| 9 | AI 多分析者 | CONFIRMED | 引文逐字吻合，作者/日期对 |
| 10 | Silberzahn + NARPS | CONFIRMED | 全部数字逐字精确 |
| 11 | statcheck | **REFUTED** | **分母错**：49.6% 是 16,695 篇不是 30,717 篇 |
| 12 | silent error | CONFIRMED | 定义逐字吻合；增益条件是 Best-of-N |
| 13 | 编造引用规模 | CONFIRMED | 4841/100/51~53、1/20、$0.04、91% 全对 |
| 14 | 因果推理短板 | CONFIRMED | 411/58%、30 agent/68.0%/5-7% 全对 |
| 15 | Ambig-DS 静默假定 | CONFIRMED | 112=51+61，引文逐字吻合 |
| 16 | PowerGPT | CONFIRMED | **原报告的存疑可消除：是准确率** |
| 17 | 审查比分析可靠 | CONFIRMED | 6 模型全中；但是 **n=1 论文的个案** |
| 18 | 期刊政策方向 | CONFIRMED | ICMJE/Elsevier/Springer 三家逐字吻合 |
| 19 | 谄媚 | **REFUTED** | ReCrit 数字是**方法增益**，非现象测量 |
| 20 | 用户原声 | CONFIRMED | 六条全部取到原帖；brhkim 引文被截断 |

### 五条 REFUTED 的取证细节

**#3 StatABench 失败归因**——论文 Table 10 的 19/10/9（50%/26%/24%）来自
"**38 个 DeepSeek-V3 失败但 Qwen2.5-72B 成功**"的对比子集，原文自述
"dominance of selection and compliance errors (76%) suggests the rigid baseline framework
restricts DeepSeek's potential in tool invocation"——即这是**特定弱模型在刚性框架下的归因**，
不能读成 StatABench 的通用失败分布。（模型分数 68.6/66.3/60.6/57.4/43.3 与 61.86 均属实。）

**#4 DABstep easy 归属**——原文 Table 1：easy 最佳 **80.56% 是 GPT-4.1**；
o4-mini 拿的是 hard 最佳 14.55%，其自身 easy 为 **76.39%**（原文："o4-mini reaches 76.39%
accuracy"）。另 IDA-Bench 实际投稿日为 **2025-05-23**（arXiv 2505），非 2025-06。
其余六个基准数字（34.12/25/32.4/21/16.9/<50）逐字精确。

**#7 BLADE 精度标签互换**——论文 Figure 4 的实际分布是：
概念变量精度 **≈60–70%**、操作化精度 <60%、**统计模型精度 <35%**。
原报告把 "<35%" 安到了"概念变量"头上。这不是小数点问题：**概念变量恰恰是模型相对最强的一维，
统计模型选择才是最弱的一维**，标签一换，"防线该建在哪"的结论直接反向。
（F1 43.9/41.7/44.8、coverage@10 <13%/<27%、专家一致性 75%/80%、EMNLP 2024 均属实。）

**#11 statcheck 分母**——原文："Across all journals and years 49.6 % of the articles
**with NHST results** contained at least one inconsistency (**8,273 of the 16,695 articles**)"。
30,717 是**下载总数**，其中仅 16,695 篇（54.4%）含可提取的 APA 格式 NHST 结果。
按 30,717 做分母会把该比例讲高约一倍。另有更保守的篇级口径：
p 值层面不一致率仅 **9.7%**、严重不一致 **1.4%**（总计 258,105 个 p 值）。

**#19 ReCrit 数字性质**——38.15→51.49 是 **ReCrit 这个 RL 方法把 Qwen3.5-4B 的 critic 准确率
提上去的增益**，不是"模型在用户批评后放弃正确答案"的发生率。且底座是 4B 小模型，外推需谨慎。
（辩论式施压 2–3 倍 / 中位 50%→79%、记忆放大至多 25 倍两条属实。）

### 两条"数字对但推论过头"

**#1 StatQA 人类基线 n=6。** 原文："We recruit **6 post-graduate students**"
（3 名统计专业 + 3 名非统计 STEM），题目为 mini-StatQA 分层抽样 **117 题**。
53.45/23.28/34.48/18.10 四个数逐字精确，但**建立在 6 名研究生身上**。
用它支撑"LLM 明确强于目标用户 → 所以不该建规则引擎"是**在 n=6 上做架构决策**。

**#5 DS-STAR 的"非模型"。** 14.55%（o4-mini）→45.24%（DS-STAR）之间
**底座模型也换了**——DS-STAR 原文"runs for a maximum of 20 rounds per task
with **Gemini-2.5-Pro** as the base LLM"。架构与底座同时变化，
"提升来自架构而非模型"需要论文内的消融来支撑，不能由这两个数直接推出。

### 其他精度备注（不改结论）

- **#8** 设计非完整析因：GPT-5-mini 只跑默认温度（40 次而非 80 次）。
  且 Gemini Flash 3 "多步 0%" 的成因是 **Step 2 文件路径处理错误**
  （原文："every execution fails at Step 2 due to incorrect file path handling"）——
  是工程 bug，不是统计不稳定，当"不可复现"的极端例引用会误导。
- **#12** +11.28% / +7.21% 的取得条件是 **Best-of-N 推理**，非裸模型直出。
- **#13** GPTZero 正文写 "51 NeurIPS papers"、表格为 53，原报告的"51–53"区间处理是诚实的。
- **#16** 原报告第十节存疑 3 **可以划掉**：99.3% vs 88.9%（检验选择）与
  94.1% vs 55.4%（样本量估计）在 arXiv 摘要中**同为准确率**。
- **#17** 该文是**单作者（Domonkos Varga）对单篇手势识别论文的个案研究**，
  作者自述结论 not definitive。作为"执行 agent + 审查 agent"架构的实证依据**偏薄**。
- **#20** mritchie712 系 **definite.app 创始人**（评论中自挂链接），
  属**同赛道厂商自述**，引用时应标注利益相关；该评论日期为 **2024-05-19**，
  是全部六条原声中最早的一条。

