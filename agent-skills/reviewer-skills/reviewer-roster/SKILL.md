---
name: reviewer-roster
description: 审稿人花名册编排 — 读论文 + 读全部审稿人画像, 为本文挑选最合适的 3 位审稿人
when_to_use: 智能审稿的方法论编排阶段, 需要为本文挑选审稿人时
user-invocable: false
disable-model-invocation: false
model: opus
effort: medium
allowed-tools: Read, Glob, mcp__minicod__search_papers
---

# 任务:为本文挑选【恰好 3 位】审稿人

你处在智能审稿的「方法论编排」阶段。你已经(或即将)读过稿件原文。审稿人分两类:
- **领域专家**(`rv-domain-*`):`fit_subjects` 列了具体学科 tag,只在论文落在该领域时才适用。
- **通用审稿人**(`fit_subjects: []`):方法学 / 创新性 / 可复现性 / 写作 / 诚信伦理 / 理论,对任何论文都通用,是兜底。

**选择逻辑(专攻优先 → 通用兜底)**:
1. 判断这篇论文的**领域 / 类型 / 方法学**,推断它的学科 tag(尽量对齐 `fit_subjects` 用的规范 tag)。
2. (系统通常已把花名册直接列在本轮提示里;若没有,用 `Glob ~/.claude/skills/rv-*/SKILL.md` + `Read` frontmatter 自建。)
3. **先看领域专家**:若有 `rv-domain-*` 的 `fit_subjects` 与本文学科**相交**,**优先选 1-2 位最匹配的领域专家**。
4. **再用通用审稿人按视角互补补满到恰好 3 位**(别和已选的领域专家重复视角)。
   - 典型:实验型 ML 论文 = `rv-domain-ml` + `rv-methodology` + `rv-novelty`/`rv-reproducibility`;临床 RCT = `rv-domain-rct`(或 `rv-domain-biomed`)+ `rv-methodology` + `rv-integrity`;系统/安全实测论文 = `rv-domain-software-systems-security` + `rv-methodology` + `rv-reproducibility`;HCI/用户实验论文 = `rv-domain-hci-user-study` + `rv-methodology` + `rv-integrity`。
5. **若没有任何领域专家与本文学科相交** → 直接选 3 位最相关的**通用审稿人**(覆盖该文最吃重的几个通用维度)。
6. 绝不选 3 个同质审稿人;**不要**选主审(chief 由系统固定,不在花名册里)。

**7. 多技能组合(可叠加视角 lens)**:每位审稿人**可选**叠加若干 `lens-*` 视角(如统计严谨 / 因果推断 / 伦理-IRB / 图表诚信 / 相关工作公正),用于锐化额外审查角度而**不改变其审稿身份**。叠几个、叠哪些**由你按稿件实际判断**:只在该视角确实与本文相关、且**不是该审稿人 base 人格已充分覆盖**的方面时才叠(如 `rv-methodology` 已覆盖统计,就别再叠 `lens-statistics-rigor`)。**宁缺毋滥——多数情况 0-2 个就够,叠太多会稀释焦点**;单人最多 5 个(系统硬上限)。系统运行时会把可选 lens 花名册一并注入,以那份清单为准。

# 输出

先输出你的自由文本方法论(论文领域判断、为什么这样审、三位审稿人各自该重点关注什么、各自叠了哪些视角)。
**然后在最末尾**输出一个 ` ```json ` 代码块(必须是本次回复的最后一个 json 代码块):

```json
{"reviewers":[
  {"slug":"rv-domain-ml","lenses":["lens-eval-contamination"],"why_chosen":"实验型 ML 论文, 领域专家 + 评测泄漏视角"},
  {"slug":"rv-methodology","lenses":[],"why_chosen":"方法学严审, base 已覆盖统计, 无需叠视角"},
  {"slug":"rv-novelty","lenses":["lens-related-work-fairness"],"why_chosen":"贡献定位 + 相关工作公正视角"}
]}
```

约束:
- `slug` 必须是某个 `rv-*` 目录名(照抄系统注入的花名册)。
- **恰好 3 个**互不相同的 slug。
- `lenses` 是**可选**的 0-2 个 `lens-*` slug(照抄系统注入的可叠加视角清单,不叠就写 `[]`)。
- 只输出 `slug` + `lenses` + 一句 `why_chosen`,**不要**把审稿人画像 / 视角正文塞进 JSON(系统会自行按 slug 取用)。
