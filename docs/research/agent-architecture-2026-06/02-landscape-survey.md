> 维度文档 · 基于 01-current-architecture.md + findings/ · 2026-06

# 开源 Agent 全景对比 (Landscape Survey)

> 维度定位:这份文档不是「再抄一遍 11 个项目」,而是**把它们摆进一个谱系,确定 Scholay(cc-haha)现在站在哪、想迁到哪、各家身上具体偷哪一块**。后续维度文档(状态/隔离/记忆/调度/编排)会从本文「该偷什么」清单展开。所有事实来自 findings,`[UNVERIFIED]` 标记的内容只作弱信号、不当事实断言。涉及我们代码的妥协一律按 §8 的 C 编号引用。

---

## 1. 概述:cc-haha 在谱系里是哪一类

把当前架构(01 文档)一句话归位:**cc-haha 本质是「一个本地 client-server agent daemon(每会话 spawn 一个未修改的桌面 CLI 子进程)」,被 `agentbridge` 在外面硬套了一层多用户 Web 适配。** 它在谱系里**横跨两类**:

- agent 容器本身(`scholar_agent` :3456,`src/server/` + spawn CLI 子进程,会话落 `~/.claude/*.jsonl`)属于 **client-server daemon 类**,与 OpenCode (`opencode serve`)、Crush (`crush serve`)、Cline SDK 的 hub-spoke、Goose `goose-server`、OpenHands V1 agent-server 同一范式 —— 一个无头引擎 + 瘦客户端 + 事件流。
- 但它的**底座**是一个**纯本地 CLI**(桌面 Claude Code 风格,装运了 Ink TUI / replLauncher / voice / vim / ssh 等全套桌面遗留物,C18),这把它的根本假设钉死在 OpenClaw / Hermes / Aider / Cline / Crush / Goose 那条**单租户、机主可信、文件即真源**的 CLI 血脉上。

关键张力就在这:**我们消费它的方式(多用户 Web、N 用户 M 会话挤一个共享 `~/.claude`)与它的设计假设(单机单用户、shared FS 天然合理)正面冲突。** 谱系里所有「单机 CLI」项目(OpenClaw/Hermes/Aider/Cline/Crush/Goose/Codex-local)都**明确自陈不是敌对多租户边界**;真正解决多租户的是另一类 —— **沙箱化云平台**(Codex Web、Claude Code on the web、Devin、Cursor Cloud、OpenHands DockerWorkspace),它们的共同答案是「**每 session/task 一个隔离容器或 VM + scoped-credential proxy + 默认拒绝出网**」。

我们当前的隔离(随机 sid + cwd 软约定 + 后端路径门,但 Bash 绕开它,C1/C5)恰好是 OpenCode SECURITY.md 那句话的翻版:*"OpenCode does not sandbox the agent… If you need true isolation, run inside Docker/VM."* —— 我们已经在跑容器,但**全用户共享同一个容器同一个 FS**,所以只拿到了「单租户 daemon」的隔离强度,没拿到「沙箱化云平台」的。

**north-star 用谱系话说:把底座从「本地 client-server daemon(共享 FS)」迁到「沙箱化云平台(DB-as-truth + per-session 隔离 + durable 任务底座 + 两层记忆)」。** 下面逐家定位,再聚类。

---

## 2. 逐项目速览(11 个)

每个:定位 · 最值得记住的 1-2 个架构决策 · 我们能偷的 1 点。

**OpenClaw (小龙虾)** — 自托管「个人 AI 助手网关」,把消息渠道接到一个常驻 Gateway daemon(WS 优先,默认 127.0.0.1:18789),自带文件型记忆 + cron + 子 agent + skill 注册中心。
- 记住:① **三层 Markdown 记忆 + SQLite 混合检索**(`MEMORY.md` 开场注入 / `memory/YYYY-MM-DD.md` daily 索引不注入 / `memory_search` MCP 走 SQLite);② **官方写死「不是敌对多租户安全边界」**,会话键 `session.dmScope` 只是路由选择器、绝不当授权。
- 偷:**Dreaming**(opt-in 夜间 cron 把累积会话固化进 `MEMORY.md`,可解释加权打分 + 门槛 gate + 写前 rehydrate)—— 直补 C4 的 per-user 长期记忆,且「会话键=路由不=授权」这条铁律正好回应 C5。

