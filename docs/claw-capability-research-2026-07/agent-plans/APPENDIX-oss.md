# 附录 · 开源选型调研原文

## 统计 · 可嵌入库
# 统计分析工作台开源资产调研报告(2026-07)

> 调研方式:20+ 次联网检索/一手页面核查(packages.debian.org、GitHub、PyPI、官方文档),逐项核实 license / 语言形态 / 维护状态。结论服务于 claw「统计分析」重能力设计(docs/claw-capability-research-2026-07/designs/01-stat-lab.md 的加深),约束:Debian trixie / Python 3.13 / bwrap 断网 jail / 闭源商用镜像分发。

## 一、三个特别问题的直接回答

### ① MVP 最优依赖组合

**apt 层(零 vendor 成本,全部实测存在于 trixie)**:
- `python3-statsmodels` 0.14.4(BSD-3)— 引擎核心
- `python3-sklearn` 1.4.2(BSD-3)— 聚类/降维 + EFA 的 GPL 规避方案
- `python3-pyreadstat` 1.2.8(Apache-2.0)— SPSS/.sav 数据入口(医学差异化)
- `python3-seaborn` 0.13.2(BSD-3)— 统计图形层

**vendor wheel 层(全 MIT、纯 Python,进 /opt + PYTHONPATH,断网可用,复刻 pandoc vendor 先例)**:
- `tableone` 0.9.6(2026-02 发版,MIT)— 医学 Table 1 确定性引擎
- `scikit-posthocs`(MIT,LICENSE 已核原文)— 事后多重比较
- `statannotations` 0.7.2(MIT)— 图上显著性标线(须 jail smoke test,见③)
- `lifelines` 0.30.3(MIT)+ 依赖链 autograd/autograd-gamma/formulaic — 生存分析
- P1 追加:`semopy`(MIT,SEM/CFA)、`great-tables`(MIT,HTML 报告表)、`reliabiliPy`(MIT,ω 信度,建议拷源码进自有资产)

**明确排除**:`pingouin`(**GPL-3.0-only**,官方 FAQ 自述因移植 R 代码而选 GPL)、`factor_analyzer`(**GPL-2.0**,ETS)。二者功能全部可由 BSD/MIT 栈 + 自写效应量公式(~200 行)+ sklearn FactorAnalysis(varimax)覆盖。统计公式不受版权保护,自实现无风险;引擎代码 import GPL 包会形成派生争议,不值得。

### ② R 车道:值得开,定位 P1「医学可信度车道」

packages.debian.org 逐包实测(trixie):

| 包 | 有无 | 版本 | 说明 |
|---|---|---|---|
| r-base / r-base-core | ✅ | 4.5.0-3(core 装后 45MB)| 附 r-recommended(survival/MASS/nlme 等)|
| **r-cran-metafor** | ✅ | 4.8-0-1(5.7MB)| **meta 分析金标准,系统综述能力直接复用** |
| r-cran-pwr | ✅ | 1.3-0 | 样本量/功效(Cohen 体系)|
| r-cran-car | ✅ | 3.1-3 | Type-III ANOVA(对齐 SPSS 默认)|
| r-cran-emmeans | ✅ | 1.10.7 | 事后边际均值(审稿人语言)|
| r-cran-lme4 | ✅ | 1.1-37 | 混合效应模型 |
| r-cran-survminer | ✅ | 0.5.0 | **出版级 KM 曲线 + risk table(ggplot2 全套连带)** |
| r-cran-broom | ✅ | 1.0.7 | 模型结果 tidy → JSON 桥回 Python |
| r-cran-gtsummary | ❌ | — | 无;Table1 用 Python tableone 补 |
| r-cran-tableone | ❌ | — | 无;同上 |
| r-cran-meta | ❌ | — | 无;metafor 单包足够 |
| r-cran-effectsize | ❌ | — | 无;效应量自写 |

**判断**:体积代价 ~350-450MB(含依赖),收益三条硬的——(a) metafor 是医学 meta 分析事实标准且 Python 无合格对等物(PythonMeta 弱且 GPL),这条同时是「系统综述」能力的刚需,一次投入两能力摊销;(b) car/emmeans 让输出与 SPSS/SAS 口径对齐,是「审稿人认」的核心;(c) survminer 的 KM 图明显优于 lifelines 出图。**架构上零新范式**:引擎模板生成 R 脚本 → Rscript 子进程 → broom/jsonlite 落 JSON 回 Python,与既有「生成代码→jail 执行→产物落 cwd」完全同构。GPL 合规:Rscript 子进程 + 镜像聚合分发是业界公认安全形态(附 license 清单即可),与 Python 进程内 import GPL 包性质不同。风险:R 启动需 /usr/lib/R、/etc/R 进 bwrap bind(有 /etc 三 bind 的先例),必须 jail smoke test。**建议:MVP 纯 Python 先行,R 车道随「系统综述 metafor」需求一并开通(P1)。**

### ③ tableone + statannotations「论文级交付」可用性

- **tableone(Python 版)**:强烈可用。MIT、纯 Python、0.9.6 发布于 2026-02(活跃),MIT-LCP/PhysioNet 出品有 JAMIA 论文背书。自动 mean±SD vs median[IQR] 选择、分组检验、SMD、缺失值报告,导出 CSV/HTML/LaTeX。它就是 Table 1 的「确定性引擎」,直接对标 R gtsummary 的核心场景。注意把 tabulate(MIT)一并 vendor,中文列名在 LaTeX 车道需实测。
- **statannotations**:可用但带一个必须实测的坑。MIT、纯 Python,但最新 0.7.2 停在 2024-03,官方只声明 seaborn 0.12+ 兼容,**未官宣 0.13**,而 apt seaborn 是 0.13.2 → 进镜像前必须 bwrap jail 内跑双样本箱线+标星 smoke test;若不兼容,备选 = pin seaborn 或自写 ~150 行 matplotlib 标线器(API 仿它,风格一致)。这层是「图能不能直接进论文」的分水岭,值得花这一小时验证。

## 二、逐库核查明细(license / 形态 / 维护)

| 库 | License | 形态 | 维护状态 | 处置 |
|---|---|---|---|---|
| statsmodels | BSD-3 | C 扩展(apt 解决)| 0.14.6,dev 页 2026-01 更新 | apt 0.14.4 |
| pingouin | **GPL-3.0-only** | 纯 py | 活跃 | **排除**,功能自实现 |
| tableone | MIT | 纯 py | 0.9.6 @2026-02 | vendor |
| scikit-posthocs | MIT(LICENSE 原文已核)| 纯 py | 活跃 | vendor |
| statannotations | MIT | 纯 py | 0.7.2 @2024-03,放缓 | vendor + jail 实测 |
| lifelines | MIT | 纯 py | 0.30.3,低速维护 | vendor(带依赖链)|
| factor_analyzer | **GPL-2.0** | 纯 py | ETS 维护 | **排除**,sklearn 替代 |
| semopy | MIT | 纯 py | 2.3.11,学术团队 | P1 vendor |
| reliabiliPy | MIT | 单文件 | 个人项目 | 拷源码进自有资产 |
| great-tables | MIT | 纯 py | Posit 活跃 | P1 vendor(HTML 车道)|
| researchpy | 未核实 | 纯 py | 低活跃 | 仅借鉴输出形态 |
| pyreadstat | Apache-2.0 | C 扩展(apt)| Roche | apt 1.2.8 |

## 三、知识资产(仅借鉴设计,零代码引入)

1. **jamovi 的 .a.yaml 声明式分析定义**(GPL≥2):「一个分析 = name + options schema + 输出表结构」的声明式 spec 设计,是我们 **AnalysisSpec JSON 契约**(仿 scidraw 配方 JSON)的最佳蓝本。JASP(GPL-2/AGPL-3,模块=R 包+QML)同理印证该范式。
2. **统计检验决策树**:statsflowchart.co.uk(含 R/SPSS 链接)、valentin-schwind statistics-decision-tree(开源交互树)、pleonova/stat-tests(30+ 节点)。决策逻辑属统计学事实不受版权保护 → 固化成自有 **decision-tree.yaml + 确定性走树引擎**,LLM 只负责 AskUserQuestion 问诊取值,不负责选检验。
3. **SPSS 翻译层**:R for SPSS Users(r-statistics.co)的过程级映射(FREQUENCIES→…, GLM→…)自写成中文 spss_mapping.yaml,服务「SPSS 用户说 SPSS 话」的问诊体验。
4. **APA 文案**:Python 无成熟 APA 结果文案库(所谓 py-apa-style 不可信);借鉴 R easystats/report(GPL-3,仅借鉴)的模板化思路,自建中英双语 apa_text.py 确定性模板(每类检验 1-2 个模板,总量可控)。

## 四、与重工程范式的对接点

- **确定性引擎**:decision-tree.yaml 走树引擎 + AnalysisSpec JSON 契约 + apa_text.py 文案模板 + tableone/statannotations 出表出图 = 对标 boltslides 的 deck 引擎地位;LLM 只做问诊与解读,不做方法选择与数值计算。
- **数据源命名合规**:统计能力本身不触 minicod,但与系统综述共用的 metafor 车道产出(森林图/漏斗图)如引用检索数据,只能标 Graph/Discovery/Medicine。
- **验证铁律**:每个新包(尤其 statannotations、R 全家)必须 bwrap jail 内 smoke test,裸 docker exec 全绿不算数。

## 主要来源
- pingouin GPL-3 官方自述: https://pingouin-stats.org/faq.html · https://github.com/raphaelvallat/pingouin
- tableone: https://github.com/tompollard/tableone · https://pypi.org/project/tableone/ · 论文 https://pmc.ncbi.nlm.nih.gov/articles/PMC6951995/
- statannotations: https://github.com/trevismd/statannotations/releases
- scikit-posthocs: https://github.com/maximtrp/scikit-posthocs/blob/master/LICENSE
- lifelines: https://github.com/CamDavidsonPilon/lifelines · https://snyk.io/advisor/python/lifelines
- semopy: https://libraries.io/pypi/semopy · https://arxiv.org/abs/1905.09376
- reliabiliPy: https://github.com/rafaelvalero/reliabiliPy
- great-tables: https://github.com/posit-dev/great-tables
- statsmodels: https://www.statsmodels.org/stable/index.html
- Debian trixie 实测: https://packages.debian.org/trixie/r-base · /r-base-core · /r-cran-metafor · /r-cran-pwr · /r-cran-car · /r-cran-emmeans · /r-cran-lme4 · /r-cran-survminer · /r-cran-broom · /python3-seaborn(gtsummary/tableone/meta/effectsize/lifelines/pingouin 均查无)
- jamovi 声明式 spec: https://docs.jamovi.org/_pages/api_analysis-definition.html · JASP 模块: https://github.com/jasp-stats/jasp-desktop/blob/development/Docs/development/jasp-module-structure.md
- 决策树: https://www.statsflowchart.co.uk/ · https://valentin-schwind.github.io/statistics-decision-tree/ · https://github.com/pleonova/stat-tests
- SPSS 对照: https://r-statistics.co/R-for-SPSS-Users.html · APA 设计蓝本: https://easystats.github.io/report/
- researchpy: https://researchpy.readthedocs.io/

---

## 统计 · agent 项目与论文
# 「数据分析/统计 agent 化」开源项目与论文调研报告(供 01-stat-lab 设计加深)

> 调研方式:22 次联网检索/页面深抓,覆盖任务指定的全部必查项(DataInterpreter / Open Interpreter / pandas-ai / LIDA / DS-Agent / AutoGen / InsightPilot / Devin / 2024-2026 统计 agent 论文 / MSTATA / StatRyx),另补查了 AIDE、Google Colab Data Science Agent、Data Formulator、Tea/Tisane、StatQA、StatABench、StatLLM、BLADE、InfiAgent-DABench、CodeAct、PCS Sanity Checks 等强相关项。所有结论均附来源 URL。

---

## 一、必查项目逐个体检

