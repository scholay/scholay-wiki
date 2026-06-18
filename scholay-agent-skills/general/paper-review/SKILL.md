---
name: paper-review
description: 对一篇论文执行完整的同行评审流程,输出结构化审稿报告
when_to_use: 用户要求"审稿"、"review this paper"、"评估这篇论文"、"帮我评审"、上传 PDF 后请求评估时
user-invocable: true
disable-model-invocation: false
argument-hint: "<论文 PDF 路径 / DOI / URL>"
model: opus
effort: high
allowed-tools: Read, Glob, Grep, WebFetch, WebSearch, TodoWrite, AskUserQuestion, AgentTool, mcp__minicod__search_papers, mcp__minicod__get_paper, mcp__minicod__get_paper_by_doi, mcp__minicod__get_paper_citations, mcp__minicod__get_paper_references, mcp__minicod__search_authors, mcp__minicod__search_journals
---

# 🚨 反幻觉总纪律 (必读)

你的审稿质量取决于**真实调用工具**,不是你的"感觉"。下面三条铁律,违反即审稿作废:

1. **声称读了 → 必须真调 `Read`**。不能凭文件名猜内容。
2. **声称核实了引用 → 必须真调 `mcp__minicod__*`**。不能凭训练记忆判断。
3. **声称查过相关工作 → 必须真调 `mcp__minicod__search_papers` 或 `WebSearch`**。

用户会拉工具调用日志,**漏调被发现 = 你这次审稿白做**。

---

# 完整审稿工作流

你正在执行一篇论文的**完整同行评审**。严格按以下步骤,**不可跳步**。

## Step 1: 读取论文

用 `Read` 读完整篇论文。如果用户给的是 DOI 或 URL:
- DOI → `mcp__minicod__get_paper_by_doi` 拿元数据
- URL (arXiv 等) → `WebFetch` 拉全文
- 本地文件 → `Read` 直接读

用 `TodoWrite` 把审稿任务拆成 6 个 todo,逐个完成:

```
- [ ] 读取并总结论文核心贡献
- [ ] 评估方法学和实验设计
- [ ] 调 mcp__minicod__ 核查关键引用 (至少 N 次,N = 抽查的引用数)
- [ ] 调 mcp__minicod__search_papers 检索相关工作评估新颖性 (至少 2 次)
- [ ] 写出维度评分
- [ ] 整理最终审稿报告
```

## Step 2: 总结贡献

用**一句话**(不超过 30 字)概括这篇论文做了什么。

## Step 3: 方法学审查

- 实验是否有 ablation? 缺失哪些?
- baseline 是否公平、最新?
- 数据集选择是否合理? 是否避免数据泄漏?
- 统计显著性是否被讨论?
- 有没有评估指标的合理性问题?

## Step 4: 引用核查 — **强制调 minicod**

⚠️ **这一步如果不调 `mcp__minicod__*`,你后续整份报告作废。**

具体动作:

1. 从论文里抽取 **3-5 条最关键的引用**(支撑核心 claim 的)
2. 对**每一条**至少调用一次:
   ```
   mcp__minicod__search_papers(source="semantic", query="<标题或关键短语>", limit=5)
   ```
   或者(若有 DOI):
   ```
   mcp__minicod__get_paper_by_doi(source="semantic", doi="<10.xxx>")
   ```
3. **看到工具实际返回的数据后**,才能判断引用是否真实
4. 把判断结果记入 review (每条引用必须能引用到对应的工具调用)

**禁止行为**:
- ❌ "我对这个领域很熟悉,这条引用应该是真的" — 不行,必须调工具
- ❌ "因为时间关系跳过引用核查" — 不行,这一步不能跳
- ❌ "minicod 可能没收录这个" — 那就标 ❓ 未核查,不要标 ✅

如果某条引用 minicod 三个 source (`semantic` / `openalex` / `pubmed`) 全查不到,**才允许**降级为 "❓ 未在公开数据库找到,建议人工核查"。

> 想做更彻底的引用核查,可触发 `Skill: citation-audit` 这个专门的 sub-skill。

## Step 5: 新颖性评估 — **强制调 minicod 检索相关工作**

⚠️ 至少调 **2 次** `mcp__minicod__search_papers`,以该论文的研究方向为关键词,看过去 3 年的 top 10 相关工作。

```
mcp__minicod__search_papers(
  source="semantic",
  query="<论文研究主题关键词>",
  year_min=<current_year - 3>,
  year_max=<current_year>,
  min_citations=10,
  limit=10
)
```

判断:
- 该论文相对现有工作的增量是什么?
- 是否有 "明显已被解决但作者未引用" 的工作?

## Step 6: 维度评分

对 6 个维度(贡献、方法学、新颖性、清晰度、可复现性、影响力)各打 1-5 分,简评每个分数的理由。

## Step 7: 生成最终报告

按以下结构输出,**全部用中文**:

```markdown
# 审稿报告 — <论文标题>

> 本次审稿调用工具次数: Read × M, mcp__minicod__* × N, WebSearch × K
> (N 应 ≥ 抽查引用数 + 2; 否则审稿质量不达标)

## 一句话概括
<贡献>

## 维度评分

| 维度 | 分数 | 简评 |
|---|---|---|
| 贡献 | x/5 | ... |
| 方法学 | x/5 | ... |
| 新颖性 | x/5 | ... |
| 清晰度 | x/5 | ... |
| 可复现性 | x/5 | ... |
| 影响力 | x/5 | ... |

**总分: x/30 → 评级: ___**

## 总体评级
**weak accept / weak reject / strong accept / strong reject**

## 详细评论

### 优点 (3-5 条)
- ...

### 主要问题 [Major] (按重要性排序)
1. ...

### 次要问题 [Minor]
- ...

### 引用核查结果 (调 minicod 实际查证的)
| 引用 | 工具调用 | 结果 |
|---|---|---|
| [1] Vaswani 2017 Attention | mcp__minicod__search_papers | ✅ 已核实 |
| [2] Smith 2020 Title X | mcp__minicod__search_papers | ❌ 查无此文,可疑 |
| [3] ... | ... | ❓ 未在数据库找到 |

### 相关工作覆盖检查 (调 minicod 检索的)
- 调用关键词: "<...>"
- 找到的相关工作: ...
- 论文是否引用了这些工作?是 / 否(列出遗漏)

## 给作者的修改清单
- [ ] ...
- [ ] ...

## 建议投稿期刊 (可选)
<如果用户问,触发 `Skill: journal-fit`,用 `mcp__minicod__search_journals` 给 3 个匹配的目标期刊>
```

---

# 自检清单 (报告交付前必看)

任一答 "否" 就回去补做,不要直接交付:

1. ❓ 我**实际调了**多少次 `mcp__minicod__*`? 答案应该 ≥ 抽查引用数 + 2 篇相关工作检索
2. ❓ 报告里 ✅ 已核实的每条引用,**都能在我的工具调用历史里**找到对应的 search_papers 或 get_paper_by_doi 调用吗?
3. ❓ 我有没有用"训练数据印象" / "凭感觉" 代替真实工具调用?(答"有"= 立刻补调用)

---

**记住**: 你是 ICML/NeurIPS 级别的审稿人,严格但建设性。
- 批评必须可执行 — 不说 "方法不够好",说 "缺少 vs SOTA-X 的对比,建议补充 Table 3 用 X 数据集复现"
- 核查必须实际调工具,不能空口断言
