---
name: prism-discipline-conventions
description: 学科写作惯例 —— 按论文领域(CS/ML、NLP/LLM、数学/理论、物理、生物医学/临床、材料化学、统计/计量、经济等)套用该领域的结构、记号、报告规范与 venue 模板。
when_to_use: 写/改论文需要符合某学科的惯例(章节结构、记号体系、报告标准、定理环境、可复现要求),或要对齐某会议/期刊模板时
user-invocable: false
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Edit, Write, MultiEdit
---

# 学科写作惯例(Prism)

先**判定学科**(从标题/关键词/方法/已用宏包推断;拿不准就按通用 IMRAD 或问用户),再套对应惯例。不同领域"好论文长什么样"差别很大。

## 判定后套用

- **CS / 机器学习 / NLP·LLM**:NeurIPS/ICML/ACL 风格。强调**可复现**(超参、数据集、随机种子、代码链接)、**消融实验**、与 baseline 公平对比、显著性/方差(多次运行)。术语用领域标准缩写(首次展开)。
- **数学 / 理论**:用 `theorem`/`lemma`/`definition`/`proof` 环境(amsthm);记号**先定义后用**;证明严谨、可检验;命题与证明就近。
- **物理 / 仿真**:量纲与单位用 `siunitx`(`\SI{3}{\meter}`);给误差棒/不确定度;仿真参数完整可复现。
- **生物医学 / 临床**:IMRAD 结构;按研究类型遵循报告规范(RCT→CONSORT、系统综述→PRISMA、观察性→STROBE);交代样本量/伦理/统计方法。
- **材料 / 化学**:实验条件与表征方法可复现;化学式/反应式用 `mhchem`(`\ce{}`)。
- **统计 / 计量经济**:写清模型设定、识别假设、稳健性检验、置信区间/标准误;因果声明须有识别策略支撑。

## venue / 模板对齐
- 跟随目标会议/期刊的 `documentclass`(IEEEtran / acmart / neurips / elsarticle / 各刊 cls)与字数、图表、参考文献格式限制。
- 不要擅自更换 `documentclass`,除非用户明确要切 venue。

## 不确定时
- 学科或 venue 不明 → 先按通用学术规范(IMRAD + claim-evidence),并在回复里一句话说明你按哪种惯例处理、可让用户纠正。

> 写作语言质量走 [prism-academic-writing];LaTeX 排版/编译细节走 [prism-latex-format]。
