# Orchestration & backend organization
> kind: dimension · confidence: high · last-checked: 2026-06

## 概述

本篇汇总「编排与后端组织」维度的一手研究,目标是为重做一个**多用户 Web 学术 agent 平台**提供决策依据。当前我们的架构是:CLI 风格的 Claude Code 被包进 HTTP+WS daemon,每个用户的 session 以 jsonl 自管落在一块共享 FS 上,backend 完全黑盒;缺少真正的隔离、长期记忆与调度/异步能力。

研究覆盖三类一手来源,可互相印证出一条清晰主线:

- **理论/方法论**:Anthropic 的「Building Effective Agents」「Context Engineering」「Multi-Agent Research System」「Writing Tools for Agents」、HumanLayer 的 12-Factor Agents、Cognition 的「Don't Build Multi-Agents」。
- **运行时**:LangGraph(graph + checkpointer/store + durable execution)、Temporal、Restate(durable execution 一手文档)。
- **批评/对标**:Diagrid 关于「checkpoints ≠ durable execution」的厂商论述(二手/带立场,谨慎采信)。

主线结论:**把控制流和状态收归后端自有(software-first),默认单线程 agent,只在真正可并行的只读 fan-out 才上 orchestrator-workers,并用 durable execution + 双层记忆解决我们缺失的「隔离/记忆/调度」三条轴。**

本篇所有非显而易见的论断均已对一手来源逐条核验;少数无法从一手页面确认的图表数据已显式标 [UNVERIFIED]。

## 关键架构决策

### 1. Workflows vs Agents(Anthropic 的分水岭)

Anthropic 把 agentic 系统分两类(均为一手原文):

- **Workflows**:"LLMs and tools are orchestrated through predefined code paths" —— 控制流写死在代码里。
- **Agents**:"LLMs dynamically direct their own processes and tool usage, maintaining control over how they accomplish tasks" —— LLM 自己驱动流程。

基础积木是 **augmented LLM**:单个 LLM 增强了 retrieval / tools / memory,模型自己生成查询、选工具、决定保留什么。

**何时不要加复杂度(对后端组织最关键)**:"finding the simplest solution possible, and only increasing complexity when needed";很多应用只需要「优化单次 LLM 调用 + retrieval + in-context examples」。Agent 带来更高成本与「错误累积(compounding errors)」,只适合「在可信环境里的开放式问题」。

### 2. Software-first:把状态/控制流收归后端(12-Factor Agents)

HumanLayer 的核心论点:好的 AI 产品「大多数是普通软件,只在恰当节点点缀 LLM 步骤」。原文(已核验):多数自称 AI Agent 的产品「are mostly deterministic code, with LLM steps sprinkled in at just the right points to make the experience truly magical.」

12 个 factor 的**逐字标题**(已对一手 README 核验):

1. Natural Language to Tool Calls
2. Own your prompts
3. Own your context window
4. Tools are just structured outputs
5. Unify execution state and business state
6. Launch/Pause/Resume with simple APIs
7. Contact humans with tool calls
8. Own your control flow
9. Compact Errors into Context Window
10. Small, Focused Agents
11. Trigger from anywhere, meet users where they are
12. Make your agent a stateless reducer

Bonus Factor 13:Pre-fetch all the context you might need。

对我们重做最承重的几条:

- **#5 Unify execution state and business state** + **#12 stateless reducer**:把 agent 建模成纯函数 `(state, event) → new state`,状态落在**我们自己的 DB**,而不是 agent 进程私有的不透明 jsonl。这直接否定我们当前「agent 自管 jsonl、backend 黑盒」的设计。
- **#6 Launch/Pause/Resume with simple APIs**:agent 生命周期是一套对持久状态的 API ——多用户、可重启、可调度的前提。
- **#8 Own your control flow** + **#4 tools as structured outputs**:不要把所有分支交给 LLM;backend 拥有 loop,可在步骤之间中断/检查点/注入。
- **#7 Contact humans with tool calls**:人审(批准/澄清)就是一个 tool,可与 pause/resume + 异步 Web 交付干净组合。
- **#10 Small, Focused Agents**:限制单 agent scope 以控住 context(呼应 Anthropic 的 altitude / context 指南)。

