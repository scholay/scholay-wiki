# OpenCode (sst/opencode, ~172K★)
> kind: project · confidence: high · last-checked: 2026-06

> **命名/归属注意**:仓库已从 `sst/opencode` 迁移到 **`anomalyco/opencode`**(原 SST 团队改名 Anomaly Innovations,项目品牌仍叫 OpenCode/SST)。`sst/opencode` 现重定向到新仓库,star ≈ **174K**(本轮实测),标题里的 ~172K 仅为近似。引用旧 `sst/*` URL 仍可用(自动跳转)。([repo move HN](https://news.ycombinator.com/item?id=46552218),[anomalyco/opencode](https://github.com/anomalyco/opencode))

## 概述

OpenCode 自称 "The open source AI coding agent"。核心是一个 **无头(headless)的 TypeScript/Bun 后端服务器**(引擎 + 全部业务逻辑),多个瘦客户端(Go TUI、桌面 App(BETA)、Web、IDE 扩展、移动端)通过 **HTTP + SSE** 连接它。

实测仓库语言占比:TypeScript 68.7% / MDX 27.7% / CSS 3.1%(MDX 占比高是因为文档站同仓);TUI 用 Go(Bubble Tea)写,是独立进程。Bun 是确认的(`bun.lock`/`bunfig.toml`);Hono 作为 HTTP 框架在官方 README 中**未明确**(来自二级源 DeepWiki,标 [UNVERIFIED])。

- 主源:[github.com/anomalyco/opencode](https://github.com/anomalyco/opencode) · [opencode.ai/docs](https://opencode.ai/docs)

## 关键架构决策

**1. 严格的 client/server 分离,服务器是唯一真源(server-as-source-of-truth)。**
`opencode serve` 启动无头 HTTP 服务器;直接跑 `opencode` 会同时拉起 TUI 客户端 + 一个服务器,TUI 只是连服务器的客户端。所有 LLM 通信、文件操作、shell 命令都在服务器侧。好处(其架构卖点):状态/工具配置/LLM 交互留在服务端 → 用户可跨设备、断线重连、在远端环境跑 agent;同一后端同时服务 TUI / 桌面 / Web / IDE。([opencode.ai/docs/server](https://opencode.ai/docs/server/))

**2. 传输 = HTTP REST + SSE 事件总线(控制面不用 WebSocket)。**
- 关键端点(官方文档确认):`POST /session/:id/message`(发送并等待响应)、`POST /session/:id/prompt_async`(异步,不等),`POST /tui/*`(从服务器驱动 TUI:append-prompt/submit-prompt/open-sessions 等,让 IDE/Web 能控制终端客户端)。
- **SSE 事件流**:`GET /event`(bus 事件,**首个事件是 `server.connected`**)与 `GET /global/event`(全局事件)两条流。客户端保持本地响应式 store,靠 apply 事件保持同步。
  - ⚠️ 心跳间隔(草稿说 ~30s / 旧源 10s)官方文档**未列出具体数值**,标 [UNVERIFIED]。
- **OpenAPI 3.1 spec 挂在 `/doc`**(`http://localhost:4096/doc`),用于生成 SDK。([opencode.ai/docs/server](https://opencode.ai/docs/server/))

**3. CORS** 通过可重复的 `--cors` flag 配置多 origin(如 `--cors http://localhost:5173 --cors https://app.example.com`)。([opencode.ai/docs/server](https://opencode.ai/docs/server/))

**4. Agent loop**(`SessionPrompt.loop()`:构建 system prompt → Provider 拿 AI SDK 的 LanguageModel → 流式 → 执行 tool call → 上下文压缩 → 标题生成 → 持久化)来自二级源 DeepWiki,**未在官方文档逐字确认**,作为旁证保留 [UNVERIFIED]。([DeepWiki](https://deepwiki.com/sst/opencode))

**5. 持久化 —— 已从 JSON 文件迁移到 SQLite(有明确版本节点)。**
- **当前**:**SQLite(Drizzle ORM)**,DB 文件 `~/.local/share/opencode/opencode.db`,beta **v1.1.53+** 起从 JSON 文件存储切到 SQLite。层级:Projects → Sessions → Messages → Parts。
- **旧版(已迁移)**:文件系统 JSON,分片于 `~/.local/share/opencode/storage/{session,message,part}/…`(小 JSON 文件、非 JSONL)。迁移是真实发生的、有 issue 追踪(增量升级时迁移可能静默跳过)。
- ⚠️ **已知坑**:并发会话(尤其同一仓库开多个 opencode,或 NFS / 本地+docker 共享 config)会导致 SQLite **数据库损坏**("database disk image is malformed")。
- git snapshot(undo/revert)+ worktree(并行分支)模块来自二级源 [UNVERIFIED]。
- 引用本地内部结构前**务必 pin 到具体版本**。([DeepWiki session-management](https://deepwiki.com/sst/opencode/2.1-session-management),[JSON→SQLite migration issue #13654](https://github.com/anomalyco/opencode/issues/13654),[corruption issue #14970](https://github.com/anomalyco/opencode/issues/14970))

## 编排与子 agent

- **Primary agents vs Subagents**(官方文档确认):
  - Primary(可 Tab 切换、直接对话):**Build**(全部工具启用)、**Plan**(规划/分析,file edit + bash 默认 `ask`)。
  - Subagents(被 primary 调用,可 @mention 手动调):**General**(近全量工具,多步/并行研究)、**Explore**(只读,探索代码库,不能改文件)、**Scout**(只读,外部文档/依赖研究)。
  - 隐藏系统 agent(不可选、自动运行):**Compaction**(压缩长上下文)、**Title**(生成会话名)、**Summary**(生成会话摘要)。
- **调用方式**:① primary 自动调用;② 消息里 `@mention`;③ 通过 **Task 工具**。子 agent 跑成**子会话(child session)**,父子层级是一等公民(TUI 有父→首个子会话 `session_child_first` 默认 `<Leader>+Down` 等导航键)。
- **每 agent 配置**(官方确认):`mode`(primary/subagent/all)、`model`、`prompt`(文件)、`temperature`、`steps`(最大 agentic 迭代数)、`permission`(细粒度)、`description`、`hidden`、`color`。定义在 `opencode.json` 或带 front-matter 的 markdown(`~/.config/opencode/agents/*.md` 或 `.opencode/agents/*.md`)。([opencode.ai/docs/agents](https://opencode.ai/docs/agents/))

## 记忆

- **短期**:会话内消息历史 + 接近 token 上限时的**自动上下文压缩/摘要**(Compaction/Summary 系统 agent)。
- **长期(内置)= 只有 `AGENTS.md`**:项目根 `AGENTS.md`(向上遍历)+ 全局 `~/.config/opencode/AGENTS.md` + `~/.claude/CLAUDE.md` 兜底;每类首个命中胜出;注入 LLM 上下文;`/init` 生成;建议提交到 Git。可在 `opencode.json` 用 `instructions: [...]` 按需引用别的文件。**这是静态、手写/`/init` 生成的,不是跨会话学习型记忆。**([opencode.ai/docs/rules](https://opencode.ai/docs/rules/))
- **无原生向量/情景记忆**。该空白由**第三方插件**填补(非核心,质量不一):`opencode-mem`(本地 SQLite 向量库 + 自动用户画像 + Web UI)、`opencode-mem0`(STM/LTM 双存、Ebbinghaus 衰减、自动晋升)、`opencode-hindsight`(retain/recall/reflect,会话启动注入)。([opencode-mem](https://github.com/tickernelz/opencode-mem),[hindsight](https://hindsight.vectorize.io/blog/2026/04/20/opencode-persistent-memory))

## 多用户与隔离 —— ⚠️ 对我们用例的最大缺口

- **没有真正的多用户模型,也没有 sandbox(刻意为之)。** 服务器是**单租户、绑单台机器/文件系统**。项目 **SECURITY.md** 明确说:
  > "OpenCode does **not** sandbox the agent. The permission system exists as a UX feature to help users stay aware of what actions the agent is taking… If you need true isolation, run OpenCode inside a Docker container or VM."

  **修正**:此句出自仓库 **SECURITY.md**,**不在** `/docs/permissions/` 官方页(权限页只把权限框定为"信任式审批",未含任何 sandbox 免责声明)。草稿把它挂在 permissions 页是错误归属,已更正。([SECURITY.md(anomalyco fork 镜像同内容)](https://github.com/anomalyco/opencode/blob/dev/SECURITY.md))

- **Server 模式 opt-in;鉴权只有 HTTP Basic。** 设 `OPENCODE_SERVER_PASSWORD`(可选 `OPENCODE_SERVER_USERNAME`,默认 `opencode`)开启 HTTP basic auth;**不设则无鉴权运行**(官方文档原文只说"Set `OPENCODE_SERVER_PASSWORD` to protect the server with HTTP basic auth";"无密码即裸跑且打 warning"这一点官方页**未明确**,标 [UNVERIFIED])。默认 bind `127.0.0.1:4096`;TUI 启动时随机分配端口/主机(可用 `--hostname`/`--port` 覆盖)。**服务器无真实用户账户/RBAC——只是单一共享密码。**([opencode.ai/docs/server](https://opencode.ai/docs/server/))

- **历史 RCE(警世案例,已核实)**:< **v1.1.10** 的服务器是**无鉴权 + 通配符 CORS(`*`)** 的本地 HTTP 端点 → "任何在浏览器里访问的网页 / 任何本地进程都能在本机执行任意命令"。修复:**v1.1.10** 服务器默认关闭;**v1.1.15** 加密码鉴权 + 收紧 CORS。维护者(thdxr)承认处置不当:报告用的邮箱属于另一仓库、无人盯,"we get 100s of issues reported to us daily… this is my own inexperience showing"。教训:把 agent daemon 暴露在 localhost HTTP 上本身就是严重攻击面,光修 CORS 挡不住本地/网络攻击者。([HN RCE 串](https://news.ycombinator.com/item?id=46581095))

- **Permissions(唯一内置控制,官方确认)**:类别 `read/edit/glob/grep/bash/task/skill/lsp/question/webfetch/websearch/external_directory/doom_loop` → 取值 `allow|ask|deny`;支持 `*`(零或多)`?`(恰一)通配 + `~`/`$HOME` 展开;`external_directory` 默认 `ask`,管控 cwd 之外的路径。([opencode.ai/docs/permissions](https://opencode.ai/docs/permissions/))

## 扩展性

- **工具**:20+ 内置(read/write/edit/bash/grep/glob/…),按每 agent 的权限规则过滤;支持自定义工具。
- **MCP**:一等公民,本地 stdio + 远程 HTTP/SSE,远程受保护 server 支持 OAuth;MCP 工具与内置工具合并进同一 registry。
- **Skills / Plugins / LSP / Formatters / ACP**:全部经 `opencode.json` 配置驱动。LSP 模块给 agent 实时诊断/类型/符号,独立于 LLM provider。
  - 注:工具数量、MCP transport、LSP 细节主要来自二级源(ggprompts/DeepWiki)+ 文档概述,作为高信号旁证,载入决策前建议对源码复核。([ggprompts architecture map](https://ggprompts.com/architecture/opencode/),[opencode.ai/docs](https://opencode.ai/docs))

### Provider 抽象(Models.dev)—— 已核实

- **75+ providers**,官方 providers 页原文 "75+ LLM providers",经 **AI SDK + Models.dev** 支持,不是逐个厂商硬编码(目录页可 "Submit a PR" 补充,底层 model catalog 来自 Models.dev)。
- **Vercel AI SDK** 作为 LLM 抽象层;自定义 provider 用 `@ai-sdk/openai-compatible` 等包。
- 凭证:`/connect` 写入 `~/.local/share/opencode/auth.json`,或环境变量(Bedrock/Azure 等)。
- **OpenCode Zen** = 官方团队挑选/验证过、即用即付的 curated 模型(新手推荐)。
- 三级模型解析(CLI flag → 编译期 bundled 快照(离线安全)→ 在线 fetch)+ context limit/pricing 用于成本追踪与压缩:来自二级源 DeepWiki/ggprompts [UNVERIFIED 细节],但 models.dev 作为 pricing/context 元数据源是确认的。([opencode.ai/docs/providers](https://opencode.ai/docs/providers/),[models.dev](https://models.dev),[DeepWiki provider-config](https://deepwiki.com/sst/opencode/3.3-provider-and-model-configuration))

## 调度与异步

- **核心无原生 cron/调度器/长时后台作业**[UNVERIFIED —— 任何抓取到的官方文档都未提及;为"证据缺失"]。
- 异步面是**请求级**:`prompt_async`(fire-and-forget,返回 204)+ SSE 观察进度;因状态在服务端,**agent 在客户端断开后仍存活**。worktree 模块支持并行分支(二级源)。([opencode.ai/docs/server](https://opencode.ai/docs/server/))

### 分享链接(与我们平台直接相关)

- 流程(官方确认):`/share` → "Creates a unique public URL"(格式 `opncd.ai/s/<share-id>`,复制到剪贴板),把会话历史同步到其服务器;**任何拿到链接的人都可公开访问**;同步内容含 "Full conversation history / All messages and responses / Session metadata";`/unshare` 删除链接与数据。
- 模式:manual(默认)/ auto-share(每个新会话自动分享)/ disabled。
- 企业能力(官方确认):可"完全禁用 / 仅限 SSO 认证用户 / 自托管在自有基础设施"。
- 基建细节(SyncServer = 每个分享会话一个 Cloudflare **Durable Object** 管 WS + 广播;本地 CLI 推 HTTP POST、viewer 走 WS 实时回放;Web Viewer 是 SolidJS;持久化 Durable Object storage + R2):来自二级源 DeepWiki [UNVERIFIED 实现细节],但"Durable-Object-per-session + public-by-link + 可 SSO 限制 + 可自托管"的总体形态与官方分享/企业文档一致。([opencode.ai/docs/share](https://opencode.ai/docs/share/),[DeepWiki session-sharing](https://deepwiki.com/sst/opencode/6.6-session-sharing))

## 值得借鉴(对标我们的多用户 Web 学术 agent 平台)

1. **Server-as-source-of-truth + 瘦客户端走 HTTP+SSE。** 解耦掉"桌面 CLI 假设",同一后端服务 Web/移动/IDE,agent 跨断线与换设备存活——正对我们"桌面 CLI 套个 daemon"的痛点。
2. **类型化事件总线 → SSE 扇出 + 本地响应式 store,首事件 `server.connected`。** 干净的多客户端实时同步;重连 = 重订阅。契合每用户多 tab / 多设备。
3. **OpenAPI 3.1 挂 `/doc` → 生成 SDK。** 单一 spec 驱动所有客户端,强契约纪律(我们已有用户端/后台,未来移动端)。
4. **Models.dev 注册表(pricing/context limit 当数据不当代码)。** 直接喂成本/配额账本(我们已记 token);bundled 快照 = 离线/启动安全。
5. **一等公民 child-session 子 agent(Task 工具)+ 每 agent 的 model/tools/permission/`steps` 预算。** 干净的编排原语:只读 Explore/Scout vs 全量 Build,带 per-agent 成本上限——可映射到我们的检索 agent / 审稿 agent / 写作 agent 与 per-feature 配额。我们现有 `agentbridge` 已是 user↔session 桥,可借鉴其 `steps` 迭代预算做成本天花板。
6. **分享 = per-session 同步单元 + secret token + 公开链接 + 可 SSO 限制/自托管。** 比"文件复制"更 Web-native;secret-token + per-session 同步对象是干净的隔离单元。**反面教材**:其默认是 public-by-link——学术/私有内容我们要 **private-by-default + 访问控制**(我们 library-share 已是"链接+提取码+过期+访问追踪",方向正确,可继续强化)。
7. **权限矩阵(per-tool allow/ask/deny + glob)随 agent / 子 agent 携带。** 可复用为我们的 per-feature、per-tier 策略层。
8. **`/init` 式 AGENTS.md 生成** 作为轻量 per-project 记忆引导(我们已有 CLAUDE.md 风格)。

## 局限(切勿照抄)

- **无多用户、无租户、无 per-user 隔离、无 sandbox。** 单租户绑文件系统;隔离明确是"你自己的事——用 Docker/VM"。我们的多用户 Web 平台**必须自建**它缺的租户 + 沙箱层(我们已有 agent 容器隔离 + agentbridge 配额钩子,方向对,但要确保 per-user cwd / 资源隔离)。
- **HTTP-on-localhost daemon 造成过真实无鉴权 RCE。** 任何浏览器可达的 agent 端点都按敌对处理:鉴权 + 严格 CORS + origin pinning 是底线,且这些还不足以挡本地/网络攻击者。
- **鉴权只有 HTTP Basic + 单一共享密码**——服务器内无真实用户账户/RBAC。
- **分享 public-by-default、整段 transcript、跑在厂商(Cloudflare/SST)边缘**——对学术/专有内容是错误默认值,需自托管 + private-by-default。
- **长期记忆只是静态 AGENTS.md;** 真正的跨会话学习记忆仅以第三方插件存在(质量参差)。
- **核心无文档化的原生 scheduler/cron/后台作业系统** [UNVERIFIED —— 证据缺失];异步仅"每 prompt + SSE 观察"。
- **存储模型有过迁移**(文件系统 JSON → SQLite/Drizzle,beta v1.1.53+),并有并发损坏坑;依赖内部结构前 pin 版本。
- 多处深层断言(event-bus 内部、SyncServer 类、agent loop、worktree、包布局)来自 **DeepWiki/ggprompts 自动生成 wiki**,非官方文档——高信号但二级,load-bearing 决策前需对源码复核。

## Sources

主源 / 权威:
- https://opencode.ai/docs
- https://opencode.ai/docs/server/
- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/rules/
- https://opencode.ai/docs/permissions/
- https://opencode.ai/docs/share/
- https://opencode.ai/docs/providers/
- https://github.com/anomalyco/opencode (原 https://github.com/sst/opencode,已迁移)
- https://github.com/anomalyco/opencode/blob/dev/SECURITY.md
- https://news.ycombinator.com/item?id=46581095 (RCE 讨论串)
- https://news.ycombinator.com/item?id=46552218 (仓库迁移 sst→anomalyco)
- https://models.dev

迁移 / issue 实证:
- https://github.com/anomalyco/opencode/issues/13654 (JSON→SQLite 迁移)
- https://github.com/anomalyco/opencode/issues/14970 (SQLite 并发损坏)

二级 / 自动生成 wiki / 社区:
- https://deepwiki.com/sst/opencode
- https://deepwiki.com/sst/opencode/2.1-session-management
- https://deepwiki.com/sst/opencode/3.3-provider-and-model-configuration
- https://deepwiki.com/sst/opencode/6.6-session-sharing
- https://ggprompts.com/architecture/opencode/
- https://github.com/tickernelz/opencode-mem
- https://hindsight.vectorize.io/blog/2026/04/20/opencode-persistent-memory
