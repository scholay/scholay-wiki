# Aider
> kind: project · confidence: high · last-checked: 2026-06

> 说明:本文围绕「多用户 Web 学术 agent 平台」改造视角整理。3-6 个最关键/最反直觉的结论已逐条对照
> primary source(GitHub 源码 / aider.chat 官方文档)核验,核验结果在正文标注。未能从 aider 一手来源
> 确认的内容标 [UNVERIFIED]。

## 概述

Aider 是一个开源的 **AI 结对编程 CLI**:在你本地的 git 工作目录里直接改代码,每次改动自动 commit 并生成提交信息;
靠 tree-sitter 生成的「repo map」理解既有代码库,可对接几乎任意 LLM(LiteLLM 后端)。
来源:[github.com/Aider-AI/aider](https://github.com/Aider-AI/aider)。

形态上它是**单用户、单机、终端优先**的工具 —— 与多用户 Web 平台正好相反。因此它的**算法思想**(repo map、
architect/editor、edit format、git 作审计)很值得借鉴,但它的**部署/隔离模型完全不能照搬**:Aider 自身不提供任何
多租户、沙箱、服务化能力。

## 关键架构决策

**会话/状态模型 = 本地文件,而非 DB / 常驻进程。**
聊天记录持久化到工作目录下的 `.aider.chat.history.md`;「活动上下文」是用户显式增删的一组文件(`/add`、`/drop`)
加上自动生成的 repo map。来源:[commands](https://aider.chat/docs/usage/commands.html)、[repomap docs](https://aider.chat/docs/repomap.html)。

**主循环 = edit-format 往返,而不是 tool-call ReAct 循环。**
Aider 把 repo map + 在场文件 + 历史发给 LLM,LLM 用结构化的 **edit format** 回复改动,Aider 解析后落盘,
再跑 lint/test,可把报错回喂给模型修复。代码结构印证这点:`aider/coders/` 下一个 `Coder` 基类 + 按 edit format 分的
子类,外加 `repomap.py` / `commands.py` / `models.py` / `io.py` / `history.py` / `linter.py` / `repo.py` 等。
来源:[edit-formats](https://aider.chat/docs/more/edit-formats.html)、[源码树](https://github.com/Aider-AI/aider/tree/main/aider)、[README](https://github.com/Aider-AI/aider)。

**持久化 = git 即数据库。** 每次接受的改动都是一个 commit;开工前若工作区已有脏改动会先单独 commit,以隔离 AI 改动;
review/回滚走普通 git 或 `/undo`。来源:[git integration](https://aider.chat/docs/git.html)。

**传输层 = 交互式终端 REPL,无内建 server/WS。** 自动化靠 `--message`/`-m`、`--message-file`/`-f`、`--yes`、
`--dry-run`,或 **Python API**(`Coder.create(...)`、`coder.run("...")`、`InputOutput(yes=True)`)。
来源:[scripting](https://aider.chat/docs/scripting.html)。

### Repo map(tree-sitter + PageRank)——最值得抄的点 ✅ 已核验源码

以下机制逐行核对了 `repomap.py` 源码,全部属实:
- **tree-sitter 解析 AST**,抽取每个符号(函数/类/变量/类型)的**定义点**与**引用点**。
- 构建 **`networkx.MultiDiGraph`**:节点=文件,边 = `引用方 → 定义方`,边权 = `use_mul * sqrt(num_refs)`;
  源码:`num_refs = math.sqrt(num_refs)` + `G.add_edge(referencer, definer, weight=use_mul * num_refs, ...)`。
- 跑 **`nx.pagerank(G, weight="weight", **pers_args)`** 排重要度,`pers_args` 含 `personalization`/`dangling`。
- **向当前会话「人格化」偏置**:当前在 chat 里的文件,其出边权重乘 **50×**(源码:`if referencer in chat_rel_fnames: use_mul *= 50`);
  chat 文件 / `mentioned_fnames` / `mentioned_idents` 还进 PageRank personalization 向量。
- **二分搜索做 token 预算**:把排好序的 tags 渲染成树,二分裁剪直到 token 数落在 `--map-tokens` 预算附近;
  源码确有 `lower_bound`/`upper_bound`/`middle = (lower_bound+upper_bound)//2` 的二分循环。默认 `map_tokens=1024`
  (源码 `def __init__(self, map_tokens=1024, ...)`)。map 大小会动态自适应(上下文里没文件时扩大)。
- 净效果:LLM 看到的是**整个仓库的签名 + 结构**,而非全文 —— 知道该问哪些文件、并尊重既有抽象。
来源:[repomap.py 源码](https://github.com/Aider-AI/aider/blob/main/aider/repomap.py)、[repo map 原理博客 2023-10](https://aider.chat/2023/10/22/repomap.html)、[repomap docs](https://aider.chat/docs/repomap.html)。

### Edit formats(改动「能否落地」的可靠性)✅ 已核验

- **whole** —— 返回整份更新后的文件;最简单、最费 token。
- **diff** —— search/replace 块(git 冲突标记风格),只返回改动区域,省 token。
- **diff-fenced** —— 把文件路径放在 fence **内**;主要给 Gemini 系(原文:"primarily used with the Gemini family")。
- **udiff** —— 简化版 unified diff;主要给 GPT-4 Turbo 系,用来压制其「偷懒/占位注释」倾向。
- **editor-diff / editor-whole** —— architect 模式下给 editor 模型用的精简变体(配合 `--editor-edit-format`)。
- Aider 会**按模型自动选最优格式**("configured to use the optimal format for most popular, common models"),
  可用 `--edit-format` 覆盖。
来源:[edit-formats](https://aider.chat/docs/more/edit-formats.html)。

### Architect/editor 双模型拆分 ✅ 已核验数字

- **问题陈述(原文直引):** 单模型"has to split its attention between solving the coding problem and conforming to
  the edit format."(既要解题又要守格式)。
- **机制:** architect 模式下,architect 模型用自然语言提方案,editor 模型把方案翻成精确的 `editor-diff`/`editor-whole` 改动。
- **2024 architect 博客(aider 自家 code-editing benchmark):** o1-preview(architect)+ o1-mini 或 DeepSeek(editor)= **85.0%**;
  o1-preview(architect)+ Claude 3.5 Sonnet(editor, diff 格式)= **82.7%**。
- **2025 R1+Sonnet(polyglot benchmark)逐项核对属实:** R1 architect + Sonnet editor = **64.0%**,edit-format 正确率 **100.0%**,
  花费 **$13.29**(原文:"14X less cost compared to the previous o1 SOTA",对比 o1 单跑 **$186.50**);
  单跑基线:o1 61.7%/R1 56.9%/Sonnet 51.6%。
- **重要反直觉点(原文直引):** 拆分**并非总有收益** —— "o1 paired with Sonnet didn't produce better results than just
  using o1 alone. Using various other models as editor didn't seem to improve o1 or R1 versus their solo scores."
  收益主要出现在「强推理但不擅长格式输出」的模型上。
来源:[architect 博客 2024-09](https://aider.chat/2024/09/26/architect.html)、[R1+Sonnet 博客 2025-01](https://aider.chat/2025/01/24/r1-sonnet.html)、[modes](https://aider.chat/docs/usage/modes.html)。

## 编排与子 agent

- **唯一**的多模型结构就是 architect → editor 的**固定两段流水线**,不是动态子 agent / swarm。
  没有 planner/worker 扇出,一手文档里没有「agent 派生 agent」。来源:[modes](https://aider.chat/docs/usage/modes.html)。
- [UNVERIFIED] 是否存在任何更复杂的子 agent 系统 —— 一手文档未见。

## 记忆

- **短期:** 会话内聊天历史 + `ChatSummary` 递归摘要。源码 `history.py` 确有 `too_big()`(`return total > self.max_tokens`)
  与递归摘要(`summarize_real(...)` 自调用 `depth+1`)。注:源码层用 `self.models[0]` 做摘要,但**官方 options 文档**明确
  `--weak-model` 即「用于 commit message 与 chat history summarization」的廉价模型(例如 Gemini 2.5 Pro 默认配
  gemini-2.5-flash 做 weak)。来源:[history.py](https://github.com/Aider-AI/aider/blob/main/aider/history.py)、[options](https://aider.chat/docs/config/options.html)、[git](https://aider.chat/docs/git.html)。
- **跨会话持久化:** 转录文件 `.aider.chat.history.md` + git commit log 本身。来源:[git](https://aider.chat/docs/git.html)。
- **持久「规则」记忆:** `CONVENTIONS.md` 经 `/read` / `--read` / `.aider.conf.yml` 的 `read:` 加载,
  官方原文:"marked as read-only, and cached if prompt caching is enabled." 这是 aider 最接近「项目级长期记忆」的东西。
  来源:[conventions](https://aider.chat/docs/usage/conventions.html)。
- **无向量/语义长期记忆:** 一手文档中对代码库的「记忆」是**每次由 repo map 重算**而非存储。[UNVERIFIED] 是否有任何 embedding/长期记忆存储。

## 多用户与隔离

- **没有。** Aider 单用户运行,以调用者身份直接改真实工作树,在宿主机上跑用户自己的 lint/test。
  任何隔离都得由**运维方**自己把它塞进容器/VM —— Aider 本身不提供。
  **对我们平台是直接缺口:** 关于「每用户隔离」Aider 给不了任何答案,这一层必须我们自建。
  来源:[github.com/Aider-AI/aider](https://github.com/Aider-AI/aider)、[git](https://aider.chat/docs/git.html)。

## 扩展性(工具 / MCP / 插件)

- **核心无原生/一等公民的 MCP 支持。** 已核验:aider 官方文档与源码里没有内建 MCP;社区有第三方包装
  (如 `mcpm-aider` 把 aider 接到任意 MCP server、以及把 aider 本身封成的「Aider MCP Server」),
  但这些都是**外挂,不属于 aider 本体**。因此**不要假设它有 Claude Code 那样的工具/MCP 生态**。
  来源:社区项目 [PulseMCP: Aider MCP Server](https://www.pulsemcp.com/servers/disler-aider)(第三方,非官方)。
- 真正的扩展点是:**Python API**(`Coder`/`Model`/`InputOutput`,把 aider 嵌进更大程序);
  可插拔的 **edit formats**(`coders/` 子类)与 **models**(任意 LiteLLM provider,可分别配 weak/editor/main 模型);
  **lint/test 命令**作为用户自定义 hook;`--read` 注入 conventions;给 repo map 加新语言 = 加 tree-sitter `queries/`。
  来源:[scripting](https://aider.chat/docs/scripting.html)、[源码树](https://github.com/Aider-AI/aider/tree/main/aider)、[README](https://github.com/Aider-AI/aider)。

## 调度与异步

- **一手文档里没有** cron/队列/后台任务系统。最接近的是 `--watch`/IDE watch 模式(响应文件内注释触发器)
  与非交互的 `-m`/`-f` 批处理(需由外部调度)。来源:[watch](https://aider.chat/docs/usage/watch.html)、[scripting](https://aider.chat/docs/scripting.html)。
- [UNVERIFIED] 是否有任何内部调度器 —— 一手文档未见。

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **「语料图 + PageRank」式的 repo map。** 我们的领域是论文/作者/期刊而非代码:把「文件→文档、引用→引文」,
   做 PageRank 并**向当前会话提及的实体人格化偏置**(那个 50× 的 chat-file 加权是精髓),给 LLM 一份
   **按 token 预算裁剪**、动态相关的大语料地图,而不必把全文塞进去。
2. **二分搜索的上下文 token 预算。** 渲染→计数→裁剪,卡在硬上限的容差内 —— 多租户下控制每用户上下文成本的干净做法。
3. **architect/editor 拆分当成本杠杆,但要按情况门控。** 贵的推理模型出方案,廉价快模型出**结构化产物**
   (引文、LaTeX 改动、JSON)—— R1+Sonnet 在 14× 更低成本拿到 SOTA。正好对应我们 `agent_config` 的
   provider/model 拆分;但要门控(并非总是赢)。
4. **结构化 edit format + 按模型自动选格式 + 把「改动是否落地」当一等指标。** 任何「改产物」类功能(Prism LaTeX、
   文献集编辑)优先用 **search/replace diff 而非整文件重写**,按模型自动挑格式,并把 **apply-success rate** 当作
   独立于「任务成功率」的质量指标来追踪(R1+Sonnet 的 100% edit-format 正确率就是这个意义)。
5. **git 当 AI 改动的审计日志。** 每用户、每产物自动 commit + 生成信息 + 一键 `/undo` —— 对「可 review、可回滚的
   agent 改动」是极佳模型。可考虑给每用户一个 git 仓库(或对象存储上的 libgit2/isomorphic-git),一举拿下
   隔离 + undo + 记忆三件事,替代当前 shared-fs jsonl。
6. **用廉价 weak model 做递归历史摘要。** `ChatSummary` + `--weak-model` 让长会话廉价地留在上下文窗口内 ——
   用在我们的长 agent 会话上,别让 jsonl 无界增长。
7. **持久、缓存、只读的「约定」注入。** `CONVENTIONS.md`(只读 + prompt-cached)是轻量的「规则型长期记忆」模式 ——
   可做成每用户/每工作区自动加载并缓存的「偏好」文档。
8. **显式的 ask↔code 模式门控。** 一个**不能改状态**的只读「ask/讨论」模式 + 显式切到编辑模式,是 Web 产品里
   干净的安全/UX 边界。来源:[modes](https://aider.chat/docs/usage/modes.html)(已核验:code/architect/ask/help 四模式,
   `/ask`、`/code`、`/architect`、`/help` 可中途切换,ask 模式 "never make changes")。

## 局限

- **不为多用户/服务端设计** —— 无隔离、无守护进程、无每用户沙箱;只能借算法,不能借部署模型。
  来源:[github.com/Aider-AI/aider](https://github.com/Aider-AI/aider)。
- **明确不为超大仓库/响应时间优化** —— repo-map PageRank 每次重算可能慢;对语料级规模需自建缓存/增量索引。
  来源:[faq](https://aider.chat/docs/faq.html)。
- **无长期/语义记忆** —— 上下文是重算而非记忆;我们「缺长期记忆」这个坑 Aider 也有,故它不是这方面的解法来源。
- **无调度/后台任务** —— 我们 cron/async 的缺口在它这里没东西可借。来源:[watch](https://aider.chat/docs/usage/watch.html)。
- **architect/editor 不是免费午餐** —— 多一次模型调用 + 延迟,且有时打不过单模型。来源:[R1+Sonnet 博客](https://aider.chat/2025/01/24/r1-sonnet.html)。
- **核心无 MCP/插件生态** —— 别假设与 Claude Code 工具/MCP 生态对等;只有第三方外挂。

## 附:基准与排行榜(已核验为 aider 一手 leaderboard,非二手聚合)

- **Polyglot benchmark:** 225 道高难度 Exercism 习题,覆盖 C++、Go、Java、JavaScript、Python、Rust;
  衡量「无人值守的指令遵从 + 改动正确落地」。
- Aider 维护**多个** leaderboard(code editing、polyglot,以及 refactoring;原 draft 说「两个」**不准确,实为三类**)。
- 当前榜首(aider.chat 官方 leaderboard 页直读,**已从原 draft 的 [UNVERIFIED] 升级为已核验**):
  GPT-5 (high) **88.0%** / $29.08;GPT-5 (medium) **86.7%** / $17.69;GPT-5 (low) 81.3% / $10.37;
  Gemini 2.5 Pro Preview (32k thinking) **83.1%** / $49.88。(分数随版本快速变化,以官方页为准。)
- **值得注意的信号:** edit-format 正确率与 pass rate **并列报告** —— 把「改动到底有没有应用上」当一等质量指标。
来源:[leaderboards](https://aider.chat/docs/leaderboards/)、[R1+Sonnet 博客](https://aider.chat/2025/01/24/r1-sonnet.html)。

## Sources

- https://github.com/Aider-AI/aider
- https://github.com/Aider-AI/aider/tree/main/aider
- https://github.com/Aider-AI/aider/blob/main/aider/repomap.py
- https://github.com/Aider-AI/aider/blob/main/aider/history.py
- https://aider.chat/docs/repomap.html
- https://aider.chat/2023/10/22/repomap.html
- https://aider.chat/2024/09/26/architect.html
- https://aider.chat/2025/01/24/r1-sonnet.html
- https://aider.chat/docs/more/edit-formats.html
- https://aider.chat/docs/usage/modes.html
- https://aider.chat/docs/usage/commands.html
- https://aider.chat/docs/usage/conventions.html
- https://aider.chat/docs/usage/watch.html
- https://aider.chat/docs/scripting.html
- https://aider.chat/docs/git.html
- https://aider.chat/docs/config/options.html
- https://aider.chat/docs/leaderboards/
- https://aider.chat/docs/faq.html
- https://www.pulsemcp.com/servers/disler-aider (第三方社区 MCP 包装,非官方)
