---
name: citation-audit
description: 核查论文中的引用是否真实存在,作者/年份/期刊是否与文中描述一致,避免幻觉引用
when_to_use: 用户要求"核查引用"、"查这条引用对不对"、"确认这篇文献存在"、"verify references" 时,或正在做 paper-review 流程时
user-invocable: true
disable-model-invocation: false
argument-hint: "<论文路径或一段引用文本>"
model: sonnet
effort: medium
allowed-tools: Read, WebFetch, WebSearch, mcp__minicod__search_papers, mcp__minicod__get_paper, mcp__minicod__get_paper_by_doi, mcp__minicod__get_paper_citations, mcp__minicod__get_paper_authors, mcp__minicod__search_authors
---

# 🚨 绝对铁律 (Critical Rule — READ FIRST)

**任何一条引用被你标记为 `✅ 已核实` 之前,你必须先调用至少一次 minicod MCP 工具去查证它。**

**禁止行为**(违反即审稿失效):
- ❌ 不调用 `mcp__minicod__search_papers` / `mcp__minicod__get_paper_by_doi` 就声称"已核实"
- ❌ 用"我认为这篇论文应该存在"代替实际查询
- ❌ 凭印象判断作者/年份/期刊
- ❌ 把模型自己的训练数据当作核查结果

**判断规则**:
- 如果你**没有**为某条引用产生一次成功的 `mcp__minicod__*` 工具调用 → 它只能被标记为 ⚠️ **未核查**(unchecked),**绝不能**标 ✅
- 用户会拉日志检查你的工具调用,**漏调被发现 = 整份审稿作废**

---

# 引用核查工作流

LLM 经常**幻觉引用**(编造论文、张冠李戴作者、错改年份)。这个 skill 用于发现这类问题。

## 输入
- 一篇论文(PDF / 文本 / DOI),或
- 一段直接提供的引用列表

## Step 1: 抽取引用

如果输入是论文,从中提取所有引用。重点关注:
- 文中 cite 的关键文献(支撑核心 claim 的)
- 看起来"恰到好处"得令人怀疑的(符合作者论点但年份/作者拼凑感强)

输出引用清单,格式:
```
[1] Author1 et al. (Year). Title. Venue.
```

## Step 2: 逐条核查 — **每条都必须调工具**

对**每一条**关键引用,你必须执行下面的工具调用序列:

### 调用 1: 搜论文存在性

```
mcp__minicod__search_papers({
  source: "semantic",
  query: "<论文标题或关键短语>",
  year_min: <year-1>,
  year_max: <year+1>,
  limit: 5
})
```

或者(如果有 DOI):

```
mcp__minicod__get_paper_by_doi({
  source: "semantic",
  doi: "<10.xxx/xxx>"
})
```

**只有在收到工具返回结果之后,你才有资格判断这条引用是否真实**。

### 判断标准

读 minicod 返回的论文列表,逐项对比:
- 第一作者 = 引用中第一作者?
- 年份 = 引用中年份?(±1 年容忍)
- 标题 ≈ 引用中标题?(允许大小写/标点差异)
- venue 一致?

满足三项 → ✅ 已核实
缺一项 → ⚠️ 元数据不符  
完全查不到 → ❌ 可能伪造(高度可疑)

### 调用 2 (可选):查作者补强

如果论文匹配但作者拼写存疑,加一次 `mcp__minicod__search_authors` 查作者档案。

## Step 3: 输出审计报告

```markdown
# 引用核查报告

总计抽查: N 条 · 调用 minicod 次数: M 次

## ✅ 已核实 (每条必须对应至少一次工具调用)
| # | 引用 | 用了哪个工具 | 命中结果 |
|---|---|---|---|
| [1] | Vaswani et al. (2017). Attention is all you need | mcp__minicod__search_papers | semantic_id=204e3073..., 年份匹配,作者匹配 |

## ⚠️ 存疑引用

### [3] Smith et al. (2020). Title X.
- **工具调用**: mcp__minicod__search_papers(query="Title X") → 0 命中
- **问题**: 完全搜索不到匹配
- **建议**: 请作者补 DOI 或 URL,或换可验证引用

### [7] Zhang et al. (2019)
- **工具调用**: mcp__minicod__search_papers(query="...") → 命中 1 篇但元数据不符
- **问题**: 实际作者 = Zhang, J. 而非 Zhang, K.; 年份应为 2018
- **建议**: 修正元数据

## ❓ 未核查 (跳过原因)
- [N] <引用>: 因 minicod 返回错误/超时,本次未核查 — 建议人工补查

## 总结
- 主要问题 (影响审稿结论): X 处
- 次要问题 (拼写/格式): Y 处
- 调用工具次数: M  (注:正常审稿 M ≥ 抽查引用数)
```

---

# 自检清单 (生成报告前必看)

写完报告前,自问 3 个问题。任一答 "否" → 回去补调用,不要直接交付:

1. ❓ 报告里的 ✅ 是不是**每条都对应到至少一次 `mcp__minicod__*` 工具调用**?
2. ❓ 工具调用次数是不是 ≥ 抽查引用条数?
3. ❓ 我有没有把"训练数据印象"当成"已核实"?(答"有"= 立刻删那条 ✅,改成 ❓)

---

# 调用示例(参考语法)

**好的调用**:
```
mcp__minicod__search_papers(
  source="semantic",
  query="Attention Is All You Need Vaswani 2017",
  year_min=2016, year_max=2018, limit=3
)
```

**坏的调用**(空泛):
```
mcp__minicod__search_papers(query="attention")  # 太宽,会有噪音
```

**搜不到时换种说法再试**:
- 原 query: "Title X by Zhang 2019" → 0 命中
- 换: "Title X" + source=openalex
- 换: 作者 + 关键术语,去年份

---

# 关键原则

- 不要怕"打扰" minicod 接口 — **引用核查的可信度比省 token 重要 100 倍**
- 怀疑 ≠ 误判 — 用工具实际查,别凭印象判断
- 如果作者用了**冷门 venue / 预印本**,要尝试不同变体(去年份、换作者顺序、换 source)
- minicod 三个 source (`semantic` / `openalex` / `pubmed`)各有侧重,可以多查一个 source 互相验证