**Hermes (Nous Research, 爱马仕)** — MIT、自我改进、CLI 优先的「数字员工」:持久记忆 + 自建技能 + **多 agent Kanban** + cron,单一 `AIAgent` 核心被所有入口复用。
- 记住:① **Kanban = 持久 SQLite 任务板**(`assignee`/`task_links` 依赖/`task_events` append-only 审计/状态机 `triage|todo|ready|running|blocked|done`/cron dispatcher 60s claim→spawn→reclaim,**每任务拉起独立 OS 进程**),一次补齐「长跑/后台/定时 + 多 agent」;② **session 开始冻结系统提示词 + 记忆快照**保 prefix cache。
- 偷:**Kanban 任务板底座**(建在我们已有 MySQL + Redis 上)—— 直补 C15(无后台/异步任务面)+ C2/C3(进程内 displacement/reset → 落 DB/Redis 锁就能横扩)。

**OpenCode (anomalyco/opencode, ~174K★)** — 无头 TS/Bun 后端 + 瘦客户端走 **HTTP + SSE**,**server-as-source-of-truth**,持久化已从 JSON 文件迁到 **SQLite (Drizzle)**。
- 记住:① **严格 client/server 分离 + 类型化事件总线 SSE 扇出**(首事件 `server.connected`,客户端保响应式 store,重连=重订阅),agent 跨断线/换设备存活;② **OpenAPI 3.1 挂 `/doc` 生成 SDK** + Models.dev 注册表(pricing/context 当数据不当代码)。
- 偷:**事件总线 + SSE 扇出 + server-as-truth** —— 修我们「连接断了会话就孤儿化」(C15)、并为 DB-as-truth 提供前端契约。反面教材:它 < v1.1.10 的无鉴权+`CORS:*` 造成过真实 RCE(对照我们 C16 CheckOrigin 恒 true)。

**Crush (charmbracelet/crush)** — Go、终端原生 TUI 编码 agent,已演进出 headless `crush serve`(HTTP+SSE),隔离单位是**文件系统路径 `--cwd` 而非用户身份**。
- 记住:① **Coordinator / SessionAgent 拆分**(长生命周期编排器:provider 构造/工具装配/模型解析 vs per-session 流式 runner:循环/队列/取消/摘要)—— 干净映射我们 `agentbridge`(=Coordinator)vs per-`agent_session` runner;② **workspace = 显式共享状态单位 + `IsBusy`/`AttachedClients` + SSE 流引用计数生命周期 + 宽限窗口**。
- 偷:**把 workspace key 从 cwd 改成 user_id**,复用 `IsBusy`/`AttachedClients` + 引用计数回收 + 宽限窗 —— 正面呼应我们 `displacement-key-per-session` 与 C2;**per-session 消息队列 + 单一在飞回合**是「多 tab 并发提交」的干净答案(不锁整个用户)。

**Aider** — 单用户单机的 AI 结对编程 CLI,git 即数据库,主循环是 **edit-format 往返**而非 tool-call ReAct;部署模型完全不能照搬,但**算法**值得抄。
- 记住:① **Repo map = tree-sitter + PageRank**,向当前会话提及的文件加权 50×,二分搜索卡 token 预算;② **architect/editor 双模型拆分**(贵推理出方案、廉价快模型出结构化 diff,R1+Sonnet 14× 更低成本拿 SOTA,**但并非总赢、需门控**)。
- 偷:**「语料图 + PageRank + 二分 token 预算」** —— 把「文件→论文/作者/期刊,引用→引文」做 PageRank、向会话提及实体人格化偏置,给 LLM 按预算裁剪的相关语料地图(我们领域天然适配,且对接 minicod 检索)。

