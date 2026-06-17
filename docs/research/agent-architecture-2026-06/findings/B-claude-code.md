# Claude Code (reference baseline)
> kind: project · confidence: high · last-checked: 2026-06

## 概述

Claude Code 是 Anthropic 官方的 agentic coding 工具,跨 terminal / IDE / desktop / web /
mobile 多 surface 共用同一个引擎:"your CLAUDE.md files, settings, and MCP servers work
across all of them"。对于我们(多用户 Web 学术 agent 平台)来说,它有两个互补维度值得拆开看:

- **本地 CLI 引擎**:session = 一次性 context window,持久化全靠磁盘文件(CLAUDE.md + auto
  memory + jsonl transcript),编排靠 subagents / forks / agent teams 三档。
- **Claude Code on the web / Routines**(research preview):每个 session 跑在 Anthropic 托管
  的一次性 VM 里,带 scoped-credential proxy + 默认拒绝出网的网络分级 + 定时/API/GitHub 触发。
  这一层正是我们"无真隔离、无定时任务、egress SSRF 风险"几个缺口的最直接对标样板。

核心工程理念(来自 building-effective-agents / effective-context-engineering 两篇官方博客):
agent = "augmented LLM + 每步从环境拿 ground truth(tool 结果)+ 明确的 stopping
conditions";context 是有限资源("context rot"),目标是"find the smallest set of
high-signal tokens that maximize the likelihood of your desired outcome";原则是
simplicity / transparency / 把工具接口(ACI)当 HCI 一样投入设计;"start with the
simplest solution... only increase complexity when needed",别上重框架抽象。

## 关键架构决策(session / state / loop / transport)

- **每个 session 从空白 context 开始,持久化落在文件而非内存。** "Each Claude Code session
  begins with a fresh context window." 两条跨会话载体:CLAUDE.md(你写)+ auto memory(Claude
  自己写)。
- **Transcript 是磁盘 jsonl(和我们现有架构同构)。** subagent transcript 在
  `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`;清理由
  `cleanupPeriodDays` 控制(默认 30 天)。
- **长任务的 context 工程三件套(官方明确推荐):**
  1. **compaction**:服务端在接近上限时自动摘要,保留决策/未决 bug,丢弃冗余 tool 输出;
  2. **structured note-taking / memory**:把进度写进文件,跨 compaction 边界存活;
  3. **sub-agent isolation + just-in-time retrieval**:按需加载轻量标识符,而非一次性预载全部。
- **context editing**:客户端自动清理过期 tool 结果(与服务端 compaction 互补)。

## 编排与子 agent

三档,隔离度与成本递增:

1. **Subagents(Agent 工具,旧名 Task,v2.1.63 起改名,`Task(...)` 仍作别名)** —— "Each
   subagent runs in its own context window with a custom system prompt, specific tool
   access, and independent permissions",只把 summary 回传主会话。定义为 markdown + YAML
   frontmatter,作用域优先级:managed settings > `--agents` CLI flag > `.claude/agents/`
   (project)> `~/.claude/agents/`(user)> plugin。
   - **frontmatter 字段(确认全集)**:`name, description, tools, disallowedTools, model
     (sonnet/opus/haiku/fable/full-id/inherit), permissionMode, maxTurns, skills,
     mcpServers, hooks, memory(user/project/local), background, effort, isolation:
     worktree, color, initialPrompt`。
   - **内建 subagent**:**Explore**(Haiku、只读、跳过 CLAUDE.md 和 git status 求快省钱)、
     **Plan**(plan mode 下的只读研究,model inherit)、**general-purpose**(全工具)。另有
     statusline-setup / claude-code-guide 等辅助 agent。
   - **subagent 默认从空白起步**:不看会话历史、不看已加载的 skill、不看已读的文件;Claude 写
     一条 delegation 消息交接。可被 resume(保留完整历史);Explore/Plan 是一次性、不返回
     agentId、不可 resume。
   - **嵌套 subagent**(v2.1.172 起):subagent 可再 spawn subagent。**前台**链可任意深(自限,
     父等子);**后台** subagent "at depth five does not receive the Agent tool and cannot
     spawn further. The limit is fixed and not configurable",防 runaway 并发树。

2. **Forks(`/fork`,v2.1.117+;v2.1.161 起默认开启,作为模型默认 spawn 行为仍是 experimental)**
   —— fork 是一个**继承整段会话**的 subagent(放弃了 input isolation),"sees the same system
   prompt, tools, model, and message history as the main session";它的 tool 调用仍留在自己
   context 里、只回传最终结果。关键点:**fork 第一条请求复用父会话的 prompt cache** —— "its
   first request reuses the parent's prompt cache... makes forking cheaper than spawning a
   fresh subagent"。fork 不能再 spawn fork;可带 `isolation: worktree`。

