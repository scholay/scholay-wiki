# Memory & long-term user memory
> kind: dimension · confidence: high · last-checked: 2026-06

## 概述

本维度调研「agent 长期记忆 / 跨会话用户记忆」的主流架构。研究背景:我们当前是一个 CLI 风格的 Claude-Code agent 跑在 HTTP+WS 守护进程里,**每用户每 feature 的 session 数据落在共享文件系统的 jsonl** 里(jsonl 即真值),**没有租户隔离、没有长期记忆、没有调度**。本文对标 6 个生态系统:Letta/MemGPT、Mem0、Zep/Graphiti、LangMem、Anthropic 官方 memory tool + context editing,以及 CLAUDE.md/AGENTS.md 这种「文件即程序性记忆」的做法。

**2026 年记忆分层共识(四层心智模型)**:第一层是 in-context 短期记忆,后三层是长期记忆。

- **短期 / 工作记忆(short-term / working)**:最近对话轮、工具输出、中间状态。在 LangGraph 里就是 thread checkpointing。
- **情景记忆(episodic)**:"what happened" —— 过往交互 / 已完成任务的摘要。
- **语义记忆(semantic)**:"what is known" —— 事实、用户偏好、领域知识、概念间关系。
- **程序性记忆(procedural)**:"how things should be done" —— 学到的工作流、代码模式、工具使用习惯、评审规范、部署步骤。Mem0 坦承「专门管理程序性记忆的工具仍处早期阶段」(已核实)。

注:Mem0 原文把「episodic + semantic」称为「大多数系统聚焦的两类」,procedural 是其补充的第三类长期记忆;atlan 等二手综述把 episodic/semantic/procedural 称为三层长期记忆的跨工具共识。短期记忆单列在长期记忆之外。

---

## 关键架构决策

各家在记忆上的根本取舍:

1. **DB 是真值,context window 是可重建视图(Letta)**。所有 state(记忆、用户消息、推理、工具调用)都持久化在数据库里,即使被挤出 context window 也永不丢失。这与「jsonl 即真值」是**完全相反**的范式 —— 也是对我们最直接的启示。

2. **记忆是一层服务,不是 agent 框架(Mem0)**。"a universal, self-improving memory layer for LLM applications that enables persistent context across sessions" —— 可挂到任意 agent 上,而非自带 agent runtime。

3. **时序优先(bi-temporal)(Zep/Graphiti)**。事实带 `valid_at` / `invalid_at`,信息变化时「旧事实被作废而非删除」,可查询「现在为真」或「任意历史时刻为真」。

4. **客户端工具,后端你自管(Anthropic memory tool)**。Claude 只发工具调用,**由你的应用执行**到任意后端(文件/DB/云/加密)。对我们这种已经是 Claude-Code 风格的栈,改造成本最低。

5. **热路径工具 + 后台 manager 双轨(LangMem)**。既给 agent 显式 save/search 工具,又跑后台异步抽取器,不依赖单一路径。

---

## 编排与子 agent

**Letta sleep-time 双 agent 架构(本维度最值得借鉴的「子 agent」模式,已核实)**:两个 agent **共享同一组 memory blocks**。

- **Primary agent(主 agent)**:面向用户、低延迟、确定性强;在 sleep-time 模式下**不给它编辑 core memory 的工具**,只有 `conversation_search` / `archival_memory_search`。
- **Sleep-time agent(休眠期 agent)**:**异步在后台运行**,从对话历史生成 learned context 去更新 primary agent 的 memory blocks,把「最重要的信息 / 洞见」写入 block,做合并、去重、重组。
- **触发**:每 N 步触发一次,`sleeptime_agent_frequency` **默认 5**。
- **可用不同模型**:sleep-time agent 因不受延迟约束,常用更强的模型。

**Mem0 actor-aware(群聊 / 子 agent 区分,已核实)**:user 消息存到 `user_id`,assistant/agent 消息存到 `agent_id`;检索时可按参与者和 session 过滤,把「用户陈述的事实」和「agent 推断出来的内容」分开。

**Letta 共享 memory block**:block 是独立的 DB 行(`block_id`),通过 `block_ids` 挂到多个 agent;一处修改、所有挂载它的 agent 立即同步 —— 「If multiple agents are attached to a block, they will all have the block data in their context windows (essentially providing shared memory)」。

---

## 记忆

### Letta / MemGPT —— 自编辑记忆块 + 三层 OS 隐喻(已核实)

来自 MemGPT「LLM as OS」论文。三层(OS 隐喻):