### 3. 工具/MCP 后端表面(Writing Tools for Agents)

- "More tools don't always lead to better outcomes" → 做「少而精、针对高价值工作流」的工具,把链式操作合并成一次调用。
- **Namespacing**(如 `asana_search` / `asana_projects_search`)划清众多工具的边界、减少选错。
- **返回高信号输出**:返回名字而非 UUID,「prioritize contextual relevance over flexibility, and eschew low-level technical identifiers」。
- **Token 效率**:pagination / range selection / filtering / truncation,带合理默认值。
- **`response_format`(`concise` vs `detailed`)** 让 agent 自选啰嗦程度(GraphQL 风格)。
- 设计 agent-computer interface(ACI)要像设计 UI 一样严谨,**"Poka-yoke your tools"**(把参数设计成更难犯错)。
- MCP 让你「以一个简单的 client 实现接入不断增长的第三方工具生态」。

## 编排与子 agent

### 五种 workflow 模式(后端控制流的决策点)

(模式名与简述已对一手页面核验;部分细节描述源自页内各模式小节)

- **Prompt chaining** —— 顺序拆成固定子任务,适合「能干净拆成 fixed subtasks」的任务,用延迟换准确性,允许在步骤之间加代码级 gate。
- **Routing** —— 分类输入 → 分派到专门 prompt/工具,带来「separation of concerns」与更专门的 prompt。
- **Parallelization** —— 两种变体:*sectioning*(把任务拆成独立子任务并行)与 *voting*(同一任务跑多次取多样输出)。
- **Orchestrator-workers** —— 中央 LLM「dynamically breaks down tasks, delegates them to worker LLMs, and synthesizes their results」,用于「无法预知子任务」的复杂任务(如多文件编辑)。
- **Evaluator-optimizer** —— 一个 LLM 生成、另一个评估反馈,在 loop 中迭代;适合「有清晰评估标准 + 迭代精修有可衡量价值」。

### 单线程 vs 多 agent —— 两篇互为补集

**Cognition「Don't Build Multi-Agents」** —— 多数真实工作应偏好单线程线性 agent。两条核心原则(逐字核验):

1. "Share context, and share full agent traces, not just individual messages"
2. "Actions carry implicit decisions, and conflicting decisions carry bad results"

为何并行子 agent 会坏:每个子 agent 在「看不到彼此选择」的情况下做隐式风格/技术决策,逼最终 agent 去「调和根本不兼容的工作」(Flappy-Bird 例子)。

**Claude Code 作为正面范例**(逐字核验):它「避免并行子 agent」,且「the subtask agent lacks context from the main agent that would otherwise be needed to do anything beyond answering a well-defined question」——子 agent 只回答有界问题,从不写代码。

长任务超 context 时,引入一个**专门的压缩模型**:把行动/对话历史「compress... into key details, events, and decisions」;原文也承认这「is hard to get right」。

**Anthropic「Multi-Agent Research System」(反面/何时确实有用)** —— orchestrator-worker:lead agent「分析查询、制定策略、spawn 子 agent 并行探索不同方面」再综合。逐字核验的关键数据:

- 经济性:"multi-agent systems use about 15× more tokens than chats"(单 agent 约 4× chat)。
- 提速:并行工具执行「cut research time by up to 90% for complex queries」。
- 设计:lead 通常「3-5 subagents in parallel rather than serially」。
- **不适用边界**:「domains requiring all agents to share the same context or involving many dependencies between agents are not a good fit for multi-agent systems today」(以 coding 为例)。
- **委派 prompting**:每个子 agent 要给「an objective, an output format, guidance on the tools and sources to use, and clear task boundaries」。
- **隔离作为特性**:子 agent 拿「distinct tools, prompts, and exploration trajectories」,降低 path dependency。

