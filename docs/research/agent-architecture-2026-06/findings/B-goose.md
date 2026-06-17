# Goose (Block)
> kind: project · confidence: high · last-checked: 2026-06

## 概述

Goose 是 Block 开源的通用 AI agent,定位是「运行在你自己机器上的 agent」(general-purpose AI agent that runs on your machine)。三种形态:macOS/Linux/Windows 原生桌面应用、完整的终端 CLI、以及可嵌入的 server (`goose-server` / `goosed`)。

- 代码以 Rust 为主(64.3%),TypeScript 次之(29.1%),其余为 JS/Python/Shell/HTML 等。
- 官方称支持 **15+ LLM providers**(Anthropic、OpenAI、Google、Ollama、Azure 等)与 **70+ extensions via MCP**(Model Context Protocol)。
- 桌面端与 CLI 共用同一套核心 Rust agent 代码。

> 注意:Goose 是**单用户、本机运行**的工具。它没有内建多租户/鉴权模型 —— 这与「多用户 Web 学术 agent 平台」的目标有根本差异,因此下文重点是「它的架构思路哪些可借鉴」,而非直接套用。

## 关键架构决策

- **分层**:UI 层(Desktop / CLI / `goose-server`)→ 核心 `goose` crate(Agent Core、Provider System、Extension Manager、Session Manager、Recipe Engine)→ `goose-mcp` 内建扩展(Developer、Computer Controller、Memory)。Desktop 与 CLI 共享同一核心。[derived: DeepWiki]
- **Agent loop**:Agent Core 编排「会话轮次 + 工具执行」—— 用户输入 → LLM provider → 经 MCP 扩展执行工具 → 返回结果,逐轮循环。[derived: DeepWiki]
- **Headless 单轮运行**:`goose run` 模式把一条用户消息映射为一个 agent turn 后退出;`--max-turns` 允许在这一次运行内链式调用若干工具。这是「有界、可干净退出」的执行原语,非常适合 cron 驱动的后台任务与配额控制。[derived: DeepWiki]
- **会话存储(重点 · 已确认)**:**自 1.10.0 起,Goose 用 SQLite 数据库 `sessions.db` 取代逐个 `.jsonl` 文件**。路径 `~/.local/share/goose/sessions/sessions.db`;旧的 `.jsonl` 文件仍留在磁盘但不再被 Goose 管理。Session ID 格式为 `YYYYMMDD_<COUNT>`(例:`20260213_9`)。Desktop 与 CLI 共用同一个 DB。**这正是我们当前在权衡的迁移方向(每用户 jsonl 散落在共享 FS → 真正的关系型/SQLite 后端)。**[verified: 官方文档]
- **传输**:本机桌面/CLI 为主;`goose-server` 暴露 HTTP API(含 `/schedule`)以嵌入 agent。工具一律走 MCP(stdio / SSE / streamable-HTTP MCP server)。[derived: DeepWiki + GitHub]

## 编排与子 agent

- **Subagents 是进程内的 `Agent` 实例(`Agent::new()`),不是独立 CLI 进程**(部分 sub-recipe 路径除外)。每个 subagent 拥有独立的 ExtensionManager、ToolMonitor、通信通道与隔离上下文,无共享状态 → 无冲突。[verified: dev.to 深度文]
- **派生工具**:主 agent 调用 `platform__create_task` + `platform__execute_tasks` 来创建/执行子任务。[verified: dev.to]
  - [UNVERIFIED] 草稿中提到的具体源码文件名(`subagent_handler.rs`、`subagent_task_config.rs`、`prompts/subagent_system.md`)未能在一手来源中确认。
- **并发与限额(硬编码)**:
  - 最多 **10 个并发并行 worker**,且**不可用户配置**(not user-configurable)。[verified: 官方 blog]
  - 默认 **5 分钟超时**;默认 **25 max turns**,可经 `GOOSE_SUBAGENT_MAX_TURNS` 覆盖。[verified: dev.to]
- **结果契约**:父 agent 只收到任务执行摘要(成功/失败、执行时间)+ task results(实际输出),**不会拿到子 agent 的完整会话历史**。返回结构形如:
  ```json
  { "execution_summary": { "total_tasks": 2, "successful_tasks": 2 }, "task_results": [ ... ] }
  ```
  [verified: dev.to]