- **Core memory** = in-context 的 **memory blocks**,「pinned to the system prompt」。每个 block 有字段 `label`、`description`、`value`、`limit`(字符上限)、`read_only`(布尔,可选,默认可写)。默认 block:**persona**(agent 行为)与 **human**(用户事实);Letta 对这两个常用 label 自动生成默认 description。
- **Recall memory** = 可搜索的完整对话历史。
- **Archival memory** = 「explicitly formulated knowledge stored in external databases」,语义可搜,按需查询。

**自编辑工具名(verbatim,legacy MemGPT agent)**:`core_memory_append`、`core_memory_replace`(删除 = 替换为空串)、`archival_memory_insert`、`archival_memory_search`、`conversation_search`(搜 recall storage)。

**新增**:Letta Code SDK agent 用 **MemFS**,「our latest memory system which is git-tracked」(文件化、版本可控的记忆)。[内部实现 UNVERIFIED]

### Mem0 —— LLM 抽取 + 可组合作用域 + 实体链接(已核实)

**两阶段 ADD 流水线**:

1. **Extraction(抽取)**:把消息过一遍 LLM,「pulls out key facts, decisions, or preferences」。
2. **Conflict resolution(冲突消解)**:对已有记忆查重 / 查矛盾,「the latest truth wins」(隐式 ADD/UPDATE/DELETE/NOOP),再写入向量库。
   - `infer=True`(默认)抽取 + 去重;`infer=False` 存原始 payload(会重复)。
   - 2026 算法 = **single-pass ADD-only extraction**:把「agent 生成的事实」当一等公民,以与「用户陈述的事实」同等权重存储 agent 的确认和推荐。

**可组合作用域(核心多用户模式,verbatim)**:每次记忆写入至少关联其一:`user_id`(跨所有 session 长期个性化)、`agent_id`(某 agent 实例)、`run_id`/`session_id`(单次对话/run,自动过期)、`app_id`/`org_id`(共享组织上下文)。「Mem0 stores each layer separately and merges them when you query」。

**Graph —— 他们走了回头路(已核实,关键反直觉点)**:2026 版「replaced external graph store support with built-in entity linking」;「The `relations` field from prior versions is gone. Entity relationships now influence retrieval ranking but cannot be traversed directly」—— 用可查询性换掉了「跑一个 Neo4j 实例」的部署开销。(开源版是否仍保留可选 graph store:[UNVERIFIED] —— graph-memory 文档页 404。)

**检索**:**multi-signal retrieval** 并行跑三路打分(语义相似度 + 关键词匹配 + 实体匹配)再融合;可选第二趟 reranker。

**生产经验(18 个月迭代)**:async 写为默认(「Memory writes that block the response pipeline add latency」,v1.0.0 起 `async_mode=True` 默认),reranking,metadata 过滤,更新打时间戳,project 级深度配置,结构化错误码。

**Benchmark(全部已核实)**:LoCoMo 92.5(6,956 tokens/query)/ LongMemEval 94.4(6,787 tokens/query),对比 full-context 约 26,000 tokens;时序 +29.6、多跳 +23.1;规模退化 —— BEAM 64.1 @1M → 48.6 @10M。

### Zep / Graphiti —— 双时态知识图谱(已核实)

**Graphiti(开源引擎)**:「a framework for building and querying temporal context graphs for AI agents」,「the open-source temporal context graph engine at the core of Zep」。四要素:

- **Entities(节点)**:「People, products, policies, concepts — with summaries that evolve over time」。
- **Facts/Relationships(边)**:「Triplets (Entity → Relationship → Entity) with temporal validity windows」。
- **Episodes(溯源)**:「Raw data as ingested — the ground truth stream. Every derived fact traces back here」。
- **Custom Types**:开发者用 Pydantic models 定义实体 / 边类型。

**双时态模型(标志性思想)**:「When information changes, old facts are invalidated — not deleted. Query what's true now, or what was true at any point in time」—— 直接解决 Mem0 点名「未解决」的记忆陈旧 / 「change as replacement」问题。

**增量、实时**:「Incremental Graph Construction: New data integrates immediately without batch recomputation. The graph evolves in real-time as episodes are ingested」—— 与 RAG/GraphRAG 的批量重算明确对立。

**混合检索**:「Combines semantic embeddings, keyword (BM25), and graph traversal for low-latency, high-precision queries without reliance on LLM summarization」。

