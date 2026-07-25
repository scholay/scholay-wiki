---
name: prism-citation-grounding
description: 引用反幻觉硬约束 —— 绝不凭记忆编造 [@键]/BibTeX/DOI/年份;要引证先用 minicod 查真论文→写进 references.bib→正文 [@键];润色时保留所有 [@键] 位置。在 Prism 里涉及文献引用时始终遵循。
when_to_use: 需要引证某个说法、加/改参考文献、或润色含 [@键] 的正文时(始终生效)
user-invocable: false
disable-model-invocation: false
allowed-tools: Read, Glob, Grep, Edit, Write, MultiEdit, mcp__minicod__search_papers, mcp__minicod__get_paper_by_doi, mcp__minicod__match_paper, mcp__minicod__search_snippets
---

# 引用反幻觉(Prism · 常驻硬约束)

会话工作区里除了 `document.md`,还有一份 **`references.bib`**(BibTeX)。**引用条目就写在这里**(用 Read/Edit/Write 改),轮末系统把它解析进参考文献表并编号渲染。

## 铁律:绝不编造
- **只引 minicod 真检索到的论文**。BibTeX 里的**标题/作者/年份/期刊/DOI 必须是 minicod 返回的真实值** —— **不许凭记忆编文献、编 DOI、编年份、编作者**。
- 查不到支撑某说法的真实文献 → **别硬引**。把话写扎实、用文字交代来源/直觉即可,或告诉用户此处需要一篇能支撑的文献。
- 幻觉引用是学术不端,一旦出现比"少一条引用"严重得多。

## cite-then-write(先查后引)
要引证某个 claim 时的顺序:
1. 用 **minicod MCP** 检索/定位真实论文——按手上的线索选最准的那个入口:
   - **有 DOI**(如从参考文献字符串里拆出来的)→ `mcp__minicod__get_paper_by_doi` 直接精确定位那一篇;
   - **有确切标题**(如要为某条参考文献字符串找真身)→ `mcp__minicod__match_paper`(传标题)精确解析成单篇,比模糊搜准;
   - **只有主题/关键词** → `mcp__minicod__search_papers` 按主题/作者检索;
   - **要给某一句 claim 配「有出处的原文片段」** → `mcp__minicod__search_snippets` 取可引用的原文段落,拿它落成真实引用、也便于核对措辞。
2. 从返回结果拿**真实元数据**;
3. 写成一条 BibTeX **追加进 `references.bib`**;
4. 正文用 `[@键]` 引用(键 = 你在 `@article{键,...}` 里起的键)。

**别先写 `[@smith2020]` 再回头凑一篇** —— 那是编造的温床。没查到就不写这个引用。

## BibTeX 条目
键用「首作者姓氏 + 年份」(如 `smith2020`;同姓同年加字母 `smith2020a`):
```
@article{smith2020,
  title   = {论文标题},
  author  = {Smith, John and Doe, Jane},
  year    = {2020},
  journal = {期刊名},
  doi     = {10.xxxx/xxxxx},
}
```
- 正文引用:`[@smith2020]`(相邻多篇自动并成 `[1,2]`)。
- `[@fig:x]`/`[@tbl:x]`/`[@sec:x]`(带前缀)是**交叉引用**,不是文献 —— **别写进 `references.bib`**(见 `prism-edit-discipline`)。

## 润色 / 改写时
- **保留所有已有 `[@键]` 的位置**,别漏、别挪、别合并到改变语义。
- 要删某处引用 → 删**正文**的 `[@键]`;**别删 `references.bib` 里别处还在用的条目**。
- 改写句子时若拆分/合并了带引用的句子,确保每条 claim 仍挂着它原来的支撑引用。

## 收尾自查
每条正文 `[@文献键]` 在 `references.bib` 里都有对应条目、且条目来自 minicod 真检索(作者/年/DOI 真实、没编);已有 `[@键]` 位置没挪;没有交叉引用锚(fig:/tbl:/sec:)混进 `references.bib`。