3. **Agent teams(experimental,`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`,需 v2.1.32+)** ——
   多个**完整 Claude 实例**,各自独立 context,通过 **Mailbox**(`SendMessage`)直接互发消息 +
   **共享 task list**(pending/in-progress/completed + 依赖自动解锁);**task 认领用 file
   locking 防竞态**。一个 lead + 多 teammate;teammate 可引用 subagent 定义作为角色(但其
   `skills`/`mcpServers` frontmatter 在 teammate 路径上不生效)。
   - **甜区 3–5 teammate,每人 5–6 task**;"Token usage scales with the number of active
     teammates",线性增长,过 ~5 后边际递减。
   - **存储**:team config `~/.claude/teams/{team-name}/config.json`、task list
     `~/.claude/tasks/{team-name}/`。**注意:这两个目录只在 team 活着时存在,cleanup 或
     session 结束即删**(并非长期持久状态)。
   - **局限**:in-process teammate 不支持 `/resume`/`/rewind`;task 状态会滞后;一次只能一个
     team;不能嵌套 team;lead 固定不可转移;权限在 spawn 时统一继承 lead。

**对应的经典 workflow patterns**:routing、parallelization(sectioning/voting)、
orchestrator-workers(= subagents)、evaluator-optimizer。

## 记忆

三套互补栈:

**(A) CLAUDE.md 层级**(你写的指令;每次 session 全量加载,作为 system prompt 之后的一条 *user
message*,不是强制 config)。加载顺序 broad→specific 且拼接(不互相覆盖):managed policy
(不可排除)> user `~/.claude/CLAUDE.md` > project `./CLAUDE.md` 或 `./.claude/CLAUDE.md` >
local `./CLAUDE.local.md`(gitignored)。外加 `@path` imports、`.claude/rules/*.md`(可用
`paths:` glob 按命中文件路径作用域加载)。`/compact` 后从磁盘重读。

**(B) Auto memory**(Claude 自己写,**机器本地、per-repo**):`~/.claude/projects/<project>/
memory/`,含 `MEMORY.md` 索引(每 session 加载前 200 行 / 25KB)+ 按需读取的主题文件。
显式提示:auto memory "not shared across machines or cloud environments" —— **不天然解决
多服务器/多用户共享**(要共享得自己集中化)。subagent 也可经 `memory: user|project|local`
拿到自己的持久 memory 目录(如 `~/.claude/agent-memory/<name>/`),系统 prompt 自动注入其
`MEMORY.md` 前 200 行 + 读写工具。

**(C) memory tool(API 原语 —— 对我们最相关)** —— **客户端、文件式**,`/memories` 目录,
tool type `memory_20250818`(context-management beta)。你自己实现的命令:`view, create,
str_replace, insert, delete, rename`。"Claude automatically checks its memory directory
before starting tasks." **存储后端(文件/DB/云/加密)完全由你控制 —— 即 per-user 隔离是你的
责任**。SDK 提供 helper(Python `BetaAbstractMemoryTool`、TS `betaMemoryTool` 等)。
- 与 **context editing**(客户端清过期 tool 结果)+ **compaction**(服务端摘要)配套。
- **官方 benchmark(已二次核实)**:memory + context-editing 较 baseline **+39%**;
  context-editing 单独 **+29%** 且在一个 100-turn web-search 评测上 **−84% tokens**(并使
  原本会因 context 耗尽而失败的工作流得以完成)。
- **多 session 模式**:initializer session 先建 progress log + feature checklist;每个
  session 先读后写;系统 prompt 内置 "ASSUME INTERRUPTION: Your context window might be
  reset at any moment"。
- **安全 MUST(实现方责任,官方原文)**:校验每个路径落在 `/memories` 下(防 `../`、`..\\`、
  URL-encoded `%2e%2e%2f`,用 `pathlib.Path.resolve()`+`relative_to()` 之类);限文件大小 /
  分页;过期清理;防 memory poisoning;敏感信息可二次 strip。

## 多用户与隔离

**Claude Code on the web / Routines = 值得照抄的 per-user 隔离模型:**
- **每 session 一个全新 Anthropic 托管 VM**(repo 克隆进去),"Each session runs in a fresh
  Anthropic-managed VM"。
- **网络分级**(per-environment):**None / Trusted(默认,allowlist)/ Full / Custom**;
  默认 Trusted 放行包仓库/GitHub/云 SDK 等 default-allowed 域,其它域请求返回
  `403` + `x-deny-reason: host_not_allowed`。