**Zep(托管层)**:节点=实体、边=事实,「invalidating outdated facts while preserving history」。两种 graph:**User Graph**(每用户个性化上下文 —— 「Each user has its own User Graph and thread history」)与 **Graph**(对象/系统知识)。写入走 `graph.add` / `thread.add_messages`;检索走 `graph.search`(低层)或 `thread.get_user_context`(高层)→ 返回 **Context Block**:一个含用户摘要和相关事实(带 valid/invalid 日期)的优化字符串。声称**亚 200ms** 检索。[精确 API 签名 UNVERIFIED,仅核实命名与概念]

### LangMem —— 热路径工具 vs 后台 manager + 提示词优化(已核实)

LangChain 出品,给 LangGraph agent 加长期记忆,「functional core with pluggable storage」,原生对接 LangGraph `BaseStore`。

**三种记忆类型**:semantic(事实 + 关系)、procedural(「saved across a combination of model weights, agent code, and agent's prompt」)、episodic(「LangMem doesn't yet support opinionated utilities for episodic memory」—— 概念存在但工具未实现)。

**两种集成模式(关键设计,工具名已核实)**:

- **热路径工具(hot-path)**,agent 对话中自己调用:`create_manage_memory_tool`、`create_search_memory_tool`(经 LangMem GitHub README + Hot Path Quickstart 文档核实;agent 自己决定何时存什么)。
- **后台 memory manager**,异步抽取记忆:`create_memory_manager`。

**程序性记忆 = 提示词优化**:`create_prompt_optimizer` 拿打过分的对话轨迹去重写 system prompt;算法 `metaprompt` / `gradient` / `prompt_memory`(已核实)。

**作用域**:**namespaces** 按 user/team 隔离记忆(「all memories are given a namespace ... include a user_id in order to prevent cross-over of user memories」);短期 = LangGraph checkpointing,长期 = store。

### Anthropic memory tool + context editing(与我们当前栈最接近,已核实)

**Memory tool(`memory_20250818`)**:**客户端工具** —— Claude 发工具调用,**你的应用执行**到任意后端。六个命令(verbatim):**`view`**(目录列表或带行范围的文件)、**`create`**、**`str_replace`**(old_str→new_str,非唯一匹配报错)、**`insert`**(指定行插入)、**`delete`**(目录递归删)、**`rename`**。操作于 `/memories` 目录。自动注入的 system prompt:「IMPORTANT: ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE ... ASSUME INTERRUPTION: Your context window might be reset at any moment」。

