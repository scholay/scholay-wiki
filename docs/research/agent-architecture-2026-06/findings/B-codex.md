# OpenAI Codex CLI + Codex Cloud
> kind: project · confidence: high · last-checked: 2026-06

## 概述

Codex 是 OpenAI 的编码 agent,一套核心引擎、多种交付面:

- **本地**:终端 CLI、IDE 扩展、桌面 app(`codex app`),核心用 **Rust 重写(`codex-rs`)**,仓库语言占比 **Rust 96.1%**(其余 Python 2.9% / TypeScript 0.2% 等)。
- **云端**:`chatgpt.com/codex`,官方名 **Codex Web** —— 异步、并行、**每任务一个隔离容器**的后台运行,自动开 PR。

同一 agent core 驱动 TUI / IDE(JSON-RPC)/ headless exec / cloud,靠 OS 内核级 sandbox(本地)与容器隔离(云)兜底安全。
([github.com/openai/codex](https://github.com/openai/codex))

## 关键架构决策

**crate 分层(`codex-rs`)** —— 已用仓库 `codex-rs/` 目录列表直接核对,以下 crate 确实存在:`core`、`protocol`、`config`、`state`、`tui`、`exec`、`app-server`、`app-server-protocol`、`cli`、`mcp-server`、`sandboxing`、`linux-sandbox`、`windows-sandbox-rs`、`memories`、`network-proxy`、`thread-store`、`rollout`、`skills`、`plugin` 等(100+ 子目录)。其职责划分:
- `codex-core` —— 可嵌入引擎;持有 `ThreadManager` / `CodexThread` / `Session`(逐轮模型交互、上下文压缩、工具分派)。
- `codex-protocol` —— operation / event 消息类型。
- `codex-config` —— **分层配置**:CLI flag > env > 项目配置 > 全局 > 编译默认值。
- `codex-state` / `thread-store` —— 线程持久化。
- `codex-tui`(Ratatui 即时模式 UI)、`codex-exec`(headless)、`codex-app-server`(把 core 以 **JSON-RPC 2.0** 暴露给 IDE,带 TypeScript schema 导出)、`codex-cli`(multitool 入口)、`mcp-server`(把 Codex 反过来当 MCP server 暴露)。

> 上面 crate 名/职责的细粒度描述来自第三方架构博客(codex-rs rewrite),但**每个 crate 都已被仓库目录列表证实存在**,故置信度高。

**Agent loop = 异步 submit/event,而非 request/response**:client 提交 `Op`(`UserTurn` / `Interrupt` / `Shutdown`),core 流式回 `EventMsg`(`TurnStarted` / `AgentMessageDelta` / `ExecCommandBegin·End` / `PatchApplied` / `TokensUsed` / `TurnFinished`)。UI/IDE **不同步调用 core**,只消费事件流 —— 这是让一份引擎同时驱动 TUI / IDE / headless 的关键解耦。[来源为架构博客,核心结论可信但具体事件名属次级证据]

**上下文管理**:`codex-core` 里的 `ContextManager` / `CompactTask` 逐轮统计 token,接近上限时**自动压缩**(老消息换成摘要)。[次级证据]

**持久化 = rollout JSONL**:每个 session 一个 JSONL 文件,路径 `~/.codex/sessions/YYYY/MM/DD/rollout-TIMESTAMP-UUID.jsonl`;每行是一个 `RolloutLine`,包裹一个 `RolloutItem` 并附 UTC 时间戳。Resume 时**追加写入既有文件**(不新建);冷文件用 **Zstandard(`.jsonl.zst`)压缩**,`open_rollout_line_reader` 透明读取明文/压缩两种格式,压缩文件被追加时自动还原为明文。
> 更正:草稿称"首行是 metadata header(ID/source/timestamp/model provider)"。DeepWiki 明确指出**不存在单独的 header 行**,故该细节已下调为 [UNVERIFIED]。
> 重点:这和本平台 agent 现状的 **jsonl-on-shared-FS** 是同一套模式 —— Codex 的赢点不在存储格式,而在它**外面包了一层隔离**。
([DeepWiki rollout persistence](https://deepwiki.com/openai/codex/3.5.2-rollout-persistence-and-replay) · [session resumption](https://deepwiki.com/openai/codex/4.4-session-resumption))

## 编排与子agent(manager–worker)

- **manager 拆解任务 → 并行派发 worker,每个 worker 独立 context window**;父 agent 等齐所有结果后返回**合并响应**。**只在用户显式要求时才 spawn**("Codex only spawns a new agent when you explicitly ask it to do so")。
- **子 agent 用 TOML 定义**,放 `~/.codex/agents/`(个人)或 `.codex/agents/`(项目)。必填 `name` / `description` / `developer_instructions`;选填(缺省继承父会话)`model` / `model_reasoning_effort` / `sandbox_mode` / `mcp_servers` / `skills.config` / `nickname_candidates`。
- **并发与深度上限**(配置 `[agents]` 段):
  - `agents.max_threads` 默认 **6**(并发开启的 agent 线程上限)
  - `agents.max_depth` 默认 **1**(嵌套深度,默认禁止超过直接子级的递归委派)
  - `agents.job_max_runtime_seconds` 默认 **1800**(CSV 批量作业每 worker 超时)
- **子 agent 继承父 sandbox 策略**;可 per-agent 覆写 `sandbox_mode`;父运行时 `/permissions` 改动会下传给子级。批量结果经 `report_agent_job_result`(配 `spawn_agents_on_csv`)收集。
([subagents](https://developers.openai.com/codex/subagents))

## 记忆(短期 + 长期)

- **Memories** = 把早先线程的有用上下文带进未来工作(稳定偏好、复发工作流、技术栈、项目约定、已知坑)。存于 Codex home `~/.codex/memories/`(摘要 / durable 条目 / 近期输入 / 支撑证据)。
- **用户本地存储**,官方文档未提跨 repo / 团队共享;**默认关闭**,且 **EEA / 英国 / 瑞士"at launch"不可用**。
- **secrets 自动脱敏**("Codex redacts secrets from generated memory fields")。
- 更新**异步后台**:线程结束不立刻更新,等线程 idle 足够久才总结;**跳过活跃 / 短生命周期会话**;rate-limit 余量过低时暂停生成。
- 明确指引:**必须永远生效的规则该放 `AGENTS.md` / 入库文档,而非 memory**("a helpful local recall layer, not the only source for rules that must always apply")。
- **Chronicle** = 配套能力,"helps Codex recover recent working context **from your screen** to build up memory" —— 官方文档确认是基于"屏幕"的上下文恢复机制(底层抓屏细节未展开,故视为高层确认、细节 [UNVERIFIED])。
([memories](https://developers.openai.com/codex/memories))

## 多用户与隔离

> 这是最值得抄的部分,但要分清两套机制:**本地 CLS 的 OS sandbox** 是单机能力控制,**云端的每任务容器**才是真正的多租户隔离。

**两轴权限模型:sandbox(技术能力)× approval(何时询问)。** sandbox 定义*能*执行什么;approval 定义*何时*要人确认。

**`sandbox_mode` 取值**:
- `read-only` —— 只读。
- `workspace-write` —— **默认模式**;工作区内可改文件 / 跑命令,**网络默认关闭**(经 `[sandbox_workspace_write] network_access = true` 开启);即使在此模式下,`<writable_root>/.git`、`.agents`、`.codex` **仍保持只读**。
- `danger-full-access` —— 无任何限制。

**`approval_policy` 取值**:`untrusted`(只自动跑已知安全的只读操作)、`on-failure`、`on-request`、`never`。

**命名预设**(组合上面两轴):
- **Auto(默认)**:`--sandbox workspace-write --ask-for-approval on-request`
- **Read-Only**:`--sandbox read-only --ask-for-approval on-request`
- **Full Access**:`--dangerously-bypass-approvals-and-sandbox`(别名 `--yolo`)

**OS 原生强制(内核级,非 app hook)** —— `sandboxing` crate 把一份 `SandboxPolicy` 翻译成各 OS 原语:
- **macOS Seatbelt**:动态生成 SBPL profile,经 `/usr/bin/sandbox-exec` 运行;网络默认拒绝。
- **Linux**:**Bubblewrap(bwrap)** 为主 —— 默认只读 FS、可写根经 `--bind` 叠加、namespace 隔离(`--unshare-*`)、网络模式 Isolated/ProxyOnly/FullAccess;**seccomp** BPF 在 FS 配好后阻断 `connect`/`bind`/`ptrace`(前置 `PR_SET_NO_NEW_PRIVS`);**Landlock** 为补充/回退(老内核 < 5.13)。
- **Windows**:受限 token + ACL deny-ACE。
- **escalation**:检测到 sandbox 拒绝(退出码 / stderr)时触发 Permission Request 让用户升级权限。
> 上述各 OS 原语细节来自 DeepWiki,但 `codex-rs/` 里 `sandboxing` / `linux-sandbox` / `windows-sandbox-rs` / `network-proxy` crate 均已被目录列表证实,机制方向可信。

**Codex Web(云端)真正的多租户隔离**:
- **每任务一个隔离容器**。流程:建容器 → 在指定 branch/commit checkout repo → 跑 setup 脚本 → 应用 internet policy → agent 循环跑终端命令。任务**后台并行**,各占独立环境。文档全程用 "container",未用 VM(也未点名具体 runtime)。
- **setup 期 vs 运行期 secret 分离**(强力借鉴点):env vars 全程保留;**secrets 只对 setup 脚本可见,agent 阶段开始前被移除**。
- **internet policy**:setup 期开;**agent 执行期默认关**(可配 limited / unrestricted);所有出站流量过 **HTTP/HTTPS proxy** 做滥用防护。
- **容器缓存最长 12h**(clone + setup 结果),被 setup/maintenance 脚本、env vars、secrets 变更自动失效。
([agent-approvals-security](https://developers.openai.com/codex/agent-approvals-security) · [DeepWiki sandboxing](https://deepwiki.com/openai/codex/5.6-sandboxing-implementation) · [cloud/environments](https://developers.openai.com/codex/cloud/environments))

## 扩展性(MCP / AGENTS.md / skills)

**MCP** —— Codex **既是 client 又是 server**:
- 作为 **client**(官方文档主推):配在 `~/.codex/config.toml` 的 `[mcp_servers.<name>]`。**官方文档只列两种传输:stdio + streamable HTTP**(stdio 字段 `command`/`args`/`env`/`env_vars`/`cwd`;HTTP 字段 `url`/`bearer_token_env_var`/`http_headers`/`env_http_headers`)。per-server 字段:`enabled`、`required`、`startup_timeout_sec`(默认 **10s**)、`tool_timeout_sec`(默认 **60s**)、`enabled_tools`/`disabled_tools` 允许/拒绝清单、`default_tools_approval_mode`(`auto`/`prompt`/`approve`);OAuth 经 `codex mcp login <server>`(配 `mcp_oauth_callback_port`/`mcp_oauth_callback_url`)。
  - 更正:草稿称"三种传输含 SSE"。**官方 MCP 文档未列 SSE**,故 SSE 支持降级为 [UNVERIFIED]。
- 作为 **server**(`codex-rs/mcp-server` crate,已核实存在):经 stdio JSON-RPC 暴露 `codex` 与 `codex_reply` 两个工具,让外部 host 编程驱动一个 Codex 会话。官方面向用户的 MCP 文档**刻意只讲 client 角色**,故 server 角色定性为「真实但次要」。
- ([mcp](https://developers.openai.com/codex/mcp) · [DeepWiki mcp-server](https://deepwiki.com/openai/codex/6.4-mcp-server-implementation-(codex-mcp-server)) · [mcp-server/src/lib.rs](https://github.com/openai/codex/blob/main/codex-rs/mcp-server/src/lib.rs))

**AGENTS.md** —— 开放 Markdown 标准,现由 **Linux Foundation 旗下 Agentic AI Foundation** 托管;被 Codex / Jules / Cursor / Aider / VS Code 等多家采用,**60k+ 开源项目**在用(草稿"20+ 工具"为不同口径,已更正为官方的 60k+ 项目数)。**嵌套优先级:"离被改文件最近的 AGENTS.md 胜出;显式 chat prompt 覆盖一切"**;OpenAI 自家主仓有 **88 个** AGENTS.md。([agents.md](https://agents.md/))

**Skills**:automation/agent 可显式触发 skill,语法 `$skill-name`。([automations](https://developers.openai.com/codex/app/automations))

## 调度与异步

- **Automations** = 后台定时任务:支持 daily/weekly,也支持**自定义 cron 语法**。
- 两类:**Standalone**(按计划起全新 run,结果进 Triage 收件箱)与 **Thread automations**(挂在某线程上的 wake-up,保留对话上下文)。
- Git 项目可选在**本地项目目录**或**新建 worktree** 跑(worktree 隔离 automation 改动与未完成的本地工作)。
- 结果落 **Triage 收件箱**(有发现才显示,可按未读筛选;**无可报告时自动归档**)。
- **本地 automation 需机器开机 + Codex 运行 + 项目仍在磁盘上**;云端 automation 无此约束,更耐久。
- **CI 路径**:`codex-action` GitHub Action / cron 做 PR 自动审查;PR 上 `@codex review` 触发标准 GitHub review;"Automatic reviews" 可逐 PR 审查。
([automations](https://developers.openai.com/codex/app/automations) · [integrations/github](https://developers.openai.com/codex/integrations/github) · [codex-action](https://github.com/openai/codex-action))

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **两轴权限:sandbox(能力)× approval(何时问)。** 把现有单一"批不批"的闸门拆成正交两轴 —— per-session `sandbox_mode`(read-only / workspace-write / full)**加** `approval_policy`(`untrusted`/`on-failure`/`on-request`/`never`),干净地把"能做什么"与"已确认什么"分开。对应我们 `agentbridge` 现在的 permission_request 自动 approve(可选)钩子,可升级成两轴模型。

2. **真正的 per-user 隔离 = Codex Web 的"每任务一容器",不是 OS sandbox。** Web 平台该抄**云模型**:每会话/任务一个临时容器、独立 checkout/scratch 目录、**网络默认关 + 只经 proxy 出站**、**带 TTL(12h)的容器缓存 + 配置变更即失效**。这正面修我们"共享 FS 上没有真正 per-user 隔离"的缺口(现状 agent 容器内 jsonl + DB 只存映射)。

3. **setup 期 vs 运行期 secret 分离。** 只在 setup 阶段注入 API key/凭据,**agent 跑起来前剥离** —— 防 agent(或被 prompt 注入的 agent)外泄密钥。极契合我们 Minicod/Anthropic 的 `third_party_accounts` key 池。

4. **异步 submit/event core 与传输解耦。** 采用 `Op`→`EventMsg` 循环,让一份引擎同时喂 HTTP+WS daemon、未来 IDE/API、headless cron,后台/定时 run 复用同一 loop。对照我们 `agentbridge` 的 WS pipe,可把"事件流"做成统一抽象。

5. **分层配置 + per-feature TOML agent 规格。** `ConfigBuilder` 优先级(request > project > user > global > defaults)与 `~/.codex/agents/*.toml`(`max_threads`/`max_depth` 上限、per-agent `sandbox_mode`/`mcp_servers`、子继承父 sandbox)是我们 `FeatureSpec` + 多 agent 配额故事的清晰蓝本。

6. **分层记忆 + 硬边界。** 长期 Memories **用户本地、secret 脱敏、异步写、且明确不放 must-always 规则**(那些进入库的 AGENTS.md)。这是我们"无长期记忆"缺口及其多租户隐私陷阱的最干净答案:per-user 记忆库 + 脱敏 +「规则进版本化配置、回忆进记忆」。

7. **调度 = cron 触发 + 隔离 worktree → 收件箱/Triage。** 干净映射到我们缺的"定时任务":cron → 临时隔离目录 → 结果进 per-user 收件箱(空则自动归档)。

8. **MCP 作为唯一扩展缝(我们已有 Minicod MCP)。** per-server 超时、`required` 标志、工具 allow/block 清单、`default_tools_approval_mode` 给到 per-tenant 细粒度工具治理,无需定制代码。

9. **best-of-N 并行尝试 + PR/产物交付。** 学术交付物可跑 N 个并行云尝试让用户挑(此为 Codex Web 文档提及的并行/diff-apply 模式,具体 best-of-N 措辞属次级证据)。

10. **嵌套优先级指令文件("最近者胜,chat 覆盖一切")。** per-org / per-project / per-session 指南的可预测覆盖链。

## 局限

- **CLI 的 OS sandbox ≠ 多租户服务器隔离。** Seatbelt/Landlock/Bubblewrap 只保护*单机*的 FS/网络,不隔离同一服务器上的用户彼此。别把 CLI sandbox 当成你的隔离答案 —— **云端容器-per-task** 才是多租户那套。
- **持久化仍是 jsonl-on-FS**(rollout 文件)—— 和我们现状同模式;Codex 的赢点是*外层隔离*,不是存储格式。
- **Bubblewrap/Landlock 有宿主前置条件**(Landlock 需内核 ≥ 5.13、bwrap 需可用),有回退路径但自托管 sandbox 层有可移植成本。
- **记忆受司法辖区限制**(EEA/UK/CH at launch 默认关)且**异步/best-effort**,非保证存储;面向 EU 用户需合规处理。
- **本地 automation 需宿主开机 + app 运行**,不能替代服务端调度;只有云端 automation 耐久。
- **子 agent 仅在显式请求时 spawn,且有上限**(`max_depth=1`、`max_threads=6`)—— 默认无自治深度编排;深度调度策略要自己设计。
- **`--yolo` / `danger-full-access` 存在** —— 多租户下任何类似"绕过"开关必须禁用或严格门控。
- **[UNVERIFIED]**:rollout 文件是否有单独 metadata header 行(DeepWiki 称无);官方 MCP 文档未列 SSE 传输;云容器具体 runtime(文档只说 "container" 未点名);Chronicle 抓屏底层细节;`Op`/`EventMsg` 具体事件名与 `ContextManager` 细节(出自架构博客,属次级证据)。

## Sources

主源:
- https://github.com/openai/codex
- https://github.com/openai/codex/tree/main/codex-rs
- https://github.com/openai/codex/blob/main/codex-rs/mcp-server/src/lib.rs
- https://developers.openai.com/codex/
- https://developers.openai.com/codex/cloud
- https://developers.openai.com/codex/cloud/environments
- https://developers.openai.com/codex/subagents
- https://developers.openai.com/codex/memories
- https://developers.openai.com/codex/agent-approvals-security
- https://developers.openai.com/codex/mcp
- https://developers.openai.com/codex/app/automations
- https://developers.openai.com/codex/integrations/github
- https://agents.md/
- https://github.com/openai/codex-action

次级(primary-derived):
- https://deepwiki.com/openai/codex/3.5.2-rollout-persistence-and-replay
- https://deepwiki.com/openai/codex/4.4-session-resumption
- https://deepwiki.com/openai/codex/5.6-sandboxing-implementation
- https://deepwiki.com/openai/codex/6.4-mcp-server-implementation-(codex-mcp-server)
- https://codex.danielvaughan.com/2026/03/28/codex-rs-rust-rewrite-architecture/