**Cline + Roo** — Cline 已抽出独立开源 runtime `@cline/sdk`(Apache-2.0),支撑 CLI + Kanban Web 看板;Roo Code(Cline 的 fork)**已于 2026-05-15 关停归档**,只作历史设计参考。
- 记住:① **Hub-spoke 解耦**(hub = 会话路由/事件 fan-out/调度,**不跑 agent loop**;spoke worker 跑 loop;**会话在 WS 断开和 worker 崩溃后存活**,另一客户端可中途 attach);② **两层上下文管理**(廉价确定性滑动窗口截断:保首条任务消息、按对丢中段、按模型留 buffer **叠加** LLM %-阈值压缩,配可见进度条)。
- 偷:**Hub-spoke 解耦**(findings 称「单项最大收益」)—— 把现有 HTTP+WS daemon 拆成协调 hub + 短命 spoke worker,会话脱离前台 WS 存活(C15),且天然横扩(C2/C3);**持久快照 + SQLite 索引**(`sessions.db` 索引 + `[session-id].json` 快照)正是从 jsonl 出走的渐进路径。

**Goose (Block)** — Rust 通用 agent(桌面/CLI/`goose-server`),工具全走 MCP,会话存储**自 1.10.0 起从 jsonl 迁到 SQLite `sessions.db`**(正是我们在权衡的迁移方向)。
- 记住:① **AgentManager:`session_id → Agent`(每 session 一个 Agent,首用即建后续复用)**—— 直接对症我们「共享 FS 无隔离」,这是 Goose 自己的整改路线(#4389);② **Recipe 作统一执行边界**(交互式 chat / 排程 job / subagent task 全建模成同一份 YAML recipe,经一个 executor 跑,消除行为漂移)。
- 偷:**「Recipe 作统一执行边界 + 每次运行起全新 agent + 排程时快照不可变 recipe」** —— 直接对症我们 C10/C11(bridge 抽象漏:server-side 路径绕开 SessionOptions/配额钩子,各 feature 自己重实现)。

**OpenHands (All-Hands-AI, 原 OpenDevin)** — V1 Software Agent SDK,**event-sourcing 作唯一真源**(append-only `EventLog` + 小 `base_state.json`),四包分层,传输 HTTP REST + WS,**隔离可选非强制**(Workspace 抽象切换 Local↔Docker)。
- 记住:① **Event-sourced `ConversationState`**(不可变事件、确定性重放、暂停/恢复/崩溃恢复;`source` 来源 ≠ LLM `role`,刻意二元);② **V0→V1 的反向教训**:V0 的「每会话一容器 + inter-pod HTTP」(≈我们当前形态)是有记录的失败源(infra errors 69.8/1k → V1 co-locate 后 0.0/1k),主张「**Sandboxing should be opt-in, not universal**」。
- 偷:**用 event-sourced state 替换不透明 jsonl**(直补 DB-as-truth + 审计 + 重放)+ **`source` 与 `role` 分离**(规整我们 in-band 前缀注入 C9)+ **Condenser 长会话记忆**(keep-first/keep-last + 总结中段,~2× 成本下降)。注意:别天真照搬 V0「每会话一容器 + HTTP daemon」(那正是它逃离的、也接近我们现状)。

**Codex (OpenAI, CLI + Cloud)** — 一套 Rust core(`codex-rs`)驱动 TUI/IDE/headless/cloud;**两轴权限:sandbox(能力)× approval(何时问)**;本地走 OS 内核级 sandbox(Seatbelt/Bubblewrap/Landlock),云端 **每任务一隔离容器**。
- 记住:① **两轴权限模型**(`sandbox_mode` read-only/workspace-write/danger-full × `approval_policy` untrusted/on-failure/on-request/never);② **setup 期 vs 运行期 secret 分离**(secret 只对 setup 脚本可见,agent 阶段开始前被移除)+ 云端容器**网络默认关、只经 proxy 出站、缓存 12h TTL**。
- 偷:**两轴权限**(把我们单 bool `AutoApprovePermission` C14 + 「Bash 无脑 allow」C1 拆成 sandbox-能力 × approval-何时问)+ **setup/runtime secret 分离**(防 prompt-injected agent `cat providers.json` 外泄真 LLM key,正中 C1 的暴露 caveat)。

**Claude Code (reference baseline)** — Anthropic 官方,本地 CLI 引擎(session=一次性 context,持久化落 jsonl + CLAUDE.md + auto memory)+ **Claude Code on the web / Routines**(每 session 一个托管 VM + scoped-credential proxy + 网络分级 + 定时/API/GitHub 触发)。这是 cc-haha 的直系血缘。
- 记住:① **memory tool 原语 `memory_20250818`**(client-side、文件式 `/memories` 目录、`view/create/str_replace/insert/delete/rename`,**存储后端与 per-user 隔离完全由实现方负责**,benchmark memory+context-editing +39%);② **per-session VM + scoped-credential proxy + 网络分级**(None/Trusted-allowlist/Full/Custom,credential 不进沙箱)。
- 偷:**实现 `memory_20250818` handler 指向我们自己的 per-user DB/MinIO 后端 + 路径穿越校验** —— 这是补 C4 最直接的「Anthropic memory-tool 契约」路径(agent 容器实现 handler,backend 提供 per-user `/memories` 命名空间);**hooks 作强制层**(PreToolUse/PermissionRequest,HTTP hook 契合 Go 后端)对应我们配额/审批应是确定性闸而非 prompt 建议(C9/C11)。

**Managed: Amp + Devin + Cursor + Droid** — 四个面向团队的托管 coding agent,**多租户/隔离/记忆/调度最成熟**的一档。
- 记住:① **Devin `blockdiff`**(COW VM 磁盘快照,20GB 创建 ~200ms,「不可变 base + per-session overlay」)+ **Knowledge 库**(trigger + content + macro,org/repo/user 作用域,**惰性检索**)+ **定时/事件触发**(RFC-5545 RRULE / file-changed / PR retrigger);② **Amp thread 作一等公民、可分享(4 级可见性)、可 @-引用**;子 agent 是 **fan-out/fan-in 不是 chat mesh**(铁律:subagent 之间不能通信),read-only **Oracle** 跑更强模型且 system prompt 刻意克制以控成本。
- 偷:**Knowledge 库的「作用域(user/project/学科)+ trigger 惰性检索」**(补 C4,且避开 org-wide 默认的跨租户泄漏);**COW 快照式 per-session 环境分叉**(修 C5 的最干净路径:不必整 VM,base 快照 + overlay 落到 container/overlayfs);**归一化用量单位 + 双计费池**(Devin ACU = VM+推理+带宽;Cursor Auto池 vs API池)优于裸 token,对接我们配额钩子(C7/C8)。

---

## 3. 大对比表

列含义:**会话/状态模型** · **持久化** · **传输** · **编排** · **长期记忆** · **多用户/隔离** · **调度/异步** · **扩展** · **开源/许可**。单元格用 ✓/✗/简词;不确定标 `?`。

| 项目 | 会话/状态模型 | 持久化 | 传输 | 编排 | 长期记忆 | 多用户/隔离 | 调度/异步 | 扩展 | 开源/许可 |
|---|---|---|---|---|---|---|---|---|---|
| **cc-haha (我们)** | 共享 FS jsonl/session(sid+cwd 软隔离) | agent 自管 jsonl + MySQL 映射 | CLI 子进程 + HTTP + WS | 子agent(Task,同步) | ✗(CLI 有 CLAUDE.md/memdir 未对接) | 单容器共享 FS,**软隔离**(C1/C5) | ✗(无后台/定时,C15) | MCP(minicod)+ skills(--add-dir) | 自有 |
| **OpenClaw** | append-only jsonl,会话键=路由 | jsonl + SQLite(检索) | WS 优先(daemon) | 子agent(默认不嵌套)+ 多 agent 路由 | ✓ 三层 MD + SQLite 混检 + Dreaming | ✗ 单租户(官方写死),per-(channel,peer) 仅隐私 | ✓ Heartbeat + Cron(at/every/cron,SQLite 持久) | MCP + Skills + ClawHub + plugins | ✓ OSS |
| **Hermes** | 单 `AIAgent` 核心多入口 | SQLite + FTS5(+ `parent_session_id` 血缘) | CLI + gateway + ACP + OpenAI 兼容 | **Kanban**(持久队列+状态机)+ delegate_task(同步) | ✓ `MEMORY.md`+`USER.md`(字符封顶)+ FTS5 episodic + 外部 provider | profiles=独立 home/进程(重);沙箱 6 backend | ✓ Cron(每 job 新 AIAgent)+ Kanban dispatcher | MCP + Skills(渐进披露)+ Curator + plugins | ✓ MIT |
| **OpenCode** | **server-as-truth**,响应式 store | **SQLite (Drizzle)**(原 JSON 文件) | **HTTP REST + SSE**(事件总线) | primary/subagent(child-session)+ Task 工具 | ✗ 仅 `AGENTS.md`(静态);第三方插件补 | ✗ 单租户绑 FS,无 sandbox(SECURITY.md 明示) | ✗ core 无 cron;`prompt_async` + SSE | MCP + Skills + Plugins + LSP + ACP | ✓ OSS |
| **Crush** | **Coordinator/SessionAgent 拆分** | **SQLite + sqlc** | TUI + `crush serve`(HTTP+SSE) | agent 工具 + agentic_fetch(只读子agent) | ✗ 仅 `CRUSH.md`/`AGENTS.md`(静态) | ✗ workspace 按 **cwd** 共享一切(反模式) | ✗ 无 cron;bash 后台 + 消息队列 | MCP(stdio/http/sse)+ Skills + Hooks + Catwalk | ✓ OSS |
| **Aider** | 本地文件 + git 即 DB | `.aider.chat.history.md` + git commit | 终端 REPL(无 server/WS) | architect→editor **固定两段**(非子agent) | ✗ 仅 `CONVENTIONS.md`(只读缓存) | ✗ 单用户单机,运维自己塞容器 | ✗ 无 cron;`-m`/`--watch` | ✗ 核心无 MCP(仅第三方外挂) | ✓ OSS |
| **Cline+Roo** | **Hub-spoke**(会话脱前台存活) | SQLite 索引 + JSON 快照 | **WS**(hub-spoke,多客户端 attach) | sub-agents(同步)+ **Teams**(持久 task-board) | ✗ Memory Bank(MD 约定,需手动) | ✗ 单租户,无 per-user 认证/隔离 | ✓ Cline CLI cron(hub 驱动,脱终端)+ Kanban worktree | MCP Marketplace(AI 装)+ SDK 工具 + rules | ✓ Apache-2.0;Roo 已归档 |
| **Goose** | **AgentManager:session→Agent**(路线图) | **SQLite `sessions.db`**(原 jsonl) | 桌面/CLI + `goose-server`(HTTP) | subagent(进程内,≤10,不嵌套)+ Recipe | ✓ Memory MCP(文件,local/global;**全量注入每 prompt**=不可扩展) | ✗ 单用户;沙箱仅路线图(本地容器) | ✓ Scheduler(tokio-cron + Temporal 后端,每 run 新 agent,recipe 快照) | MCP(70+)+ Recipe(YAML)+ schema 输出 | ✓ OSS |
| **OpenHands** | **Event-sourcing 唯一真源** | append-only `EventLog` + `base_state.json`(<20ms 恢复) | HTTP REST + WS + OpenAI 兼容 | **DelegateTool**(阻塞并行)+ RouterLLM | ✗ core 无跨会话长期记忆(? 向量未证);Condenser=摘要 | ✓ **Workspace 抽象**(Local↔Docker↔Remote)container-per-conv/user(粒度可配) | RFC #13275(cron=webhook POST + 入队解耦,Draft) | MCP(FastMCP)+ Skills(always/触发)+ Hooks(shell/agent) | ✓ OSS |
| **Codex** | 一套 core 多交付面,submit/event 解耦 | rollout JSONL(+ zstd 压缩) | TUI/IDE(JSON-RPC)/headless/cloud | manager-worker(显式 spawn,max_depth=1/threads=6) | ✓ Memories(用户本地,secret 脱敏,异步写;规则进 AGENTS.md) | **本地 OS sandbox** + **云每任务一容器**(网络默关+proxy+12h TTL) | ✓ Automations(cron/RRULE,standalone/thread,worktree→Triage) | MCP(client+server)+ AGENTS.md + Skills($skill) | ✓ OSS(CLI) |
| **Claude Code** | session=一次性 context,文件持久 | jsonl + CLAUDE.md + auto memory(per-repo 本地) | 多 surface 同引擎(协议 spec ?) | **三档**:subagents(嵌套≤5 后台)/forks(复用父 cache)/agent teams(Mailbox+共享 task list) | ✓ **memory tool `memory_20250818`**(client-side,后端自实现)+ auto memory | **on web:每 session 托管 VM + scoped-cred proxy + 网络分级** | ✓ **Routines**(cron 最小1h / API `/fire` / GitHub 事件,跑托管基建) | Skills(渐进披露)+ **Hooks**(强制层,含 HTTP)+ MCP + Plugins | 闭源(契约/标准开放) |
| **Managed(Amp/Devin/Cursor/Droid)** | thread 一等公民(Amp)/ per-session VM(Devin) | thread / VM 快照(Devin `blockdiff` COW) | CLI + Web + Mobile + Slack/GitHub/API | fan-out/fan-in(Amp Oracle 只读)/ manager-Devin / coordinator→droid | ✓ **Devin Knowledge**(trigger+作用域+惰性检索)/ Playbooks | ✓ **每 session 隔离 VM**(Devin/Cursor)+ scoped 凭据;Amp thread 4 级可见性 | ✓ **最成熟**(Devin RRULE/file/PR;Cursor schedule+事件 Automations 多入口) | MCP + Skills/Playbooks + Hooks + plugins | 闭源(托管) |

> 表内 `?` 处:OpenHands core 是否有向量/语义长期记忆主源未证;Claude Code 跨 surface 同引擎的协议 spec 未找到(均见 findings `[UNVERIFIED]`)。

---

## 4. 架构聚类:五大范式,我们在哪、去哪

把 11 家(+我们)按「会话状态住在哪 + 隔离强度 + 是否生产级多租户」聚成五类。注意**记忆层、durable 编排底座是横切能力**,不是互斥范式,所以单列出来。

**范式 A · 纯本地 CLI(单进程、文件即真源、单租户)**
成员:Aider、OpenClaw、Hermes、Cline(IDE 扩展形态)、Crush(TUI 形态)、Goose(桌面/CLI 形态)、Codex(本地 CLI)、Claude Code(本地引擎)。
共性:状态落本地文件/SQLite,机主可信,隔离靠 OS sandbox(顶多)。**全部明确自陈不是敌对多租户边界。**
**cc-haha 的底座属于这一类**(spawn 完整桌面 CLI 子进程,C18),这是一切多租户妥协的根因。

**范式 B · Client-server daemon(无头引擎 + 瘦客户端 + 事件流,仍单租户)**
成员:OpenCode (`serve`)、Crush (`serve`)、Cline SDK(hub-spoke)、Goose (`goose-server`)、OpenHands V1 agent-server、Codex app-server。
共性:server-as-truth、HTTP+SSE 或 WS、会话脱离前台客户端存活、多客户端 attach。**但隔离仍是 cwd/单机级,不是 per-user。**
**cc-haha 的 agent 容器属于这一类** —— 我们已经迈过「daemon 化」这一步(`src/server/` + WS pipe),但停在「单租户 daemon」,没拿到 per-user 隔离与 server-as-truth(状态还在 jsonl 不在我们 DB)。

**范式 C · 沙箱化云平台(每 session/task 隔离容器/VM + scoped-cred proxy + 默认拒绝出网,真多租户)**
成员:Codex Web、Claude Code on the web、Devin、Cursor Cloud、OpenHands DockerWorkspace/RemoteWorkspace。
共性:**这是唯一一类真正解决「敌对多用户」的范式。** 隔离边界 = 容器/VM(非软约定),credential 不进沙箱(secret 在边缘/setup 期解析),网络默认关只走 proxy,资源配额一体。
**这是 north-star 想迁到的类。** 我们已有 egress proxy(唯一出网)+ prism_tex 的 `network_mode:none` 硬沙箱样板,缺的是把「每 session 一个隔离执行环境」这件事从「共享容器内 cwd 软约定」升级为「真隔离单元」。OpenHands V1 的教训提醒:别天真做「每会话一容器 + inter-pod HTTP」(V0 失败源,≈我们现状的放大版),要么 co-locate 要么用更轻的 COW 快照(Devin blockdiff)。

**范式 D · 记忆层(横切能力)**
谱系:静态文件(AGENTS.md/CLAUDE.md/CONVENTIONS.md — OpenCode/Crush/Aider/Amp,**非学习型**)→ 双层文件 + 字符封顶(Hermes `MEMORY.md`/`USER.md`、Goose local/global)→ **三层 + 检索/固化**(OpenClaw 三层 MD + SQLite 混检 + Dreaming;Devin Knowledge trigger+作用域+惰性检索)→ **API 契约**(Claude Code `memory_20250818`,后端自实现)。
**我们当前在「无」**(C4:CLI 有 CLAUDE.md/memdir 但 Web 未对接)。目标:**两层记忆 = per-session checkpoint(Condenser/摘要)+ per-user 长期 block/archival,走 `memory_20250818` 契约**。

**范式 E · Durable 任务底座 / Kanban(横切能力)**
谱系:无(Aider/OpenCode/Crush 核心无 cron)→ 进程内 cron(Goose tokio-cron)→ **持久任务板/队列**(Hermes Kanban SQLite + dispatcher;Cline Teams task-board;Claude Code agent teams 共享 task list 但临时)→ **生产级 durable**(Goose Temporal 后端;OpenHands automations「cron=webhook POST + 入队解耦」;Devin/Cursor 托管调度)。
**我们当前在「无」**(C15)。目标:**durable 任务底座 + Kanban 式任务板,一次补齐「长跑/后台/定时 + 多 agent」,建在已有 MySQL + Redis 上**(Hermes Kanban 蓝本,但用 DB/Redis 锁取代进程内,顺带解 C2/C3)。

**一句话路线:A(底座) → B(已到) → C(目标隔离) + D(记忆) + E(任务底座)。**

---

## 5. Scholay 该从每家偷什么(精炼清单,指向后续维度)

按维度归并,标注**影响的 C 编号 + 我们的改动触点**。后续维度文档据此展开。

**→ 状态/持久化维度(DB-as-truth,出 jsonl)**
1. **OpenHands event-sourcing**:append-only `EventLog` + 小 `base_state.json`,确定性重放 + 崩溃恢复 + 审计。落点:把 transcript 从 agent 自管 jsonl 迁进我们 MySQL,`agent_sessions` 映射表对应 `conversation_id`。影响 **C5**(共享 jsonl)、**C21**(无 FK)。
2. **Goose/Cline/OpenCode 的 SQLite 渐进路径**:Cline「SQLite 索引 + JSON 快照」是最轻的过渡(保留落盘模型,先让列表/搜索廉价 + 按 user 命名空间)。落点:`agent_sessions` 加历史持久化列 / 旁表。影响 **C5**。
3. **OpenHands `source` ≠ LLM `role`**:把系统规则注入为 `role=user` 而不污染归因 —— 规整我们 in-band 前缀。影响 **C9**(prompt 注入前缀 in-band 可伪造)。

**→ 隔离/沙箱维度(per-session 分级隔离)**
4. **Codex 两轴权限**(sandbox 能力 × approval 何时问)+ **setup/runtime secret 分离**。落点:`agentbridge` 把单 bool `AutoApprovePermission` 与 `decidePermission` 升级成两轴;agent 容器 secret 在 setup 期注入、agent 启动前剥离。影响 **C1**(Bash 旁路 + 可读 providers.json)、**C14**(单 bool 语义分裂)。
5. **OpenHands Workspace 抽象 + Codex Web/Claude Code on web 的「每 session 隔离容器/VM + scoped-cred proxy + 网络默关」**:按信任级别分级(MCP-only→container/gVisor,任意代码→microVM)。落点:复用已有 egress proxy + prism_tex `network_mode:none` 样板,把「共享容器 cwd」升级为隔离单元。影响 **C1/C5**。
6. **Devin `blockdiff` COW 快照**(20GB ~200ms):「不可变 base + per-session overlay」落到 container/overlayfs,让 per-session 隔离不必整 VM。影响 **C5**。

**→ 记忆维度(两层 + Anthropic 契约)**
7. **Claude Code `memory_20250818` handler 指向 per-user 后端**:agent 容器实现 memory-tool handler,backend 提供 per-user `/memories` 命名空间(DB/MinIO)+ **路径穿越校验**。这是补 C4 最直接的契约路径。影响 **C4**。
8. **OpenClaw Dreaming + Hermes 字符封顶 + Devin Knowledge 作用域/惰性检索**:夜间 cron 把累积会话固化进 per-user `MEMORY.md`(加权打分 gate);记忆**按相关性检索而非全量注入**(避开 Goose「全量注入每 prompt」不可扩展的坑);作用域设 user/project/学科(避开 org-wide 跨租户泄漏)。落点:新 per-user 记忆表 + `agentbridge` 注入钩子 + 夜间任务。影响 **C4**。
9. **OpenHands Condenser / Aider+Cline 廉价摘要**:per-session checkpoint = keep-first/keep-last + 廉价小模型摘要中段(~2× 成本下降),配可见上下文进度条。影响 **C4** + token 成本。

**→ 调度/任务底座维度(durable + Kanban)**
10. **Hermes Kanban 任务板**(`assignee`/`task_links`/`task_events` append-only/状态机/dispatcher claim→spawn→reclaim)建在我们 MySQL + Redis:**一次补齐「长跑/后台/定时 + 多 agent」**,且把进程内 displacement/reset 锁换成 DB/Redis 锁 → 横扩。影响 **C15**(无任务面/无通知)、**C2/C3**(进程内单实例假设)。
11. **OpenHands automations 模式**(cron = webhook POST + 入消息队列再执行,ingestion 与 execution 解耦做背压)+ **Goose Recipe 快照不可变 + 每 run 新 agent**:调度的可靠性纪律。影响 **C15**。
12. **Claude Code Routines / Devin 多入口触发**(cron 最小 1h / API `/fire` / GitHub 事件):异步 agent 可程序化触发,结果落 per-user 收件箱(空则归档)—— 补「完成通知」。注意我们 deferred 的 `CronCreate`/`RemoteTrigger`/`PushNotification` 工具(`PushNotification` 还在 denylist)。影响 **C15**。

**→ 编排/前端维度(事件总线 + bridge 抽象收口)**
13. **OpenCode 事件总线 SSE 扇出 + Cline hub-spoke**:会话脱离前台 WS 存活、多客户端 attach、worker 崩溃不死会话。落点:把 WS pipe 拆成协调层 + 短命 worker。影响 **C15**、**C17**(逐帧同步无缓冲;配合 north-star 的 resumable streams + Redis 缓冲)。
14. **Crush Coordinator/SessionAgent 拆分 + workspace key 改 user_id + `IsBusy`/`AttachedClients` + 引用计数回收**:per-session 消息队列解「多 tab 并发提交」不锁整个用户。影响 **C2**(displacement)、**C6**(get-or-create 双行)。
15. **Goose Recipe 统一执行边界 + OpenHands 委派即工具**:消除 server-side feature(peerreview)绕开 bridge 重实现 session 创建/配额。落点:`agentbridge` 把 SessionOptions/配额钩子做成对 WS 与 server-side 都生效的统一抽象。影响 **C10**(SessionOptions 不覆盖 server-side)、**C11**(配额钩子无 server-side 等价)、**C13**(artifact 交付是 claw 私有)。
16. **Codex/Devin 归一化用量单位 + 双计费池**(ACU = VM+推理+带宽;Auto池 vs API池):前置检查与扣减统一、带 request_id 归属。影响 **C7**(配额前置/扣减解耦,WS usage 无 request_id)、**C8**(fail-open)。
17. **Amp 铁律 fan-out/fan-in(subagent 不通信)+ Oracle 只读强模型 system prompt 克制 + Aider architect/editor 门控**:多 agent 编排的成本纪律 —— 预算约束落编排层不交模型自觉。指向编排维度文档。

**→ 安全维度(纵深防御补层)**
18. **OpenCode RCE 警世(无鉴权 + `CORS:*`)** 对照我们 **C16**(CheckOrigin 恒 true):WS origin 白名单作纵深防御。
19. **Hermes Promptware Defense + Goose Recipe 注入扫描**:对**被存储/被调度的任务体**在执行前做 prompt-injection 扫描 —— 一旦上 §E 任务底座 + §D 记忆固化,这是必须补的缺口(否则 poisoned memory/task 会被无脑执行)。

---

*(本维度到此。状态/隔离/记忆/调度/编排各自的分期选项与取舍,留给后续维度文档展开。)*