> **调和 Cognition vs Anthropic**:默认单线程(Cognition / 12-factor #10)。**仅**在只读、独立、可并行的 fan-out(如一次性检索多篇论文/多个来源)才上 orchestrator-workers,且子 agent 只回 condensed summary;**绝不**用于强耦合的写作/编辑(论文撰写、审稿报告拼装)。启用前先预算 ~15× token。

### 单 vs 多 共识(2026,量化但来源较弱)

业内 2026 多篇文章引用一项「Google 的 agent-scaling 研究」称多 agent 在可并行任务上「+81%」、在顺序任务上「最多 −70% 退化」——「task structure is the deciding factor」。**[UNVERIFIED:±81% / −70% 具体数字归于某 Google 研究,系厂商 guide 转述,未定位到原始研究。]** 但「顺序/有状态用单 agent,可真正并行才用多 agent」这条实践规则被多源反复印证。

## 记忆

我们当前缺的「长期记忆」轴,LangGraph 给了最清晰的两层划分(已对 LangChain 一手 persistence 文档核验):

- **Checkpointers** —— 在每个执行步保存 graph state 快照,作为 **short-term、thread-scoped memory**;启用后即获得「memory between interactions / human-in-the-loop / time travel / fault tolerance」。传入 `thread_id`,LangGraph 从该 thread 最后一个 checkpoint 恢复状态。
- **Stores** —— 持久化 graph state 之外的应用自定义数据,作为 **long-term、cross-thread memory**,用于「user preferences, facts, and shared knowledge」。
- **Threads** —— 用唯一 `thread_id` 组织状态,保存对话历史并支持 time-travel debugging。
- **组合用法**:大多数应用两者都用 —— checkpointer 跟踪当前 thread,store 跨 thread 跟踪持久信息(`builder.compile(checkpointer=..., store=...)`)。

这正是我们缺失的「短期(session)vs 长期(per-user)」记忆分层。

**Anthropic Context Engineering** 补齐了记忆的「生命周期管理」一面(均逐字核验):

- 定义:context engineering 是「curating and maintaining the optimal set of tokens (information) during LLM inference」,是 prompt engineering 在多轮/长时程下的超集。
- **Context rot / attention budget**:「as the number of tokens in the context window increases, the model's ability to accurately recall information from that context decreases」;transformer 的 n² token 关系把注意力「摊薄」,每个新 token 都消耗 attention budget。
- 指导原则:找「the smallest possible set of high-signal tokens that maximize the likelihood of some desired outcome」。
- **长时程三招**(直接对应我们缺的记忆):
  - **Compaction**:接近窗口上限时摘要并从摘要重启;警告:「overly aggressive compaction can result in the loss of subtle but critical context」。
  - **结构化记笔记 / 外部记忆**:agent 写 `NOTES.md` / to-do 文件,以极小开销做「persistent memory」、跨摘要周期跟踪进度。
  - **子 agent context 隔离**:聚焦子 agent 用干净窗口工作,只回「a condensed, distilled summary of its work (often 1,000-2,000 tokens)」。
- **Just-in-time retrieval**:只保留「lightweight identifiers (file paths, stored queries, web links)」,运行时用工具按需加载,「mirror[ing] human cognition」;upfront + 自主探索的混合也可。

## 多用户与隔离

- **状态收归后端 = 隔离的根**:12-factor #5/#12 把权威状态放进我们的 DB(对应 `agent_sessions` 升级为权威状态而非仅映射),agent 退化为 backend 驱动的 `(state,event)→state` 步骤;从根上解决「无真正隔离 / backend 黑盒」。
- **Own your control flow(#8)→ 步骤间插桩**:因为 backend 驱动每一轮 loop,可在 LLM 轮次之间注入 per-user 配额检查、限流、sandbox 边界,而不是信任一个不透明 CLI。
- **子 agent 隔离作为特性**:Anthropic multi-agent 的「distinct tools/prompts/trajectories」与 context-engineering 的子 agent 干净窗口,天然支持按用户/按任务隔离上下文。
- **并发恢复需要协调**:Diagrid 指出 LangGraph 开源库「单进程、无分布式执行、无 task queue、无 worker pool」,且「若两个进程同时 resume 同一 `thread_id`,LangGraph 没有内建协调」——分布式锁/租约要自己做(厂商立场,但这条对多用户平台的并发 resume 确实是真实风险点,需自评)。

## 扩展性

- **#10 Small, Focused Agents** + per-feature spec(我们已有 smartsearch/prism/peerreview/claw 分 feature)——边界清晰、context 可控,符合 Anthropic「altitude」指导。
- **#11 Trigger from anywhere**:agent 可由 Web/cron/webhook/站内事件触发,与异步交付组合。
- 工具表面收敛(少而精 + namespacing + 高信号输出 + 分页/截断默认)在平台规模下显著压低 per-user token 消耗。
- 模式可叠加:大多数生产系统是 workflow 模式组合 + 个别 agent 节点,而非「一个大 agent」。

## 调度与异步

这是我们缺失的另一条轴。**Durable / resumable execution** 运行时是关键(均尽量取一手):

- **核心思想**:durable execution「journals every step」,崩溃后从「停下的确切位置」恢复;否则崩溃意味着「从头重启进程、重复耗时且花钱的 LLM 调用」。
- **Temporal**(一手厂商博客,逐字核验):崩溃后 Workflow「replays」进度,但「does not ask the agent for a new plan for decisions it has already made」——agent 改用 Temporal 的 **Event History** 作为既往决策记录,「survive a crash and resume exactly where it left off」。
- **Restate**(一手文档,逐字核验):「When your agent runs, Restate records each step's result in a journal」;崩溃后「Completed steps are replayed from the journal (no re-execution)」、「Execution resumes from the first incomplete step」。LLM 调用与工具副作用各用 `ctx.run()` 包成一步:「LLM calls are not repeated」「Tool side effects are not duplicated (no double bookings, no duplicate emails)」;loop「until the LLM returns a final answer」。
- **LangGraph durable execution**(已对 LangChain 一手 reference 核验,三种 durability 模式):
  - **`exit`**:仅在 graph 退出时持久化,长任务性能最好,但**中途崩溃无法恢复**。
  - **`async`**:在下一步执行的同时异步持久化,性能/durability 平衡,但崩溃时有「小概率没写上 checkpoint」。
  - **`sync`**:下一步开始前同步持久化,**每个 checkpoint 必写**,代价是性能开销。
  - 生产恢复需持久 checkpointer(如 `PostgresSaver`),并把非确定操作包进 task。
- **Determinism 要求(跨运行时)**:replay 只有在非确定操作/副作用被包裹时才正确(LangGraph `@task`、Restate `ctx.run`、Temporal activities),replay 复用记录结果而非重执行。
- **Landscape(二手)**:2026 年常见 Temporal / AWS Step Functions / Restate / DBOS / Inngest / LangGraph checkpointers;Temporal 被定位为最成熟。

**对我们的直接价值**:把 agent loop 包进 durable runtime 后,「定时/后台/异步任务」自然解锁 —— 例如「每周文献摘要」就是一个 cron 触发的 durable workflow。

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **状态出 jsonl、进后端 DB 做单一真源**(12-factor #5+#12)。agent 变成 backend 驱动的纯 `(state,event)→state` 步骤,从根上修「无隔离 / backend 黑盒」。映射:`agent_sessions` 从「映射表」升级为「权威状态」。
2. **显式采用 LangGraph 双层记忆**:thread-scoped checkpoints(短期,每 session)+ cross-thread Store(长期,per-user:user preferences / facts / shared knowledge)。正补我们缺的长期记忆轴。
3. **把 agent loop 包进 durable execution**(Restate/Temporal/DBOS,或至少 Postgres-checkpointed 步骤):每次 LLM + tool 调用都 journaled —— 崩溃安全、可「从第一个未完成步骤恢复」、副作用/扣费不重复。顺带解锁**定时/后台/异步**(另一条缺失轴)。
4. **默认单线程 agent;仅在只读并行 fan-out 才上 orchestrator-workers**(多源论文/引文检索),子 agent 回 1–2k token 的 condensed summary 给 lead 综合。耦合写作(论文撰写、审稿报告拼装)**绝不**用多 agent。启用前按 ~15× token 预算。
5. **Context 生命周期作为后端一等公民**:compaction(摘要重启)+ per-session 结构化外部笔记 + just-in-time retrieval(存 paper ID/query,按需取),而非把整篇 PDF/abstract 塞进 context。直接对抗 context rot。
6. **人审 = tool call + pause/resume**,而非定制 socket 逻辑。审批(「花经费?」「确认投稿?」)做成挂起 durable workflow、用户操作后恢复的 tool,与我们 WS 层 + 异步 Web 交付干净组合(12-factor #6/#7;LangGraph interrupts)。
7. **收敛工具/MCP 表面**:少而精、namespaced、返回高信号(论文标题/作者,非不透明 ID),带 `concise`/`detailed` `response_format` 与分页/截断默认。平台规模下压低 per-user token 消耗。
8. **按 feature 设对的 prompt「altitude」**(smartsearch/prism/peerreview/claw 已分 feature)——给 heuristics 而非写死规则;这与我们现有 per-feature-spec 模式一致,获 Anthropic 背书。
9. **「Own your control flow」使隔离与配额可在步骤间强制**:backend 驱动每轮 loop,故能在 LLM 轮次之间插 per-user budget/限流/sandbox 边界,而非信任不透明 CLI(12-factor #8)。

## 局限

- **Compaction 会丢信息**:「overly aggressive compaction can result in the loss of subtle but critical context」——需谨慎调参(Anthropic context engineering)。
- **多 agent 对耦合工作既贵又脆**:15× token,并行子 agent 产「conflicting decisions carry bad results」;只对真正独立的只读任务 fan-out(Anthropic multi-agent;Cognition)。
- **Checkpoints ≠ 完整 durable execution(厂商立场,需自评)**:Diagrid 论点的实质是——LangGraph/CrewAI/Google ADK 提供 checkpoint+resume,但「failure detection、自动恢复、重复防护、分布式协调」仍丢给你自己做(单进程、无 worker pool、并发 resume 无内建锁)。这是带销售立场的二手来源,采信前应独立验证我们的具体栈。
- **Durable execution 要求 determinism**:replay 只有在非确定操作/副作用被包裹时才成立;把这套硬塞进一个会随意写 FS 的 CLI 风格 agent 并不简单(LangGraph;Restate)。
- **重运行时(Temporal)增加运维重量** vs 我们当前 docker-compose 的简单;更轻的 DBOS / Postgres-backed checkpointer 可能更合身 —— 对我们栈的取舍 [UNVERIFIED]。

**核验状态说明**:
- 已升级为已验证:LangGraph 三种 durability 模式(`exit`/`async`/`sync`),由 LangChain 一手 reference 文档(`reference.langchain.com/.../Durability`)及 LangChain 团队公开说明确认。
- 仍 [UNVERIFIED]:Google 多 agent ±81% / −70% 数字(厂商转述,未定位原始研究);Temporal 等重运行时对我们具体栈的取舍。
- LangGraph 多 agent 架构(supervisor / swarm / hierarchical / handoffs via `Command`)在本轮未取得逐字一手定义,作为已知存在但**不引用逐字定义**处理。

## Sources

- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://github.com/humanlayer/12-factor-agents
- https://github.com/humanlayer/12-factor-agents/blob/main/README.md
- https://cognition.ai/blog/dont-build-multi-agents
- https://docs.langchain.com/oss/python/langgraph/persistence
- https://docs.langchain.com/oss/python/langgraph/durable-execution
- https://reference.langchain.com/python/langgraph/types/Durability
- https://temporal.io/blog/of-course-you-can-build-dynamic-ai-agents-with-temporal
- https://docs.restate.dev/ai/patterns/durable-agents
- https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows
- https://www.augmentcode.com/guides/single-agent-vs-multi-agent-ai
- https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
