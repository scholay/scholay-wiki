# Cline & Roo Code
> kind: project · confidence: high · last-checked: 2026-06

## 概述

- **Cline**:"The open source coding agent in your IDE and terminal." 最初是 VS Code 扩展;**2026-05-13/14** 其核心被抽取为独立的开源 agent runtime —— `@cline/sdk`(**Apache-2.0,要求 Node 22+**)。该 SDK 现已支撑 Cline 的 CLI 与 Kanban Web 看板,IDE 扩展(VS Code / JetBrains)正在迁移中。SDK 处理完整 agent loop:LLM 调用、工具编排、会话持久化、多 agent 协作、调度。([github.com/cline/cline](https://github.com/cline/cline)、[cline.bot blog: introducing-cline-sdk](https://cline.bot/blog/introducing-cline-sdk-the-upgraded-agent-runtime)、[marktechpost 2026-05-14](https://www.marktechpost.com/2026/05/14/cline-releases-cline-sdk-an-open-source-agent-runtime-now-powering-its-cli-and-kanban-with-ide-extensions-being-migrated/))

- **Roo Code**:Cline 的 VS Code 扩展 fork —— "Roo Code gives you a whole dev team of AI agents in your code editor." 它在 *modes* 与 *任务编排*(Boomerang)上走得更远。单用户、绑定 IDE。
  - ⚠️ **重要更正(与草稿相反):Roo Code 已于 2026-05-15 正式关停并归档,不是 mirror artifact。** GitHub API 显示官方仓库 `RooCodeInc/Roo-Code` `archived: true`、`pushed_at: 2026-05-15T18:08:47Z`、最后版本 v3.54.0(2026-05-15);README 明确写 "The Roo Code Extension was shut down on May 15th",并推荐改用社区 fork **ZooCode** 与 **Cline**(Roo Code 的源头)。([github.com/RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code))
  - 其文档站 `docs.roocode.com`(指向归档后的 GitHub Pages 镜像 `roocodeinc.github.io/Roo-Code`)内容仍可访问,本报告把它当作**历史设计的一手资料**来引用,但该产品本身已不再维护。**若要长期对标,应以仍在积极开发、且面向 Web/SDK 的 Cline 为基准。**

---

## 关键架构决策

### Cline SDK —— 对 Web 平台最直接相关的模型

- **严格分层、核心可在浏览器运行。** 四个包,依赖只能**向下**:`@cline/shared`(types / tool 契约 / hook engine,无依赖)→ `@cline/llms`(provider handlers / model catalog / 运行时 `registerProvider`·`registerModel`)→ `@cline/agents`(**浏览器兼容、无状态的 agent 执行循环**)→ `@cline/core`(Node runtime:sessions、内建工具、hub 传输)。"lower layers stay embeddable without pulling in the full runtime." ([docs.cline.bot/sdk/architecture/overview](https://docs.cline.bot/sdk/architecture/overview))
- **AgentRuntime**(别名 `Agent`)是循环原语,暴露 `run` / `continue` / `abort` / `subscribe` / `restore` / `snapshot` —— 多轮状态机,平台无关、不拥有会话存储或内建工具。([overview](https://docs.cline.bot/sdk/architecture/overview))
- **Hub-spoke daemon 传输**(多客户端的关键决策,均为一手文档原文):
  - **Hub** = 每台机器一个 singleton daemon:"Coordinates sessions, routes events and approvals, manages schedules, brokers capabilities between clients. **Does not run the agent loop.**"
  - **Spoke workers** = 跑 `@cline/core` 的独立 worker 进程:"Executes the agent loop, calls tools, streams output. Reports events back to the hub."
  - **Clients**(CLI / VS Code / JetBrains / 自定义 app)"registers over WebSocket, attaches to sessions, sends user input, receives streamed events."
  - **会话能在客户端断开后存活**(原文):"If the CLI exits or a window closes, the spoke continues executing. Another client can attach to the same session and pick up the event stream mid-flight." 以及 "If a client crashes, the hub and its running spokes are unaffected. The session continues executing in the spoke worker."
  - ([docs.cline.bot/sdk/architecture/hub-spoke](https://docs.cline.bot/sdk/architecture/hub-spoke))
- **持久化**:`~/.cline/data/sessions/` 下用 "**SQLite index** for efficient listing and **JSON snapshots** as the source of truth for each session's state"(目录里 `sessions.db` + `[session-id].json`)。即:与本平台现有的"每会话本地文件"模式同构,但在其上加了 SQLite 索引。([hub-spoke](https://docs.cline.bot/sdk/architecture/hub-spoke))

### Agent loop & 工具分发(Cline 扩展内部,来源 DeepWiki,二手)

`Controller` 管理任务生命周期;每个 `Task` 跑循环:system-prompt 组装(`PromptRegistry`,按模型族出 variant)→ LLM 调用(`ApiHandler` → `ApiStream` async generator)→ 解析为 text+tool 块(`AssistantMessageContent`)→ `ToolExecutor` 分发(file / command / browser / MCP)→ **`Task.ask()` 挂起循环等人工 approve** → 追加结果 → 继续。访问控制 `ClineIgnoreController` + `CommandPermissionController`;diff 经 `DiffViewProvider` 预览。([deepwiki.com/cline/cline](https://deepwiki.com/cline/cline) —— DeepWiki 为社区生成的代码索引,非官方文档,作背景参考)

---

## 编排与子 agent

### Plan / Act modes(Cline) vs Modes(Roo)

- **Cline Plan/Act**(一手文档原文已核):Plan mode 只读 —— "read your codebase, run searches, and discuss strategy, but cannot modify any files or execute commands";"This constraint is intentional." Act mode 解锁编辑/命令。**切换时完整会话历史保留**("The conversation history carries over when you switch modes")。可**按 mode 配不同模型**(Plan 用强推理、Act 用快模型)。([docs.cline.bot/core-workflows/plan-and-act](https://docs.cline.bot/core-workflows/plan-and-act))
- **Roo modes** = 同一思路泛化为具名 persona,每个 mode 门控**工具组** `read | edit | command | mcp`:Code(全组)、Ask(`read`,`mcp`)、Architect(read + edit 限定 markdown)、Debug(全功能、方法论式)、**Orchestrator(无直接工具访问 —— 只委派)**。可经下拉 / slash(`/code`,`/architect`)/ `Cmd+.` 切换;**Sticky Models** = 每个 mode 记住上次用的模型。([roocodeinc.github.io/Roo-Code/basic-usage/using-modes](https://roocodeinc.github.io/Roo-Code/basic-usage/using-modes))(Roo 已归档,此为历史设计)

### 多 agent / 子任务

- **Roo Boomerang / Orchestrator**(一手文档原文已核):parent 用 `new_task`(`mode` 参数选模式,`message` 参数传指令)派生子任务;"Each subtask operates in complete isolation with its own conversation history";上下文**向下经指令、向上只回摘要**(`attempt_completion` 的 `result`)。默认 "you must approve the creation and completion of each subtask"。Orchestrator 故意不具备读文件/执行能力以防"context contamination"。([roocodeinc.github.io/Roo-Code/features/boomerang-tasks](https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks))
- **Cline 两层**(SDK 原生,一手文档原文已核):
  - **Sub-agents**(`enableSpawnAgent: true`):"The parent agent spawns a child, **waits for its result**, and continues." 子 agent 自带模型/工具/prompt,上下文隔离;"No persistent state, no task board",更轻量。
  - **Teams**(`enableAgentTeams: true`):coordinator 拥有 `team_spawn_teammate` / `team_delegate_task` / `team_check_status` / `team_get_result` 四个工具;**持久共享状态**存于 `~/.cline/data/teams/[team-name]/`(`task-board.json` / `mailbox.json` / `mission-log.json`),支持**异步、跨会话/跨天**协作("Work spans multiple sessions or days")。指引明确:"For simpler cases, a single agent with good tools is usually more efficient than a team."
  - ([docs.cline.bot/sdk/guides/multi-agent-teams](https://docs.cline.bot/sdk/guides/multi-agent-teams))

---

## 记忆

- **无原生长期记忆。** Cline 自己的文档:"my memory resets completely between sessions." ([docs.cline.bot/best-practices/memory-bank](https://docs.cline.bot/best-practices/memory-bank))
- **Memory Bank** = 一种*约定*,非引擎状态:repo 内六个 markdown(`projectbrief.md` / `productContext.md` / `activeContext.md` / `systemPatterns.md` / `techContext.md` / `progress.md`),Cline 在任务开始读、在用户下 "update memory bank" 命令时重写。本质是"文档即记忆"的 hack,用来撑过 session reset。([memory-bank](https://docs.cline.bot/best-practices/memory-bank))
- **短期记忆** = 对话 transcript 本身,靠截断/压缩管理(见下)。

### 上下文窗口管理与截断(与本平台 jsonl 膨胀问题高度相关)

- **Cline 滑动窗口截断**(无需 LLM 调用,公式与数字已对一手 blog 核):自适应 buffer `maxAllowedSize = Math.max(contextWindow - 40_000, contextWindow * 0.8)`,文中给的分配:Claude 200k → `-40_000` ≈ 160k 可用;128k 模型 → `-30_000` ≈ 98k;DeepSeek 64k → `-27_000` ≈ 37k。溢出时**永远保留首条任务消息**(`const truncatedMessages = [messages[0]]`),**按对成块移除**中段消息(`Math.floor((messages.length - startOfRest) / 4) * 2`,保持 user/assistant 交替),标准约移 50%、切到更小窗模型时约移 75%。"Caches survive truncation operations"。([cline.bot blog: context-window-progress-bar](https://cline.bot/blog/understanding-the-new-context-window-progress-bar-in-cline)、[discussion #1608](https://github.com/cline/cline/discussions/1608))
- **Roo intelligent context condensing**(基于 LLM 的摘要,与上者互补):默认开启;按"context window 百分比"滑块触发自动压缩,或手动按钮;摘要保留要点;**用当前对话模型**(非另起一个)以免破坏 tool-call/结构化内容;首条消息的 slash 命令保留;原文可经 Checkpoints 回退恢复。([roocodeinc.github.io/Roo-Code/features/intelligent-context-condensing](https://roocodeinc.github.io/Roo-Code/features/intelligent-context-condensing))(Roo 已归档,历史设计)
- **UI**:Cline 提供上下文窗口**进度条**(↑input / ↓output vs 容量),让用户在失败前就"看见"压力。([context-window-progress-bar](https://cline.bot/blog/understanding-the-new-context-window-progress-bar-in-cline))

### Checkpoints(工作区快照)

- **均用 shadow Git repo**,与项目真实 Git 历史分离。Cline 在**每次工具使用后**提交文件状态;能捕获未跟踪文件。([docs.cline.bot/core-workflows/checkpoints](https://docs.cline.bot/core-workflows/checkpoints))
- **解耦的恢复维度**(精巧之处):Restore Files(只代码、留对话)/ Restore Task Only(删后续消息、留文件)/ Restore Files & Task(两者)。([checkpoints](https://docs.cline.bot/core-workflows/checkpoints))
- **注意**:大仓库下"checkpoints may use significant storage and slow down Cline"(每次工具用都提交)。([checkpoints](https://docs.cline.bot/core-workflows/checkpoints))

---

## 多用户与隔离

- **两者都不是多租户。** 都假设本地工作站上的单一可信用户:状态落在 `~/.cline/...` / repo 目录,**架构里没有 per-user 认证/隔离/沙箱**。多租户、配额、FS/进程隔离需自行补 —— 这正是本平台当前的缺口,而它们并不替你解决。([hub-spoke](https://docs.cline.bot/sdk/architecture/hub-spoke)、[memory-bank](https://docs.cline.bot/best-practices/memory-bank))
- 不过 hub-spoke 的会话/进程解耦,是把单机模型改造成多客户端/可恢复模型的最佳起点(见"值得借鉴")。

### Approval UX

- **循环内门控**:`Task.ask()` 挂起执行;每个有后果的动作(写文件 / 命令 / browser / MCP)弹确认 + diff 预览。([deepwiki](https://deepwiki.com/cline/cline))
- **分类粒度 auto-approve**:Read / Edit / Commands / Browser / MCP / Notifications,base-toggle + extension 语义("Read all files" 仅在 base Read 开时才扩展)。命令不是静态白名单 —— **由模型按 command+args 给每条命令打 `requires_approval` 标记**(`git status` 安全;`rm -rf`、`npm install`、`sed -i` 需 approve)。**YOLO mode** 自动批准一切(含 mode 切换),文档明确警告需隔离环境 + 版本控制。([docs.cline.bot/features/auto-approve](https://docs.cline.bot/features/auto-approve))

---

## 扩展性(工具 / MCP / rules)

- **MCP 是主要扩展面。Cline MCP Marketplace** 于 **2025-02-19** 公布:curated GitHub registry。**一键安装为 AI 驱动** —— "Cline reads the installation instructions, asks you for any necessary API keys, and configures everything automatically",其约定的安装说明文件标准在公告中写作 `llms-installation.md`(Cline 文档与生态中更常见的拼法是 `llms-install.md`,两者并存,以仓库实际文件为准 [UNVERIFIED 命名细节])。提交要求:GitHub repo URL + 400×400 PNG logo + 简短描述,经 mcp-marketplace 仓库 issue 提交。([cline.ghost.io: introducing-the-mcp-marketplace](https://cline.ghost.io/introducing-the-mcp-marketplace-clines-new-app-store/)、[docs.cline.bot/mcp/mcp-marketplace](https://docs.cline.bot/mcp/mcp-marketplace))
  - 注:docs 站当前页只剩 "Use Cline's MCP Marketplace for one-click install when available" 一句,AI 驱动安装的细节来自上述 2025-02-19 公告。
- **SDK 可插拔**:经 `createTool` 定义带 approval gate 的 typed 工具;`HookEngine` + `HookStage` / `HookPolicies` 让扩展在生命周期点介入;provider/model 经 `registerProvider` / `registerModel` 运行时注册。([overview](https://docs.cline.bot/sdk/architecture/overview))
- **Rules**:`.clinerules/`(目录内所有 `.md`/`.txt` 合进 system prompt),workspace vs global,冲突时 workspace 胜;也认 `.cursorrules` / `.windsurfrules` / `AGENTS.md`。有可开关的 "Rules bank" UI,可启停单个 rule 文件而不删除。([docs.cline.bot/customization/cline-rules](https://docs.cline.bot/customization/cline-rules))
- **Roo 等价物**:custom modes,经 global `custom_modes.yaml` 或项目 `.roomodes`,每个含 `roleDefinition`(前置进 system prompt)、`groups`(工具访问)、`fileRegex`(限定该 mode 可编辑哪些文件)。([roocodeinc.github.io/Roo-Code/features/custom-modes](https://roocodeinc.github.io/Roo-Code/features/custom-modes))(Roo 已归档,历史设计)

---

## 调度与异步

- **Cline CLI 调度**(仅 SDK/CLI/Kanban,一手文档原文已核):标准 cron 表达式;"Scheduling requires the hub. It starts automatically when you create a schedule.";"Scheduled agents persist across process restarts and run independently of any terminal session."；`cline schedule` 交互菜单含 "Execution history"(past runs:status / duration / tokens / cost)与 "Statistics"(success rate / average duration / last failure)。([docs.cline.bot/cli/scheduling](https://docs.cline.bot/cli/scheduling))
- **Kanban 并行**:"Each card gets its own worktree, auto-commit, and dependency chains";CLI `--team-name` 用于委派式多 agent。([github.com/cline/cline](https://github.com/cline/cline))
- **Roo:未在一手文档发现原生调度器** [UNVERIFIED]。

---

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **Hub-spoke 解耦 = 单项最大收益。** 把现有 HTTP+WS daemon 拆成协调 hub(会话路由、事件 fan-out、持久化)+ 短生命周期 spoke worker(跑 agent loop)。会话从此**能在 WS 断开和 worker 崩溃后存活**,多浏览器 tab/设备可 attach 同一会话 —— 直接修掉"连接断了会话就死"。([hub-spoke](https://docs.cline.bot/sdk/architecture/hub-spoke))
2. **在每会话快照上加 SQLite 索引**,替代裸 jsonl 扫描:保留现有落盘模型,但让列表/搜索/元数据变廉价;快照目录按 per-user 命名空间即得到真隔离。([hub-spoke](https://docs.cline.bot/sdk/architecture/hub-spoke))
3. **两层上下文管理**:廉价确定性滑动窗口截断(保首条任务消息、按对丢中段、按模型留 buffer)**叠加**可选的 LLM %-阈值压缩,配**可见的上下文进度条**。在不丢任务锚点的前提下解决 jsonl 无界增长。([cline blog](https://cline.bot/blog/understanding-the-new-context-window-progress-bar-in-cline)、[roo condensing](https://roocodeinc.github.io/Roo-Code/features/intelligent-context-condensing))
4. **解耦的 checkpoint 恢复维度**(只文件 / 只任务 / 两者)+ shadow VCS:学术场景可对*产出物*(草稿、生成的 LaTeX/notebook)按工具用快照,让用户回退一次坏编辑而不丢对话。([cline checkpoints](https://docs.cline.bot/core-workflows/checkpoints))
5. **Plan/Act + per-mode 模型 + 只读 Plan** 干净映射到学术流(Plan = 文献/策略用强推理;Act = 起草/编辑用便宜模型),只读约束是天然安全边界。([plan-and-act](https://docs.cline.bot/core-workflows/plan-and-act))
6. **Roo Boomerang 隔离模式**(子任务 = 全新上下文,只回摘要)是多步研究避免上下文膨胀的最干净答案 —— 如"检索论文"子任务只回 digest 给 orchestrator。([boomerang](https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks))
7. **mode = role + 工具组门控 + fileRegex** 是轻量、可按租户配置的权限模型,可存服务端并注入 system prompt —— 优于当前全局工具暴露。([custom-modes](https://roocodeinc.github.io/Roo-Code/features/custom-modes))
8. **模型自标命令风险**(`requires_approval`)做分级 auto-approve —— 让学者对安全操作有自主权、对破坏性操作仍门控,且无需维护脆弱白名单。([auto-approve](https://docs.cline.bot/features/auto-approve))
9. **AI 驱动的 MCP 安装(读 `llms-install.md`)** = 通向 per-tenant 工具市场的路径:接一个数据源(如某期刊 API)= 一键 + 填 key,而非 ops 工作。([mcp-marketplace 公告](https://cline.ghost.io/introducing-the-mcp-marketplace-clines-new-app-store/))
10. **hub 驱动、与会话解耦的 cron 调度**:无需用户开终端/浏览器即可跑"后台学术 agent"(每周文献摘要、引文核查)。([cli/scheduling](https://docs.cline.bot/cli/scheduling))
11. **Memory Bank 模式,服务端化**:per-user/per-project 持久化一份结构化记忆文档并在任务开始自动注入 —— 不上向量库也能有廉价长期记忆。([memory-bank](https://docs.cline.bot/best-practices/memory-bank))

---

## 局限

- **都不是多租户。** 单可信用户假设,无 per-user 认证/隔离/沙箱,需自行补租户、配额、FS/进程隔离(正是本平台缺口,它们不替你解)。([hub-spoke](https://docs.cline.bot/sdk/architecture/hub-spoke)、[memory-bank](https://docs.cline.bot/best-practices/memory-bank))
- **无真正长期记忆** —— Memory Bank 是依赖用户主动调 "update memory bank" 的 markdown 约定。([memory-bank](https://docs.cline.bot/best-practices/memory-bank))
- **Checkpoints 在大工作区扩展性差**(每次工具用都提交 → 存储 + 延迟)。([checkpoints](https://docs.cline.bot/core-workflows/checkpoints))
- **滑动窗口截断是"盲"的** —— 从中段丢 tool-use/代码块/文件操作,可能丢掉重要上下文;社区仍在迭代优先级感知截断。([discussion #1608](https://github.com/cline/cline/discussions/1608))
- **YOLO/全自动 approve 真危险**(能删文件、提交、装包)—— 只在沙箱/隔离 runner 里可行,Web 平台必须提供。([auto-approve](https://docs.cline.bot/features/auto-approve))
- **压缩/截断正确性依赖同一模型处理 tool-call 结构** —— 混入便宜的 condenser 模型会破坏 tool calls,故 Roo 强制用当前模型。想要便宜摘要器须据此规划。([condensing](https://roocodeinc.github.io/Roo-Code/features/intelligent-context-condensing))
- **Cline SDK 全新(2026-05)、IDE 迁移仍在进行** —— API 可能仍在变,包边界视为示意而非稳定。([marktechpost](https://www.marktechpost.com/2026/05/14/cline-releases-cline-sdk-an-open-source-agent-runtime-now-powering-its-cli-and-kanban-with-ide-extensions-being-migrated/))
- **Roo Code 已于 2026-05-15 关停并归档**(官方仓库 `archived: true`,README 推荐改用 ZooCode / Cline)。其设计仍有借鉴价值,但**不应作为长期标准化基座**;如需活跃且面向 Web 的基座,选 Cline SDK。([github.com/RooCodeInc/Roo-Code](https://github.com/RooCodeInc/Roo-Code))

---

## Sources

- https://github.com/cline/cline
- https://cline.bot/blog/introducing-cline-sdk-the-upgraded-agent-runtime
- https://cline.ghost.io/introducing-cline-sdk-the-upgraded-agent-runtime/
- https://www.marktechpost.com/2026/05/14/cline-releases-cline-sdk-an-open-source-agent-runtime-now-powering-its-cli-and-kanban-with-ide-extensions-being-migrated/
- https://docs.cline.bot/sdk/overview
- https://docs.cline.bot/sdk/architecture/overview
- https://docs.cline.bot/sdk/architecture/hub-spoke
- https://docs.cline.bot/sdk/guides/multi-agent-teams
- https://docs.cline.bot/core-workflows/plan-and-act
- https://docs.cline.bot/core-workflows/checkpoints
- https://docs.cline.bot/best-practices/memory-bank
- https://docs.cline.bot/features/auto-approve
- https://docs.cline.bot/customization/cline-rules
- https://docs.cline.bot/mcp/mcp-marketplace
- https://cline.ghost.io/introducing-the-mcp-marketplace-clines-new-app-store/
- https://docs.cline.bot/cli/scheduling
- https://cline.bot/blog/understanding-the-new-context-window-progress-bar-in-cline
- https://github.com/cline/cline/discussions/1608
- https://deepwiki.com/cline/cline
- https://github.com/RooCodeInc/Roo-Code
- https://roocodeinc.github.io/Roo-Code/basic-usage/using-modes
- https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks
- https://roocodeinc.github.io/Roo-Code/features/intelligent-context-condensing
- https://roocodeinc.github.io/Roo-Code/features/custom-modes
- https://roocodeinc.github.io/Roo-Code/features/checkpoints
