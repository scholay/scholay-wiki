# OpenHands (All-Hands-AI, formerly OpenDevin)
> kind: project · confidence: high · last-checked: 2026-06

> **范围说明**：OpenHands 有两套架构。**V0** = 原始单体应用（Docker-per-session，EventStream + ActionExecutor）。**V1** = **Software Agent SDK**（`openhands.sdk` / `.tools` / `.workspace` / `.agent_server`），是 2025-11 发表论文（[arXiv 2511.03690v2](https://arxiv.org/html/2511.03690v2)）描述的重写版本。当前官方文档站 `docs.openhands.dev` 已全面以 SDK（V1）为中心。下文两套都涉及，但 V1 是面向未来、与我们重设计最相关的部分。
>
> 仓库地址为 **`github.com/All-Hands-AI/OpenHands`**（约 76.8k stars，Python+TypeScript）。注意：当前 README **不再**显式提及 "OpenDevin" 旧名（"formerly OpenDevin" 是历史事实，但已不写在主仓 README 里）。

## 概述

OpenHands 是一个开源的 AI 软件开发 agent 平台，agent 能执行代码、编辑文件、浏览网页。对外有多种形态：CLI、本地 GUI（REST API + React SPA）、托管 Cloud（`app.all-hands.dev`）、自托管 Enterprise（K8s）。V1 把这些统一建在一个可组合的 Python **Software Agent SDK** 之上。README 把 SDK 列为第一卖点，描述为 "a composable Python library that contains all of our agentic tech"（[docs root](https://docs.openhands.dev/)；[arch overview](https://docs.openhands.dev/sdk/arch/overview.md)）。

## 关键架构决策

- **Event sourcing 作为唯一真源。** "Event-sourcing pattern treating all interactions as immutable events appended to a log"（[paper](https://arxiv.org/html/2511.03690v2)）。`ConversationState` = (1) 可变 metadata + (2) 一个 append-only `EventLog`。Event 是带 id+timestamp 的不可变 Pydantic 模型，支持**确定性重放**（[events](https://docs.openhands.dev/sdk/arch/events.md)）。
- **Action/Observation 模型。** Base `Event` → `LLMConvertibleEvent`（模型可见）vs 内部事件。`ActionEvent` = 工具调用（thought + `security_risk` + tool call + `llm_response_id` 用于分组并行调用）；`ObservationEvent` = 结果；另有 `MessageEvent`、`SystemPromptEvent`、`AgentErrorEvent`、`CondensationSummaryEvent`、`ConversationStateUpdateEvent`、`PauseEvent`（[events](https://docs.openhands.dev/sdk/arch/events.md)）。
- **`source` ≠ LLM `role`（刻意二元）。** `Event.source` = 来源（user/agent/environment）用于归因；LLM `role` = 模型如何读它。工具结果 `source="environment"` 但 `role="tool"`；合成指令可以是 `source=environment, role=user`（[events](https://docs.openhands.dev/sdk/arch/events.md)）。
- **无状态 agent 循环。** "Stateless: Agent holds no mutable state between steps" —— 每个 `step()` 读历史、写新事件，原子、可暂停可恢复。step 顺序：执行待确认的 pending actions → 需要则 condense → 查 LLM → 解析成 `ActionEvent`/`MessageEvent` → 确认门（设状态 `WAITING_FOR_CONFIRMATION` 并 return）→ 执行工具 → 发 observations（[agent](https://docs.openhands.dev/sdk/arch/agent.md)）。
- **持久化 = 文件系统，每会话一目录。** `base_state.json`（config/status/stats）+ `events/event-NNNNN-<id>.json`（顺序、增量追加）。恢复 = 用同一 `conversation_id` + `persistence_dir` + `agent` + `workspace` 重新实例化 `Conversation`；base state 在任意 public 字段变更时自动保存（[persistence](https://docs.openhands.dev/sdk/guides/convo-persistence.md)）。性能数据：单事件 persist latency **0.20 ms 中位 / 0.31 ms P95**；Action+Obs 一轮 persist **0.40 ms 中位 / 0.56 ms P95**；崩溃恢复在最长会话（358 events）下仍 **< 20 ms**（[paper](https://arxiv.org/html/2511.03690v2)）。
- **传输：HTTP REST + WebSocket。** Agent Server（FastAPI）暴露 REST 做生命周期操作、WS 做事件流（"REST API & WebSocket endpoints for conversations, bash, files, events, desktop, and VSCode"）；并提供一个 **OpenAI 兼容的 `/v1/chat/completions`** 端点（"for clients that expect an OpenAI-style backend"）（[overview](https://docs.openhands.dev/sdk/arch/overview.md)）。
- **四包分层：** `openhands.sdk`（核心抽象：agents/conversations/LLM/workspace/events）、`openhands.tools`（Action/Observation/Executor 具体实现）、`openhands.workspace`（执行环境实现）、`openhands.agent_server`（FastAPI Web 服务）——"Same agent code works in both modes—just swap the workspace type (`LocalWorkspace` → `DockerWorkspace` → `RemoteAPIWorkspace`)"（[overview](https://docs.openhands.dev/sdk/arch/overview.md)）。
- **V0 → V1 取舍（与我们直接相关）：** V0 假设 "all tool calls should run inside sandboxed Docker containers"（强制沙箱），inter-pod HTTP 带来鉴权失败等问题；V1 主张 "Sandboxing should be opt-in, not universal"，默认把 agent 与工具执行**合并到单进程**。量化结果：V1 把 system-attributable failures **降低 61%（78.0 → 30.0 errors/1k conversations）**；其中 infrastructure errors 从 **69.8/1k（V0）降到 0.0/1k（V1）**，V1 自身 SDK errors 为 **29.7/1k**。能力持平：Claude Sonnet 4 下 V0 与 V1 都是 **68.0% SWE-Bench**（[paper](https://arxiv.org/html/2511.03690v2)）。

## 编排与子 agent

- **委派就是一个工具**（`DelegateTool`，注册即用，无需改 core）（[delegation](https://docs.openhands.dev/sdk/guides/agent-delegation.md)；[paper](https://arxiv.org/html/2511.03690v2)）。
- 两个操作：`spawn` 创建带 id 的命名子 agent（id 由 agent 自取，如 'lodging'/'activities'），**继承父 agent 的 LLM 配置 + 共享同一 workspace**（"operating in the same workspace as the main agent"）；`delegate` 接收 `{id: task}` 任务映射。
- `delegate` "Runs all sub-agent tasks in parallel using threads"、"Blocks until all sub-agents complete"、"Returns a single consolidated observation with all results"；可选 `max_children`（示例 `= 3`）限制并发。注意论文措辞更保守："blocking parallel execution, implemented as a standard tool"——是阻塞式的并行（[delegation](https://docs.openhands.dev/sdk/guides/agent-delegation.md)）。
- `RouterLLM`（`LLM` 的子类）+ `select_llm()` 把不同请求路由到不同模型，例如 `MultimodalRouter`：含图片走多模态、纯文本走便宜模型（[paper](https://arxiv.org/html/2511.03690v2)）。

## 记忆

- **短期记忆 = event log**（agent 的工作记忆）（[events](https://docs.openhands.dev/sdk/arch/events.md)）。
- **上下文压缩（核心记忆机制）。** `CondenserBase` 契约；`View.from_events()` 构建 LLM 就绪视图。默认 `LLMSummarizingCondenser`：在 `max_size`（**默认 120** 事件）触发，保留 `keep_first`（**默认 4**）+ 末尾若干，LLM 总结中间部分，产出带 `forgotten_event_ids` + `summary` 的 `Condensation` 事件；下一步过滤掉 forgotten 事件并插入摘要。还有 `NoOpCondenser`、`RollingCondenser`（阈值触发基类）、`PipelineCondenser`（串联多个）。手动触发：`CondensationRequest` 事件（亦用于 LLM context window 报错时）（[condenser](https://docs.openhands.dev/sdk/arch/condenser.md)）。默认 condenser "reduce[s] API costs by up to 2× with no degradation in agent performance"（[paper](https://arxiv.org/html/2511.03690v2)）。
- **核心无内建的跨会话长期记忆存储**（除了持久化的 event logs + 仓库 skills）。[UNVERIFIED：V1 core 中是否有向量/语义长期记忆——主源未找到。]

## 多用户与隔离（对我们最关键）

- **隔离可选，非强制** —— 默认本地运行，"when additional safety or resource control is required" 才切到沙箱（[paper](https://arxiv.org/html/2511.03690v2)）。
- **Workspace 抽象 = 隔离边界。** `BaseWorkspace` → `LocalWorkspace`（进程内 subprocess，直接用宿主 FS，无清理）、`RemoteWorkspace`（HTTP→Agent Server，容器/VM 隔离）、`DockerWorkspace`（自动起容器，面向多用户/不可信代码）、`RemoteAPIWorkspace`/`OpenHandsCloudWorkspace`（连已有/云端服务）。"Each agent instance runs in an independent container with a dedicated file system, environment, and resource"（[workspace](https://docs.openhands.dev/sdk/arch/workspace.md)；[paper](https://arxiv.org/html/2511.03690v2)）。
- **每会话一容器，自动管理。** 实例化 `DockerWorkspace` 会让 `Conversation` 变成 `RemoteConversation`（WS 流）；context manager 拉/构建镜像、起带 agent-server 的容器、等就绪，**退出时清理容器**（[docker-sandbox](https://docs.openhands.dev/sdk/guides/agent-server/docker-sandbox.md)）。
- **声明的多用户模型（agent-server 文档）：** 明确写 **"One container per user (chosen)"**——"Each user gets isolated workspace"、"Strong isolation between users"、"Persistent workspace across sessions"，配 **"API key → user ID mapping"**、"Users can't access each other's workspaces"。每 workspace 资源上限：`memory: 2g`、`cpus: 2`、`disk: 10g`、`timeout: 300`（成本优化档示例 `memory: 1g`/`cpus: 0.5`）（[agent-server](https://docs.openhands.dev/sdk/arch/agent-server.md)）。
  > ⚠️ **粒度在文档间不一致**：agent-server 文档说 "container per user"，而 sandbox/paper 强调 per-conversation 容器。粒度本质上是可配置的工程选择——需自己定池化/驱逐策略。
- **V0 runtime（遗留但久经考验的模式）：** user image → 自定义 "OH Runtime Image" → Docker 容器 → `ActionExecutor`（bash + plugins）→ 后端在紧凑的 Action→Observation 循环里走 REST。3-tag 镜像缓存加速重建；file-locked 端口段；bind mounts / 命名卷 + copy-on-write overlay（[V0 runtime](https://docs.openhands.dev/openhands/usage/architecture/runtime)）。
- **扩展路径：** 单机 → 多机 + 负载均衡（"Shared State Store (Database, Redis, etc.)"）→ Kubernetes 多副本（文档示例 `replicas: 3`）。[UNVERIFIED：文档**未**提及 auto-scaling 自动伸缩，draft 的 "auto-scaling" 表述无主源支撑，已降级]（[agent-server](https://docs.openhands.dev/sdk/arch/agent-server.md)）。
- **托管 Cloud**（`app.all-hands.dev`）按 `cloud_api_key` 自动 provision 沙箱，`keep_alive` 可保活；**secrets 在沙箱内惰性解析，原始值 "never transit through the SDK client"**（[cloud-workspace](https://docs.openhands.dev/sdk/guides/agent-server/cloud-workspace.md)）。[UNVERIFIED：预热/warm container 池——属通用模式，OpenHands 主源未提。]

## 扩展性

- **工具系统 = Action–Execution–Observation**，全 Pydantic 校验；工具是 registry 解析的轻量 spec（注册名 + JSON 参数），故能在分布式/远程执行中工作（[paper](https://arxiv.org/html/2511.03690v2)；[tool-system](https://docs.openhands.dev/sdk/arch/tool-system.md)）。
- **原生 MCP。** FastMCP 风格配置（`command`/`args`，stdio spawn，如 `uvx mcp-server-fetch`）；`tools/list` 发现 → 动态 Pydantic `MCPToolAction`；`MCPToolDefinition` 扩展 `ToolDefinition`，`MCPToolExecutor` 委托 FastMCP `MCPClient`。MCP 工具 "behave identically to native tools"（[mcp](https://docs.openhands.dev/sdk/arch/mcp.md)；[paper](https://arxiv.org/html/2511.03690v2)）。
- **Skills（V1，V0 称 "microagents"）。** Markdown + 可选 YAML frontmatter。两种加载模型：**仓库/always-on skills**（`repo.md` 类，frontmatter 可选，缺省即按 repository agent 全量加载）vs **knowledge/on-demand skills**（关键词触发，"Trigger-based: Activated by specific keywords"）。目录：`.openhands/skills/`（V1 首选）、`.openhands/microagents/`（V0 位置，V1 仍向后兼容）。[UNVERIFIED：draft 称 `.agents/skills/` 为"推荐"且存在三级 precedence——README **未**写明此 precedence，已降级]（[skills README](https://github.com/All-Hands-AI/OpenHands/blob/main/skills/README.md)）。
- **生命周期 hooks。** `PreToolUse`/`PostToolUse`/`UserPromptSubmit`/`Stop`/`SessionStart`/`SessionEnd`。可用 shell hooks（exit 2 = block，exit 0 + JSON `{decision, reason, additionalContext}`）**或 agent-based hooks**（LLM 子 agent 返回 `{decision: allow|deny, reason}`，跑在隔离子会话，fail open）。用途：日志、指标、审计/合规、门控（[hooks](https://docs.openhands.dev/sdk/guides/hooks.md)）。
- **V0 plugins：** 继承 `Plugin` 的 Python 类，注册进 `ALL_PLUGINS`，经 `Agent.sandbox_plugins` 请求（如 Jupyter、VS Code），runtime 启动时异步初始化（[V0 runtime](https://docs.openhands.dev/openhands/usage/architecture/runtime)）。

## 调度与异步

- **不在稳定 core 内；设计在 RFC #13275（2026-03-06，状态 "Draft — for team discussion"，标题 "OpenHands Automations"）。** 统一模型：**每个 automation 都表示为 SDK code**（"whether the user typed a prompt, selected a plugin, or uploaded a custom script — is represented as SDK code"）。**"Cron is not special — a background scheduler just POSTs to the automation's webhook endpoint when it's time to run."** 每个 automation 有**公开 webhook URL**（`webhook_secret` 鉴权）；`source_type ∈ {github, gitlab, slack, cron, ...}`。**handler 把匹配事件入消息队列**而非同步执行（"Decoupling: ingestion (fast, never drops) is separated from execution (slow, resource-intensive)"，提供背压/可靠性）。执行：create sandbox → upload SDK script → 跑 `python automation.py`（脚本在 localhost agent-server 上建 `Agent`+`Conversation` 并 `run()`）（[RFC #13275](https://github.com/All-Hands-AI/OpenHands/issues/13275)）。
- CLI 可 headless 跑（从 CI、cron、内部系统调用），但这只是把 CLI 当无头入口，不等于内建调度。

## 值得借鉴（对标我们的多用户 Web 学术 agent 平台）

1. **用 event-sourced `ConversationState` 替换"每用户 jsonl"** = append-only `EventLog` + 小 `base_state.json`。带来确定性重放、暂停/恢复、崩溃恢复、干净审计链——远胜当前不透明的 agent 自管 jsonl。我们的 `agent_sessions` 映射表可直接对应 `conversation_id + persistence_dir`（[persistence](https://docs.openhands.dev/sdk/guides/convo-persistence.md)；[paper](https://arxiv.org/html/2511.03690v2)）。
2. **Workspace 抽象 + `LocalWorkspace`↔`DockerWorkspace` 切换。** 可信/轻量 feature 走进程内廉价执行，不可信/重任务才翻到**容器-per-conversation**——直接解我们"单一共享 FS、无真正 per-user 隔离"的痛点（[workspace](https://docs.openhands.dev/sdk/arch/workspace.md)）。
3. **容器-per-conversation 走 context manager 生命周期**（拉/建镜像 → 起 agent-server → 就绪检查 → 自动清理）+ **每 workspace 资源上限**（memory/cpu/disk/timeout）+ **API-key→user-ID 映射**——隔离 + 成本控制一体（[docker-sandbox](https://docs.openhands.dev/sdk/guides/agent-server/docker-sandbox.md)；[agent-server](https://docs.openhands.dev/sdk/arch/agent-server.md)）。
4. **`source` 与 LLM `role` 分离** —— 把 system/框架指令注入为 agent 可读的 `role=user` 而不污染归因（我们已在手动注 SystemPrompt prefix，可借此规整）（[events](https://docs.openhands.dev/sdk/arch/events.md)）。
5. **Condenser 作长会话记忆。** `LLMSummarizingCondenser`（keep-first + keep-last + 总结中段，~2× 成本下降）正对我们"无长期记忆 + token 成本"两个顾虑；可插拔，可 per-feature 换策略（[condenser](https://docs.openhands.dev/sdk/arch/condenser.md)；[paper](https://arxiv.org/html/2511.03690v2)）。
6. **Skills 即 markdown + frontmatter，always-on vs 关键词触发** —— 对应我们现有 `--add-dir` skill 注入，但补上**按需（summary-first）加载**以保持 system prompt 精简；可 per-feature skill 目录（[skills README](https://github.com/All-Hands-AI/OpenHands/blob/main/skills/README.md)）。
7. **安全分析器 + 确认策略**（`LLMSecurityAnalyzer` 在标准 LLM action 生成里内联打 `security_risk`，**"No Additional LLM Calls" / "Zero Overhead"**；`ConfirmRisky` 仅门控高风险，默认 threshold=HIGH；`WAITING_FOR_CONFIRMATION` 状态）——比我们"无脑 auto-approve permission_request"更有原则（[security](https://docs.openhands.dev/sdk/arch/security.md)）。
8. **生命周期 hooks（`PreToolUse` 等）** 作为我们配额/用量/审计钩子（现 `PreUserMessage`/`OnMessageComplete`）的通用挂载点，含 **agent-based hooks** 做 LLM 判定的门控（[hooks](https://docs.openhands.dev/sdk/guides/hooks.md)）。
9. **委派即工具** 做学术任务 fan-out（如并行论文分析）——并行子 agent、合并 observation、`max_children` 上限、**共享 workspace**（[delegation](https://docs.openhands.dev/sdk/guides/agent-delegation.md)）。
10. **Automations 模式补我们缺的定时任务：** 把 cron 当"webhook POST" + **入消息队列再执行**（解耦/背压/可靠）→ 起沙箱 → 跑 SDK 脚本。注意这是 RFC-stage 蓝图，非现成实现（[RFC #13275](https://github.com/All-Hands-AI/OpenHands/issues/13275)）。
11. **secrets 在沙箱内惰性解析、不经客户端** —— 多用户 API key 的强模式（对应我们 third_party_accounts 池，但把解析推到边缘）（[cloud-workspace](https://docs.openhands.dev/sdk/guides/agent-server/cloud-workspace.md)）。
12. **agent server 上的 OpenAI 兼容 `/v1/chat/completions`** —— 白送一个标准客户端面（[overview](https://docs.openhands.dev/sdk/arch/overview.md)）。

## 局限

- **V0 的强制沙箱 + inter-pod HTTP 是有记录的失败源**（鉴权失败等；infrastructure errors V0 高达 **69.8/1k**，V1 降到 0.0/1k）——即"每会话一容器 + HTTP daemon"的朴素做法（接近我们当前设计）正是他们要逃离的；能 co-locate 就 co-locate（[paper](https://arxiv.org/html/2511.03690v2)）。
  > 注：draft 原文写 V0 "43.0/1k errors" 无主源支撑，已删；权威数字是总体 78.0/1k（其中 infra 69.8/1k）。
- **容器-per-conversation 有真实成本/延迟**：每会话都要镜像拉/建 + 就绪等待；warm pool 是**暗示的**缓解但 **[UNVERIFIED in primary docs]**。要为冷启动与清理留预算。
- **调度/automations 仍是 RFC 阶段（2026-03，Draft）**，非稳定 core——别指望 SDK 里有开箱即用的 cron，队列+调度器要自己实现（[RFC #13275](https://github.com/All-Hands-AI/OpenHands/issues/13275)）。
- **无已验证的内建跨会话语义/长期记忆**（仅持久化 logs + 仓库 skills）；condensation 是总结，不是检索 **[UNVERIFIED beyond this]**。
- **`LocalWorkspace` = 直接宿主 FS、无清理** —— 方便但对不可信多用户不安全；隔离是 opt-in，不可信任务必须显式选 Docker/Remote（[workspace](https://docs.openhands.dev/sdk/arch/workspace.md)）。
- **多用户粒度文档自相矛盾**（"container per user" vs per-conversation 容器）——自己定池化/驱逐策略；资源上限是配置项，不是强制安全边界（[agent-server](https://docs.openhands.dev/sdk/arch/agent-server.md)）。
- **K8s auto-scaling 未经主源确认**——文档只给静态 `replicas: 3` 示例，自动伸缩需自行实现 [UNVERIFIED]（[agent-server](https://docs.openhands.dev/sdk/arch/agent-server.md)）。
- **SDK 本质是"代码执行/软件工程"形状**（bash/files/VSCode/VNC、SWE-Bench 取向）；学术检索类负载未必需要每任务全 Docker——靠 `LocalWorkspace`↔`DockerWorkspace` 切换避免过度供给（[docker-sandbox](https://docs.openhands.dev/sdk/guides/agent-server/docker-sandbox.md)）。

## Sources

- https://arxiv.org/html/2511.03690v2 （Software Agent SDK 论文）
- https://github.com/All-Hands-AI/OpenHands （主仓库）
- https://docs.openhands.dev/ （文档站根）
- https://docs.openhands.dev/sdk/arch/overview.md
- https://docs.openhands.dev/sdk/arch/events.md
- https://docs.openhands.dev/sdk/arch/agent.md
- https://docs.openhands.dev/sdk/arch/agent-server.md
- https://docs.openhands.dev/sdk/arch/workspace.md
- https://docs.openhands.dev/sdk/arch/condenser.md
- https://docs.openhands.dev/sdk/arch/mcp.md
- https://docs.openhands.dev/sdk/arch/tool-system.md
- https://docs.openhands.dev/sdk/arch/security.md
- https://docs.openhands.dev/sdk/guides/agent-delegation.md
- https://docs.openhands.dev/sdk/guides/convo-persistence.md
- https://docs.openhands.dev/sdk/guides/agent-server/docker-sandbox.md
- https://docs.openhands.dev/sdk/guides/agent-server/cloud-workspace.md
- https://docs.openhands.dev/sdk/guides/hooks.md
- https://docs.openhands.dev/openhands/usage/architecture/runtime （V0 runtime）
- https://github.com/All-Hands-AI/OpenHands/blob/main/skills/README.md
- https://github.com/All-Hands-AI/OpenHands/issues/13275 （Automations RFC）
