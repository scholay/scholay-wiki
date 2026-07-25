---
name: minicod-search-strategy
description: 学术检索的「怎么找得全、找得准」策略——查询拆解、同义扩展、引文滚雪球、作者枢纽、覆盖度与何时停
when_to_use: 每次为用户找论文时都适用;尤其是初次结果不理想、需要系统性覆盖一个主题、或要顺藤摸瓜扩展文献时
user-invocable: false
disable-model-invocation: false
allowed-tools: mcp__minicod__search_papers, mcp__minicod__get_paper, mcp__minicod__get_paper_references, mcp__minicod__get_paper_citations, mcp__minicod__search_authors, mcp__minicod__get_author, mcp__minicod__get_author_papers, mcp__minicod__get_journal, mcp__minicod__match_paper, mcp__minicod__get_papers_batch, mcp__minicod__search_papers_bulk, mcp__minicod__search_snippets, mcp__minicod__get_related_works, mcp__minicod__recommend_paper, mcp__minicod__recommend_from_pool, mcp__minicod__group_works
---

# 检索策略(找得全 + 找得准)

系统提示已规定了工具边界、source 品牌名、limit/重试/报错纪律与输出格式——那些**照做**。本技能补的是「怎么检索才有质量」。

## 1. 先把问题拆成概念块,别一句话直搜

把用户的需求拆成 2-4 个**概念块**(方法 / 对象 / 场景 / 指标),每块列几个同义或相关术语,再组合成查询:

- 中文需求先转成**英文学术术语**(检索命中率高得多),必要时保留领域黑话。
- 一个概念用多个说法轮换:如「大模型」= large language model / LLM / foundation model;「小样本」= few-shot / low-resource。
- 宽 → 窄:先用核心 2-3 词探路(limit=5),看回的论文标题/术语,再据此收紧或换词。别一上来堆一长串限定词把结果逼到 0。
- **确切标题就别模糊搜**:用户已给出某篇的确切标题时,用 `match_paper`(传标题)直接解析到那一篇,比关键词 search 准得多、也省调用。
- **一批已知 ID 一次水合**:手里已有一组论文 ID(来自引文链、推荐、用户粘贴)要补全元数据时,用 `get_papers_batch` 一次取回,别逐篇 `get_paper`。

## 2. 顺藤摸雪球:一篇好文 → 一片文献

找到 1-2 篇高相关的「种子论文」后,别停在关键词搜:

- **往回查**(`get_paper_references`):看它引了谁 → 找到该方向的**奠基/经典**工作。
- **往前查**(`get_paper_citations`):看谁引了它 → 找到**最新进展**与后续改进。
- **找近邻**(`get_related_works` / `recommend_paper`):从一篇种子直接要「相似 / 相关」论文,补上引文链之外的旁支同类工作。
- **由种子池扩展**(`recommend_from_pool`):已攒到一小撮高相关论文时,把它们当种子池,让系统顺整池共性推更多同向工作——比逐篇换关键词更贴。
- 反复 1-2 轮,主题的核心文献网就基本浮现了。经典 + 最新两头都要,别只给一堆同质近作。

## 3. 作者枢纽:认准领域里的关键人

某几位作者反复出现时,用 `search_authors` → `get_author_papers` 直接拉他们的相关近作——常能补齐关键词搜不到的重要文献。

## 4. 覆盖度自检 + 何时停

给结论前快速自问:

- **多角度了吗**:同一需求是否至少从 2 个查询角度(不同术语/不同 source)搜过?只搜一次就交差容易漏。
- **两头都有吗**:既有该方向的奠基工作,也有近 1-2 年的新进展?(年份换算按系统提示以【当前日期】为准。)
- **去重了吗**:标题/DOI 相同的合并,最终清单通常 ≤ 10 篇,按相关度排序。
- **停的信号**:新一轮检索只反复返回已见过的论文 → 覆盖够了,可以收尾;而不是硬凑数量。

## 5. 结果稀疏时的扩展顺序

命中太少时,依次放宽:换英文/同义术语 → 拆短 query → 放宽或去掉年份 → 换 source(Graph/Discovery/Medicine)→ 转作者反查。每轮只动一个维度,便于判断哪个维度是瓶颈。

中文/本土题材命中差是**覆盖问题**(平台无知网 CNKI/万方/维普),不是检索技巧问题——转英文术语检索并向用户如实披露覆盖限制、建议其自行在知网/万方补充,不要无限重试,更不许声称已检索任何中文数据库。

反过来,需要**超大规模深翻**(要成百上千地系统性扫一个主题、普通 search 的 offset 翻页窗口不够用)时,换 `search_papers_bulk` 做批量深翻,别硬用普通 search 翻到窗口尽头。

## 6. 要「可引用的原文」时:取片段,而非只取标题

当用户要的是**有出处、能落引用、能核对的证据**(不是「有哪些论文」,而是「这句话谁说的 / 原文怎么写」),用 `search_snippets` 直接取带出处的原文片段——它返回可溯源的文本段落,避免凭标题猜内容、避免编造。反幻觉场景优先走这条。

## 7. 问「近几年热度 / 分布 / 趋势」时:分桶看,别逐篇数

遇到「这个方向近几年火不火」「主要集中在哪些机构 / 子主题」这类分布性问题,用 `group_works` 把一批结果按年份 / 机构 / 主题分桶,直接看聚合走向来回答;别把一堆论文一篇篇列出来当趋势结论。