- **credential 保护(原文)**:"sensitive credentials such as git credentials or signing
  keys are never inside the sandbox with Claude Code. Authentication is handled through a
  secure proxy using scoped credentials." GitHub 操作走专用 proxy,沙箱内只持 scoped
  credential,"your token never enters the container",proxy 还把 push 限制在当前分支。
- **资源上限(近似,会变)**:~4 vCPU / 16 GB RAM / 30 GB 磁盘。
- **重要安全告警(原文)**:"When running with network access disabled, Claude Code can
  still communicate with the Anthropic API, which may allow data to exit the VM." —— 即
  network=None 也不是绝对气密。

**本地 CLI 的会话内安全旋钮 —— permission modes**(从松到紧/分级):`default`(基本只读+提示)
/ `acceptEdits`(工作目录内编辑+安全 FS 命令)/ `plan`(只读研究)/ `auto`(由一个独立
classifier 模型审查命令与受保护目录写入)/ `dontAsk`(只允许已显式放行的)/
`bypassPermissions`(跳过所有提示,仅限隔离容器/VM)。受保护路径(`.git`/`.claude`/shell
rc/`.mcp.json` 等)非 bypass 不自动放行。
- 子 agent 可加 `isolation: worktree` 拿一份隔离的 git worktree。
- **[UNVERIFIED]** auto mode "连续 3 次 / 累计 20 次被 block 后回落到提示" 的具体阈值数字本轮
  未二次核实(permission-modes 页未重新抓取);classifier + auto mode 的存在与定位已确认。

**GitHub 访问粒度偏粗(原文要点)**:"a cloud session can access any repository the
connecting GitHub account can see, not just the repositories the Claude GitHub App is
installed on. App installation... is not a session-level access control." 且**目前无专用
secrets store**,env vars/setup script 对"能编辑该 environment 的人"可见。

## 扩展性

- **Skills** = `SKILL.md`(Agent Skills 开放标准),核心是 **progressive disclosure**:listing
  里只放 description + when_to_use,正文按需加载,bundled 文件(reference.md/scripts)再按需
  加载。位置 `.claude/skills/<name>/`、`~/.claude/skills/`、plugin、enterprise。支持动态
  context 注入(运行 shell 片段嵌入)、`$ARGUMENTS`/`${CLAUDE_SESSION_ID}`/
  `${CLAUDE_SKILL_DIR}` 替换;`disable-model-invocation` 控制谁能触发;**skill 在主会话内联
  运行**(vs subagent = 隔离 context)。
  - **[UNVERIFIED]** description 字段 1,536 字符上限的精确数字本轮未二次核实(skills 页未重新
    抓取);progressive-disclosure 机制与 SKILL.md 格式本身已确认。
- **Hooks** = 确定性强制层。CLAUDE.md/skills 是 context **不是 enforcement**;"To block an
  action regardless of what Claude decides, use a PreToolUse hook"。事件含 `SessionStart/
  End, UserPromptSubmit, PreToolUse, PermissionRequest, PostToolUse, Stop,
  SubagentStart/Stop, PreCompact/PostCompact, TaskCreated/Completed, TeammateIdle`。
  handler 类型:command(stdin JSON,exit 2 = block)/ http(POST 到 URL)/ mcp_tool /
  prompt(LLM 判定)/ agent。plugin hook 出于安全不能用 `hooks/mcpServers/permissionMode`。
  → **HTTP hook 类型很契合我们的 Go 后端**。
- **MCP** 可 per-subagent scope(inline server 在 spawn 时连、finish 时断,把工具描述挡在主
  context 外)。**Plugins** 打包 agents+hooks+MCP+skills+output-styles。**Output styles** 直接
  改 system prompt(内建 Default/Proactive/Explanatory/Learning)。

## 调度与异步

- **Routines(research preview)** = 跑在 Anthropic 云基建上的定时 agent("keep working when
  your laptop is closed")。三类触发可组合:
  - **Schedule**:cron,**最小间隔 1 小时**(更短被拒);本地时区→UTC;一次性运行触发后自动
    禁用(标 "Ran"),且一次性运行**不计入每日 routine 配额**。
  - **API**:per-routine `/fire` 端点,POST + bearer token(`Generate token` 只显示一次),
    可带 freeform `text` payload(**不解析,JSON 会被当字面字符串**),返回新 session URL。
    实际端点形如 `POST https://api.anthropic.com/v1/claude_code/routines/{trig_id}/fire`,
    走 beta header `experimental-cc-routine-2026-04-01`。
  - **GitHub**:Pull request / Release 事件 + 字段过滤(author/title/labels/base/head/
    is_draft/is_merged 等,支持 equals/contains/regex)。
  - 默认只往 `claude/` 前缀分支推;每账号有每日 run 上限;经 `/schedule`(CLI)、web、Desktop
    创建。
  - **告警**:run 列表里绿色 status ≠ 任务成功 —— "It does not mean the task in your prompt
    succeeded. Open the run to read the transcript."