### 1. MetaGPT DataInterpreter(MIT,69.5k stars,活跃)
本轮调研含金量最高的工程范本。架构细节(来自论文 [arXiv:2402.18679](https://arxiv.org/html/2402.18679v1) 与 [仓库](https://github.com/FoundationAgents/MetaGPT)):
- **两级 DAG 计划**:task graph(任务分解)+ action graph(代码执行);失败或人工改动后用「拓扑排序 + 前缀匹配」只重算受影响的下游节点,不整体重跑。
- **失败处理分级**:runtime error → 有限次 self-debug;debug 不动 → 升级为**改计划**(重新生成受影响子图),而非死磕同一段代码。
- **结果验证 ACV(Automated Confidence-based Verification)**:针对「跑通了但逻辑错」——独立生成一段*验证代码*模拟任务预期行为,执行后打置信分(True=1.0/False=0.2/其他=0.5),多次 trial 按均值置信度选终答;优于简单多数投票。
- **经验库**:存任务描述+终版代码+答案,检索复用;经验池 0→200 条时,平均 debug 次数从 1.48 → 0.32。
- **消融数字**:裸代码执行 0.37 → 加动态计划 0.85(+0.48)→ 加工具 0.94(+0.09)。**结构化计划的贡献远大于工具**——这是「重工程方案优于裸提示词」的最硬定量证据。

### 2. Open Interpreter(AGPL-3.0,50k+ stars)
经典「request → 生成代码 → 本地执行 → 观察 → 迭代」循环 + 执行前人工确认([GitHub](https://github.com/OpenInterpreter)、[综述](https://obot.ai/resources/learning-center/open-interpreter/))。**AGPL-3.0,禁止代码级引入**(闭源商用随镜像分发会触发传染);其循环本身我们的 Claude Code 底座已天然具备,只借鉴其「执行前确认」UX(我们已有 permission 机制)。

### 3. pandas-ai(MIT,~20k stars,活跃)
三个可搬设计([GitHub](https://github.com/sinaptik-ai/pandas-ai)、[Docs](https://docs.pandas-ai.com/v3/agent)):① **只送 schema + 随机化的 df.head 给 LLM**(敏感列可只送列名,enforce_privacy),全量数据永不进上下文——与我们已拍板的 FetchCorpus「数据不过模型上下文」同构;② 语义层(列的业务含义描述)提升代码生成正确率;③ 独立 Docker 沙箱执行(可离线)。框架本身不引入(v3 迭代快、API 不稳)。

### 4. Microsoft LIDA(MIT,MSR 出品,维护放缓)
四模块流水线([论文](https://arxiv.org/abs/2303.02927)、[官网](https://microsoft.github.io/lida/)):SUMMARIZER(把数据压成紧凑 NL 摘要,作为后续一切生成的**唯一接地上下文**)→ GOAL EXPLORER(JSON 结构化的探索目标:question/viz/rationale)→ VISGENERATOR(scaffold 构造器 + 生成器 + 执行器,含**生成-评估-修复-过滤**四段)→ INFOGRAPHER。可搬:数据摘要接地 + 「目标即 JSON」+ 生成后自动修复/过滤。

### 5. DS-Agent(ICML'24,239 stars,研究代码)
CBR(案例推理)两阶段([论文](https://arxiv.org/pdf/2402.17453)、[GitHub](https://github.com/guosyjlu/DS-Agent)):开发期检索 Kaggle 人类案例库迭代;部署期用简化 CBR 直接改写过去成功方案,**大幅降低对基座模型能力的要求**(GPT-4 开发期 100% 成功率,部署期平均 one-pass +36%)。可搬:**「成功分析方案沉淀为案例库→下次同类任务直接改写」**,即我们的「分析配方缓存」。

### 6. AutoGen 数据分析范式(MIT)
官方 notebook 的标准编队:planner + coder + **executor(独立 Docker 执行)** + **critic(专职审查图表/结论)**([Group Chat with Coder and Visualization Critic](https://microsoft.github.io/autogen/0.2/docs/notebooks/agentchat_groupchat_vis/)、[Code Execution 设计模式](https://microsoft.github.io/autogen/stable/user-guide/core-user-guide/design-patterns/code-execution-groupchat.html))。启示:**「执行」与「批评」是独立角色**。但我们生产每容器 2 并发槽,不宜多 agent 编队,应把 critic 折叠为**同会话内的确定性 checklist 阶段**(引擎跑检查而非再开一个 LLM)。

### 7. InsightPilot(Microsoft,EMNLP'23 demo,未开源)
对我们最重要的**结构性先例**([论文](https://aclanthology.org/2023.emnlp-demo.31/)、[MSR页](https://www.microsoft.com/en-us/research/publication/insightpilot-an-llm-empowered-automated-data-exploration-system/)):洞察由**确定性 insight engine** 执行 IQuery 产生,LLM 只负责「选哪个洞察、下一步查什么、怎么串成叙事」——论文明说这是为了**给 LLM 喂准确洞察以避免幻觉 + 用紧凑抽象降 token 成本**。这就是「声明式 spec + 确定性执行器」路线在微软的落地版,直接背书我们的 StatEngine 设计。

### 8. Devin 类通用 agent 对数据任务
实测口碑:早期独立评测 20 任务仅完成 3 个;SWE-bench 13.86%;>10 ACU 后性能退化;擅长「前置需求清晰 + 结果可验证」任务,坏于模糊需求和中途改需求([Qubika 评测](https://qubika.com/blog/devin-ai-coding-agent/)、[Cognition 官方年度复盘](https://cognition.ai/blog/devin-annual-performance-review-2025)、[任务分层 PR 接受率研究](https://arxiv.org/html/2602.08915v1))。结论:**通用自治 agent 直接做统计分析不可靠,佐证必须上领域引擎 + 分步问诊(我们已有 AskUserQuestion)把需求前置澄清**。

### 9. 闭源产品对标:MSTATA 与 StatRyx
- **MSTATA**([官网](https://mstata.com/)):国内医学统计 AI 龙头(自述 1200+ SCI);产品形态=按研究设计选方法→一键出表出图→按杂志格式出 Word 报告→论文草稿。**关键动作:支持导出 R 源码以自证可追溯/可复现**——说明「黑箱不可复现」正是该品类被审稿人和用户质疑的核心痛点,厂商被迫用「导出代码」回应。公开渠道未检索到成规模差评帖(内容生态被官方教程占据),但其「导出代码自证」本身就是市场对黑箱焦虑的证据。
- **StatRyx**([官网](https://statryx.ai/)):浏览器端上传 CSV/Excel/**SPSS 文件**→自动选检验→输出 **APA 7 格式结果(精确 p 值 + 效应量 + 置信区间)+ 白话解读**。弱点自述「比老牌软件新」(信任积累不足)。可搬产品点:**效应量与 CI 默认带出、期刊格式化输出、SPSS 文件直读**(我们容器可 apt 装 pyreadstat)。

---

## 二、问题①:「计划-执行-自检」循环 / 沙箱重试 / 结果验证——谁的设计值得搬

综合 DataInterpreter、AIDE([arXiv:2502.13138](https://arxiv.org/abs/2502.13138),树搜索:节点=完整方案、metric 驱动扩展,MLE-bench 系 SOTA)、LIDA、AutoGen、Google Colab Data Science Agent([官方博客](https://developers.googleblog.com/en/data-science-agent-in-colab-with-gemini/),产物=可执行可改的完整 notebook,计划可视化可编辑)、PCS Sanity Checks、AIRepr([arXiv:2502.16395](https://arxiv.org/pdf/2502.16395),analyst–inspector 双角色验证可复现性),**值得搬进 01-stat-lab 的 8 条机制**:

1. **任务级 DAG + 局部重算**(DataInterpreter):分析计划显式为阶段 DAG(画像→清洗→前提检验→主分析→敏感性→报告);某步失败只重算下游。落地:StatEngine 的 pipeline 状态机,正好对齐我们 24 工具轮预算。
2. **失败分级**:代码错→有限次 self-debug(建议 ≤2,防烧 token);再败→**改 spec/改计划**而非重试同代码;最终败→AskUserQuestion 找用户。
3. **验证代码与实现代码分离**(ACV):对关键数值结论,由引擎跑独立校核(如:t 检验结果用非参数对照跑一遍、回归系数用另一参数化复核),不靠 LLM 自评——因为 **agent 自报置信度与结论稳定性校准很差**(PCS 论文实测)。
4. **扰动稳定性自检**(PCS Sanity Checks,[arXiv:2604.11003](https://arxiv.org/abs/2604.11003)):用合理扰动(标签置换/bootstrap 重抽/噪声注入)重跑,检验结论是否翻转——11 个真实数据集里 **6 个的单次肯定结论经不起扰动**。这必须做成 StatEngine 的**确定性内建步骤**(纯计算,不费 LLM token),报告中输出「稳定性」栏。
5. **摘要接地**(LIDA SUMMARIZER + pandas-ai):LLM 永远只见 schema + 统计画像 + 脱敏 head,全量数据只在 jail 内流动。
6. **经验/配方库**(DataInterpreter 经验池 + DS-Agent CBR):成功的 AnalysisSpec + 产出脚本按「设计类型×数据形态」入库,同类任务先检索改写(debug 次数可降 ~4 倍)。
7. **产物=可复现脚本**(Google DS Agent 的 notebook 交付形态 + MSTATA 的 R 导出):每次分析落 `./out/analysis.py` + 环境版本清单,既是防黑箱卖点也是审稿人刚需。
8. **critic 折叠为确定性 checklist**(改造 AutoGen 编队):在 2 并发槽约束下,不上多 agent;把「批评者」做成引擎的规则检查(前提、多重比较、效应量缺失、图表规范)。

---

## 三、问题②:LLM 做统计的实证错误模式 → 「引擎守门」层设计

### 实证错误模式(按证据强度排列)

| 错误模式 | 实证 | 来源 |
|---|---|---|
| **适用性错误是 LLM 的主错型**:选了「名字对但前提不满足」的方法(正态性/方差齐性/样本量/期望频数没查);与人类相反(人类主要犯任务混淆) | StatQA 11,623 题,GPT-4o 最好也只有 **64.83%**;LLM 犯 applicability errors,人类犯 task confusion errors | [StatQA, NeurIPS'24](https://arxiv.org/abs/2406.07815) / [官网](https://statqa.github.io/) |
| **给了统一统计工具仍然错**:74% 的失败是统计错误(50% 选错/漏调工具,24% 结果解读错),仅 26% 是工程错误 | StatABench:35 函数 SAToolKit + 4 框架(CrewAI 把 DeepSeek-V3 从 53.54%→85.35%,但「框架重标定差距、不消除差距」) | [StatABench](https://arxiv.org/html/2606.22977) |
| **简单检验选得准、复杂模型崩**:20 个教科书场景 6 个 LLM 选择 100% 对,但推理解释质量 3.16–4.66/5,泊松回归等高阶方法最差;27 案例 pilot 中 ChatGPT3.5 一致率仅 85.19% | 两项医学界评测 | [6-LLM 研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC12627256/) / [pilot](https://pmc.ncbi.nlm.nih.gov/articles/PMC11584160/) |
| **代码质量/可执行性系统性缺口**(SAS/R):正确性、可执行性、输出准确性三维人工评分均有硬差距 | StatLLM 207 任务 × 3 模型 | [StatLLM](https://arxiv.org/abs/2502.17657) |
| **幻觉数字**:文献引用编造率 GPT-3.5 55%/GPT-4 18%;医学参考值幻觉率 50–82% | 多项医学评测 | [引用编造](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10484980/) / [Mount Sinai](https://thelimbic.com/chatgpt-and-rivals-prone-to-dangerous-medical-hallucinations/) |
| **单次运行结论不稳 + 自信错觉**:6/11 数据集的肯定结论经扰动不成立;自报置信度与稳定性脱钩 | PCS Sanity Checks(Codex 实测) | [arXiv:2604.11003](https://arxiv.org/abs/2604.11003) |
| **分析决策多歧(forking paths)**:变量选择/变换/模型设定的开放决策,最好模型 F1 仅 ~40% | BLADE 12 数据集专家 ground truth | [BLADE, EMNLP'24](https://arxiv.org/abs/2408.09667) |

### 由此推出的七道「引擎守门」防线(直接写进 01-stat-lab)

1. **Spec schema 硬校验**:AnalysisSpec(JSON)声明 设计类型/变量角色与测量水平/配对结构/假设方向——非法组合在 schema 层拒绝,不进 LLM。
2. **前提实测,不问 LLM**:引擎在真数据上自动跑 Shapiro-Wilk/Levene/期望频数/缺失模式/样本量,结果写进机器可读的「数据画像」。这是针对 StatQA「适用性错误」的正面解:**LLM 最常犯的错,恰是最容易确定性化的部分**。
3. **检验选择约束表(Tea 式)**:借鉴 [Tea](https://tea-lang.org/)([UIST'19 论文](https://arxiv.org/abs/1904.05387v1),Apache-2.0)把「设计×变量类型×实测前提 → 合法检验集」编译为约束求解/决策表;LLM 只能在**白名单**内选(或引擎自动定 + 给出非参数备胎)。对应 StatABench「50% 选错工具」。
4. **数字零转写**:报告一切数值由引擎 JSON 结果**模板插值**回填,LLM 只写定性叙述;后处理器扫描报告中的数字与结果表 diff,发现无源数字即拦截(对应幻觉数字证据)。
5. **稳定性/敏感性内建**:关键结论自动附 bootstrap CI + 扰动重跑翻转检验(PCS),报告出「稳健性」栏。
6. **多重比较与 p-hacking 闸**:引擎统计本会话累计检验次数,自动提示/执行 FDR/Bonferroni;探索性 vs 验证性分析在 spec 里显式分流(对应 BLADE 的 forking paths)。
7. **可复现交付**:产物含可执行脚本 + 包版本清单 + spec 原文,对标 MSTATA「导出 R 码自证」;这同时是商业卖点。

---

## 四、问题③:「声明式 spec + 确定性执行器」 vs 「LLM 自由写代码」——证据与取舍

**自由代码路线的证据**:[CodeAct(ICML'24)](https://arxiv.org/abs/2402.01030) 证明代码动作比 JSON 工具调用成功率高最多 ~20pp、少 30% 步骤(可嵌套/复用/贴近预训练分布);DataInterpreter/InfiAgent(GPT-4 在 DABench 78.99%,[InfiAgent-DABench, ICML'24](https://arxiv.org/abs/2401.05507))证明自由代码对**长尾、开放式**任务覆盖面无可替代。

**声明式路线的证据**:InsightPilot(引擎产洞察防幻觉)、Tea/Tisane([Tisane, CHI'22](https://dl.acm.org/doi/10.1145/3491102.3502016):研究设计 spec → 图推理 → 候选模型 + 追问消歧,正是我们 AskUserQuestion 问诊的学术版)、[Data Formulator(MIT,0.8.0a4 更新于 2026-07)](https://github.com/microsoft/data-formulator)——「LLM 只做数据变换,图表由 Flint 编译为 Vega-Lite/ECharts 确定性渲染」,与我们 scidraw compose.ts 完全同构;StatABench 则从反面证明**光把统计封装成工具不够**(74% 仍是统计错),必须再加「选择守门」。

**关键裁决证据**:StatQA 的错误分型——LLM 的主错型(前提适用性)恰是**最可确定性化**的;而 CodeAct 的优势场景(灵活组合、长尾)恰是 spec 表达力覆盖不到的。两条路线**各覆盖对方的失效区**,不是二选一。

**拍板建议:双车道混合(与 scidraw 三车道范式同构)**
- **车道 A(声明式,默认)**:高频规范分析(组间比较/相关/χ²/回归/生存/Table 1/前后测)→ AnalysisSpec JSON + StatEngine 确定性执行(仿 BuildDeck executor 形态,进 `agent/src/tools/registry.ts`,statsmodels/lifelines 等在 jail 内跑)。质量可控、数字可溯源、天然可复现。
- **车道 B(受守门的自由代码)**:清洗、特殊变换、spec 覆盖不到的长尾建模 → LLM 写 Python,但受第三节七道防线约束(白名单库 + 沙箱 + 前提实测 + 数字审计 + 稳定性重跑)。
- **沉淀回路**:车道 B 的成功方案经守门校验后固化为新 spec 模板/配方入库(DS-Agent CBR + DataInterpreter 经验池思想),让车道 A 覆盖面随使用增长。

---

## 五、评测资产(质量评测层直接可用)

- [StatQA](https://github.com/HKUSTDial/StatQA):抽样构建「选检验守门」回归测试(license 需核查,先仅内部评测)。
- [InfiAgent-DABench](https://github.com/InfiAgent/InfiAgent):603 题 closed-form 自动判分,适合 CI。
- [BLADE](https://github.com/behavioral-data/BLADE):评「分析决策合理性」而非只评结果,补足开放式场景。
- [StatLLM](https://github.com/yili-hong/StatLLM):借其人工评分 rubric(正确性/可执行性/输出准确性)做我们的验收维度。

## 六、License 风险汇总

- **禁止引入**:Open Interpreter(AGPL-3.0)。
- **谨慎**:pingouin(GPL-3.0,官方 FAQ 明示因移植 R 包故 GPL)——仅自有服务器 SaaS 运行不构成分发、合规;**若镜像会交付第三方则不引入**,用 statsmodels+scipy 自研补齐效应量/前提检验。
- **放心用**:statsmodels/scikit-learn(BSD-3)、tableone/lifelines/scikit-posthocs/LIDA/pandas-ai/Data Formulator/MetaGPT(MIT)、Tea(Apache-2.0,但只借设计不引研究级代码)。
- **数据集类**:StatQA/InfiAgent/BLADE/StatLLM 部分未明示 license,评测内部用可,不随镜像分发。

## 主要来源

[DataInterpreter 论文](https://arxiv.org/html/2402.18679v1) · [MetaGPT](https://github.com/FoundationAgents/MetaGPT) · [Open Interpreter](https://github.com/OpenInterpreter) · [pandas-ai](https://github.com/sinaptik-ai/pandas-ai) · [LIDA](https://arxiv.org/abs/2303.02927) · [DS-Agent](https://arxiv.org/pdf/2402.17453) · [AutoGen critic 范式](https://microsoft.github.io/autogen/0.2/docs/notebooks/agentchat_groupchat_vis/) · [InsightPilot](https://aclanthology.org/2023.emnlp-demo.31/) · [Devin 复盘](https://cognition.ai/blog/devin-annual-performance-review-2025) · [AIDE](https://arxiv.org/abs/2502.13138) · [Colab DS Agent](https://developers.googleblog.com/en/data-science-agent-in-colab-with-gemini/) · [Data Formulator](https://github.com/microsoft/data-formulator) · [Tea](https://arxiv.org/abs/1904.05387v1) · [tea-lang 仓库](https://github.com/tea-lang-org/tea-lang) · [StatQA](https://arxiv.org/abs/2406.07815) · [StatABench](https://arxiv.org/html/2606.22977) · [StatLLM](https://arxiv.org/abs/2502.17657) · [PCS Sanity Checks](https://arxiv.org/abs/2604.11003) · [BLADE](https://arxiv.org/abs/2408.09667) · [InfiAgent-DABench](https://arxiv.org/abs/2401.05507) · [CodeAct](https://arxiv.org/abs/2402.01030) · [AIRepr](https://arxiv.org/pdf/2502.16395) · [6-LLM 检验选择研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC12627256/) · [pilot 研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC11584160/) · [统计与DS agent 综述](https://arxiv.org/abs/2412.14222) · [MSTATA](https://mstata.com/) · [StatRyx](https://statryx.ai/) · [statsource-mcp](https://github.com/jamie7893/statsource-mcp) · [stata-mcp](https://github.com/SepineTam/stata-mcp)

---

## 系统综述 · 可嵌入库
## 系统综述/Meta 分析工作台 — 开源资产调研(2026-07)

> 约束回顾:容器 Debian 13 trixie / Python 3.13.5,已装 numpy/pandas/matplotlib/**scipy 1.15.3**(pip 版,比 Debian 新)/openpyxl/python-docx/rdkit/weasyprint/pandoc 3.10。**statsmodels 未装、sklearn 未装**。构建期可联网(apt 阿里云 / pip / vendor),运行期 bwrap `--unshare-all` 断网。License 必须能闭源商用随镜像分发。既有设计 `docs/claw-capability-research-2026-07/designs/02-sys-review.md` 已定 feature_key=`sys_review` 五件套 + FetchCorpus executor 工具 + 四 skill,本调研在其基础上把「二期 meta 统计 / 去重 / 筛选 / PRISMA / RoB / 检索式」六块的开源选型逐一钉死。

---

### 一、直接回答三个拍板问题

#### ① Meta 统计:statsmodels 原生够不够?(vs vendor PythonMeta vs 开 R 车道)

**结论:statsmodels 原生 = MVP/P2 核心足够,主推;PythonMeta 明确弃用(GPL 污染 + 陈旧);R/metafor 车道不开(GPL + 重运行时,仅留 P3 高级场景可选)。**

- `statsmodels.stats.meta_analysis`(0.14.x 起稳定)已覆盖标准 meta 分析主干:
  - `combine_effects(effect, variance, method_re=...)`:**固定效应 + 随机效应**;随机效应方差二法 —— `"dl"`(DerSimonian-Laird 一步)与 `"pm"/"iterated"`(Paule-Mandel 迭代);支持 **HKSJ**(Hartung-Knapp 缩放)小样本校正。
  - `effectsize_smd(...)`:连续结局标准化均差(Hedges g / Cohen d)。
  - `effectsize_2proportions(...)`:二分类结局 RR/OR/RD/风险差等效应量。
  - 返回 `CombineResults`,含 `plot_forest()`(自带森林图)、`summary_frame()`(eff/sd_eff/ci_low/ci_upp/w_fe/w_re 权重)、`conf_int()`、`test_homogeneity()`;**异质性 Q、τ²、I²** 由 `combine_effects` 内部算出并在 summary 暴露。官方明言「主要对照 R metafor 验证」。
  - 来源:https://www.statsmodels.org/stable/generated/statsmodels.stats.meta_analysis.combine_effects.html · https://www.statsmodels.org/stable/generated/statsmodels.stats.meta_analysis.CombineResults.html · https://www.statsmodels.org/stable/examples/notebooks/generated/metaanalysis1.html
- **缺口(需手写补,均为几十行确定性代码,不引第三方)**:Egger 回归检验(= 效应量对 SE 的加权最小二乘,直接用 `statsmodels.WLS`)、trim-and-fill、漏斗图(matplotlib 手绘)、含协变量的 meta-regression(`combine_effects` 不做调节变量,但 `WLS`/`GLM` 可)。这些正好落在 scidraw 已验证的「matplotlib 确定性出图 + numpy 手写统计量」手艺范围内。
- **安装路径关键坑**:容器 scipy 是 **pip 1.15.3**;若 `apt install python3-statsmodels`(Debian 0.14.2)会连带拉 Debian 的 `python3-scipy`(旧版),造成**双 scipy 并存/ABI 打架**。因此 statsmodels 应在**构建期 pip 安装 wheel**(`pip install "statsmodels==0.14.*"`,BSD-3,自带 manylinux Cython wheel,与 pip scipy 匹配),而非 apt。BSD-3 → 闭源商用随镜像分发无碍。
- **PythonMeta 弃用**:GPL-3.0 → 随闭源镜像分发即污染,红线;且 v1.26 停在 2021-11,无维护。仅其 OR/RR/RD/MD/SMD 合并公式可作教科书级参考(公式本身无版权)。来源:https://libraries.io/pypi/PythonMeta · https://snyk.io/advisor/python/pythonmeta
- **R/metafor 不开车道**:GPL(>=2);且要烧入整个 R 运行时(r-base + r-cran-metafor 4.8-0,Debian trixie 有 apt,但 +数百 MB,吃 1.5G 内存帽);子进程 arm's-length 调用虽是 GPL 边界灰区但对闭源商用有风险。**仅当 P3 真出现 statsmodels 不支持的需求(网络 meta 分析 network meta-analysis、更多 RE 估计器如 REML/EB、复杂 moderator 模型)才评估**,且宁可届时另想办法也不轻易引 GPL R。来源:https://cran.r-project.org/web/packages/metafor/ · https://packages.debian.org/sid/r-cran-metafor
- **PyMARE 不需要**:MIT(干净),但 alpha、58 stars、定位神经影像、功能明说是 metafor 的一个小子集,statsmodels 已覆盖且更成熟。仅其 REML/似然估计器实现可作参考。来源:https://github.com/neurostuff/PyMARE

#### ② ASReview 的 active learning 值不值得引入?

**结论:不引入完整 ASReview 应用(架构不匹配),借鉴其「AI 排序 + 人裁决」范式,用 apt `python3-sklearn` 自己复现主动学习排序,落进 screening-ledger skill。Apache-2.0 使其保留为「可选 vendor」后路。**

- ASReview LAB 是 **Apache-2.0**(可闭源商用分发,license 干净),Nature Machine Intelligence 验证,主动学习内核 = TF-IDF 特征 + SVM 分类器 + 最大不确定性查询,scikit-learn 驱动,有 Python 模拟 API。来源:https://github.com/asreview/asreview · https://asreview.readthedocs.io/en/latest/lab/simulation_api_example.html
- **为何不整包嵌入**:它是一个 **Flask Web 应用 + 自有项目文件格式 + 持久交互 server**,天生想当 UI/后端。我们的形态是「executor 批处理 + xlsx 台账 + 断网沙箱 + 无常驻交互服务」,整包嵌入水土不服(要拖 Flask/DB/前端一大堆),且 Python 3.10+ 依赖面重。
- **正解**:其主动学习内核极简,用 apt `python3-sklearn`(Debian trixie **1.4.2**,BSD)直接复现 —— TF-IDF + 线性 SVM/逻辑回归,按预测置信度对未裁决题录排序,「模型排序、理由标注、裁决权留用户、全程台账」写进 screening-ledger skill。离线可跑、轻量、与 xlsx 台账工作流严丝合缝,且完全承接设计文档「只建议不定论」红线。
- Apache-2.0 意味着**若后续想要它验证过的模型预设**,可安全地把 `asreview` 作为可选 pip/vendor 加进来(bib-dedupe 也仅把 asreview 当数据集依赖),但 MVP 不需要。

#### ③ 题录去重最佳纯 Python 方案

**结论:bib-dedupe(CoLRev)为主(它就是 ASySD 的纯 Python 对等物),rapidfuzz 作模糊核 + 手写 DOI 精确/标题-作者-年份分块作兜底。recordlinkage 仅通用记录链接备选。**

- **bib-dedupe(CoLRev-Environment/bib-dedupe)= 首选**:**MIT**(可闭源商用分发),**专为文献综述题录去重**打造,JOSS 2024 发表,在 **10 个数据集 16 万+ 条记录**上持续基准评测,做 entity-resolution(**链接**重复而非直接删,保留溯源,契合台账);Python **3.10–3.13**(正好覆盖容器 3.13.5),v0.11.0(2025-11)活跃维护;依赖 `rapidfuzz / pandas / numpy / number-parser / requests / tqdm` —— 全部 pip/apt 友好、其中 pandas/numpy 容器已装,number-parser 纯 Python。安装路径 = 构建期 `pip install bib-dedupe`。来源:https://joss.theoj.org/papers/10.21105/joss.06318 · https://github.com/CoLRev-Environment/bib-dedupe · https://pypi.org/pypi/bib-dedupe/json
- **rapidfuzz = 模糊匹配基石**:**MIT**,Debian trixie `python3-rapidfuzz` **3.12.2**(也是 bib-dedupe 的依赖),C++ 加速。既作 bib-dedupe 底座,也用于手写兜底(DOI 精确匹配优先 → 标题/作者/年份分块 + token_set_ratio 阈值),避免对 bib-dedupe 硬绑定(万一 minicod 字段形状喂不进 bib-dedupe 的 blocking 规则时可降级)。来源:https://packages.debian.org/trixie/python3-rapidfuzz
- **ASySD 不用但作基准参照**:R + GPL-3(不开 R 车道),但它是去重界金标准(灵敏度 0.95–0.99、特异度 >0.99),其去重规则/基准用于校验我们的 bib-dedupe/兜底效果。来源:https://github.com/camaradesuk/ASySD · https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10483700/
- **recordlinkage(J535D165)= 通用备选**:BSD-3,通用记录链接工具箱,但依赖更重(pandas/numpy/**sklearn**/scipy/jellyfish)且非题录专用;仅当需要通用去重/链接场景才 vendor。来源:https://github.com/J535D165/recordlinkage
- **dedupe-sweep(IEBH)不用**:Node.js 形态(sweep 方法),与我们 Python 去重栈不符(容器虽有 bun,但引 JS 去重链得不偿失)。来源:https://github.com/IEBH/dedupe-sweep

---

### 二、PRISMA 流程图 / RoB 偏倚可视化 / 检索式构建

- **PRISMA 图**:优先按设计文档「借 sci-draw 的 SVG 手艺手写 PRISMA 2020 SVG」。开源可借:
  - **prisma-flow(osl-incubator)**:**BSD-3**,纯 Python SVG 渲染(不依赖 Graphviz/Node),PRISMA 2020 合规布局,输出 SVG/HTML/PNG/Mermaid,依赖 `pydantic + resvg`。**风险:极不成熟(1 star,2026 新项目),resvg 是 Rust 绑定(PNG 光栅化,SVG 本身不需要它)**。定位 = 借鉴其官方 box 布局/字段模型,主推手写;若要省事可 vendor(BSD-3 安全)但需评估 resvg wheel 可得性。来源:https://pypi.org/pypi/prisma-flow/json · https://github.com/osl-incubator/prisma-flow
  - **PRISMA2020(R,nealhaddaway)**:**CC-BY 4.0**,R/Shiny(不开 R 车道),但其**官方 PRISMA 2020 SVG 模板**可署名复用,作为我们手写 SVG 的版式蓝本。来源:https://github.com/prisma-flowdiagram/PRISMA2020 · https://onlinelibrary.wiley.com/doi/full/10.1002/cl2.1230
- **RoB 偏倚可视化 robvis**:**MIT**,R/ggplot2,支持 ROB2/ROBINS-I/QUADAS-2/QUIPS 的 traffic-light 图 + summary 条形图 + Cochrane 红黄绿配色。不引 R,**借鉴其版式与配色,用 matplotlib/SVG 手绘**(与 scidraw 确定性出图一致)。RoB 判定本身由 agent LLM 辅助 + 用户裁决(不引重 ML)。来源:https://github.com/mcguinlu/robvis
- **RobotReviewer 拒绝**:GPL-3 + 需下载大 ML 模型 + **运行期断网无法加载模型** + 1.5G 内存帽,三重不可行。RoB 自动化改由 agent 内 LLM 抽取 + 用户裁决实现。来源:https://github.com/ijmarshall/robotreviewer
- **森林图**:主推 statsmodels `plot_forest()` + matplotlib 手绘(带权重方块 + 合并菱形)。**forestplot(LSYS)**:MIT、142 stars、pandas/numpy/matplotlib,但偏系数图、不原生画 meta 权重方块 + summary 菱形,仅借鉴其 API/版式,不作硬依赖。来源:https://github.com/LSYS/forestplot
- **检索式构建**:
  - **litsearchr(R,GPL-3)**:关键词共现网络法自动选词。不引 R+GPL,**借鉴其方法**,py 侧用 apt `python3-networkx` + rapidfuzz + RAKE 复现,落进 search-strategy skill。来源:https://github.com/elizagrames/litsearchr
  - **searchrefiner(ielab,MIT,Go)**:布尔检索式可视化 Web 工具,非库;借鉴其「布尔式可视化/校验命中」交互思路。来源:https://github.com/ielab/searchrefiner

---

### 三、被评估但整包拒绝的平台(仅借鉴工作流)

- **colandr(MIT,Flask 全站)** / **Buhos(Ruby/Sinatra 全站)**:都是完整 Web 平台,不能当库嵌入;借鉴其「计划→题录筛选→全文筛选→数据提取」四阶段工作流拆分。来源:https://github.com/datakind/permanent-colandr-back · https://github.com/clbustos/buhos
- **Rayyan**:无开源版,略过。

---

### 四、落地清单(承接设计文档 P0/P2)

| 环节 | 主选 | 安装 | 兜底/借鉴 |
|---|---|---|---|
| 大批量检索 | FetchCorpus executor 工具(自建,直连 minicod bulk) | 已在设计 | — |
| 题录去重 | **bib-dedupe** (MIT) | 构建期 pip | rapidfuzz 手写分块;ASySD 作基准 |
| 筛选主动学习 | **scikit-learn** 复现 AL 排序 | apt python3-sklearn 1.4.2 | 借鉴 ASReview 范式 |
| Meta 统计 | **statsmodels** 0.14.x | 构建期 pip(勿 apt,避双 scipy) | Egger/trim-fill 手写 |
| 森林/漏斗图 | statsmodels plot_forest + matplotlib | 已装 | forestplot 版式参考 |
| PRISMA 图 | 手写 SVG(借 sci-draw) | — | prisma-flow(BSD-3)可 vendor;PRISMA2020 模板 |
| RoB 图 | matplotlib/SVG 手绘 | 已装 | 借 robvis 版式/配色 |
| 检索式 | networkx 共现网络 | apt python3-networkx | 借 litsearchr/searchrefiner |

**镜像新增层(全部构建期,BSD/MIT,可闭源分发)**:`pip install statsmodels==0.14.* bib-dedupe` + `apt install python3-sklearn python3-networkx`(阿里云镜像,拆层防 OOM)。均需在 bwrap jail 内 smoke test(裸 docker exec 全绿 ≠ jail 能跑),重点验 statsmodels/bib-dedupe 的 Cython/C++ 扩展在断网 jail 内可 import。此举同时偿还 data-figures/methods-stats guide「声称有 scipy/statsmodels 但镜像未装」的既有债。

---

## 系统综述 · agentic SR 前沿
## 系统综述 Agent 化 · 前沿调研报告(2026-07)

面向:claw 重能力「系统综述/Meta 分析工作台」(feature_key=`sys_review`)的方案加深。本报告只回答三件事——**①agentic SR 的 SOTA 流程与人机分工;②筛选/提取环节 LLM 的实证准确率(写进产品必须诚实标注的数字);③官方指南对「AI 辅助 SR」的合规要求(直接定义我们的台账/审计字段)**。所有结论附来源 URL。

---

### 一、Agentic SR 的 SOTA 流程:分几段、每段人机怎么分工、我们能拿走什么

当前把「检索→去重→筛选→全文→提取→分析」六段全跑通、且有硬核实证的代表是 **otto-SR**(Cao et al., medRxiv 2025.06,多伦多/哈佛/Cochrane France/MIT/Church 实验室联署),这是我们最该逐段抄的蓝本。我把它的 manuscript.pdf 全文读了,流水线如下(来源:https://www.medrxiv.org/content/10.1101/2025.06.13.25329541v1 · https://ottosr.com/manuscript.pdf):

**otto-SR 六段拆解(每段模型 + 人机边界)**
1. **检索**:复现每篇 review 的原始检索式(exact terms + filters),受限于机构可访问库;日期粒度不足时后处理补齐。→ 我们的 `search_strategy.md` 对应。
2. **全文获取**:通过 **OpenAlex(2.4 亿 works,聚合 Crossref/MAG/DataCite/HAL/PubMed/机构库)**程序化取 PDF,取不到的走机构订阅。→ 我们对外只能叫 Graph/Discovery/Medicine,但这条印证「先元数据后 OA 全文」的分层是对的。
3. **PDF→结构化**:**Gemini 2.0 Flash** 把全文 PDF 转成结构化 **Markdown**,喂给下游。→ 印证我们「全文入模前先转 MD」的必要,且这是 otto-SR 自认的最大误差源(只取正文,不碰补充表/图,是它 6.9% 提取错误里的一部分)。
4. **摘要+全文筛选**:**GPT-4.1** 作为**独立单审(standalone reviewer)**,用原文未改动的 objectives+纳排标准提示;32,768 token 输出上限、temperature=1、full-text 用 2.5 的纳入分阈值。
5. **数据提取**:**o3-mini-high**(high reasoning、100,000 token 输出),用原作者定义的变量名+描述。
6. **Meta 分析**:**R 的 metafor 包**跑随机/固定效应,效应量含 RR/OR/率比/MD/SMD。

**人机分工的关键设计(这就是我们「AI 建议+人裁决」话术的实证靠山)**
- otto-SR 有两种运行态:**全自动** 与 **human-in-the-loop**,产品化必须是后者。
- 提取准确率不拿「原作者提取值」当金标准(因为双人提取本身准确率只有 65.8–85.5%),而是用 **LLM-as-a-judge** 先标不一致,再上**盲法裁决面板(3 名研究生独立评,第 4 人仲裁)**构造「校正金标准」。→ **这套「LLM 先筛差异、人只裁决差异点」正是我们台账该做的交互:不是让人重看全部,而是让人只裁决 AI 与某基线冲突的行。**
- 错误可解释:6.9% 提取错误里 0.83% 是模型拿不到(补充材料)、0.67% 是 PDF 解析错、0.49% 是原作者和 AI 都错。→ 我们台账的「不确定/NR/解析失败」三类标注要照此分。

**otto-SR 的实测战绩(见第二节数字)+ 一个杀手级用例**:用 otto-SR **两天复现并更新了 Cochrane 2024年4月一整期(12 篇 review)**,约等于 12 人年工作量;错误排除中位数 0 篇(IQR 0–0.25);比原作者多找到 54 篇合格研究;meta 分析里 **2 篇产生了新的统计显著结论、1 篇推翻了原显著性**。这既是能力上限的证据,也是**红线警报**——所以我们 MVP 三红线「不做全自动定论/不碰付费墙/不合成一手证据图」必须钉死。

**第二个蓝本 TrialMind**(npj Digital Medicine 2025,arXiv 2406.17755):同样 search→screen→extract 三段 LLM 驱动 + 人类专家纠错,配了 **TrialReviewBench(100 篇已发表 SR、2,220 篇临床研究)** 基准。它的价值在于**量化了「人机协同」增益**(见第二节),以及证明了「AI 搜索召回碾压人类基线」。来源:https://www.nature.com/articles/s41746-025-01840-7 · https://pmc.ncbi.nlm.nih.gov/articles/PMC12331930/

**第三类:端到端 agent pipeline 论文**(meta-pipe、LUMEN,arXiv 2606.28363 / 2606.28362)——这两篇主打**多 agent + 成本透明(cost-transparent)**的端到端 SR+meta。对我们的直接启发:**把「花了多少 token/多少钱」做成产物的一部分**(呼应我们 FetchCorpus 不过上下文的成本控制),以及 agent 分工编排。来源:https://arxiv.org/pdf/2606.28363 · https://arxiv.org/pdf/2606.28362

**商业标杆 Elicit 的公开 SR 工作流**:三步向导 search → title/abstract screening → full-text extraction,宣称提速 80%;**核心产品哲学=transparent & editable by design,用户随时能查看并 override 每个筛选决定**。这正是我们台账「AI 建议+理由+置信度+用户裁决列」的产品范式来源。来源:https://elicit.com/blog/systematic-review/ · https://elicit.com/blog/how-we-evaluated-elicit-systematic-review · https://elicit.com/blog/systematic-review-for-prisma-2020

> **我们能直接拿走的设计**:(a) 六段流水线 + 每段独立可审;(b) 全文先转 MD 再入模(且诚实承认补充表/图是盲区);(c) **人只裁决「AI 与基线冲突」的差异行**(otto-SR 盲法裁决 + Elicit override 的合流);(d) 提取错误三分类标注(不可达/解析错/真错);(e) 成本作为一等产物。**FetchCorpus 落盘不过上下文**的决策与这批 SOTA 完全一致(它们全都把大批量检索结果落库,不逐条喂模型)。

---

### 二、筛选/提取环节 LLM 的实证准确率(产品里必须逐字诚实标注的数字)

**筛选(title/abstract + full-text screening)**
- **otto-SR(GPT-4.1)**:摘要筛选加权**灵敏度 96.6%**(vs Elicit 88.5% / 双人 87.3%);全文筛选**灵敏度 96.2% vs 双人 81.7%**,**特异度 96.9% vs 双人 98.1%**。即 **AI 召回更高(漏得更少),特异度与人相当略低(误纳略多)**。来源同上 otto-SR。
- **系统综述级 meta 分析(Kim et al., J Med AI 2025)**:纳入 **14 个 LLM 筛选模型**,SROC 汇总**灵敏度、特异度均逼近 90%**,总体低偏倚风险。来源:https://jmai.amegroups.org/article/view/10102/html
- **GPT-3.5 Turbo(Annals Intern Med, M23-3389)**:平衡规则下**灵敏度 81.1–96.5%、特异度仅 25.8–80.4%**。→ **特异度是软肋**:高召回换来大量误纳,人必须复筛。来源:https://www.acpjournals.org/doi/pdf/10.7326/M23-3389
- **Elicit 官方**:全文筛选**灵敏度 99.5% / 特异度 70%**;逐条准则准确率 94.8%。来源:https://elicit.com/blog/how-we-evaluated-elicit-systematic-review

> **产品话术定档**:对用户明说「**AI 初筛以高召回为目标(灵敏度 ~90–97%),但特异度中等——它宁可多留、绝不替你排除;每一条排除建议都必须你亲自裁决**」。这是诚实且有据的。**默认阈值建议偏召回**(低纳入分门槛,把边界样本一律推给人),与 Kim/GPT-3.5 数据吻合。

**数据提取(PICO/结局)**
- **otto-SR(o3-mini-high)**:加权**准确率 93.1% vs 双人 79.7% vs Elicit 74.8%**;冲突时盲法面板 **69.3% 支持 otto-SR**。但**双人提取文献报告值本身仅 65.8–85.5%**——金标准本就不稳。来源同上。
- **ChatGPT-4o 作二审(PLOS One)**:提取**准确率 92.4%,但 5.2% 案例产生假数据(编造)**;字符型变量(国别/设计/药名)准确率高于数值型变量。来源:https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0313401
- **GPT-4 vs 其他(arXiv 2502.15702)**:GPT-4 提取 **0.81 vs Claude-3 0.59 vs Mistral 0.46**;PICO 中 P/I 准确率 >80%,**Outcomes 最难**。来源:https://arxiv.org/abs/2502.15702
- **Elicit 独立学术评测**:整体 **81.4% vs 人类 86.7%(差异无统计学显著)**;另有案例 1,502/1,511 数据点=99.4%。来源:https://elicit.com/blog/how-we-evaluated-elicit-slr

> **产品话术定档**:「**提取数值仅供二审复核,数值型/结局字段错误率更高;每个数字都可溯源到摘要原文片段,拿不准一律标 NR**」。**数值型变量强制 snippet 溯源、不确定填 NR**,直接源自上面两组数字。

**风险偏倚(RoB)——本期不做自动定论的实证依据**
- **GPT-4 vs Cochrane 作者 RoB2 整体一致性 κ=0.16(很差)**;LLM 普遍过度保守、爱选 high/No-Info。来源:https://pmc.ncbi.nlm.nih.gov/articles/PMC11112444/
- 队列研究稍好(准确率 80.8–83.3%,速度快 97.3%),但结论一致:**尚不能替代专家,仅作辅助**。来源:https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12657654/

> **决策**:RoB 自动评估**不进 MVP 定论环节**(κ=0.16 是硬证据);若二期做,只做「AI 起草 + 逐条人工确认」,且不写进最终结论。

**引用编造——为什么我们绝不让 LLM「写」引用**
- **GPT-3.5 编造率 55%,GPT-4 降到 18%**;GPT-4 的真引用里 **24% 仍有实质性错误**。来源:https://www.nature.com/articles/s41598-023-41032-5
- **2025 PMC 综合评测:19.9% AI 生成引用完全不存在**;编造中 66% 是「整条凭空捏造」。来源:https://www.enago.com/responsible-ai-movement/resources/ai-generated-fake-references-scholarly-integrity
- 跨心理学子领域**编造率 6–60%**。来源:https://www.psypost.org/chatgpt-hallucinates-fake-but-plausible-scientific-citations-at-a-staggering-rate-study-finds/

> **铁律**:台账/提取表/PRISMA/检索式里出现的**每一条文献,只能来自 FetchCorpus 落盘的真实语料(Graph/Discovery/Medicine)**,LLM 永远不许自己「生成」DOI/题录。**外接 Retraction Watch(经 Crossref API)标注撤稿**作为完整性加固(executor 侧在线,不进 jail)。来源:https://www.crossref.org/documentation/retrieve-metadata/retraction-watch/

**人机协同的增益(证明「工作台」比「全自动」更值)**——TrialMind:人机协同**召回 +71.4%、筛选耗时 -44.2%**;提取**准确率 +23.5%、耗时 -63.4%**;专家在 **62.5–100%** 的案例中更偏好 TrialMind 合成的证据而非 GPT-4 裸输出。来源:https://www.nature.com/articles/s41746-025-01840-7

---

### 三、官方指南对「AI 辅助 SR」的合规要求 → 直接定义我们台账/审计的字段

**这是本轮最硬的产品约束。2025 年 11 月,Cochrane + Campbell + JBI + CEE 四大证据合成机构联合发布 AI 使用立场声明,并背书 RAISE(Responsible use of AI in evidence SynthEsis)框架。** 来源:https://www.cochranelibrary.com/cdsr/doi/10.1002/14651858.ED000178/full · https://pmc.ncbi.nlm.nih.gov/articles/PMC12603384/

**三条核心原则(必须内建进产品文化)**
1. **责任在人**:证据合成者对成果负最终责任,包括「是否用 AI」这个决定本身。
2. **不得损害方法学严谨性**:能用 AI,前提是能证明不削弱严谨性/完整性。
3. **必须有人类监督**:任何 AI 环节都要 human oversight。

**RAISE 三件套结构**(2025 年 6 月更新):RAISE 1=生态各角色实践建议;RAISE 2=构建与评估 AI 工具的指南(**面向我们这种工具开发方**);RAISE 3=选择与使用 AI 工具的指南。来源:https://www.cochrane.org/about-us/news/how-cochrane-advancing-responsible-ai-evidence-synthesis

**RAISE 强制上报清单 → 逐条映射成我们的审计字段(这就是台账/`ai_provenance.json` 的 schema)**:凡是「做出或建议判断」的 AI 使用,必须在报告中完整透明地记录(来源:https://www.scribelabwriter.com/blog/ai-tools-systematic-review-raise-framework · https://environmentalevidence.org/artificial-intelligence-reporting-guidance/):
| RAISE 要求上报项 | 我们产物里对应的落地字段 |
|---|---|
| 工具名+版本(「AI 辅助筛选」不合格,要精确到模型/版本) | 每份产物页脚 + `ai_provenance.json`:`{tool:"Scholay sys_review", model:"<agent 配置模型>", version, run_date}` |
| 使用阶段(检索/去重/筛选/提取/RoB…) | 台账/提取表每张 sheet 标 `stage`;PRISMA 每个计数框标注是否 AI 参与 |
| 工作流描述(人是复核全部还是只看 AI 标记项;是否有自动排除的置信度阈值) | 台账开头 README sheet 写死「AI 只建议、人裁决全部排除;纳入分阈值=X」 |
| 停止规则(如适用) | 若做 active-learning 优先级排序,记录停筛规则 |
| **验证数据:在测试集上对金标准的灵敏度/特异度** | 产品内置「本工具在公开基准上的实测灵敏度/特异度」说明卡(引用第二节数字,诚实标注) |
| 任何修改/提示词 | 检索式 md 记录 PICO→布尔的推导;提取记录变量定义 |

> **这直接推翻/加固我们原设计的一点**:原案「无新业务表、台账真源=xlsx」在功能上成立,但**合规上需要一份机器可读的 AI 使用溯源清单**。建议**每个会话产物目录固定生成 `ai_provenance.json`**(工具/模型/版本/各阶段/人机边界/阈值/本工具实测准确率引用),随 `./out/` 收割——这是 RAISE 合规的最小充分集,且零 DB 改动。

**PRISMA 相关的两个易混点(别踩坑)**:
- **PRISMA-AI ≠ 我们需要的**:PRISMA-AI(2022 注册 NCT05382455)至今**未正式发表**,且它管的是「**以 AI 为研究对象**的 SR 怎么报告」,不是「用 AI 做 SR」。来源:https://clinicaltrials.gov/study/NCT05382455
- **真正对口的是 PRISMA-trAIce**(JMIR AI 2025):专为「**把 AI 当方法学工具**用于证据合成时如何透明报告」而生。→ 我们的 `ai_provenance.json` 应向 PRISMA-trAIce 的条目靠拢。来源:https://ai.jmir.org/2025/1/e80247
- **PRISMA 2020 流程图**本身是硬合规物,otto-SR 也指出「现行 PRISMA 认可但未强制」的五项复现材料(完整检索式/RIS 检索文件/原始提取输出+数据字典/作者函件补充清单/分析代码)——**这五项正好是我们五件套产物该覆盖的**。

---

### 四、国内循证医学 AI 现状(竞品 + 市场验证)

- **EviMed(灵犀医疗)**:**国内首个全流程 AI 自动 Meta 分析工具**,自研医学大模型,整合七大中英文医学库,宣称 **3 个月→3 天**,已在 **100+ 家三甲医院试点**(心血管/抗感染/风湿免疫等);明确宣传「**过程透明、支持人工二次校对、Meta 结果自动解读**」。来源:https://cloud.tencent.com/developer/news/2162000 · https://ai-bot.cn/evimed/
- **超能文献(深圳数野科技)**:LLM+传统 NLP 的医学文献搜索引擎。来源:https://www.aigc.cn/sites/70521.html

> **对我们的意义**:(a) 市场已被验证,「透明+人工二次校对」正是国内头部工具的卖点,与 RAISE 完全同向,**我们的差异化应压在「多源检索式合规复现 + PRISMA 2020 SVG + 提取值 snippet 溯源 + 机器可读 AI 溯源清单」这些更硬的合规资产上**;(b) EviMed「结果自动解读」是二期 meta 阶段可借鉴的产物形态(但解读必须基于确定性统计输出,不编造)。

---

### 五、开源可用清单(能否闭源商用随镜像分发 = 硬门槛)

见下方结构化 picks。**结论速览**:
- **Meta 统计引擎**:选 **statsmodels(BSD-3)** 走 apt `python3-statsmodels`,BSD 可闭源商用随镜像分发,零 GPL 传染;**metafor(GPL,R)** 仅作「金标准复现/校验」参照,不进镜像(避免拖 R 运行时 + copyleft)。这与 otto-SR 用 metafor 的结论不冲突——我们用 statsmodels 复刻同类固定/随机效应即可,验收标准「与 RevMan 合并效应量误差<0.01」照旧。
- **去重**:**ASySD 是 GPL-3 的 R 包**,不 vendor;**借鉴其模糊匹配思路(title/DOI/author/year),用 rapidfuzz(MIT,vendor wheel)在 Python 里自己实现**——离线可跑、许可干净。
- **筛选优先级(可选二期)**:**ASReview(Apache 2.0,Python)** 许可最干净、可闭源商用;但它是重应用(拖 sklearn 等)。**建议先借鉴其 active-learning 设计,用 apt `python3-sklearn`(BSD)自建轻量 TF-IDF+逻辑回归优先级排序**,不引入整个 asreview;若确需再 vendor wheel。
- **PRISMA 图**:**PRISMA2020 R 包借鉴框结构即可**,SVG 我们自绘(照原设计借 sci-draw SVG 手艺),不引入 R。
- **完整性加固**:**Retraction Watch(经 Crossref REST API)** 在 executor 侧在线查撤稿,数据免费(使用需引用),标注进台账。
- **RoB 自动化(不做)**:RobotReviewer/Trialstreamer 均 GPL-3 且需重模型(torch),**不引入**,只借「不全自动 RoB」的教训与 PICO 字段分类法。

**vendor/apt 三条许可红线**:apt 的 scipy/statsmodels/sklearn 全是 BSD → 安全;rapidfuzz MIT → 安全;**任何 GPL(ASySD/metafor/RobotReviewer)一律不进闭源镜像,只借鉴设计**。这与仓库既有 pandoc(vendor)先例的许可审查纪律一致。

---

### 六、对原设计(docs/.../02-sys-review.md)的四点加深建议

1. **新增机器可读 AI 溯源产物 `ai_provenance.json`**(RAISE 强制):工具/模型/版本/运行日期/各阶段人机边界/纳入分阈值/本工具实测灵敏度特异度引用——随 `./out/` 收割,零 DB 改动。这是原案「无新业务表」下补齐合规的最小充分集。
2. **筛选默认阈值偏召回 + 台账 README sheet 写死人机边界话术**:「AI 只建议、人裁决全部排除决定;灵敏度~90–97%、特异度中等」——有第二节实证背书。
3. **提取表强制 snippet 溯源 + 数值型/结局字段高亮「需复核」**:源自 ChatGPT-4o 5.2% 编造、数值型弱于字符型的实证。
4. **RoB 明确不进 MVP 定论**(κ=0.16 硬证据);**外接 Retraction Watch 撤稿标注**进台账;**FetchCorpus 落盘不过上下文**的决策获全部 SOTA pipeline 背书,维持不变。

统计引擎从原案的「scipy+statsmodels apt 层」维持,并明确 **statsmodels(BSD)为 meta 主引擎、metafor(GPL)仅作离线校验参照**、**去重用 rapidfuzz(MIT,vendor)而非 GPL 的 ASySD**——把原设计里「python3-scipy/statsmodels apt 层」的许可与选型钉死。

---

## 国自然 · 开源资源
# 国自然标书工作台 · 开源资产与公开资源调研报告(2026-07)

> 结论先行:**没有任何一个开源项目做到了「重工程」形态的国自然标书工作台**(确定性引擎/工具契约/状态机/质量评测均缺位),现有开源全是「模板 + 提示词」轻量形态——这正是我们的差异化空间。但可薅的资产相当多:MIT 的 LaTeX 模板群提供正文八股结构与样式参数真源;官方公文性质的形审自查表/83 案例库/申请通告可结构化进 skill;模拟函评有 4 个可借鉴的英文实现 + 1 套可迁移的评测方法论。以下按四条必查线展开。

---

## 一、GitHub 国自然模板项目(license 已逐一核查)

| 项目 | stars | license | 更新 | 备注 |
|---|---|---|---|---|
| [Ruzim/NSFC-application-template-latex](https://github.com/Ruzim/NSFC-application-template-latex) | 1.1k | **MIT** | 2026-01(已对齐 2026 新版) | 面上正文复刻,附 GB/T 7714 bst |
| [huangwb8/ChineseResearchLaTeX](https://github.com/huangwb8/ChineseResearchLaTeX) | 2.5k | **MIT** | 2026-07 活跃 | 青C/面上/地区全有,**自带 Claude Code 兼容 AI skill + PDF/DOCX 双输出**,是最接近我们形态的工程化先例 |
| [fylimas/nsfc](https://github.com/fylimas/nsfc) | 1.3k | **无 license** | 2026-02(面地青CBA 全类型) | 内容最全但不能分发,仅借鉴 |
| [YimianDai/iNSFC](https://github.com/YimianDai/iNSFC) | 513 | 无 license | 2026-03 | 仅借鉴 |
| [tsingke/NSFC-LaTeX-2026](https://github.com/tsingke/NSFC-LaTeX-2026) | 5 | MIT | 2026-05 | 含「写作逻辑示范」,可 MIT 摘编 |
| [andy123t/nsfc-latex](https://github.com/andy123t/nsfc-latex) | 5 | **CC BY-NC 4.0** | 2026-03 | **非商业条款,绝不能进镜像**,仅借鉴 |

**关键判断**:我们容器**没有 TeX**,LaTeX 模板本身不进镜像。这些项目的价值是三样可移植物:① 2026 新版正文**提纲结构文字**(官方提纲属公文性质);② **样式参数**(字体字号行距页边距——排版事实不受版权保护),用来自制 `pandoc --reference-doc` 的 docx 样式模板;③ Ruzim 的 `gbt7714-numerical.bst` 对应的参考文献格式规则(我们用 CSL 实现,见下)。MIT 项目(Ruzim/huangwb8/tsingke)的 README 写作经验文本可直接摘编进 skill 并保留版权声明。

**GB/T 7714 参考文献格式**:pandoc 已烧入镜像,加一个 [citation-style-language/styles](https://github.com/citation-style-language/styles) 官方仓库的 `china-national-standard-gb-t-7714-2015-numeric.csl`(**CC BY-SA 3.0,可商用分发,署名+样式文件本身同协议共享即可**)即可让 lit-workbench 的「主张↔引用」docx 输出标准中文参考文献格式。注意 [zotero-chinese/styles](https://github.com/zotero-chinese/styles)(6.3k stars)整仓 NOASSERTION,取单文件请从官方 CSL 仓取(每个 CSL 文件头内嵌 CC BY-SA 3.0 声明)。

## 二、开源标书辅助 / AI 审稿项目

### 2.1 国自然域同类产品(问题③的直接答案)
- [njzjz/nsfc-agent-skills](https://github.com/njzjz/nsfc-agent-skills)(264 stars,2026-05 活跃,**无 license**):**与我们形态完全同构的先例**——Claude Code Agent Skills 写国自然,4 技能:nsfc-write(选题/摘要/立项依据分节指南)、nsfc-figure(概念图/技术路线图/甘特图)、nsfc-literature(OpenAlex 检索+引用)、nsfc-policy(2026 限项/AI 规范/申请代码速查)。其技能切分(写作/图/文献/政策四分法)与「不得 AI 直接生成、必须人工核实」的铁律表述值得逐条对照。**无 license 不能拷任何文本**,仅借鉴目录设计。它用 OpenAlex API——我们对外必须叫 Graph/Discovery,这一点它没有我们的合规约束。
- [Lxltx-Team/LXLTX-nsfc_writer](https://github.com/Lxltx-Team/LXLTX-nsfc_writer)(73 stars,无 license,医学 AI 团队):功能最全的同类——六模块生成(背景/内容/方法/创新点/预期成果/研究基础)+ **「智能评审:量化评分+逻辑诊断+优化建议」** + 文献向量库引用推荐。Gradio+Ollama 本地栈,与我们架构无关,但其「评审量化评分维度」与模块划分可作产品对标。
- [ChineseResearchLaTeX](https://github.com/huangwb8/ChineseResearchLaTeX)(见上):提出「Vibe Writing 人机协作——AI 只做格式对齐/参考文献管理/章节重构等机械任务」,与我们「不代写正文」合规硬线的产品叙事同源,MIT 可引用其表述。
- 周边:[gpt_academic](https://github.com/binary-husky/gpt_academic)(通用学术,不特化国自然);[eseckel/ai-for-grant-writing](https://github.com/eseckel/ai-for-grant-writing)(英文 grant prompt 精选集);[wanshuiyin/Auto-claude-code-research-in-sleep 的 grant-proposal SKILL.md](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/skills/grant-proposal/SKILL.md)(又一 agent-skill 先例)。
- 工程投标域(非科研基金,但「自查」交互可借鉴):[FB208/OpenBidKit_Yibiao](https://github.com/FB208/OpenBidKit_Yibiao) 的**「废标项检查」**是开源里最接近「形式审查确定性 checker」的交互先例;[ImGoodBai/good-autobid](https://github.com/ImGoodBai/good-autobid) 是纯生成流(反面教材:正是我们合规上不能做的形态)。

**结论③**:同类先例全是「模板+提示词」,没有一家有确定性引擎/状态机/评测。我们的重工程点(python-docx 形审规则引擎、主张↔引用绑定契约、函评双会话状态机、扰动评测)在开源界是空白,可放心当独创卖点;njzjz 与 huangwb8 两个项目是「别人已验证的技能切分与合规叙事」,照着校准即可。

### 2.2 模拟函评可借鉴的开源实现(问题②的直接答案)
- [SakanaAI/AI-Scientist](https://github.com/SakanaAI/AI-Scientist) 的 [`perform_review.py`](https://github.com/SakanaAI/AI-Scientist/blob/main/ai_scientist/perform_review.py)(14.3k stars):被验证「与人类 reviewer 一致性相当(balanced acc 69%)」的设计——**NeurIPS rubric 数值评分(soundness/presentation/contribution/overall/confidence)+ 5 独立 review ensemble + Area Chair 汇总 + self-reflection 循环 + few-shot 真实评审样例**。⚠️ **license 是定制限制性协议(AI Scientist Source Code License,基于 Responsible AI License,明确禁「未披露 AI 生成学术内容」等),代码一行不能进仓**;但上述**架构设计**(rubric 化+ensemble+AC 汇总)可完整迁移到我们的函评四维(科学问题属性/创新性/可行性/研究基础),恰好与已有 peerreview 的 PersonaRandomPicker+双会话+有界 JSON 架构严丝合缝。
- [maxidl/openreviewer](https://github.com/maxidl/openreviewer):8B 微调模型(7.9 万条 ICLR/NeurIPS 专家评审训练),模型本身不进我们栈,但其**强制结构化 review 输出模板**(逐节 strengths/weaknesses/questions)是好的输出契约参照。
- ReviewerGPT 论文([arXiv 2306.00622](https://arxiv.org/abs/2306.00622))核心结论直接指导 prompt 设计:**「让 LLM 回答具体问题(如找错误/核查清单)显著优于让它泛泛写评审」**——函评 skill 应做成逐维 checklist 问答而非自由发挥,这也正与形审 checker 的确定性思路互洽。
- **质量评测方法论**:[Evaluating LLM-Based Grant Proposal Review via Structured Perturbations(arXiv 2603.08281)](https://arxiv.org/pdf/2603.08281)——对标书做受控扰动(删可行性/弱化创新点/换假设)测评审器检出率。这是「函评质量评测」的现成方法:我们可自建 5-10 份埋了已知缺陷的标书扰动集作回归评测,直接满足用户「质量评测」的重工程要求。
- OpenReview 语料([Seafoodair/Openreview](https://github.com/Seafoodair/Openreview) ICLR 4 万条评审、[AReviewers/AgentReviewers](https://github.com/AReviewers/AgentReviewers) 多智能体评审+最大评审数据集):**全是英文论文域,与国自然函评文体差异大,不建议引入**,最多做评审措辞风格 few-shot 参考。
- **中文函评语料现实**:不存在开源结构化语料。可得的是 LetPub 等平台的整理文章([2024 函评意见汇编](https://www.letpub.com.cn/index.php?page=grant_article_details&article_id=907)、[评审"潜规则"分析](https://letpub.com.cn/index.php?article_id=928&page=grant_article_details)、[2025 各学部不予资助领域](http://letpub.com.cn/index.php?page=grant_article_details&article_id=1557))——**有版权,不能拷贝**;正确做法是据其提炼「函评意见 taxonomy」(创新性不足/假说不清/可行性存疑/工作量不匹配/研究基础薄弱等十余类,每类自写 2-3 条中文范式意见)写成我们自己的 skill 语料。[shengyp/NNSFC](https://github.com/shengyp/NNSFC) 是一个把指南/案例/函评等级/名家 PPT 收集成 PDF 的资料索引仓(0 star,无 license,内容系第三方转存)——只当**找料地图**用。

## 三、公开知识资产(可结构化进 skill 的官方/公文性质内容)

- **申请通告与规则真源**:[2026 年度项目申请与结题通告(基金委官方)](https://www.nsfc.gov.cn/p1/3381/2824/99667.html)——限项、无纸化、职称审核等规则;政策速查 skill 的内容基底。
- **形式审查自查表(2026)**:高校科研处流传的官方配套表,[CSDN 有下载](https://blog.csdn.net/qq_15963745/article/details/158804988)、[知乎转载](https://zhuanlan.zhihu.com/p/2002069295908266813);官方表格属行政公文性质,**可结构化成 checklist md 进 skill**,并进一步做成 python-docx 确定性 checker 的规则集(字体/页数/章节完整/依托单位信息等逐项)。另有[香港中文大学(深圳)2026 申请手册 PDF](https://www.cuhk.edu.cn/sites/webmaster.prod1.dpsite04.cuhk.edu.cn/files/inline-files/%E9%99%84%E4%BB%B61-2026%E5%B9%B4%E5%9F%BA%E9%87%91%E9%A1%B9%E7%9B%AE%E7%94%B3%E8%AF%B7%E6%89%8B%E5%86%8CAnnex%201-Handbook%20of%202026%20NSFC%20programs%20application_2.pdf)等多校版本可交叉校对。
- **科学问题属性四类 + 83 典型案例**:官方发布的案例库(鼓励探索19/聚焦前沿21/需求牵引24/共性导向19),[上师大科技处转载页](https://kjc.shnu.edu.cn/ef/4a/c16762a716618/page.htm)、[搜狐存档](https://www.sohu.com/a/376508677_607269);配[北大科研部《科学问题属性的注意事项与建议》PDF](http://www.research.pku.edu.cn/docs/2021-02/20210220115414037316.pdf)与[知乎《800字科学问题属性怎么写》](https://zhuanlan.zhihu.com/p/58075385)。官方案例文件可摘编成「四类属性判别决策树 + 分学部案例摘要」进 skill——这是 skeleton skill 里「科学问题属性四选一」向导的内容真源。
- **正文八股权威拆解**:基金委自家期刊《中国科学基金》两篇——张策等[《撰写国家自然科学基金申请书的技巧及要点》](https://www.nsfc.gov.cn/csc/20345/20348/pdf/2018/201806596.pdf)、陈越等[《谈面上项目研究内容的遴选与撰写》](https://www.nsfc.gov.cn/csc/20345/20348/pdf/2009/%E8%B0%88%E5%9B%BD%E5%AE%B6%E8%87%AA%E7%84%B6%E7%A7%91%E5%AD%A6%E5%9F%BA%E9%87%91%E9%9D%A2%E4%B8%8A%E9%A1%B9%E7%9B%AE%E7%94%B3%E8%AF%B7%E4%B9%A6%E4%B8%AD%E7%A0%94%E7%A9%B6%E5%86%85%E5%AE%B9%E7%9A%84%E9%81%B4%E9%80%89%E4%B8%8E%E6%92%B0%E5%86%99.pdf)(权威度最高,提炼观点进 skill,勿整段复制);[2024 版申请书撰写范例 PDF](https://www.szcu.edu.cn/_upload/article/files/f7/d5/3ccd83054580a9da0a2673ae1c96/089639c3-69f1-4442-af54-5f5314ae28a7.pdf);[杨汉春(中国农大)撰写要点讲义](https://sy.cau.edu.cn/module/download/downfile.jsp?classid=0&filename=60b98acea059450da01cab46cb29371c.pdf)。注意 2026 年面上/青C 申请书**已改版**([改版分析](https://zhuanlan.zhihu.com/p/1989342633034801709)),「研究内容不再预设提纲限制、正文原则上≤30页」——skeleton skill 的结构必须以 2026 新版为准,老八股文章只取方法论。
- **评审机制事实**(函评 persona 的世界观设定):3-5 位函评专家、综合评价 A/B/C/D + 资助意见加权、前~12% A 类必助、12-35% B 类上会约半数获助、C 类不上会([LetPub 上会机制](https://letpub.com.cn/index.php?article_id=1468&page=grant_article_details)、[知乎评审流程解析](https://zhuanlan.zhihu.com/p/653666227))。
- **资助项目语料(选题参考,可选)**:[suqingdong/nsfc](https://github.com/suqingdong/nsfc)(PyPI `nsfc`,178 stars,BSD 类,但数据停在 2019)、[hamdichau/NSFC](https://github.com/hamdichau/NSFC)(结题项目爬虫)、[wolfsonliu/web-crawler_isisn](https://github.com/wolfsonliu/web-crawler_isisn)。数据陈旧 + 爬虫合规风险,**不建议进镜像**;同类中标题目检索这条需求交给 minicod(对外叫 Graph/Discovery)即可。

## 四、技术路线图绘制资源

- **主车道已在自家**:mermaid 会话内联渲染 + sci-draw L2 SVG 车道零依赖,与 04 设计一致。开源可薅的是**版式母版**而非引擎:需要自建 3-5 个「正面模板」(ASCII 框图复发的教训:否定式规则无效)——推荐做成 mermaid `flowchart TB` 四层母版(科学问题→研究内容三支柱→方法/技术手段→预期成果与考核指标)+ 甘特(mermaid gantt)两件套,存 skill 目录。
- TikZ 资源([pierre-luc/flowtex](https://github.com/pierre-luc/flowtex)、[MartinThoma/LaTeX-examples 的 flowchart.tex](https://github.com/MartinThoma/LaTeX-examples/blob/master/tikz/line-segments/flowchart.tex)、[heitzmann/latex-templates 的 project.tex(含甘特)](https://github.com/heitzmann/latex-templates/blob/master/project/project.tex)、[IsaacDodd/flowchart(PRISMA/CONSORT 风格)](https://github.com/IsaacDodd/flowchart/)):容器无 TeX,**仅借鉴其节点布局与配色版式**移植到 SVG 母版;njzjz/nsfc-figure skill 对「概念图/路线图/甘特图」的三分法可对照。
- 商业模板站(CSDN「200+ 国自然路线图模板」等)有版权,不引入。

---

## 特别回答汇总

**① 可直接进 skill 目录的资产**(全部合规路径):
1. 形审自查表 → 结构化 checklist md + python-docx 规则集(官方公文性质);
2. 四类科学问题属性定义 + 83 案例摘编 md(官方案例库);
3. 2026 新版三段式提纲结构 + 自制 reference-doc docx(样式参数取自 MIT 模板群,自建 docx 避开官方文件二次分发争议);
4. GB/T 7714-2015 numeric CSL 文件(CC BY-SA 3.0,pandoc citeproc 直接用);
5. AI 使用声明模板段(据科技部《负责任研究行为规范指引 2023》+ 2026 通告自写);
6. mermaid 路线图/甘特母版(自建,版式借鉴 TikZ 项目);
7. MIT 项目(Ruzim/huangwb8/tsingke)的写作经验文本摘编(保留 license 声明);
8. 函评意见 taxonomy + 范式意见(据 LetPub 系文章提炼自写,不拷原文)。

**② 模拟函评借鉴**:架构用自家 peerreview(已拍板);设计抄 AI-Scientist 的 rubric+ensemble+AC 汇总(只抄设计,license 禁抄代码);输出契约参照 openreviewer 结构化模板;prompt 策略遵循 ReviewerGPT「具体问题化优于自由评审」;**质量评测用 Structured Perturbations 扰动集回归**——这一条是把「模拟函评」做成重工程(可评测、可回归)的关键。

**③ 同类开源先例**:njzjz/nsfc-agent-skills(形态最同构)、LXLTX-nsfc_writer(功能对标)、ChineseResearchLaTeX(工程最成熟且 MIT,含 Claude Code skill + DOCX 双输出先例)。均无确定性引擎/状态机/评测,我们的重工程主张成立。

---

## 国自然 · 2026 政策核实
# 2026 年国自然申报政策联网核实报告(供国自然标书能力设计用)

> 核实时间:2026-07-24。方法:12 次中文检索 + 12 次原文抓取,其中《2026 年度项目指南·申请规定》官方 PDF(986KB)与港中深《2026 基金项目申请手册》PDF(2.5MB)已下载并本地 pdftotext 全文解析,关键条款均拿到**原文**。置信度标注:🟢=官方原文核实 / 🟡=多个二手信源一致 / 🔴=仅社区流传、未见官方原文。

---

## 一、假设 → 核实结果对照表(核心交付)

| # | 上一轮设计中的假设 | 核实结果 | 置信度 | 信源 |
|---|---|---|---|---|
| 1 | 「2026 新版三段式(立项依据/研究内容/研究基础)」为产品假设 | **核实为真,且已官宣落地**。基金委 2025-12-30 官网发布《关注!!!2026 年申请书改版》:面上项目与青年科学基金项目(C 类)申请书正文重塑为**三部分:立项依据、研究内容、研究基础**;正文**原则上不超过 30 页** | 🟢 | [基金委官网通知](https://www.nsfc.gov.cn/p1/3381/2821/99242.html) |
| 2 | 三段式适用于所有项目类型 | **不成立,仅面上 + 青 C 两类**。重点、杰青(青 A)、优青(青 B)、地区等其余类型 2026 年仍用旧版提纲 → 引擎必须**双模板** | 🟢 | 同上 + [2026 通告](https://www.nsfc.gov.cn/p1/3381/2824/99667.html) |
| 3 | 有明确字数要求 | 无字数硬指标,只有「正文原则上不超过 **30 页**,鼓励简洁表达」。此前无页数上限(社区实测青 C 常写 40-60 页)。港中深手册补充:**模板须在申报系统下载 2026 最新版,不得删除模板中蓝色标题及括号内容** | 🟢 | 官方通知 + [CUHK 手册 PDF](https://www.cuhk.edu.cn/sites/webmaster.prod1.dpsite04.cuhk.edu.cn/files/inline-files/%E9%99%84%E4%BB%B61-2026%E5%B9%B4%E5%9F%BA%E9%87%91%E9%A1%B9%E7%9B%AE%E7%94%B3%E8%AF%B7%E6%89%8B%E5%86%8CAnnex%201-Handbook%20of%202026%20NSFC%20programs%20application_2.pdf)(本地解析) |
| 4 | 科学问题属性为「四类」 | **已过时**。自 2024 年度起四类(鼓励探索突出原创/聚焦前沿独辟蹊径/需求牵引突破瓶颈/共性导向交叉融通)简化为**两类:自由探索类基础研究 / 目标导向类基础研究**,2026 年继续。分类评审试点范围=**面上、青 C、重点** | 🟢 | [2026 指南·申请规定 PDF](https://www.nsfc.gov.cn/u/cms/www/202601/190844586k0w.pdf)(本地解析原文)+ [2025 通告](https://www.nsfc.gov.cn/p1/3381/2824/66780.html) |
| 5 | 基金委对 AI 有禁令(细节未知) | **2026 年首次在指南/通告层面明确成文**(已核实 2025 年度通告无 AI 条款)。原文见下文第三节。核心:允许辅助检索/整理但须人工核实,**须全面如实声明并按国家规定标识,不得使用 AI 直接生成的申请书** | 🟢 | 2026 指南·申请规定 PDF 第(二)8 条原文 |
| 6 | 评审端有 AI 禁令 | 《评审专家行为规范》(2015 施行)**无 AI 条款**;「专家不得将申请书上传 AI/不得 AI 生成评审意见」流传甚广但**未检索到基金委公开发文原文**(可能载于函评邀请须知,非公开)。评审端硬约束的公开依据是行为规范第 11、12 条**保密条款**(严禁扩散申请书内容) | 🟡 | [评审专家行为规范](https://www.nsfc.gov.cn/p1/2871/2874/2884/69612.html) |
| 7 | 形式审查高频被拒原因(未知) | 官方培训视频公布 **7 大原因**(2022 数据);2025 年不予受理仅 992-997 项(0.23%,历史最低)。详见第四节 | 🟢 | [基金委培训视频总结](https://www.acabridge.cn/jjxm/zrjj/202302/t20230207_2289944.shtml) + [2025 评审结果通告](https://www.nsfc.gov.cn/p1/3381/2824/94026.html) |
| 8 | 申报时间线(未知) | 2026 全周期已核实:12-30 改版预告 → 1-15 通告/系统开放 → 1-19 指南发布 → **3-1~3-20 16:00 集中接收** → 4-29 前初审结果 → 5-7 月函评会评 → 8 月下旬放榜(2025 为 8-27)→ 复审 8-27~9-15 | 🟢 | 2026 通告 + [新华网](https://www.news.cn/government/20260120/7cf3415100e44423881c9b4d08e99c19/c.html) |
| 9 | 函评意见结构(未知) | 综合评价**优/良/中/差** + 资助意见**优先资助/可资助/不予资助** + 文字评述;2024 起按两类属性**分类评审**;2025 年函评有「优先+可资助 ≤35%」比例约束(🟡);详见第六节 | 🟡 | 多源交叉,官方评议表原文不公开 |

---

## 二、申请书正文结构:改了什么(逐条)

### 2026 新三段式(面上/青 C)🟢 官方原文
- **立项依据**:只需说清「为什么要开展此项研究,研究的价值何在」;
- **研究内容**:**不再预设提纲限制**,「申请人可以根据自己的研究思路和研究工作的自身逻辑自主撰写」——官方明说是为摒弃「研究方案」「技术路线」等固化条框造成的「套路化」「八股文」;
- **研究基础**:主要展示前期工作积累;
- 正文原则上 ≤30 页。发布时间 2025-12-30,官方定名「瘦身提质」行动([科学网](https://news.sciencenet.cn/htmlnews/2025/12/557977.shtm)、[科技日报](https://www.stdaily.com/web/gdxw/2025-12/30/content_455368.html))。

### 旧八股(2025 及以前,其余项目类型 2026 仍沿用)🟢(CUHK 手册写作指导章节本地解析,标注「仅供参考」)
(一)立项依据与研究内容:1.立项依据(研究意义、国内外研究现状及发展动态分析,附主要参考文献;社区惯例约 5000 字) 2.研究内容、研究目标及拟解决的关键科学问题 3.拟采取的研究方案及可行性分析(研究方法/技术路线/实验手段/关键技术) 4.特色与创新之处(2-3 个) 5.年度研究计划及预期研究结果;(二)研究基础与工作条件:1.研究基础 2.工作条件 3.正在承担的相关科研项目 4.完成国家自然科学基金项目情况;(三)其他需要说明的情况。摘要:中文 ≤400 字。

### 对我们引擎的直接含义
1. **双模板状态机**:`outline_2026_free`(面上/青 C:三段式+30 页预算)与 `outline_classic`(重点/杰青/优青/地区等:八股)并存,按项目类型路由;
2. **旧八股要素降级为内容检查表**:新版「研究内容」虽自由撰写,但评审专家仍会找研究目标/关键科学问题/方案可行性/创新点/年度计划这些要素(🟡 社区共识,如[知乎改版解读](https://zhuanlan.zhihu.com/p/1991189437665808712))——引擎的 lint 规则应查「要素齐全」而非「标题齐全」;
3. **30 页预算器**:各节页数配额估算 + 超页告警是确定性引擎的新职责;
4. 模板每年 1 月中旬随指南更新 → **提纲/规则必须外置为可热更新的数据文件**,不能烧死在镜像里。

---

## 三、AI 使用规定(全文级核实)

### 申请端 🟢《2026 年度指南·申请规定》科研诚信第(二)部分第 8 条原文:
> 「申请人在撰写科学基金项目申请书时,如果借助生成式人工智能技术跟踪研究动态、收集整理参考文献,必须由人工核实生成式人工智能生成信息和参考文献的真实性和准确性。申请人应当对使用的生成内容负责,应当全面如实声明使用情况,并按照国家有关规定对相关内容进行标识。**不得使用由生成式人工智能直接生成的申请书,不得使用未经核实的生成内容。**」

- 已核实 **2025 年度通告无此条款** → 2026 为首次成文([搜狐解读](https://www.sohu.com/a/977513213_121252874)称「基金委首次明确 AI 写标书规范」与此一致);
- 「按照国家有关规定标识」指向四部门《人工智能生成合成内容标识办法》(2025-03-14 发布、**2025-09-01 施行**,显式+隐式标识,[网信办](https://www.cac.gov.cn/2025-03/14/c_1743654685899683.htm));
- 通告同时要求署名诚信:代表作「如实注明本人署名及贡献情况,不得虚假标注第一作者或通讯作者,不得夸大个人贡献」🟢。

### 评审端 🟡
- 《评审专家行为规范》(2014-12-02 审议通过、2015-01-01 施行)无 AI 条款,但第 11 条「严禁抄袭、剽窃或者扩散申请书中的内容……及时退回、删除或者销毁评审资料」、第 12 条保密条款,构成「不得把他人申请书喂给外部 AI」的制度依据;
- 社区广传的「函评须知严禁上传申请书至 AI 工具、严禁 AI 生成评审意见」未检到基金委公开原文(部分文章混入期刊审稿规范,如[北大国发院](https://nsd.pku.edu.cn/xzyj/cbw/jjxjk/xwsd/89501b9d3dab410f86c1520cfbc82498.htm)是期刊场景)→ 引用时须谨慎。

### 产品红线(必须写进 skill 与前端文案)
1. **绝不能宣传/实现「一键生成整本申请书」**——直接违反「不得使用由生成式人工智能直接生成的申请书」。能力定位必须是:结构化打磨、要素 lint、逐段深度反馈、检索与事实核对辅助,**人写 AI 审**;
2. 内置「**AI 使用声明生成器**」:按用户实际使用范围生成合规声明文本(社区已有声明模板实践,[知乎](https://zhuanlan.zhihu.com/p/2015814613111939852)),放「其他需要说明的情况」🟡;
3. 参考文献**必须走 minicod 真实检索核验**,杜绝幻觉引用(与既有 citation-audit 技能同源)——这正是新规「人工核实真实性」最重的合规点;
4. **模拟函评的输入警示**:若用户身份是评审专家、上传**他人**申请书求模拟评审 → 触碰保密红线,需在 skill 中写明只服务「作者本人打磨自己的本子」。

---

## 四、形式审查不予受理:官方口径

**《条例》四种不予受理情形** 🟢(2026 指南原文):(1)申请人/主要参与者不符合《条例》《指南》及管理办法规定;(2)申请材料不符合《指南》要求;(3)因违背科研诚信/科技伦理被禁止承担财政性资金科技活动;(4)不符合限项规定。

**官方培训视频公布的 7 大高频原因** 🟢(2022 年数据:接收 294,396 项,不予受理 1,569 项,0.53%):
1. 证明材料不全(推荐信/导师同意函/伦理证明等);2. 研究期限填写错误;3. 不属于项目指南资助范畴;4. 申请代码或研究领域选择错误;5. 申请人不具备该类项目申请资格;6. 申请书缺项;7. 申请人或主要参与者超项。

**最新基线** 🟢:2025 年接收 433,426 项,受理 432,434 项(官方通告口径差 992 项;初审公布时点为 997 项、0.23%,历史最低,复审恢复少量)。资助 53,159 项。复审仅程序性:「对学术判断有异议」不予受理复审。

**产品含义**:FormCheck 确定性引擎的规则源=各高校发布的《年度形式审查明细表》(如[北大 2025 版 PDF](https://www.research.pku.edu.cn/docs/2025-02/20250205103323999183.pdf)),逐条可机检(研究期限=2027-01-01 起、代码到二级 4 位、附件清单、限项计数器、职称/学位一致性等),这是**高确定性、低模型依赖**的部件,应做成 YAML 规则 + 校验器。

---

## 五、2026-2027 申报季时间线与上线窗口

| 节点 | 2026 年实际日期 🟢 |
|---|---|
| 申请书改版预告 | 2025-12-30 |
| 年度通告发布 + 信息系统开放 | 2026-01-15 |
| 项目指南正式发布(7 项改革) | 2026-01-19 |
| 集中接收期 | **2026-03-01 ~ 03-20 16:00** |
| 校内截止(以 CUHK 为例) | 院初审 03-04 / 校复审 03-08 / 终提交 03-18 |
| 初审(形式审查)结果 | 04-29 前 |
| 函评 → 会评 | 约 5-7 月 |
| 放榜 | 8 月下旬(2025 年为 08-27) |
| 复审窗口 | 放榜起 ~09-15,复审结果 11-06 前 |

**倒推我们的上线窗口**:今天(2026-07-24)本申报季已结束、正值放榜前夜。节奏应为——① 2026 年 8 月底放榜后立刻可用「**败因复盘 + 意见解读 + 复审申请辅助**」切入(放榜后 20 天复审窗口是天然获客时点);② 2026 年 9-12 月是标书「预研打磨季」(高校普遍 11-12 月启动预评审),核心能力须在此期间上线;③ 2027-01 中旬指南发布后 72 小时内完成模板/规则热更新,2-3 月进入冲刺峰值。**结论:重工程部分 2026-11 前交付,规则数据层设计成年更。**

---

## 六、函评/会评流程:模拟函评的仿真粒度

**全流程** 🟢(《条例》+官方通告+《中国科学基金》姚玉鹏 2017 [论文](https://kjc.nwu.edu.cn/__local/0/10/97/DAB24822519DD86F4206114B668_7D27676E_3521B.pdf)):形式审查(初审,45 日内)→ **通讯评审(函评,同行专家 ≥3 人**,面上通常 5 人 🟡)→ 学科综合排序 → **会议评审(上会=资助名额 1.3-1.6 倍** 🟡)→ 委务会议审批 → 公示/通告 → 复审(仅程序性)。注:国自然没有「几上几下」往返修改机制(那是国社科等的流程),一轮定生死+事后复审。

**函评意见表结构** 🟡(官方表原文不公开,以下为多源一致的可信重建):
- 分类评审导语:按申请人所选**研究属性**(自由探索类/目标导向类)给出不同评审要点——自由探索类重**原创性与科学价值**,目标导向类重**需求匹配与应用前景**(🟢 分类评审本身;🟡 具体措辞);
- 文字评述:创新性与科学意义/研究内容与目标及关键科学问题/研究方案可行性/研究基础与团队,要求「明确具体,避免简单化和套话,指出优势、不足和改进建议」(🟢 行为规范第 6 条原文);
- 档位:综合评价 **优/良/中/差(A/B/C/D)** + 资助意见 **优先资助/可资助/不予资助**;
- 比例约束:2025 年函评「优先资助+同意资助不超过 35%」([CERNET](https://www.cernet.edu.cn/rd/gao_xiao_cheng_guo/gao_xiao_zi_xun/202504/t20250430_2666721.shtml) 🟡);
- 社区流传的换算(A=4/B=3/C=2/D=1,资助意见 A=4/B=2~3/C=-3,总分=综合+资助,前 12% A 类上会、12-35% B 类上会)版本不一 🔴 → **不要写死进引擎,做成可配置评分模型**。

**模拟函评应仿真到的粒度(拍板建议)**:N 份(默认 5、可配 3)**互相独立、人格化**的专家意见,每份含:按所选研究属性路由的评审要点 → 四维文字评述(每条挂具体页/段落证据)→ 综合评价档 + 资助意见档 + 可执行修改建议;之上叠一层「学科排序模拟」:按 ≤35% 比例约束聚合 N 份意见给出上会概率区间,并显著标注「模拟推演,非官方口径,评分换算为社区经验模型」。**不予受理风险单独走 FormCheck 确定性引擎,不进 LLM。**

---

## 七、2026 年 7 项改革与其他增量事实(背景)

指南层面 7 项改革 🟢([新华网](https://www.news.cn/government/20260120/7cf3415100e44423881c9b4d08e99c19/c.html)):①优化人才类项目资助机制(向青年倾斜、港澳开放创新群体);②重大非共识项目试点;③原创探索计划;④整治评审「打招呼」;⑤加强科学工具领域支持;⑥引导提升申请质量(申请书瘦身提质属此);⑦改革国际科研资助体系。另:青 A 对 35 岁以下男性/38 岁以下女性单设赛道(🟢 CUHK 手册);青 A/B/C 全面**经费包干制**、无须编预算(🟢 指南原文);代表作个人贡献采集范围=各类项目申请人+创新/卓越群体骨干(🟢)。

---

## 八、给设计 agent 的增量约束清单(在 04-nsfc-grant.md 基础上加深)

1. 提纲引擎:双模板路由(2026 三段式 vs 经典八股)+ 30 页预算器 + 要素级 lint(要素查内容不查标题);模板/规则外置年更;
2. 属性选择器:两类属性(非四类!)+ 按属性分叉的立项依据论证策略与模拟评审要点;
3. 合规层:AI 使用声明生成器 + 「绝不整本代写」的能力边界文案 + 评审保密场景拦截 + 引用全量 minicod 核验;对外文案数据源名遵守 Graph/Discovery/Medicine 别名铁律;
4. FormCheck:形式审查明细表 YAML 化(7 大高频原因全覆盖:期限/代码/附件/资格/限项/缺项/证明材料);
5. 模拟函评:5 专家独立人格 + 属性路由评审要点 + 档位/比例约束 + 可配置评分模型 + 免责标注;
6. 节奏:2026-11 前交付核心;放榜后的「败因复盘/复审辅助」作为 2026-08 底的先导轻入口。

## 主要信源
- 官方:[申请书改版通知](https://www.nsfc.gov.cn/p1/3381/2821/99242.html) · [2026 通告](https://www.nsfc.gov.cn/p1/3381/2824/99667.html) · [2026 指南·申请规定 PDF](https://www.nsfc.gov.cn/u/cms/www/202601/190844586k0w.pdf) · [2025 评审结果通告](https://www.nsfc.gov.cn/p1/3381/2824/94026.html) · [2025 通告](https://www.nsfc.gov.cn/p1/3381/2824/66780.html) · [评审专家行为规范](https://www.nsfc.gov.cn/p1/2871/2874/2884/69612.html) · [改革举措页](https://www.nsfc.gov.cn/p1/2931/3971/3973/2026ndgjzrkxjjggjc.html) · [网信办标识办法](https://www.cac.gov.cn/2025-03/14/c_1743654685899683.htm)
- 权威媒体/机构:[新华网 7 项改革](https://www.news.cn/government/20260120/7cf3415100e44423881c9b4d08e99c19/c.html) · [科学网](https://news.sciencenet.cn/htmlnews/2025/12/557977.shtm) · [科技日报](https://www.stdaily.com/web/gdxw/2025-12/30/content_455368.html) · [CERNET](https://www.cernet.edu.cn/rd/gao_xiao_cheng_guo/gao_xiao_zi_xun/202504/t20250430_2666721.shtml) · [CUHK-SZ 手册](https://www.cuhk.edu.cn/sites/webmaster.prod1.dpsite04.cuhk.edu.cn/files/inline-files/%E9%99%84%E4%BB%B61-2026%E5%B9%B4%E5%9F%BA%E9%87%91%E9%A1%B9%E7%9B%AE%E7%94%B3%E8%AF%B7%E6%89%8B%E5%86%8CAnnex%201-Handbook%20of%202026%20NSFC%20programs%20application_2.pdf)
- 社区(仅作 🟡/🔴 佐证):知乎/LetPub/学点/CSDN 各改版与会评解读文(正文已逐条链接)
- 本地解析产物:`/private/tmp/claude-501/-Users-youngp-mypro-fuck----scholar/5671e320-45b1-48a7-af51-dd418ad8cc23/scratchpad/nsfc2026.txt`(指南申请规定全文)、`cuhk2026.txt`(申请手册全文)