- **护栏**:subagent **不能再派生 subagent**(防递归)、**不能修改 extensions**、**不能创建定时任务**(防权限升级)。subagent 与 subrecipe 都隔离、都**不可嵌套**;两者间共享信息必须在 prompt 里「非常明确地」写出来。[verified: dev.to + 官方 blog]
- **已知弱点 → 路线图**:当前 server 对所有 session **使用单一共享 Agent**,导致 session 之间互相干扰(共享 ExtensionManager / tool monitor / channels),「在 A 里启用/禁用扩展不影响 B」。官方提案:引入 **`AgentManager`,把 `session_id -> Agent`(每 session 一个 Agent),首次使用时创建、后续复用**,并「在边界处把一切都当作 Recipe」,用单一统一 executor 收敛 chat/scheduler/subtask 的多条执行路径。[verified: GitHub Discussion #4389]
- **2026 路线图**(覆盖 2026-02 至 04):承诺做「**meta-agent orchestrator**,管理 sessions / workflows / recipes 与多个并行 subagent」,并「定义一套具体的执行模型(含隔离与可选的本地容器)」。[verified: GitHub Discussion #6973]

## 记忆

- **短期记忆**:每个 session 的会话历史存于 `sessions.db`,resume 时加载。[verified: 官方文档]
- **长期记忆**:由 **Memory MCP 扩展**以文件形式落盘 —— **local 作用域** `.goose/memory/`(项目级)与 **global 作用域** `~/.config/goose/memory/`(跨项目)。[verified: 官方文档]
  - **关键行为**:「Goose 在 session 开始时加载**所有**已保存的记忆,并把它们放进**发送给 LLM 的每一条 prompt**。」[verified: 官方文档]
  - 工具:`remember_memory`(category / 可选 tags / 作用域)、`retrieve_memories`(按 category 取,`"*"` 取全部)、`remove_memory_category`、`remove_specific_memory`。关键词触发(remember / forget / memory / save / clear memory / search memory 等)。[verified: 官方文档]
  - **告诫**:把全部记忆注入每条 prompt 在大规模学术语料下**不可扩展**(context 膨胀 + 成本暴涨)。借鉴时应改为「按相关性检索」而非「全量注入」。

## 多用户与隔离

- Goose **按设计就是单用户、本机运行**,**没有内建多租户/鉴权**。今天的隔离粒度是**每 subagent(进程内)**,而非每用户;server 的「共享 Agent」问题被官方明确承认为 bug(见 #4389)。[verified: GitHub Discussion #4389]
- **沙箱目前仍是愿景**:2026 路线图提到「可选的本地容器」作为未来的执行隔离模型。[verified: Discussion #6973]
- [UNVERIFIED] 当前 release 是否已经发布任何容器级沙箱 —— 一手来源仅见路线图层面的表述,未见已落地证据。

## 扩展性

- **Extensions = MCP server**,由 Extension Manager 管理生命周期。内建三个:Developer(文件/shell/代码)、Computer Controller(GUI 自动化)、Memory。社区另有 70+ 扩展。[verified: GitHub] [derived: DeepWiki]
- **Recipes = 声明式 YAML workflow**(Recipe Engine,Jinja2 模板)。字段:必填 `title`、`description`,以及 `instructions`/`prompt` 至少其一;可选 `version`、`parameters[]`、`extensions[]`、`activities[]`、`settings`(provider/model 覆盖)、`sub_recipes[]`、`response`(JSON 输出 schema)、`retry`。参数支持 `key`、`input_type`(`string|number|boolean|date|file|select`)、`requirement`、`default`、`options`。`instructions` 会成为 `additional_system_prompt`;`prompt` 用作会话首条种子。[derived: DeepWiki 4.4.1]
- **Sub-recipe 入口字段**:`name`、`path`(相对父 recipe)、`values`(预置参数)、`sequential_when_repeated`(串行 vs 并行)。[derived: DeepWiki 4.4.1]
- **Recipe 安全**:运行前做隐藏 unicode / prompt-injection 检查;内建 library recipe 经 LLM-classifier CI 扫描;recipe 从 `~/.config/goose/recipes` 加载或从 GitHub 临时克隆。[derived: DeepWiki 4.4.2]
- **结构化输出**:配 `response.json_schema` 后,Goose 校验并强制最终输出匹配 schema(CLI 与 Desktop 均可)—— 对「机器可消费的 agent 结果」很有用。[derived: DeepWiki 3.2]

## 调度与异步

- **内建 scheduler 包裹 `tokio-cron-scheduler`**。`Scheduler` 结构体字段:`tokio_scheduler`、`jobs: Arc<Mutex<JobsMap>>`、`storage_path`(→ data 目录下 `schedule.json`)、`running_tasks`(`CancellationToken` 集合)、`session_manager`(创建自动化 session)。[derived: DeepWiki 4.1.5]
- **Cron**:6 段式(`second minute hour day month weekday`);旧的 5 段式会自动在秒位前补 `0` 转换。[derived: DeepWiki 4.1.5]
- **触发后行为**:cron 触发时,recipe 以 **headless** 运行(无交互),经 SessionManager 创建自动化 session;`CancellationToken` 防止同一 job 重叠运行。**recipe 会被复制到 `scheduled_recipes/` 目录**,即使原文件被移动/删除,已排程的 job 仍保持不变(快照式不可变)。排程时所有参数必须提前解析完(无交互式 prompt)。[derived: DeepWiki 4.1.5 + 4.4.2]
- **Agent 可控的 scheduler**:有一个 `manage_schedule` platform tool,让 agent 自己 `add/list/remove/pause/unpause/update/run_now/sessions/kill`,**门控在 `scheduler_service` 之后**(为 None 则该工具对 agent 不可用)。[derived: DeepWiki 4.1.5]
- **两套后端(legacy + Temporal)**:除内建 tokio-cron 实现外,还有一套 **Temporal** 实现,把一次性操作变成可靠的可排程 workflow;两套实现都「每次运行 spin up 一个全新 Agent」(fresh Agent per run,保证隔离)。[verified via: Temporal 社区论坛 + WebSearch;DeepWiki 4.1.5 仅描述 tokio-cron 实现,未提 Template]
  - [UNVERIFIED] 选择后端的环境变量确切名字(草稿猜测 `GOOSE_SCHEDULER_TYPE`,值 legacy/temporal)未在一手来源确认 —— 请勿当作事实引用。
- **已知调度可靠性 bug**:
  - `Scheduler not available. This tool only works in server mode.` —— **CLI headless recipe 运行在 Linux AARCH64(v1.18.0 / v1.19.1)上失败**,v1.15.0 正常;根因是 CLI headless 模式下 `scheduler_service` 未初始化。[verified: Issue #6405]
  - 早期(v1.1.4)后台排程 job「以 chat 模式运行,阻塞工具执行」。[verified: Issue #3882]

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **每 session 一个 agent,藏在 AgentManager(`session_id → Agent`)之后** —— 直接对症我们「共享 FS、无隔离」的痛点。每个 session 拿到独立的 extension/tool manager + channels;这正是 Goose 自己的整改路线(#4389)。
2. **用单一关系型/SQLite 式 session store 取代「每用户 jsonl 散落共享 FS」** —— Goose 在 1.10.0 做的正是这次迁移(jsonl → `sessions.db`),还顺带统一了 Desktop+CLI。对多用户,只需再加 `user_id` 分区(我们已有 `agent_sessions` 映射表,可把历史持久化收进去)。
3. **以 Recipe 作为统一执行边界** —— 把交互式 chat、排程 job、subagent task 都建模成**同一份 YAML recipe**,经一个 executor 跑,而非各写一套代码路径,消除行为漂移(#4389)。
4. **Recipe schema = 干净、参数化、schema 校验的任务规格**:`instructions`+`prompt`+ 类型化 `parameters`(含 `select`/`file`)+ `extensions` + `settings` + `response.json_schema`(机器可读结构化输出)。非常契合「对论文 X 跑这条分析 recipe」这类学术任务。
5. **Headless 单轮运行模式**(`goose run` → 一轮即退、`--no-session`、`--max-turns`)作为排程/后台执行的原语 —— 有界、干净退出,理想用于 cron 任务与配额控制。
6. **scheduler 的几处设计直接抄**:排程时**快照/复制 recipe**(不可变)、要求参数提前解析、每 job 跟踪 `current_session_id` + `last_run`、用 cancellation token 防重叠、**每次运行起一个全新 agent**。对 Web 平台,**Temporal 后端**(持久化 workflow)是比进程内 cron 循环更生产级的选项。
7. **agent 驱动的排程(经门控工具 `manage_schedule`)** —— 可让学术 agent 自己创建「定期文献监控」job,但要门控在能力开关之后并接上我们的配额钩子(对应 Goose 的 `scheduler_service` 门控)。
8. **subagent 扇出 + 严格的结果摘要契约** —— 派生 N 个隔离 worker(像 Goose 那样把并发封顶到 10)、强制超时(5 分钟)+ max-turns,且**只把摘要/结果回传父 agent**(保持父上下文干净、成本有界)。非常适合「并行 review 这 20 篇论文」。
9. **subagent 的「不可嵌套 + 不可自排程」护栏**,防递归/成本爆炸与权限升级。
10. **Recipe 注入安全闸**(隐藏 unicode / prompt-injection 扫描 + 对共享 recipe 的 LLM classifier)在任何用户共享的 recipe 运行前先过 —— 若日后允许学术用户共享 recipe 模板,这点相关。
11. **双层记忆 + 显式作用域标记(`is_global`)**,但要**改进** Goose:**不要把全部记忆塞进每条 prompt**,改成按相关性检索。

## 局限

- **server 端今天仍是单一共享 Agent = 跨 session 污染**(extension / tool-monitor / channel 互相干扰);修复仍在路线图、未发布(#4389)。
- **无原生多用户/租户与鉴权**;隔离是进程内 subagent,而非 OS/容器级。容器沙箱仅见于路线图,当前 release 是否落地 [UNVERIFIED](#6973)。
- **记忆不可扩展**:每条已存记忆都被注入每条 prompt → 语料规模下 context 膨胀 + 成本上升(Memory MCP 文档)。
- **subagent 失败语义有损**:超时/失败时父端「收不到该 subagent 的任何输出」;并行批次里只拿到成功者的结果(官方 blog)。
- **调度有过可靠性 bug**:`Scheduler not available`(Linux AARCH64,v1.18+,#6405);早期排程 job 曾以 chat 模式运行阻塞工具(v1.1.4,#3882)。
- **recipe 与文件夹/文件强耦合**(path 相对父 recipe;缺乏干净的打包/版本化)—— 社区想要插件式分发,尚未实现(#6768,路线图 #6973)。
- **文档可信度提示**:官方 `block.github.io/goose/docs/*` 在调研时多处 404(内容现镜像在 `goose-docs.ai`);若干深层内部细节来自 **DeepWiki(派生,非一手)**;一份 DeepWiki 快照(scheduler 页)并未呈现 Temporal 后端,因此 Temporal 后端选择器/环境变量名仍 [UNVERIFIED]。**另需警惕同名混淆**:`book.goose.rs` 是 Rust **负载测试框架 Goose**(scenario/transaction/RoundRobin 调度),与 Block 的 Goose agent **无关**,不可作为本项目来源。

## Sources

一手 / 官方:
- https://github.com/block/goose
- https://goose-docs.ai/docs/guides/sessions/session-management
- https://goose-docs.ai/docs/mcp/memory-mcp
- https://goose-docs.ai/blog/2025/09/26/subagents-vs-subrecipes/ (官方 blog,镜像)
- https://github.com/block/goose/discussions/4389 (Unify Agent Execution:per-session agents + 统一 tasks/recipes/scheduler)
- https://github.com/aaif-goose/goose/discussions/6973 (2026 OSS 路线图 · meta-agent orchestrator · 隔离/本地容器)
- https://github.com/block/goose/issues/6405 (CLI headless "Scheduler not available",Linux AARCH64 v1.18+)
- https://github.com/block/goose/issues/3882 (后台排程 job 以 chat 模式运行阻塞工具)
- https://github.com/block/goose/issues/6768 (recipe 打包/分发诉求)
- https://community.temporal.io/t/community-live-turning-ai-prompts-into-scheduled-workflows-with-goose/17751 (Temporal 后端佐证)

派生(DeepWiki,二手,需谨慎):
- https://deepwiki.com/block/goose
- https://deepwiki.com/block/goose/4.1.5-scheduler-and-recurring-tasks
- https://deepwiki.com/block/goose/4.4.1-recipe-definition-and-parameters
- https://deepwiki.com/block/goose/4.4.2-recipe-execution-and-scheduling
- https://deepwiki.com/block/goose/3.2-command-line-interface

第三方深度文:
- https://dev.to/nickytonline/advent-of-ai-day-11-goose-subagents-2n2 (subagent 内部机制深度解析)