**安全(与我们共享 FS 风险直接相关)**:文档措辞强硬 —— 「Your implementation **MUST** validate all paths to prevent directory traversal attacks」。安全措施:校验路径以 `/memories` 开头、canonical 化 + `relative_to()` 验证仍在记忆目录内、拒绝 `../` / `..\\` / `%2e%2e%2f`,加大小上限、分页、定期清理久未访问文件。SDK 助手:`BetaAbstractMemoryTool`(Python/C#)、`betaMemoryTool`(TS)、`BetaMemoryToolHandler`(Java)—— 你 subclass 它指向**你自己的每用户后端**(文件/DB/云/加密均可)。

**Context editing(`clear_tool_uses_20250919`)**:服务端策略。当 input tokens 超过 `trigger`(默认 **100,000**)时,清理最旧的 tool results,保留最近 `keep`(默认 **3**)个 tool-use 对,用占位文本替换;配置项 `clear_at_least`(每次至少清多少,清不够就不触发)、`exclude_tools`(永不清理的工具)、`clear_tool_inputs`(默认 false,默认只清 result 保留 Claude 的原始 tool call);beta header `context-management-2025-06-27`;客户端保留完整未改历史。**与 memory tool 配对**:「Claude can write essential information from tool results to memory files before those results are cleared」。也与 **compaction**(服务端在接近窗口上限时整体摘要)配对 ——「memory persists important information across compaction boundaries」。

**多 session 软件开发模式(几乎是我们 CLI agent 的镜像)**:初始化 session bootstrap 出 progress log + feature checklist;后续每个 session 先读它们「recover the full state ... in seconds」;session 结束更新 log;「work on one feature at a time」,端到端验证通过才标记完成。详见 Anthropic「effective harnesses for long-running agents」案例。

### CLAUDE.md / AGENTS.md 作为程序性记忆

「静态程序性记忆走 markdown」—— 学到的规范写成人类可读的指令,每次 session 开头注入。Claude Code 读 `CLAUDE.md`,Codex CLI 读 `AGENTS.md`,AGENTS.md 「正在收敛为跨工具标准」。**注意**:agent 会因「lost in the middle」实测性地忽略这些文件 —— 保持简短、关键规则前置。这是 Letta persona block / LangMem prompt optimizer 的文件版:人类可编辑、可 diff 的程序性记忆。[二手来源 deployhq/augmentcode/amitray,非一手核实]

---

## 多用户与隔离

各家的多租户原语:

- **Mem0**:四个可组合作用域键 `user_id` / `agent_id` / `run_id`(session) / `app_id`(org),分层存储、查询时合并(用户记忆优先,再 session,再原始历史)。actor-aware 区分用户事实 vs agent 推断。
- **Zep**:每用户一张 **User Graph**(「Each user has its own User Graph」)+ 系统级 Graph。
- **LangMem**:**namespace** 按 user/team 隔离,防止跨用户串记忆。
- **Letta**:state 全在 DB,可按 owner 隔离;共享 block 可做团队/组织级共享上下文。
- **Anthropic memory tool**:隔离责任在你 —— 文档 **MUST** 要求路径校验防遍历;后端按用户命名空间是你的事。

**跨 session 身份是公认脆弱点(Mem0,已核实)**:「anonymous sessions, multi-device users, and mixed auth flows」会破坏跨 session 身份 —— `user_id` keying 必须先做扎实,记忆才可信。

---

## 扩展性

- **Mem0**:记忆即独立服务,水平扩展友好;但规模退化真实存在(BEAM 1M→10M 时序准确率掉约 25%)。
- **Graphiti/Zep**:增量构图、无需批量重算,适合持续流入;代价是要跑图数据库(Neo4j 类)基础设施。
- **Letta**:DB 为真值,可挂配额/审计/隔离;sleep-time 把重计算移到离线。
- **Mem0 的反例**:为避免运维负担,**移除了**可遍历的图,改成内置实体链接 —— 提示「先用带 rerank 的向量,真有时序/多跳需求再上图」。

---

## 调度与异步

这是我们当前**完全缺失**的能力,也是本维度最有价值的输入:

- **Letta sleep-time(已核实)**:异步后台 agent,每 N 步(默认 5)触发,用更强模型离线蒸馏 transcript → 更新用户 profile block + archival 事实。用户侧零延迟。
- **底层论文「Sleep-time Compute」(arXiv 2504.13171,Kevin Lin / Charlie Snell 等,含 Charles Packer、Sarah Wooders、Ion Stoica、Joseph Gonzalez,已核实)**:核心是「让模型在 query 到来前离线 think」—— 预判用户可能问什么并预计算。摘要原文:在 Stateful GSM-Symbolic 与 Stateful AIME 上「reduce the amount of test-time compute needed to achieve the same accuracy by ~5x」;进一步 scale sleep-time compute 可再提准确率最多 13%(GSM-Symbolic)/ 18%(AIME);多 query 共享同一 context 时摊薄平均成本约 2.5x。
- **Mem0 async 写默认(已核实)**:阻塞响应管线的记忆写会让用户「感受到」延迟 —— 热路径绝不内联写记忆。
- **LangMem 后台 manager**:`create_memory_manager` 异步抽取,与热路径工具分离。

---

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **DB 即真值,jsonl 降为派生视图(Letta)**。当前 jsonl-on-shared-FS 本身就是 state。改成把记忆作为 DB 行存储,按 `user_id`(+ 已有的 `feature_key`,见 `agent_sessions`)键控,每轮重建上下文。可抗 context reset,并解锁隔离/配额/审计。
2. **可组合作用域键(Mem0)**。采用 `user_id` / `session_id`(= feature session)/ `agent_id` / `org_id`,检索按作用域过滤合并。干净映射到我们已有的 `(user_id, feature_key)` 复合键。
3. **两层记忆:in-context block + 按需 archival(Letta)**。每用户一个小 profile/persona block(研究兴趣、偏好期刊、引用风格、阅读水平),pin 进**所有 feature**(smart-search/claw/prism/peerreview)的 system prompt;外加一个大的语义可搜 archival 库,agent 通过工具查询。这个 block 正是「每用户版 CLAUDE.md 程序性记忆」该有的形态。
4. **sleep-time / 后台合并做成异步 job(Letta)**。我们本就缺调度 —— 加一个后台 worker,在 session 间用**更强模型**把 transcript 蒸馏进用户 profile block + archival 事实。非阻塞 → 用户延迟不变,质量离线提升。仿 `sleeptime_agent_frequency` 每 N 轮触发。
5. **记忆写默认异步(Mem0)**。绝不在热路径内联写记忆。
6. **热路径工具 + 后台 manager 双轨(LangMem)**。给 agent `manage_memory`/`search_memory` 工具做显式保存,同时跑后台抽取器,不依赖单一路径。
7. **学术领域用双时态事实(Graphiti/Zep)**。研究者兴趣、作者当前所属、"读过的论文"、项目状态都随时间变。`valid_at`/`invalid_at` 作废(非删除)给出正确的「现在为真」+ 历史,是记忆陈旧问题的最佳解。每用户 User Graph 直接映射到我们的租户。
8. **多信号检索 + rerank,返回紧凑 Context Block 字符串(Mem0/Zep)**。融合语义+关键词+实体、rerank,交给 agent 单个 token 高效的上下文串(约 7K vs full-context 约 26K tokens)。
9. **直接复用 Anthropic memory tool 契约(最低改造成本)**。我们已是 Claude-Code 风格 —— 实现六命令 `memory_20250818` handler(`view/create/str_replace/insert/delete/rename`),但后端换成**每用户命名空间存储**而非共享 FS。SDK `BetaAbstractMemoryTool`/`betaMemoryTool` 就是为此而设。
10. **context editing + compaction + memory 三件套(Anthropic)**。长学术 session 启用 `clear_tool_uses_20250919`,在清理前让 agent flush 关键发现到记忆 —— 直击长运行成本/延迟。
11. **溯源 / episodes(Graphiti)**。每条派生记忆事实都能回溯到来源轮次/论文 —— 学术工具讲信任和可引用,这是刚需。
12. **共享 block 做共享上下文(Letta)**。一个只读的组织/政策 block,或可挂到团队多用户的共享「实验室/课题组」记忆 block。

---

## 局限

- **共享 FS 的路径遍历是我们的活体漏洞**。Anthropic 强调实现「MUST validate all paths」;我们当前无隔离的共享 FS jsonl 正是它警告的攻击面。Anthropic 还建议记忆操作放在沙箱/隔离环境(明确的 MUST 是路径校验,隔离是隐含建议)。
- **跨 session 身份会断**:「anonymous sessions, multi-device users, and mixed auth flows」—— `user_id` keying 不扎实之前记忆不可信。
- **记忆陈旧 / "change as replacement"**:多数系统「把变化当替换」而非演化 —— 不采用双时态作废就得接受事实变陈旧。
- **规模退化**:1M→10M tokens 时序准确率掉约 25%(BEAM 64.1→48.6),长时程召回仍未解决。
- **图的成本 vs 收益**:Mem0 主动**移除**了可遍历图以避免 Neo4j 运维;完整 Graphiti/Neo4j 时序图很强但是真实基础设施成本。先上「带 rerank 的向量」,真有时序/多跳需求再加图。
- **隐私/同意是「应用层」问题,库不替你解决**:「谁能看记忆?保留多久?」是你的决定 —— 多用户产品需要用户可见的记忆查看/删除(GDPR 式)。
- **程序性记忆工具不成熟**(Mem0 自称「early-stage」;LangMem episodic「not yet supported」)。每用户 CLAUDE.md / prompt-optimizer 路线可行,但 agent 会因 lost-in-the-middle「忽略」指令 —— block 要短、关键规则前置。
- **sleep-time 额外消耗算力**:session 间跑第二个(常更大的)模型,是成本/质量权衡,不是免费午餐。
- **context-editing 会打破 prompt cache**:清理时使缓存失效;用 `clear_at_least` 确保缓存失效「划得来」。

**[UNVERIFIED]**:Mem0 开源版 graph-store 列表(graph-memory 文档页 404);Letta MemFS 内部实现;Zep `graph.add`/`thread.get_user_context` 在命名之外的精确签名;CLAUDE.md/AGENTS.md「跨工具标准」表述仅来自二手综述。

---

## Sources

- https://mem0.ai/blog/state-of-ai-agent-memory-2026
- https://docs.mem0.ai/core-concepts/memory-types
- https://docs.mem0.ai/core-concepts/memory-operations
- https://docs.letta.com/guides/agents/memory
- https://docs.letta.com/guides/agents/memory-blocks
- https://docs.letta.com/guides/agents/architectures/sleeptime/
- https://docs.letta.com/guides/legacy/memgpt_agents_legacy
- https://www.letta.com/blog/sleep-time-compute
- https://www.letta.com/blog/agent-memory/
- https://arxiv.org/abs/2504.13171
- https://github.com/getzep/graphiti
- https://help.getzep.com/concepts
- https://www.langchain.com/blog/langmem-sdk-launch
- https://github.com/langchain-ai/langmem/blob/main/README.md
- https://langchain-ai.github.io/langmem/hot_path_quickstart/
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- https://platform.claude.com/docs/en/build-with-claude/context-editing
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
