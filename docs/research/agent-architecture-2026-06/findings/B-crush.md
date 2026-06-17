# Crush (charmbracelet/crush)
> kind: project · confidence: high · last-checked: 2026-06

## 概述

Crush 是 Charm 出品的**终端原生(TUI)AI 编码 agent**,用 Go 写成(仓库约 98% Go),构建在 Charm 生态(Bubble Tea v2,即 `charm.land/bubbletea/v2`)之上。单二进制、local-first;支持多 provider LLM、**会话中途切换模型**、LSP 上下文、MCP server、以及开放的 Agent Skills 标准。

对我们最有参考价值的是:它已经从纯 TUI 演进出一个 **headless HTTP 守护进程 `crush serve`**(HTTP + SSE API),允许多个客户端连到同一个后端——这正好对标我们"多用户 Web agent 平台"的形态,但它的隔离单位是**文件系统路径(`--cwd`)而非用户身份**,这是直接可借鉴 + 需要规避的关键点。

来源:[crush repo](https://github.com/charmbracelet/crush) · [README](https://raw.githubusercontent.com/charmbracelet/crush/main/README.md) · [DeepWiki overview](https://deepwiki.com/charmbracelet/crush)

## 关键架构决策

**分层设计。** `internal/config/`(分层配置 + 持久化)→ `app.App` 编排层(持有 service 单例:`session.Service`、`lsp.Manager`、shell 等)→ agent 层(`agent.Coordinator` + per-session `SessionAgent`)→ TUI 层(Bubble Tea v2)。一个 `internal/pubsub` 发布订阅系统解耦 agent↔UI↔services,消息在 `App.events` channel 上广播。(DeepWiki;pub/sub 细节为 DeepWiki 二手描述)

**Coordinator + SessionAgent 拆分(核心设计思想,已核实字段名)。**
- `agent.Coordinator`(`internal/agent/coordinator.go`,文件已确认存在):负责 **provider 构造、工具装配、模型解析(model resolution)**,管理多个 `SessionAgent` 的生命周期、prompt 排队与取消。持有配置、sessions/messages/permissions/history 服务、`skillTracker` 等。`NewCoordinator` 发现 skills、构建 system prompt、解析模型、创建初始 SessionAgent。
- `SessionAgent`:**单个活动 session 内**的实际 LLM 流式循环、排队、取消、自动摘要的所有者。已核实的 per-session 字段:
  - `largeModel` / `smallModel`,类型 `*csync.Value[Model]`(原子热替换)
  - `messageQueue` 类型 `*csync.Map[string, []SessionAgentCall]`(per-session 排队的调用)
  - `activeRequests` 类型 `*csync.Map[string, context.CancelFunc]`(per-session 取消句柄)
  - `Model` 结构体打包了运行期 provider handle(`fantasy.LanguageModel`)+ 来自 catwalk 的模型元数据(context window、能力)+ 用户配置(`config.SelectedModel`)
- **并发模型**:`SessionAgent.Run` 持久化消息→准备 prompt→流式→执行工具→把工具结果回喂,直到拿到最终回复。若某 session 正忙,新调用被追加到 `messageQueue[sessionID]`,在当前回合结束后**递归处理**(per-session 串行回合 + 队列)。

**LLM 抽象 = `charm.land/fantasy`(独立 Charm 库)。** 官方 tagline:**"Build AI agents with Go. Multi-provider, multi-model, one API."** SessionAgent 用 `fantasy.NewAgent`(+ `WithSystemPrompt`、`WithTools`);工具实现 `fantasy.AgentTool` 接口(`NewAgentTool` 定义);`Generate()` 接受 `AgentCall`。注:fantasy 自述为 WIP,目前不支持 image/audio/PDF 模型。

**持久化 = SQLite + sqlc(不是 jsonl,也不是运行期 ORM)——已用仓库目录核实。** `internal/db/` 实际包含:`migrations/`、`sql/` 子目录,以及 sqlc 生成的 `models.go`、`querier.go`,和 `sessions.sql.go` / `messages.sql.go` / `files.sql.go` / `read_files.sql.go` / `stats.sql.go`。驱动为 CGO-free 的 `modernc.org/sqlite`(`connect_modernc.go`),另有 `ncruces` 变体(`connect_ncruces.go`);`datadirlock.go` 对本地数据目录做并发控制。完整会话历史、文件引用、工具调用都经 service 抽象落 SQLite。
> 纠错:部分二手文章声称会话以 JSON 文件存于 `~/.config/crush/sessions/`——**这是错误的**。仓库 `internal/db`(sqlc + SQLite 驱动 + `sessions.sql.go`)是权威信号。确实存在 JSON 的是**临时/配置状态**(如 `$HOME/.local/share/crush/crush.json`),那是 config,不是会话历史。

来源:[DeepWiki agent system](https://deepwiki.com/charmbracelet/crush/4-ai-and-llm-integration) · [internal/db tree](https://github.com/charmbracelet/crush/tree/main/internal/db) · [internal/agent tree](https://github.com/charmbracelet/crush/tree/main/internal/agent) · [fantasy](https://github.com/charmbracelet/fantasy)

## 编排与子 agent

真实存在,但是**浅层编排**(`internal/agent/` 下确认有 `agent_tool.go`、`agentic_fetch_tool.go`、`hooked_tool.go`、`loop_detection.go`)。

- **`agent` 工具**:主"Coder" agent 委派给子 `SessionAgent` 处理聚焦的子任务,经 coordinator 的 `runSubAgent` 编排逻辑管理 session 生命周期。
- **`agentic_fetch` 工具**:专用子 agent,用于联网搜索 / 深度内容分析,配发**受限只读工具集**:`NewWebFetchTool`、`NewWebSearchTool`、`NewGrepTool`、`NewGlobTool`、`NewSourcegraphTool`、`NewViewTool`;在一个**临时目录**工作,**返回后清理**。
- **上下文隔离**:子 agent **不**继承父消息历史——"a new session is created to maintain isolation"。子 session ID 用确定性派生 `CreateAgentToolSessionID`(由父 message ID + tool-call ID 派生,保证幂等/重试一致);`CreateTaskSession` 会填 `ParentSessionID` 维持层级。
- **成本上卷**:完成时 `childSession.Cost` 累加到 `parentSession.Cost`。
- **递归限制(意图已确认,具体数字 [UNVERIFIED])**:文档表述"Task agents are intentionally limited to prevent nested sub-agents... only the Coder agent has the capability to spawn sub-agents to prevent unbounded recursion"——即**有意限制递归**是确认的;但"最大深度恰为 2 / Task agent 无法访问 agent 工具"的精确说法,DeepWiki 委派页明确表示"未覆盖此细节",故标 **[UNVERIFIED]**。
- 相关动向:开放 issue #2501 提议让 agent 工具能 per-call 选择子 agent 的模型档位——说明当前子 agent 档位是固定的、尚不能逐次指定。

来源:[DeepWiki agent delegation](https://deepwiki.com/charmbracelet/crush/6.7-agent-delegation-and-nested-tools) · [internal/agent tree](https://github.com/charmbracelet/crush/tree/main/internal/agent) · [issue #2501](https://github.com/charmbracelet/crush/issues/2501)

## 记忆

- **短期**:完整对话/上下文落 SQLite;**自动摘要**在剩余 token 低于阈值(或检测到重复工具调用疑似 loop)时压缩历史。已核实的常量:`largeContextWindowThreshold` = 200_000、`largeContextWindowBuffer` = 20_000、`smallContextWindowRatio` = 0.2。摘要由 `smallModel` 承担。`loop_detection.go` 在检测到重复工具调用时也会触发摘要。
- **长期**:仅**静态上下文文件**(无学习型/向量记忆)。全局 `~/.config/crush/CRUSH.md`(Crush 专属规则)+ `~/.config/AGENTS.md`(跨工具通用 agent 规则),外加项目级同名文件;初始化时按 `initialize_as`(默认 `AGENTS.md`)生成项目上下文文件,记录它发现的 build 命令/代码模式/约定。
- **无**跨会话学习记忆 / 对历史的 RAG。这是 Crush 的空白,不是可抄的东西。

来源:[DeepWiki agent system](https://deepwiki.com/charmbracelet/crush/4-ai-and-llm-integration) · [README](https://raw.githubusercontent.com/charmbracelet/crush/main/README.md)

## 多用户与隔离

- **没有真正的多用户隔离或沙箱(已确认)。** Workspace 以**文件系统路径(`--cwd`)**为键,而非用户身份。已核实 README 原文:相同 `--cwd` 的两个客户端"join the same underlying workspace, so they **share the session list, message history, permission queue, LSP, and MCP state**"——即同路径客户端**有意共享一切**。
- 进程级旗标(`--yolo`、`--debug`)遵循**首个客户端 first-wins**:后到的客户端无法覆盖。
- 安全机制仅靠**权限闸门**(工具调用前询问、`permissions.Request()`、`allowed_tools` 预批、`--yolo` 全绕过)+ `.gitignore` / `.crushignore` 文件过滤——**不是** OS 级沙箱。
- 子 agent 隔离是**逻辑隔离**(独立 session + 受限工具集 + 临时目录),不是安全边界。

来源:[README](https://raw.githubusercontent.com/charmbracelet/crush/main/README.md) · [DeepWiki tool system](https://deepwiki.com/charmbracelet/crush/6-tool-system)

## 扩展性

- **内建工具**:`view`、`ls`、`grep`、`glob`、`edit`、`bash`、`sourcegraph`、web fetch/search 等。`bash` 带**后台任务管理**(后台启动 + 读后台输出 + kill 后台任务;此为 DeepWiki 二手描述,README 仅提及"background jobs"未展开)。可经 `options.disabled_tools` 关闭。
- **MCP**(Crush 是 MCP **客户端**):支持 `stdio` / `http` / `sse` 三种 transport;配置项支持 shell 风格变量展开(`$VAR`、`${VAR:-default}`、`$(cmd)`、必填用 `${VAR:?msg}`),展开为空的 header 会被丢弃不发送。per-server 工具 allowlist(server→许可工具名)。
- **Skills**(开放的 "Agent Skills" `SKILL.md` 标准):从多路径发现——`$CRUSH_SKILLS_DIR`、`~/.config/agents/skills/`、`~/.config/crush/skills/`,以及项目级 `.agents/skills`、`.crush/skills`、`.claude/skills`、`.cursor/skills`(刻意兼容 Claude/Cursor)。frontmatter 标志:`user-invocable: true`(进命令面板,带 `user:`/`project:` 前缀)、`disable-model-invocation: true`(禁自动触发但保留手动)。由 `skills.Tracker` 跟踪。
- **Hooks**:pre-tool hook 可自动批准并短路权限提示(对应 `hooked_tool.go`)。
- **Provider 目录 = Catwalk**(Charm 的开源 provider/model **目录**,自述 "A database for Crush-compatible models" / "A collection of LLM inference providers and models",社区可贡献)。Crush 默认自动拉取最新 provider/model + 元数据(定价、context window、能力标志),可经 `disable_provider_auto_update` / `CRUSH_DISABLE_PROVIDER_AUTO_UPDATE` 关闭,或 `crush update-providers` 手动更新。
- **两档模型 per session**:`largeModel`(推理/编码)+ `smallModel`(标题、摘要、轻任务);**会话中途切换**(经 csync 原子热替换,重建 models+tools);支持 OpenAI-/Anthropic-兼容 API、本地模型(Ollama / LM Studio 经 openai-compat)、云端(Bedrock、Vertex、Groq 等)。

来源:[README](https://raw.githubusercontent.com/charmbracelet/crush/main/README.md) · [DeepWiki tool system](https://deepwiki.com/charmbracelet/crush/6-tool-system) · [catwalk](https://github.com/charmbracelet/catwalk) · [fantasy](https://github.com/charmbracelet/fantasy)

## 调度与异步

- **无 cron / 调度器(已确认无任何来源记载)。** 异步能力仅限于:
  1. **bash 后台任务**(background + 读输出 + kill);
  2. **per-session 消息队列**(`messageQueue`)串行化排队回合;
  3. **取消**(`activeRequests` 的 cancel func);
  4. **SSE event stream** 作为推给客户端的异步通道。
- 没有定时/周期任务系统。我们的"定时任务"需求无法从 Crush 抄,需另行设计。

来源:[DeepWiki agent system](https://deepwiki.com/charmbracelet/crush/4-ai-and-llm-integration) · [README](https://raw.githubusercontent.com/charmbracelet/crush/main/README.md)

## 会话/workspace 模型(多客户端,共享后端)——最贴近我们的重设计

- `crush serve` 是 HTTP 守护进程,多个 TUI 客户端可连同一个后端。最初来自 feature request #976(后续 PR #2455),现已写进 README。
- 客户端按解析后的 `--cwd` **分组进 workspace**;同 `--cwd` 共享 session 列表 / 消息历史 / 权限队列 / LSP / MCP 状态。
- per-session 协作信号:**`IsBusy`**(有 agent 回合在飞)与 **`AttachedClients`**(当前在看的客户端数)。
- **生命周期**:workspace 只要还有 ≥1 客户端持有 **SSE event stream** 就存活;最后一个流断开即拆除。`POST /v1/workspaces` 后有一个**短宽限窗口**,防止"创建了 workspace 但还没来得及挂事件流"的客户端被回收。
- 注意:README 文档化了 `/v1/workspaces` + SSE 设计,但**完整端点清单未详尽公开**,依赖前需对源码核对。

来源:[issue #976](https://github.com/charmbracelet/crush/issues/976) · [README](https://raw.githubusercontent.com/charmbracelet/crush/main/README.md)

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **Coordinator / SessionAgent 拆分**:把"长生命周期、持配置的编排器(provider 构造、工具装配、模型解析)"与"per-session 流式 runner(循环、队列、取消、摘要)"分开。干净映射到我们 `agentbridge`(= Coordinator)vs per-`agent_session` runner。

2. **SQLite + sqlc 存 session/message/stats**,而不是不透明的 per-user jsonl:得到可查询历史、用量/成本统计(`stats.sql.go`)、幂等迁移、真实 schema。直击我们"per-user jsonl 无结构"的痛点。我们已是 MySQL+GORM,要学的是"给 message/session/cost 第一类的强类型 schema",而非把它当一条扁平日志。

3. **Workspace = 显式的共享状态单位** + `IsBusy`/`AttachedClients` + **SSE 流引用计数生命周期 + 宽限窗口**。对我们多用户 Web:把 **workspace key 改成 user_id(而非 cwd)**,复用 IsBusy/AttachedClients 做"agent 运行中"UI 和多 tab attach,最后一个 WS/SSE 流断开时回收 idle session(留宽限窗口扛重连——呼应我们既有的 `displacement-key-per-session` 记忆)。

4. **per-session 消息队列 + 单一在飞回合**:对"多 tab 并发提交"的干净答案——不用锁住整个用户。

5. **基于 token 阈值的自动摘要**(`largeContextWindowThreshold`=200k / `smallContextWindowBuffer`=20k / `smallContextWindowRatio`=0.2):我们目前缺的、廉价的长对话记忆;用 `smallModel` 做摘要降本。

6. **带隔离 + 成本上卷的子 agent 委派**:子 session 不继承父历史、配受限只读工具集、临时目录用完即清、**成本上卷到父**——非常适合学术"检索/取数"子任务 + per-user 计费聚合。确定性子 session ID(父 msg + tool-call id)给重试幂等。

7. **两档模型(large/small)+ Catwalk 式中央模型目录**(元数据驱动定价/context window/能力):替掉硬编码模型表;标题/摘要/子 agent 用 small 模型降本(与我们已有的"小模型生标题"一致)。

8. **MCP per-server allowlist + pre-tool hook 自动批准**:无需逐次人工提示就能扩展到多租户的权限模型,匹配我们的 auto-approve-permission 模式。

9. **pub/sub 事件总线解耦 agent↔transport**:把一个 agent 回合扇出给 N 个 attached 客户端(多 tab)的干净接缝,正是我们 WS-pipe 的关切。

10. **后台任务作为第一类工具**(read job output / kill job):可改造用于长跑学术任务(大语料抓取、批量分析)而不必上完整调度器。

## 局限

- **Workspace 以 `--cwd` 为键,不是用户**:Crush 里同路径客户端**有意共享一切**(session、权限队列、文件)。对多用户 Web 平台这恰是**反模式**——必须按用户身份做隔离,否则跨租户泄漏状态。
- **无真沙箱 / OS 隔离**:bash + 文件工具以守护进程权限运行,安全仅靠权限提示。原样不适合不受信的多用户执行——仍需容器/网络隔离(对应我们既有的 agent-hardening 方向)。
- **无长期/学习型记忆或对历史的 RAG**:只有静态 `CRUSH.md`/`AGENTS.md`。跨会话记忆是我们要自己设计的缺口,不是可抄项。
- **无调度器 / cron / 定时异步任务**:Crush 帮不上我们的"定时任务"需求,单独设计。
- **子 agent 递归被限**:"有意限制递归、通常只有 Coder 能 spawn 子 agent"是确认的;但**"最大深度恰为 2"是 [UNVERIFIED]**(DeepWiki 委派页未覆盖该数字)。适合聚焦子任务,不适合深层多 agent 编排。
- **HTTP/serve API 较年轻**(源自 feature request #976 / PR #2455)。`/v1/workspaces` + SSE 写进了 README,但完整端点面尚未详尽公开,依赖前需核对源码。

## Sources

- https://github.com/charmbracelet/crush
- https://raw.githubusercontent.com/charmbracelet/crush/main/README.md
- https://github.com/charmbracelet/crush/tree/main/internal/db
- https://github.com/charmbracelet/crush/tree/main/internal/agent
- https://github.com/charmbracelet/crush/issues/976
- https://github.com/charmbracelet/crush/issues/2501
- https://github.com/charmbracelet/fantasy
- https://github.com/charmbracelet/catwalk
- https://deepwiki.com/charmbracelet/crush
- https://deepwiki.com/charmbracelet/crush/4-ai-and-llm-integration
- https://deepwiki.com/charmbracelet/crush/6-tool-system
- https://deepwiki.com/charmbracelet/crush/6.7-agent-delegation-and-nested-tools