- **Background subagents** 并发跑,"auto-deny any tool call that would otherwise prompt"。
  `/loop` 在 session 内按间隔重复一个 prompt;Desktop scheduled tasks 在本机跑。

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **把 memory tool 原语当长期记忆地基** —— 它本就是 client-side,正好让我们用自己的 DB/MinIO
   实现 **per-user `/memories` 命名空间 + 路径穿越校验**,直接补"无真隔离 + 无长期记忆"两个洞。
   长研究 session 配 context editing + compaction(有 −84% token 的实测背书)。
2. **per-session VM + scoped-credential proxy 模型**,而不是共享文件系统:credential 不进沙箱、
   默认拒绝出网 allowlist —— 正对我们 CLAUDE.md 标记的 egress SSRF 高危。
3. **冗长学术工作丢进 subagent 隔离**:文献检索 / PDF 解析 / 大日志步骤在隔离 subagent 里跑,
   只回 ~1–2K token summary,主 agent 专注综合。
4. **SKILL.md progressive disclosure** 直接套到现有 skill(latex-format / academic-writing /
   discipline-conventions):listing 只放短描述,正文按需加载,加大量学科 skill 几乎零成本。
5. **CLAUDE.md 分层 → "机构 context"分层**:managed(平台引用/合规规则)> user(研究者偏好)>
   project(单篇论文);用 `.claude/rules/` 的 `paths:` 作用域让学科规则只在相关时加载。
6. **Hooks 作为强制层**:我们的配额 / 权限审批逻辑应是 PreToolUse / PermissionRequest hook
   (确定性),因为 prompt 级规则只是建议性的。HTTP hook 类型契合 Go 后端。
7. **Routines 架构 = 我们缺的定时任务**:per-user 保存的 config(prompt+语料+connector)+
   cron(最小 1h)+ API `/fire` webhook + 事件触发,跑在托管基建;"一次性 job → 返回 session
   URL" 模式特别适合"稍后回来看"的异步学术作业。
8. **多 session "initializer + progress log" 模式**("ASSUME INTERRUPTION")用于跨天可恢复的
   长论文/综述任务。
9. **auto mode 的 classifier + 会话级 boundary** 作为"既降审批摩擦又保安全"的参考。
10. **Output styles** 给非编码学术人格(审稿人/导师/写作助手)换皮,无需 fork subagent。

## 局限

- **CLAUDE.md / auto-memory / skills 是 context 不是 enforcement** —— "no guarantee of
  strict compliance";只有 **hooks** 和 **permission deny 规则**是硬闸。
- **memory tool 把安全全压给实现方**:路径穿越、memory poisoning、文件无界增长、敏感数据外泄
  全是你自己负责。
- **GitHub 授权粗粒度**:cloud session 能访问连接账号可见的任意 repo;App 安装不是 session 级
  访问控制;**目前无专用 secrets store**,env var 对能编辑 environment 的人可见。
- **network=None 仍可达 Anthropic API** —— "may allow data to exit the VM",非绝对气密。
- **多 agent 成本与协调**:subagent 返回详细结果会"consume significant context";agent teams
  token 线性增长、~5 后边际递减、且 experimental(in-process teammate 不可 `/resume`、task
  状态滞后、一次一个 team、不可嵌套)。
- **bypassPermissions 零 prompt-injection 防护** —— 仅限隔离容器。
- **Routines 绿色 status ≠ 任务成功**;cron 最小间隔 1 小时;`/fire` 的 `text` 是未解析字面串。
- **auto memory 机器本地**,不跨机器/云共享 —— 多服务器/多用户共享要自己集中化。
- **agent teams 的 team/task 目录是临时的**(cleanup/session 结束即删),不是可依赖的持久状态。
- **[UNVERIFIED]** 跨 surface "同一引擎"的内部 transport / 协议规格:文档有"same engine"措辞,
  但本轮未找到协议层 spec。
- **[UNVERIFIED]** auto mode 的 3 连续 / 20 累计 block 回落阈值、skill description 1,536 字符
  上限:两个精确数字本轮未二次核实(对应文档页未重抓),机制本身已确认。

## Sources

- https://code.claude.com/docs/en/overview
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/routines
- https://code.claude.com/docs/en/claude-code-on-the-web
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/output-styles
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- https://www.anthropic.com/news/context-management
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/engineering/building-effective-agents
