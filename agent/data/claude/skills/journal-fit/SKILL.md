---
name: journal-fit
description: 根据论文内容推荐 3-5 个最适合投稿的期刊/会议,附 IF / JCR 分区 / 接收难度信息
when_to_use: 用户要求"推荐期刊"、"投哪里"、"target journal"、"应该投什么 venue" 时
user-invocable: true
disable-model-invocation: false
argument-hint: "<论文摘要或主题描述>"
model: sonnet
effort: medium
allowed-tools: Read, WebFetch, AskUserQuestion, mcp__minicod__search_journals, mcp__minicod__get_journal, mcp__minicod__list_journals, mcp__minicod__compare_journals, mcp__minicod__search_papers
---

# 期刊匹配工作流

帮作者找到**最适合**投稿的期刊/会议。

## Step 1: 提取论文的关键属性

如果还不清楚,用 `AskUserQuestion` 问:
- 主要研究领域 (CS / 生物 / 物理 / 跨学科)
- 子领域关键词 (3-5 个)
- 工作类型 (理论 / 实证 / 综述 / 工具)
- 目标:学术影响力 / 应用落地 / 快速发表
- 接受度容忍 (顶刊冲一冲 vs 稳妥发表)

## Step 2: 用 minicod 搜匹配期刊

`mcp__minicod__search_journals` 支持的强力筛选:
- `keywords` — 主题词匹配
- `impact_factor_min` / `impact_factor_max` — IF 区间
- `jcr_quartile` — Q1 / Q2 / Q3 / Q4
- `scimago_quartile` — Scimago 分区
- `country` — 优先国内/国际
- `subject_category` — 学科类别

建议跑 **2-3 个查询**,覆盖不同难度梯度:
1. **冲刺梯队**: 顶刊 / 顶会 (Nature / Science / NeurIPS / CVPR)
2. **主流梯队**: 领域内常规期刊 (IF 5-10 / CCF B)
3. **稳妥梯队**: 接收率高的期刊 (IF 1-3 / CCF C)

## Step 3: 类似论文都投了哪里?

用 `mcp__minicod__search_papers` 搜该论文的**最相近 5 篇**,看它们的 venue 分布,作为参考。

## Step 4: 横向对比

对最终候选 3-5 个期刊,用 `mcp__minicod__compare_journals` 一次性拿到对比表(IF、分区、接收率、平均审稿周期、领域权威性)。

## Step 5: 输出推荐

```markdown
# 投稿期刊推荐 — <论文主题>

## 🏆 冲刺梯队 (难度: ★★★★★)

### 1. <Journal/Venue 名>
- **IF**: x.x · **JCR**: Q1 · **接收率**: ~y%
- **匹配度**: ⭐⭐⭐⭐⭐
- **推荐理由**: 该期刊近 2 年发表了多篇 <相似主题> 的工作 (列 2 篇)
- **审稿周期**: 中位数 N 个月
- **风险**: 拒稿率高;审稿严格,需充分准备 rebuttal

## 🎯 主流梯队 (难度: ★★★)

### 2. ...
### 3. ...

## ✅ 稳妥梯队 (难度: ★★)

### 4. ...
### 5. ...

## 综合建议
- **首选**: <X>(理由)
- **备选**: <Y>(如果 X 拒,直接转投)
- **避免**: <Z>(原因:领域不匹配 / 审稿质量差)
```

---

**注意**:
- 不要只看 IF,看**领域匹配度**和**接收时长**
- 国内作者要考虑**SCI 一区**、**CCF A/B/C**、**中科院分区**多套指标
- 部分顶会接受率低于 15%,建议同时准备 backup 期刊
