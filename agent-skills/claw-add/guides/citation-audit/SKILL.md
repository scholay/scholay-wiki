---
name: citation-audit
description: 核查论文/文本里的引用是否真实存在,作者/年份/期刊是否与文中描述一致,识别幻觉引用
when_to_use: 用户要求「核查引用」「查这条引用对不对」「确认这篇文献存在」「verify references」,或让你基于一份参考文献列表判断真伪时
user-invocable: false
disable-model-invocation: false
allowed-tools: Read, ReadDocument, mcp__minicod__search_papers, mcp__minicod__get_paper, mcp__minicod__get_paper_by_doi, mcp__minicod__match_paper, mcp__minicod__search_authors
---

# 引用核查

> 引用真实性红线(引用只许来自工具返回或用户材料、未验证必须标注、绝不宣称"已检索/已核实"却零调用)
> **已是常驻系统铁律**,任何时候都生效;本技能是其操作手册,给出逐条核查的具体流程。

LLM 写作常**幻觉引用**(编造论文、张冠李戴作者、错改年份)。本技能用于查出这类问题。

## 🚨 铁律(先读)

**任何一条引用被你标 `✅ 已核实` 之前,必须先成功调用一次 minicod 工具查证它。**

- 没有为某条引用产生一次成功的 `mcp__minicod__*` 调用 → 只能标 ⚠️ **未核查**,**绝不能**标 ✅。
- 禁止用「我印象里这篇应该存在」「训练数据里有」代替实际查询。
- 用户会拉工具调用日志比对,漏查被发现 = 整份核查作废。

## 工作流

1. **抽取引用**。输入是论文(PDF/文本)就提取参考文献;重点是支撑核心结论的关键引用,以及那些「恰好符合作者论点但作者/年份拼凑感强」的可疑项。
2. **逐条查证**(每条关键引用都要调工具,按手上线索选最准的入口):
   - **有 DOI** → 用 `mcp__minicod__get_paper_by_doi` 精确解析(DOI 直接定位那一篇,比把 DOI 当关键词搜准得多);
   - **没 DOI 但标题确切** → 用 `mcp__minicod__match_paper`(传标题)直接匹配到单篇;
   - **只有模糊信息** → 用 `mcp__minicod__search_papers` 以标题或标题+作者+年份为 query 搜(搜不到就换措辞、去年份、换 source 再试)。
   - 命中候选后可用 `mcp__minicod__get_paper` 取详情核对,作者拼写存疑时用 `mcp__minicod__search_authors` 补查。
   - 拿到工具返回结果**之后**才有资格判断真伪。
3. **判定**(收到返回后逐项比对):第一作者、年份(±1 年容忍)、标题(容许大小写/标点差异)、venue。
   - 四项基本吻合 → ✅ 已核实
   - 命中但有项对不上 → ⚠️ 元数据不符(指出差在哪)
   - 多次不同措辞都 0 命中 → ❌ 高度可疑(可能伪造)
   - 工具报错/超时 → ❓ 未核查(说明原因)

## 输出报告

在聊天里直接用 GFM 表格 + 分段呈现(界面会渲染):

```markdown
# 引用核查报告
抽查 N 条 · 调用 minicod M 次

## ✅ 已核实
| # | 引用 | 用的工具 | 命中 |
|---|------|---------|------|
| [1] | Vaswani et al. (2017) Attention is all you need | search_papers | 年份/作者匹配 |

## ⚠️ 存疑 / ❌ 可疑
- **[3] Smith et al. (2020) Title X** — search_papers 多次 0 命中 → 可能伪造;建议作者补 DOI/URL 或换可验证引用。
- **[7] Zhang et al. (2019)** — 命中 1 篇但作者应为 Zhang, J.、年份应 2018 → 修正元数据。

## ❓ 未核查
- [N] 因 minicod 超时/报错未查,建议人工补。

## 小结:主要问题(影响结论)X 处 · 次要(拼写/格式)Y 处 · 工具调用 M 次
```

## 交付前自检(任一答「否」就回去补调用,别直接交)

1. 报告里每个 ✅ 是否都对应至少一次成功的 `mcp__minicod__*` 调用?
2. 工具调用次数是否 ≥ 抽查的关键引用条数?
3. 有没有把「训练数据印象」当成「已核实」?(有 → 立刻把那条 ✅ 降级为 ❓)

> minicod 有多个 source(对外品牌名 Graph / Discovery / Medicine),冷门 venue 或预印本可换 source、去年份、调整作者顺序多试几次。引用核查的可信度远比省几次调用重要。对用户提及数据源时只用 Graph / Discovery / Medicine 这三个品牌名,绝不暴露上游原始数据库名。
