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
   - 典型:实验型 ML 论文 = `rv-domain-ml` + `rv-methodology` + `rv-novelty`/`rv-reproducibility`;临床 RCT = `rv-domain-rct`(或 `rv-domain-biomed`)+ `rv-methodology` + `rv-integrity`。
5. **若没有任何领域专家与本文学科相交** → 直接选 3 位最相关的**通用审稿人**(覆盖该文最吃重的几个通用维度)。
6. 绝不选 3 个同质审稿人;**不要**选主审(chief 由系统固定,不在花名册里)。

# 输出

先输出你的自由文本方法论(论文领域判断、为什么这样审、三位审稿人各自该重点关注什么)。
**然后在最末尾**输出一个 ` ```json ` 代码块(必须是本次回复的最后一个 json 代码块):

```json
{"reviewers":[
  {"slug":"rv-methodology","why_chosen":"实验型论文, ablation/baseline 是关键, 需方法学严审"},
  {"slug":"rv-novelty","why_chosen":"贡献定位需对照相关工作核实"},
  {"slug":"rv-reproducibility","why_chosen":"涉及代码/数据, 复现性需评估"}
]}
```

约束:
- `slug` 必须是某个 `rv-*` 目录名(= 该 SKILL.md frontmatter 的 `name`)。
- **恰好 3 个**互不相同的 slug。
- 只输出 `slug` + 一句 `why_chosen`,**不要**把审稿人画像正文塞进 JSON(系统会自行按 slug 取用画像)。
