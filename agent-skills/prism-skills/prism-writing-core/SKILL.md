---
name: prism-writing-core
description: 学术写作通用声音 —— 章节感知的语气/时态、claim-first 主题句、修辞动作思维、默认 hedging 校准、一句一信息、去 AI 腔。在 Prism 里续写/改写/润色论文正文时始终遵循。
when_to_use: 在 Prism 里续写、改写、润色论文正文,或用户要"写得更好/更地道/更精炼"时(始终生效)
user-invocable: false
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Edit, Write, MultiEdit
---

# 学术写作通用声音(Prism · 常驻)

你在 `document.md` 里改的是**给同行评审读的论文正文**。**保持章节结构与所有 `[@引用键]` 位置不变**,只动语言。这是**通用底座**;某个维度要写深(结构/清晰/论证/严谨/图表叙述/去 AI 腔/中式英语…)时,**先从技能菜单按需加载对应 `wl-*` 指南再动手**。

## 句段层(每次落笔都成立)
- **claim-first 主题句**:每段第一句直接给本段论点,其余句支撑它;**一段只讲一个论点**。
- **一句一信息**:每句承载一个新命题;句均长 ~20 词,>40 词拆开;删低信息量的"承上启下"句。
- **主动语态**为主(方法步骤可用被动);**角色-动作**主干清楚(谁对谁做了什么),别把动作埋进名词化。
- **论证可定位**:claim → evidence(指向具体图/表/数字/引用),不空泛断言。
- **术语/记号全文一致**;首次出现的缩写与符号先定义。

## 语气 / 时态(register)
- 正式书面语;**方法与结果用过去时**("我们训练了…""准确率达到…"),**公认事实/本文结论用现在时**("Transformer 依赖注意力…""这表明…")。
- **hedging 与证据强度匹配**:单次实验/相关性 → "suggests / is associated with / 可能";多次稳健复现/随机对照 → 可用较强措辞。**既不过度自信("证明了""必然"),也不过度收缩("也许可能大概")**。深校准见 `wl-rl-claim-calibration`。

## 修辞动作思维(写/补对应章节时)
每个章节有它该完成的"动作":引言=立territory→点gap→给贡献;方法=先直觉后形式;结果=设置→对比→takeaway;讨论=回答问题→限度→意义;相关工作=按主题分组+定位差异。**按 section 的职责写,别把讨论写成结果的复读**。细粒度脚手架见 `wl-structure`。

## 去 AI 腔(让文字像人写)
- 删空洞套话:"众所周知 / 值得注意的是 / 在本节中我们将 / 综上所述 / It is worth noting / Notably / In conclusion / plays a crucial role"。
- 删机械排比("首先…其次…再次"的空壳并列)、滥用的 em-dash(—)、过度自信副词。
- 框架/提法**跨章节稳定**,不中途改叫法(framing drift 与拒稿相关)。
- 更狠的 de-slop 黑名单见 `wl-de-slop`;非母语英文的中式英语纠正见 `wl-eal-chinglish`。

## 边界(别越到这三处的地盘)
- `document.md` 的**格式/机制**(数学/表/图行/交叉引用/frontmatter/转义/最小 diff)→ 见 `prism-edit-discipline`(常驻)。
- **引用文献**(绝不编造、走 minicod、写 `references.bib`)→ 见 `prism-citation-grounding`(常驻)。
- **学科惯例**(结构/记号/报告规范因领域而异)→ 由项目的写作画像(base 人格)承载;不清楚就按通用 IMRaD + claim-evidence 并说明。
