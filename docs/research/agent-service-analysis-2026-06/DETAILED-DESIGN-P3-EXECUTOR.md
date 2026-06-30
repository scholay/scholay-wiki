<!-- 2026-06-28 P3 executor detailed design (clean-room raw-SDK executor, no cc-haha). 7 agents. Probe GREEN. -->

Confirmed: `SetAgentClient(client AgentPusher)` (service.go:39), where `AgentPusher` is a one-method interface (`PushConfig`, service.go:23-25) deliberately defined to avoid the reverse cycle. C1 is a genuine false alarm — the concrete client satisfies it today and the new `agentexec` client satisfies it via `PushConfig` (seam method #5). No widening, no swap-time break. Applying all three corrections and emitting the final design.

---

# Scholar Agent 重构 · P3 详细设计(clean-room executor,干掉 cc-haha)

## 0. 范围 / 前置(P0+P1 已就绪;探针 GREEN;v2 铁律)

**目标(BLUEPRINT 修订 v2):** 用一个 **clean-room、provider-agnostic、按轮无状态** 的 TS 执行器,基于 raw `@anthropic-ai/sdk` 的 tool-runner 从零重写,替换掉 fork 的 cc-haha CLI(`agent/src/`,36M on disk / 806KB 源)。绑 **Anthropic Messages API 协议**(不是 Anthropic 厂商);当前上游 = DeepSeek(`deepseek-v4-pro` / `deepseek-v4-flash`,经 `agent_config` 槽位)。**零 cc-haha / Claude Code CLI / Codex CLI 血统**。

**GROUND TRUTH(已核对真实代码):**
- P0+P1 已 SHIPPED/DEPLOYED/TESTED:后端 event-sourced 真源(`agent_turns`/`agent_turn_events`/`agent_billing_ledger`,migrations 0046-0049);shadow journal works;三 feature(smart-search/claw/prism)走 DeepSeek 经 fork 运行;`AGENT_JOURNAL_READ` 仍 OFF(P1 读有 3 个已知 latent bug:HIGH-1/2/3)。
- Go bridge 经 `bridge.client`(**当前是 concrete `*agent.Client`**,bridge.go:38)与执行器对话。
- GO/NO-GO 探针 GREEN:raw SDK 对 DeepSeek 的 ① 非流式 tool_use ② tool_result round-trip→end_turn ③ 流式 text_delta+finalMessage ④ 流式带 tools 的 `content_block_start{tool_use}`+`input_json_delta` 组装 —— 四项全过。raw-SDK loop VIABLE。
- Model tiering = `agent_config` 槽位:main=`deepseek-v4-pro`,haiku=`deepseek-v4-flash`,sonnet=`deepseek-v4-flash`,opus=`deepseek-v4-pro`。

**v2 铁律(贯穿全文):**
1. fork 是 live 执行路径,**直到 P4a 逐 feature 切走、P6 才删**。每步用默认 OFF 的 env flag 守卫,单次 commit 可作为 prod no-op 上线(沿用 P0/P1 的 `AGENT_TURN_JOURNAL`/`AGENT_JOURNAL_READ` flag 纪律,bridge.go:200-214)。
2. **后端拥有 state**(P0/P1 journal);执行器按轮无状态,history 由后端喂入。
3. 日志中性化:停止固化 fork 帧;在 `Append` 边界归一成中性 `EvType`。
4. **executor.go 接缝先落地**(P0 漏项,P0-P1-REVIEW §5)—— 让交换是一行 bootstrap。

---

## 1. executor.go 接缝(Go interface,精确签名,*agent.Client 满足,零行为变更)— P0 漏项补齐

### 1.1 接口定义(`internal/agent/executor.go`,新文件,package `agent`)

放在 package `agent` 内,与它返回的所有 DTO(`CreateSessionOptions`/`CreatedSession`/`SessionMessagesResponse`/`WorkspaceFile`…)同包 —— 无 import cycle、无结构体复制,新执行器只 import `agent` 拿 DTO 类型。

```go
// internal/agent/executor.go
package agent

import (
	"context"
	"io"
	"scholar-backend/internal/agentconfig"
)

// Executor 是 Go bridge 对话的接缝。fork 的 *agent.Client 今天即满足(零改动);
// P3 clean-room 执行器满足同一接口,交换 = 一行 bootstrap。
// 这 20 个方法全是 HTTP。live agent→browser WS pipe 不是接缝方法 —— 见 §5,只靠 BaseURL()+AuthToken()。
//
// WS 契约(NON-OBVIOUS,不在 Go 签名里,务必看 §5.1/§5.3):
// Go hub 用 BaseURL() 派生的 URL + Authorization:Bearer<AuthToken()> 拨 raw WS,
// 任何实现者必须在该 endpoint 讲同一中性 frame 协议。peerreview 的 server-side drive
// 100% 跑在这个 WS 协议上、无 HTTP-seam 兜底(见 §6 O1 行)。
type Executor interface {
	// connectivity / config
	BaseURL() string
	AuthToken() string
	Health(ctx context.Context) error
	UpsertAgent(ctx context.Context, name string, body map[string]any) error
	PushConfig(ctx context.Context, cfg *agentconfig.AgentConfig) error
	ListModels(ctx context.Context) (*ListModelsResponse, error)
	// session lifecycle
	CreateSession(ctx context.Context, opts *CreateSessionOptions) (*CreatedSession, error)
	DeleteSession(ctx context.Context, sessionID string) error
	PatchSession(ctx context.Context, sessionID, title string) error
	ListSessions(ctx context.Context, ids []string) (*ListSessionsResponse, error)
	// transcript / context read
	GetSessionMessages(ctx context.Context, sessionID string, limitTurns int) (*SessionMessagesResponse, error)
	GetSessionContextEstimate(ctx context.Context, sessionID string) (*SessionContextEstimate, error)
	// server-side drive (no WS client online — peerreview)
	EnqueueChatMessage(ctx context.Context, sessionID, content string) error
	GetChatStatus(ctx context.Context, sessionID string) (*ChatStatus, error)
	// workspace ops — prism/claw
	PushSessionFile(ctx context.Context, sessionID, filename string, content io.Reader) (*PushedFile, error)
	GetWorkspaceFile(ctx context.Context, sessionID, relPath string) (*WorkspaceFile, error)
	ReadWorkspaceFileFull(ctx context.Context, sessionID, relPath string) (*WorkspaceFile, error)
	ReadWorkspaceFileRaw(ctx context.Context, sessionID, relPath string) (*WorkspaceRawFile, error)
	ListWorkspaceFiles(ctx context.Context, sessionID, relDir string) (*WorkspaceTree, error)
	PutWorkspaceFile(ctx context.Context, sessionID, relPath string, content []byte) error
	DeleteWorkspaceFile(ctx context.Context, sessionID, relPath string) error
}

var _ Executor = (*Client)(nil) // 编译期证明 fork client 零改动满足接缝
```

### 1.2 20 个方法的 file:line(已核对)

| Method | 源 | | Method | 源 |
|---|---|---|---|---|
| `BaseURL` | client.go:817 | | `PatchSession` | client.go:599 |
| `AuthToken` | client.go:820 | | `ListSessions` | client.go:497 |
| `Health` | client.go:823 | | `GetSessionMessages` | client.go:655 |
| `UpsertAgent` | **skill.go:25** | | `GetSessionContextEstimate` | client.go:698 |
| `PushConfig` | client.go:844 | | `EnqueueChatMessage` | client.go:725 |
| `ListModels` | client.go:583 | | `GetChatStatus` | client.go:759 |
| `CreateSession` | client.go:139 | | `PushSessionFile` | client.go:202 |
| `DeleteSession` | client.go:173 | | `GetWorkspaceFile` | client.go:320 |
| `ReadWorkspaceFileFull` | client.go:345 | | `ReadWorkspaceFileRaw` | client.go:289 |
| `ListWorkspaceFiles` | client.go:388 | | `PutWorkspaceFile` | client.go:413 |
| `DeleteWorkspaceFile` | client.go:447 | | | |

**返回 DTO 全部 verbatim 存在于 client.go**(`var _` 守卫诚实可编译):`*ListModelsResponse`(L570)、`*CreatedSession`(L114)、`*SessionMessagesResponse`(L639)、`*SessionContextEstimate`(L681)、`*ChatStatus`(L754)、`*PushedFile`(L191)、`*WorkspaceFile`(L263)、`*WorkspaceRawFile`(L277)、`*WorkspaceTree`(L378)、`*ListSessionsResponse`(L481)、`*CreateSessionOptions`(L120)。

**核对结论(纠正 migration piece 的两处)：**
- `UpsertAgent` **存在**(skill.go:25)—— migration piece 的 "verify" 标注解除。
- `ServerSideChatStreaming` 是 `*Bridge` 的方法(**ws_serverside.go:62**),**不是** `*Client` 的 —— **绝不进 `Executor` 接缝**(见 §6 O1)。seam piece 正确地省略了它;migration piece 把它列进 "legacy Client interface" 是错的,以此为准删除。
- 未导出 helper(`doJSON`/`listProviders`/`createProvider`/`pushConfigOnce`/`listSessionsOnce`/`agentExists`…)是实现细节,不上接缝。

### 1.3 需要 widen 的引用(7 处签名;**SetAgentClient 已是接口,无需 widen**)

全是 concrete→interface 的类型加宽,`var _ Executor = (*Client)(nil)` 守卫:能编译 = 行为一致。

**`internal/agentbridge/bridge.go`:**
- L38 `client *agent.Client` → `client agent.Executor`
- L175 `func New(client *agent.Client, repo *Repository)` → `client agent.Executor`
- L407 `func (b *Bridge) Client() *agent.Client` → `agent.Executor`
- L429 `func (f *FeatureBridge) AgentClient() *agent.Client` → `agent.Executor`

**`internal/agentbridge/eventlog_validate.go`:**
- L40 `client *agent.Client` → `agent.Executor`
- L44 `func NewJournalValidator(db, log, client *agent.Client)` → `client agent.Executor`(只调 `GetSessionMessages`,L95,在接缝上;P3 canary 跑不变。**这是 review 点名的硬绑定,必须改,否则 shadow 路径无法喂入第二个 client**)

**`internal/prism/service.go`:**
- L41 `agent *agent.Client` → `agent agent.Executor`
- L46 `func NewService(..., agentClient *agent.Client)` → `agentClient agent.Executor`

**`cmd/server/bootstrap.go` —— 无签名改动(grep 实证):**
- L110 `agentClient := agent.LoadFromEnv()` 仍返回 `*agent.Client`,可赋给 `agentbridge.New`(L128)/`NewJournalValidator`(L139)/`prism NewService`(L425)的 `agent.Executor` 参数 —— **无签名改动**。
- **L111 `agentConfigService.SetAgentClient(agentClient)` —— 不是隐藏消费者,不需 widen。** `SetAgentClient(client AgentPusher)`(`agentconfig/service.go:39`)收的是 `agentconfig` 自定义的**单方法接口** `AgentPusher{ PushConfig(ctx, *AgentConfig) error }`(service.go:23-25)—— 它正是为了 *避免* `agentconfig` 反向 import `internal/agent` 形成 cycle 而抽出的。concrete `*agent.Client` 今天已满足;未来 `agentexec` 客户端只要有 `PushConfig`(它有 —— 接缝方法 #5)也自动满足。**一行交换不会在此编译失败。**(此前 draft 把它列为"第 21 消费者必须 widen"是自造的假警报,删除;若按那个错改还会把 `agentconfig` 无谓耦合到 `agent`。)
- **建议** bootstrap 处显式 `var agentClient agent.Executor = agent.LoadFromEnv()`,这样将来 `LoadFromEnv` 返回 concrete 类型仍可 slot in;`SetAgentClient(agentClient)` 仍编译(`agent.Executor` 含 `PushConfig`,满足 `AgentPusher`)。

**P4 一行交换(等新执行器就绪):**
```go
// today:  var agentClient agent.Executor = agent.LoadFromEnv()        // *agent.Client (fork)
// P4 cut:  var agentClient agent.Executor = agentexec.LoadFromEnv()   // clean-room
```
下游全收 `agent.Executor`,这一行翻转所有 4 feature。

### 1.4 import 拓扑(纠正反 cycle 方向)
- 接缝 `executor.go` 的 `PushConfig(ctx, *agentconfig.AgentConfig)` 让 `package agent` import `agentconfig` —— 它**已经** import(client.go:26);`agentconfig` 不 import `agent`(`AgentPusher` 的全部意义)。**无 cycle。**
- **新 `agentexec` 包 import 两个包,不是一个**:import `agent`(拿全部 DTO)+ import `agentconfig`(拿 `AgentConfig` 类型给 `PushConfig`)。二者都是 leaf-ish,无 cycle。
- **陷阱**:不要把 DTO 结构体从 package `agent` 搬去 `agentbridge`(会造成 `agentbridge` import `agent` 的反向 cycle)。接口+DTO 留 `agent`,新执行器实现在自有包(`agentexec`)。

### 1.5 风险旗
- **§1.1-1.3 零风险、完全可逆**:纯类型加宽,`var _` 守卫。**最先落地**(P0 漏项),在任何 executor TS 代码存在之前,落在 fork 上。
- **唯一近不可逆点** = bootstrap 的一行 `LoadFromEnv` 替换 —— 但一行可 revert,且被 P3→P4 canary 守住。

---

## 2. 新 `agent-executor/` 架构(raw `@anthropic-ai/sdk`)

### 2.0 头号决策:Client SDK,不是 Agent SDK

**用 raw `@anthropic-ai/sdk`(Client SDK)+ 手写 tool loop + `@modelcontextprotocol/sdk`。绝不用 `@anthropic-ai/claude-agent-sdk`。** 两个 disqualifier:
1. Agent SDK 在自己文件系统拥有 state、围绕 resume-from-JSONL 构建 —— 正是 Scholar 要删的 cc-haha 模型;P0/P1 journal 存在的全部意义就是 host 拥有 transcript。
2. Agent SDK 是 Anthropic-coupled(`ANTHROPIC_API_KEY` / Bedrock / Vertex,无 documented `baseURL` override),且本身就是 bundled Claude Code 二进制子进程 —— 字面违反 "零 Claude Code 血统"。

raw SDK = `new Anthropic({ baseURL, authToken })`,provider-agnostic by construction,**已是 `agent/package.json` 的依赖**(`@anthropic-ai/sdk@^0.80.0`),探针已证对 DeepSeek 工作。三个 clean-room 配料(`@anthropic-ai/sdk` / `@modelcontextprotocol/sdk@^1.29.0` / `@minicod/mcp-server@0.3.0`)cc-haha **已经 bundle**,丢掉其余 ~36M。

### 2.1 目录布局

```
agent-executor/
  package.json   — @anthropic-ai/sdk, @modelcontextprotocol/sdk, @minicod/mcp-server, ws, zod, bun-types
                   无 Ink/react/commander。
  Dockerfile     — bun:1 slim;preinstalled-mcp.json(只 minicod);SANDBOX_MODE 守卫;non-root;cap_drop。
  src/
    index.ts                     进程入口:加载 config,起 http+ws server :3456。
    config/providerStore.ts      内存活跃 ProviderConfig(base_url/token/4 slots);PushConfig 写,client+models 读。
    config/models.ts             tier 映射 'main'|'haiku'|'sonnet'|'opus' → 活跃 provider 槽位;resolveTier(tier)→string。
    anthropic/client.ts          factory: new Anthropic({baseURL, authToken});authStrategy=auth_token;PushConfig 时重建。
    turn/turnLoop.ts             ★ agent loop(§2.3)。while(stop_reason==='tool_use'): stream→emit→assemble→exec→tool_result→loop。
    turn/assembleToolUse.ts      input_json_delta 按 content_block index 累积(探针 #4)。
    turn/history.ts              本轮 messages[] 构建(无状态:由 caller 喂)。
    turn/compaction.ts           history 窗口 + fast-tier 摘要(应急,§7.1)。
    tools/registry.ts            name→{schema,run,parallelSafe};clean-room 实现。
    tools/{read,write,edit,glob,grep,bash}.ts   built-ins,cwd-confined。
    tools/toAnthropicTools.ts    registry+MCP→Anthropic tools[],按 per-turn allow-list 过滤。
    mcp/minicodClient.ts         MCP stdio client(spawn @minicod/mcp-server),singleton 预热。
    mcp/mcpTools.ts              MCP tools 包成 Anthropic tool def(name = mcp__minicod__<tool>)。
    sandbox/{profile,bwrap,egress}.ts   SandboxProfile;bwrap 启动器(SANDBOX_MODE 守卫);tinyproxy egress + key 替换。
    server/{http,ws,sessions,workspace,chat}.ts   REST + WS + session registry + cwd 文件 op + server-side enqueue/status。
    policy/featurePolicy.ts      per-turn tool allow/deny(控制面授权,执行器第二道墙)。
    journal/sessionMeta.ts       极小 per-session meta(workDir/disallowedTools/addDirs/appendSystemPrompt/title)。无 transcript。
    obs/log.ts                   结构化 stdout(slog-parity)。
```

**相对 806KB fork 故意缺席:** `src/ink/`、`src/vim/`、`src/commands/`、`src/remote/`、`src/assistant/`、`src/proactive/`、bundled `src/skills/`、`src/cost-tracker.ts`、`src/QueryEngine.ts`、jsonl `src/history.ts`、`src/memdir/`。一律不复现。

### 2.2 anthropic/client.ts — provider 注入点

- `new Anthropic({ baseURL: cfg.BaseURL, authToken: cfg.AuthToken })` —— 用 **`authToken`**(→ `Authorization: Bearer`)不是 `apiKey`(→ `x-api-key`),匹配 `PushConfig` 已发的 `AuthStrategy:"auth_token"`(client.go:899-900)。DeepSeek-via-Anthropic-protocol gateway 期望 Bearer。
- provider 切换 = `PushConfig` → `/api/providers` upsert+activate → 重建 client。`APIFormat:"anthropic"` 是**协议不变量**(client.go:887 已 hardcode),不是存储字段;原 3 步 preset/activate dance(client.go:866-913)删除。runtime-switchable:执行器每轮读内存 `ProviderConfig`。

### 2.3 agent loop(`turn/turnLoop.ts`)— 落在 GREEN 探针上

用 `client.messages.stream()`(流式 helper,给 `.on()` 事件 **且** `await stream.finalMessage()` 拿到累积好的 `Message`,含解析后的 `tool_use.input`),不用 raw `.create({stream:true})`。

```ts
async function runTurn(input: TurnInput, sink: EventSink) {
  const client = anthropicClientFromProvider();          // base_url+token+slots, provider-agnostic
  const model  = resolveTier(input.tier);                // tier→活跃 provider 槽位
  const tools  = await buildTools(input.allowedTools, mcp);
  let messages = input.messages;                         // 后端喂的 history + 本轮 user(无状态)
  const system = input.appendSystemPrompt;               // 规则 + per-user memory,控制面给

  for (let round = 0; ; round++) {
    if (round > MAX_TOOL_ROUNDS) { sink.error('tool_round_cap','busy'); break; }
    const stream = client.messages.stream({ model, max_tokens: 64000, system, messages, tools });
    const assembler = new ToolUseAssembler();            // 按 content_block index
    for await (const ev of stream) {
      switch (ev.type) {
        case 'content_block_start':
          if (ev.content_block.type==='text')      sink.frame({type:'content_start',blockType:'text'});
          if (ev.content_block.type==='tool_use'){ assembler.open(ev.index, ev.content_block);
            sink.frame({type:'content_start',blockType:'tool_use',toolName:ev.content_block.name,toolUseId:ev.content_block.id}); }
          if (ev.content_block.type==='thinking')  sink.frame({type:'content_start',blockType:'thinking'});
          break;
        case 'content_block_delta':
          if (ev.delta.type==='text_delta')        sink.frame({type:'content_delta',text:ev.delta.text});
          if (ev.delta.type==='thinking_delta')    sink.frame({type:'thinking',text:ev.delta.thinking});
          if (ev.delta.type==='input_json_delta')  assembler.push(ev.index, ev.delta.partial_json);
          break;
        case 'content_block_stop':
          if (assembler.isTool(ev.index)) { const tu = assembler.close(ev.index);
            sink.frame({type:'tool_use_complete',toolName:tu.name,toolUseId:tu.id,input:tu.input}); }
          break;
      }
    }
    const msg = await stream.finalMessage();             // 探针 #3/#4
    messages.push({ role:'assistant', content: msg.content });   // 必须 append 全 content,保 tool_use 块
    if (msg.stop_reason !== 'tool_use') { sink.frame({type:'message_complete', usage: normUsage(msg.usage)}); break; }
    const toolUses = msg.content.filter(b=>b.type==='tool_use');
    const results  = await runTools(toolUses, input, sink);
    messages.push({ role:'user', content: results });    // 所有 tool_result 在一个 user 消息里(SDK 规则)
  }
}
```

正确性要点(skill tool-use 规则 + 探针):
- **append 全 `msg.content`**(非仅 text),保留 `tool_use` 块给下一请求。
- **所有 `tool_result` 在一个 user 消息**;拆开会静默把模型训离 parallel call。
- **失败 tool → `tool_result{is_error:true}`**,绝不丢。
- `MAX_TOOL_ROUNDS` cap 防失控(cap 留在控制面,比 Agent SDK 的 `maxTurns` 更可控)。
- **thinking 是条件性、非假设**:DeepSeek 不发 thinking,loop 仅在 stream 真产 thinking 时转发(顺解 P0-P1-REVIEW MEDIUM-4)。

### 2.4 runTools — tool 执行 + permission(控制面拥有)

Go 的 `decidePermission`/`permissionAllowed`(ws.go:231/276)是**权威**安全 C&C,留在 Go。执行器:
1. 逐 `tool_use` 查 `featurePolicy`(执行器第二道墙:deny-list from `input.allowedTools`、MCP-allow、Bash-by-`allowBash`、文件路径在 cwd 内)—— 镜像 `permissionAllowed`,执行器绝不跑 Go 会拒的东西,且**绝不拓宽 allow-list**(`TurnInput.AllowedTools` 是天花板)。
2. 需裁决的 tool:`sink.frame(permission_request{requestId,toolName,toolUseId,input})` → Go hub 回 `permission_response{requestId,allowed}`(或 `PermissionAuto` 时 `decidePermission` 自批)。执行器按 `requestId` 阻塞该 tool。
3. `allowed:true` → 在 sandbox profile(§2.6)内跑。built-in 解析路径对 cwd;Bash 在 bwrap jail(仅 claw)。
4. emit `tool_result{toolUseId,content,isError}`(也回喂 `messages[]`)。
5. **闭合子代理绕过隐患**(ws.go:297):Task/Agent 的嵌套 tool call 也走 `runTools`→`permission_request`→Go `decidePermission`。Task/Agent 在 P4b bwrap prod 验证前保持 denied。

### 2.5 MCP — 直接用 `@modelcontextprotocol/sdk`,singleton 预热

- 执行器启动时实例化 MCP `Client` 对 Minicod stdio server(复用 `preinstalled-mcp.json` 的 command/args/env,含 `MINICOD_API_KEY`+`MINICOD_API_BASE_URL`)。Minicod 是**唯一** MCP。
- `client.listTools()` → 每个转 Anthropic `ToolParam`(`name:"mcp__minicod__<tool>"`)。**保留 `mcp__minicod__*` 命名** —— 前端已按它渲卡片(memory: claw-paper-cards),**零前端改动**。
- `tool_use` name 以 `mcp__minicod__` 开头 → 路由 `mcpClient.callTool`;其余 → built-in。
- **进程共享 singleton、boot 预热**(避开 cold-start MCP 连接 60s 超时);tool *可见性* per-turn 由 allow-list 控。不用 Agent SDK 的 "tool search"(只一个 MCP,不需要)。

### 2.6 sandbox + per-feature policy + model tiering

- **sandbox(`SANDBOX_MODE=none|bwrap`,bwrap prod-only):**
  - `profile.ts` per session:`{cwd, net:'open'|'none', allowBash, roBinds:[skillDirs]}`。smartsearch=`{net:open(仅 MCP 经 egress),allowBash:false}`;claw=`{allowBash:true}`;prism=`{net:'none'}`(`compile` profile,泛化 prism_tex 的 `network_mode:none`)。
  - `bwrap.ts`(P4b):`--unshare-all`、tmpfs `/`、`--bind <cwd> /work --chdir /work`、`--ro-bind` skill dirs、`--die-with-parent`、seccomp、`PR_SET_NO_NEW_PRIVS`、cap-drop → 跨租户遍历物理不可能。
  - `egress.ts`:`--unshare-net`;出站仅经 tinyproxy allowlist(Minicod / 配置的 provider host / WebFetch);**key 在 egress 替换** —— Minicod/provider key 绝不进 jail,sandbox 持 placeholder,tinyproxy 仅对 allowlist host 重写 header。
- **per-feature policy(控制面拥有,per-turn):** turn input 带 `allowedTools`(Go 侧由 `FeatureSpec.specDeny()`/`SessionDisallowedTools()` 推)。`featurePolicy.ts` 作第二道墙;fork 手写 denylist 删除。smartsearch=MCP-only;claw=+Bash;prism=file-edit+`compile`;peerreview=server-side(无 WS client,但走 server-side WS 协议,§6 O1)。
- **model tiering:** turn input 带 `tier∈{main,haiku,sonnet,opus}`;`resolveTier` 映射到活跃 provider 槽位。fast(haiku)=记忆抽取/标题/peerreview JSON 重试/方法论;strong(sonnet|opus)=主推理+chief。tier 是 **per-call-site 由控制面设的 turn 字段**,不是 CLI 进程默认(那是单用户假设)。DeepSeek:main/opus=`deepseek-v4-pro`,haiku/sonnet=`deepseek-v4-flash` —— **从槽位读,绝不 hardcode**。

---

## 3. 它如何无状态 + 后端拥有 history(用 P0/P1 journal 喂入)

- **真源 = 后端 journal**(`agent_turn_events`,P0/P1 已发)。执行器**不**留 jsonl transcript、**不** `--resume`。
- **两种 history 喂入模式,per-turn 选择:**
  1. **Fed-history mode(目标,P4+):** 控制面把 `agent_turn_events` 折成 `messages[]`(Go 的 `FoldToMessages`,见 §4 须先修),作为 turn input 传入。`turn/history.ts` 直接用。执行器跨轮零保留。
  2. **Local-meta mode(迁移桥,P3):** shadow 期间执行器仅在内存持有*运行中那一轮*的 `messages[]`(不持久),让单 canary turn 在后端尚未推 history 时也能跑。P4a 丢弃。
- **`sessions.ts` 只存 sandbox handle + per-session opts**(`session-meta.json`,KB 级,非 transcript)。`CreateSession`(client.go:139)退化成"分配 sandbox cwd + 持久化 opts";`GetSessionMessages`/`PatchSession`/`ListSessions` 要么后端本地(history 在 MySQL),要么 migration-compat 透传。
- **关键区分:执行器 transcript 无状态,但 sandbox fs 是 per-session 可变状态**(prism 经 `PutWorkspaceFile` 从 DB 重建 cwd;claw references 在 cwd),keyed by `SandboxID`。别试图让 sandbox per-turn ephemeral。
- **为何 raw SDK 让这免费:** transcript 就是我传给 `messages.stream()` 的 `messages[]` 数组。后端可任意粒度存再回喂 —— 正是 brief 的 "genuinely stateless turn-executor"。

**context compaction = 控制面 policy,非执行器关切。** Go 折 `messages[]` 时 cap turn(`GetSessionContextEstimate` + 前端已传的 `HISTORY_WINDOW=100`/`limitTurns`)。可选后加 summarize-older-turns pass 作独立 `kind` turn。**绝不 import fork compaction。**

---

## 4. 日志中性化(停止固化 fork 帧;新 executor 发中性帧;顺带解 P1 读 HIGH-1/2/MEDIUM-4)

**问题(P0-P1-REVIEW §5,已逐行核对真实代码):** 耐久 journal 现存 raw fork wire 帧。`FoldToMessages`(eventlog_store.go:197-198)把 browser-frame payload `tool_use_complete{toolName,toolUseId,input}` 直接塞成 assistant content block —— **这不是合法 Anthropic content shape**(应是 `tool_use{type,id,name,input}`),且把 `tool_result` **错误地嵌进 assistant 消息**而不是作为顶层 user block。代码自己标了 "P1 待精修"(eventlog_store.go:164-166)。`EvType` 常量(eventlog.go:31-37)**没有** `EvContentStart`/`EvThinking`;`classifyJournalEv`(hub.go:794-810)的 switch 直接丢弃 `content_start`/`thinking`。clean-room 执行器发**不同**帧。两个坏选项:迁 journal schema,或让新执行器**冒充 fork 帧**(后者违反零血统)。

**修复 —— 在 `Append` 边界归一成中性 `EvType`:**
- `classifyJournalEv` → 发中性形:`tool_use_complete{toolUseId,toolName,input}` → `EvToolUse{id,name,input}`;`tool_result` → `EvToolResult{tool_use_id,content,is_error}`;**新增** `EvContentStart`/`EvThinking` 常量(eventlog.go:31-37),捕 `content_start`(**修 HIGH-2**)、`thinking`(**修 MEDIUM-4**)。
- `FoldToMessages` 只读中性形,渲合法 Anthropic `content[]`:assistant 块用 `tool_use{type:'tool_use',id,name,input}`,`tool_result{type:'tool_result',tool_use_id,is_error}` 放**顶层 user 块**(不嵌 assistant),让 `replayHistoryAsTurns` 认得(**修 HIGH-1**)。
- 同一中性 journal 无论生产者是 fork(Append 时归一)还是新执行器(本就发中性 `TurnEvent`)都同样消费 —— **这是 shadow-execute 比较有效的前提**:两生产者落同一中性 journal、同样折叠、apples-to-apples。

**validator 学会 tool 维度(修 HIGH-3,eventlog_validate.go:99-110):** `compareSession` 加 `tool_call_name_sequence` 比较维度。现仅数 user msg + assistant text —— 对 tool drop 结构性盲。同一维度也是 shadow-execute 比 fork-vs-executor 用的,一份工作服务 P1-read 与 P3-shadow 双 go/no-go。

**执行器侧保证(中性帧 mandate):** 执行器 `tool_use_complete` 带 `{toolUseId,toolName,input}`,`message_complete.usage` 是 4 字段中性 usage —— 正是 Go 侧已解析的。执行器**绝不**发明新字段名。

---

## 5. WS/HTTP 协议映射(逐帧:浏览器↔executor,seam 契约方法)

### 5.1 HTTP/WS 边界 —— 接缝只承载 BaseURL+AuthToken

20 个接缝方法**全是 HTTP**。live agent→browser streaming **故意不是接缝方法**:
- hub 拨 raw WS:`hub.go:151` `agentDialer.Dial(agentWSURL,header)`,URL 由 `f.bridge.client.BaseURL()`(hub.go:141)+ bearer `f.bridge.client.AuthToken()`(hub.go:148)构。server-side peerreview 同样(ws_serverside.go:78/86)。
- **WS 路径的唯一接缝面 = `BaseURL()`+`AuthToken()`**,二者已在 `Executor` 上。frame pipe 由 bridge 拥有(ws.go),非 client。

**对 P3 执行器的含义:** swap-compatible 要求执行器 (a) 实现 20 个 HTTP 方法,**且** (b) 在 `BaseURL()` 派生的 URL 暴露 WS endpoint,接受 `Authorization: Bearer <AuthToken()>`,讲同一 frame 协议 —— 因为 Go hub 会继续把它当 raw socket 拨。frame 协议是接缝 Go 签名**之外**的契约,故已在 §1.1 接口 doc comment 明示,防它像原 executor.go 一样被忘。

**可选硬化(推荐 P3,非阻塞):** 若想把 WS 拨号也藏进接缝,加 `DialSessionWS(ctx, sessionID) (WSConn, error)`,把 `buildAgentWSURL`+`agentDialer.Dial` 移其后。零变更交换不需要(`BaseURL`/`AuthToken` 已够)—— 标为 **deferred、非阻塞** 接缝扩展。

### 5.2 HTTP 路由(镜像 `agent.Client`)

| 路由 | Go caller | 新执行器行为 |
|---|---|---|
| `GET /health` | `Health` | `{status:ok,timestamp}` |
| `POST /api/sessions` | `CreateSession` | 分配 cwd `<root>/<sid>`,持久 opts,返 `{id\|sessionId, workDir}`。无 jsonl。 |
| `DELETE /api/sessions/:id` | `DeleteSession` | rm cwd+meta;404→`ErrSessionNotFound` |
| `GET /api/sessions` | `ListSessions` | 从 meta registry 列;honor `?ids=`/`?limit`。migration-compat |
| `GET …/:id/messages` | `GetSessionMessages` | 目标:410/empty→后端读 journal。迁移:返本地 turn buffer 折出的 `messages[]`+`totalTurns` |
| `PATCH /api/sessions/:id` | `PatchSession` | meta 设 title |
| `GET …/:id/inspection?contextOnly=1` | `GetSessionContextEstimate` | 从末 assistant `usage` 算 `{totalTokens,maxTokens,percentage,model}` |
| `POST …/:id/chat` + `GET …/chat/status` | `EnqueueChatMessage`/`GetChatStatus` | server-driven(peerreview):enqueue turn,server-side 跑,暴露 `{state:idle\|thinking\|working\|error}` |
| `POST …/:id/files`(multipart) | `PushSessionFile` | stream 入 cwd,返 `{path,name,size}` |
| `GET …/workspace/file`(`?full`/`?raw`) | `GetWorkspaceFile`/`…Full`/`…Raw` | 读 cwd;text/image/binary/too_large/missing;`?full=1` 绕 1MB;`?raw=1` base64 |
| `GET …/workspace/tree` | `ListWorkspaceFiles` | 目录列;missing→`state:missing` |
| `PUT/DELETE …/workspace/file` | `PutWorkspaceFile`/`Delete…` | cwd 内覆写/删;越界拒绝 |
| `GET/POST/PUT /api/providers*`, `…/activate` | `PushConfig` | 持久 provider+设活跃+重建 client。**provider 注入点** |
| `GET /api/models` | `ListModels` | 4 tier 别名→活跃 provider 槽位 id+Description |

错误用 fork 的 `{error,message}` 信封,保 Go `HTTPError` 解析器(client.go:983);404→`ErrSessionNotFound`。**workspace op 必须字节级一致**(prism 固化经 `ReadWorkspaceFileFull` 读全文,`?full=1` 不截断,否则静默腐蚀 DB,client.go:343)。

### 5.3 WS frame map(`server/ws.ts`)

hub 拨 `ws://…/ws/<sessionId>?ws_token=…`(ws.go:115)。新 server 升级同路径。

**浏览器→agent(执行器收,经 Go pipe `writeAgent`):**
| Frame | 执行器动作 |
|---|---|
| `user_message{content,clientTurnId,attachments?}` | 起 turn:建 `messages[]`(fed history+content;attachments→cwd 路径),跑 turnLoop |
| `stop_generation` | abort in-flight stream+kill 运行中 tool |
| `set_runtime_config{providerId,modelId}` | per-connection tier/model override(不落盘) |
| `permission_response{requestId,allowed}` | 解阻塞匹配的 gated tool |
| `ping` | 回 `pong` |
| `extract_memory`(Go `buildMemoryExtractFrame`,hub.go:475) | 跑 fast-tier 抽取 turn,回 `memory_update` |
| `prewarm_session` | 可选缓存预热;no-op 可接受 |

**agent→browser(执行器发,Go hub 转发/journal,消费点已逐行核对):**
| Frame | 时机 | Go hub 消费 |
|---|---|---|
| `connected{sessionId}` | WS open | passthrough |
| `status{state}` | thinking/tool_executing/streaming/idle | passthrough |
| `content_start{blockType,toolName?,toolUseId?}` | block open | **journal HIGH-2 需此** |
| `content_delta{text?}` | streaming token | Go batcher 合并 |
| `thinking{text}` | thinking delta(仅产时) | passthrough+journal(MEDIUM-4) |
| `tool_use_complete{toolName,toolUseId,input}` | 组装好 tool_use | `classifyJournalEv`(hub.go:525/794) |
| `permission_request{requestId,toolName,toolUseId,input}` | gated tool | `decidePermission`(ws.go:231,hub.go:420) |
| `tool_result{toolUseId,content,isError}` | tool done | journal |
| `message_complete{usage:{input_tokens,output_tokens,cache_read_tokens?,cache_creation_tokens?}}` | `stop_reason!=tool_use` | `extractMessageComplete`(ws.go:448,hub.go:430)→billing |
| `session_title_updated{sessionId,title,aiGenerated}` | 标题生成(§7) | `extractTitleUpdateFrame`(ws.go:528,hub.go:506)→`OnTitleResult` |
| `pong` / `error{message,code,retryable?}` | ping 回复 / 失败/`busy` | passthrough(前端 `busyRejected`) |

**带外 billing/memory 帧(执行器必须续发,保 `recordOutOfBandTokens`/`IngestMemory`,ws.go:487 / hub.go:490-499):**
- `token_usage{usage,kind}` —— 带外 kind(title/memory_extract)→`recordOutOfBandTokens`。
- `memory_update{...}` —— 回应入站 `extract_memory`→`IngestMemory`。抽取 prompt/spec 留 Go-authored(memory: memory-and-prism-naming-to-agent),执行器只执行帧。

**关键:WS 协议被 swap 不变** —— 执行器发/收同一中性帧,前端不变,这是增量迁移的钥匙。

---

## 6. shadow-execute 迁移 P3→P6

**贯穿不变量:** fork 是 live 路径直到 P4a 逐 feature 切、P6 才删。新执行器工作落在默认 OFF 的 `AGENT_EXECUTOR_SHADOW` / `AGENT_EXECUTOR_LIVE` flag 后,每 commit 是 prod no-op。

**硬前置门(阻塞全部 P3-live+):** §4 的 journal 中性化 + validator tool 维度(修 HIGH-1/2/3)**必须先做**,因 shadow-execute 复用 journal+fold+validator 比对新执行器 vs fork。fold 若丢 tool 块,shadow 比对结构性看不见 smart_search 产生的 6 个 Minicod call —— **这是迁移 on-ramp,不可选**。

| Stage | 上线物 | Flag(默认) | 可逆? | 不可逆/仅生产/需点头 |
|---|---|---|---|---|
| **Prereq** | journal 中性化 + validator tool 维度(修 HIGH-1/2/3) | 现有 P1 flag | yes(dual-read fold) | 顺带解锁 `AGENT_JOURNAL_READ` |
| **P3.0** | `executor.go` 接缝;widen 7 处(**SetAgentClient 不动**);validator 收接口 | 无(编译期) | yes | 零风险,**最先做** |
| **P3.1** | `agent-executor/` 容器 `scholar_agent_exec`,**未接 live** | 无 | yes | none |
| **P3.2** | `shadow_execute.go` smart_search 只读比对 | `AGENT_EXECUTOR_SHADOW=""` | yes(unset) | **需点头**:采样 canary 成本 |
| **P3-live** | smart_search→执行器 + billing flip(turn_id ledger 权威) | `AGENT_EXECUTOR_LIVE=smart_search` | yes(窗口内) | **需点头**;billing 变权威 |
| **P4a** | claw+prism→执行器(jsonl 墙溶解) | `…,claw,prism` | bounded window | **需点头**逐 feature |
| **P4b** | bubblewrap | `SANDBOX_MODE=bwrap` | yes(`=none`) | **仅生产内核**;需 prod smoke |
| **P4c** | drop sticky 路由 | sticky-behind-flag | yes(重启 sticky) | 通向多副本的门 |
| **P5(peerreview)** | saga 引擎 + peerreview server-side WS | `AGENT_SAGA=peerreview` | yes(interim stitch) | **需点头;100% 跑在新执行器 server-side WS 协议保真度上,无 HTTP-seam 兜底(O1)** |
| **P6** | 删 `agent/src/`(36M)+ flip replicas | `replicas:` | **NO(delete)** | **不可逆**;两 commit;**需点头** |

**O1 —— peerreview 的特殊耦合(显式立行):** `ServerSideChatStreaming`(`*Bridge`,ws_serverside.go:62)有 **4 个 live caller,全在 peerreview**(`peerreview/service.go:586/1395/1705` + prism 注释 service.go:40)。它内部经 `b.client.BaseURL()`/`AuthToken()`(ws_serverside.go:78/86)**自拨一条新 agent WS**,跑完整 `decidePermission` + 带外 token 路径(ws_serverside.go:217/238/403),并自起新连接接 `extract_memory`(ws_serverside.go:354/364)。**含义:peerreview 是唯一核心 drive 零 HTTP-seam 参与的 feature —— 纯 WS。** 它的 P5 cutover **完全 gated 在新执行器 server-side WS 协议(content_start/content_delta/message_complete/permission_request/thinking,ws_serverside.go:196-321)的保真度上**,不靠任何接缝方法兜底。这是一条独立的近不可逆耦合,迁移表已单列。

**P3.2 shadow 机制(本块核心,仿 `JournalValidator`):**
- gated `AGENT_EXECUTOR_SHADOW=smart_search`(CSV per-feature,同 `AGENT_JOURNAL_READ` 形)。空=全 no-op。
- **触发点:** fork 上一个真 smart_search turn 完成并 journal 后(`message_complete` tee 已触 `CompleteTurn`,hub.go:435-450)。此刻后端拥有完整 turn input(journal 折出的 history)与 fork 输出(journal 事件+ledger row)。
- **只读重放:** harness 用*喂 fork 那轮的同一折叠 history*建 `TurnInput`,对新执行器 `RunTurn` 调用,用 **throwaway sink** 缓冲事件 —— **绝不广播浏览器、绝不写 `agent_turn_events`、绝不碰 ledger**。
- **无双副作用/双成本理由:** smart_search 是 **MCP-only 只读**(Minicod search)。重放发只读 Minicod query + 一次 DeepSeek completion。这是**唯一**构造上可安全 dual-run 的 feature。**采样跑**(`AGENT_EXECUTOR_SHADOW_RATE`,如 1/N)把增量 DeepSeek/Minicod 花费压到已知小比例 —— 真实成本,有界可观测,仅 smart_search 接受。
- **比对+记录:** append-only `agent_shadow_compare`(或先 slog,仿 validator 起步):per turn 比 `tool_call_name_sequence`、`token_usage` delta(fork ledger vs 执行器 `message_complete.usage`)、`final_text_similarity`(归一空白后 Levenshtein/ratio,复用 `normalizeWS` eventlog_validate.go:146)。`shadowCompareMismatch` counter 仿 `journalValidateMismatch`。
- **GO criterion 离开 P3:** N 连续天 `shadow_compare`(**在含 Minicod tool call 的轮上**,否则是假绿,HIGH-3 教训):tool 序列同、token delta 在容差、text 相似度过阈。然后 `AGENT_EXECUTOR_LIVE=smart_search` 提 live —— **这里 P3 结束、billing flip 发生**(turn_id-idempotent ledger 对已迁 feature 变权威)。

**P4a 副作用 feature 的特殊处理:** claw(Bash)/prism(cwd 写)有真副作用,**shadow 用 record-replay stub 或 isolated cwd**(绝不对共享 cwd 双跑 Bash / 双写 prism_tex)。完整信心来自小规模 **live canary cohort**(flag 选 user-id allowlist),非全 dual-run。**P4a 不可逆点:** feature 一旦 live 产 turn,其 jsonl 不再权威 → 回滚只在 fork 还能重建 history 的有界窗口内。

**P4b/P4c/P5/P6 见上表;不可逆点:** P6 删 `agent/src/` 移除*所有*前阶段的回滚目标;只在全 feature live 零 shadow 回归 soak 后 + §7 总闸/fence-token/独立 agent-Redis-noeviction 就位后入。**删 + replica flip 做两个独立 commit**,让 replica flip 可 revert 而不复活 fork。

---

## 7. 最难的几块

1. **context/compaction(UNCERTAIN,§8 探针 #1):** 无状态每轮重发 history,若 provider 不 honor prefix cache 则 input token 涨。**架构绝不依赖它。** `turn/compaction.ts`:cap history 窗口 + fast-tier 摘要旧轮(把 fork tail-read 逻辑移进 Go history-folder,执行器只消费有界 `messages[]`)。无论如何纪律:`[system+memory+tool defs]` 前缀字节稳定(对任何 prefix-cache 实现严格占优)。Anthropic 协议的 `cache_control`/`compact-*` beta 若上游 honor 可用,用 `usage.cache_read_input_tokens` per-provider 验,绝不假设。
2. **prism file-edit+compile 沙箱:** `Write/Edit` 限 cwd + `net:none` LaTeX compile(`compile` profile = bwrap 无网 jail)。diff prepare→apply/reject 留 Go 编排;prism 固化经 `ReadWorkspaceFileFull` 读全文,执行器必须 `?full=1` 不截断(client.go:343),否则静默腐蚀 DB。
3. **claw artifacts/uploads:** `PushSessionFile` stream 入 cwd(方案 B:agent 读原文件)。artifact 落 `./out`;Go 经 `ListWorkspaceFiles`/`ReadWorkspaceFileRaw`→MinIO 收割。claw Bash 需 bwrap(pandoc/python 出 docx/xlsx)—— 隔离最大受益者。
4. **peerreview server-side(见 §6 O1):** 无 WS client → `EnqueueChatMessage`+`GetChatStatus` poll+`GetSessionMessages`;但核心 drive 是 `ServerSideChatStreaming` 自拨的 server-side WS,执行器须在该 WS 路径完整实现 content_start/content_delta/message_complete/permission_request/thinking + `extract_memory`。P5 每 reviewer step 是 Go saga 驱动的一个 turn。
5. **subagents:** **不**用 SDK `agents`。peerreview 多 reviewer(方法论→alpha/beta/gamma→chief)走 Go-side saga(`agent_saga_steps`,memory: peerreview-skills-redesign),每 reviewer = 独立 `RunTurn`(`client_turn_id = saga_id:step_key:attempt`)。编排留耐久控制面(resumable/billable/attributable),执行器保持扁平单轮 runner。
6. **bubblewrap prod-only:** bwrap 需 Linux userns;**LinuxKit(本 Mac Docker Desktop)无法测**。首次真验证在 Linux CI runner / prod box。`SANDBOX_MODE=none` 一 flag 回退到 `decidePermission` 逻辑墙。

---

## 8. 剩余 week-1 探针

tool-call 已 GREEN(探针四项全过)。两个 go/no-go 门剩:
1. **DeepSeek prompt-cache(P3-live 成本模型门,非 shadow 阻塞):** 固定 `[system+memory+tools]` 前缀,发两个同前缀请求,查 DeepSeek `usage` cache-hit 信号(字段名未知,可能 `prompt_cache_hit_tokens`,可能无)。**架构不依赖它** —— 无 cache 则长 claw/prism session input 成本线性涨,缓解 = history-window cap + fast-tier 摘要旧轮。"稳定前缀字节"纪律无论如何做(严格占优)。
2. **bubblewrap prod 内核(P4b 门):** 本 Mac/LinuxKit 跑不了。需 Linux CI runner / prod box:`unprivileged_userns_clone=1`、`max_user_namespaces>0`、`bwrap --unshare-all true` exit 0、Ubuntu 24.04+ AppArmor restricted-userns 检查。**不过→不入 P4b**(P4a 仍以 `SANDBOX_MODE=none` 上)。

**带外计费缺口(P3 billing-flip 前必补,P0-P1-REVIEW 偏离 #3):** 带外 turn(memory_extract/title)从不调 `BeginTurn`,故 shadow ledger 只是子集镜像。billing-flip 前给带外 turn `BeginTurn`/ledger row,否则 `SUM(ledger)==SUM(llm_token_usage where source=agent)` 的对账前提不成立。(Agent-SDK-hosting 探针为 confirm-only,不在 shadow 关键路径。)

---

## 9. 多会话增量落地顺序(不破坏现有 fork 直到 P6)

1. **`executor.go` 接缝 lift(零行为)** —— widen 7 处签名(`bridge.go` 4 + `eventlog_validate.go` 2 + `prism/service.go` 2,**`SetAgentClient` 不动**)+ validator 收接口,`var _ Executor=(*Client)(nil)` 守卫。落 fork 上,任何 TS 前。
2. **journal 中性化 + validator tool 维度**(修 HIGH-1/2/3:`FoldToMessages` 合法 content shape + 顶层 tool_result;新增 `EvContentStart`/`EvThinking`;`compareSession` 加 tool 序列维度)—— 现有 P1 flag 下上,顺带解锁 `AGENT_JOURNAL_READ`,且是 shadow 比对有效的前提。
3. **scaffold `agent-executor/`** + `/health`+`/api/providers*`+`/api/models`(provider 管道,无 loop)。验 `PushConfig` 对新容器 round-trip。
4. **`anthropic/client.ts`+`turn/turnLoop.ts`+`mcp/minicodClient.ts`+built-in tools** —— 对真 DeepSeek 跑 conformance harness(单/多/parallel tool、空响应、长响应)。
5. **`server/ws.ts` 全 frame map+`runTools` permission round-trip** —— 接 `executor.go` 接缝。
6. **shadow-execute reconcile harness on smart_search(只读)** —— flip `AGENT_EXECUTOR_SHADOW`,跑 N 天攒 parity。
7. **workspace op+`chat`/`status`+server-side WS**(prism/claw/peerreview 面,字节级 parity to client.go op;peerreview 的 server-side WS 是 O1 关键路径)。
8. **`sandbox/bwrap.ts`+`egress.ts`**(P4b,prod-gated)。
9. **P3-live→P4a→P4b→P4c→P5→P6**,逐 flag 推进,每步 soak 过 parity 才进下一步。

---

**核对的真实文件:** `internal/agent/client.go`(20 方法接缝 + 全部返回 DTO,L114-983)、`internal/agent/skill.go:25`(`UpsertAgent`)、`internal/agentconfig/service.go:23-41`(`AgentPusher` 单方法接口 —— **作废 C1 "第 21 消费者" 假警报**)、`internal/agentbridge/bridge.go:38/175/407/429`(widen 点)、`internal/agentbridge/eventlog_validate.go:40/44/95/99-110/146`(validator)、`internal/agentbridge/eventlog.go:31-37`(无 `EvContentStart`/`EvThinking` —— 须新增)、`internal/agentbridge/eventlog_store.go:160-204`(HIGH-1 真:raw frame 当 assistant block + tool_result 误嵌)、`internal/agentbridge/hub.go:141-525/794-810`(frame switch + billing/title/memory hook)、`internal/agentbridge/ws.go:231/276/448/487/528`(`decidePermission` 权威 gate 留 Go + 各 extractor)、`internal/agentbridge/ws_serverside.go:62/78/86/196-321/354/364/403`(`ServerSideChatStreaming` 在 `*Bridge` 不在 `*Client`,**不上接缝**;peerreview 纯 WS drive)、`internal/peerreview/service.go:586/1395/1705`(4 caller)、`internal/prism/service.go:40-46`、`cmd/server/bootstrap.go:109-143`、BLUEPRINT §3/§8、DETAILED-DESIGN §5、P0-P1-REVIEW §5。

**对 critique 三处裁定的应用(lead architect):** (1) **C1 删除** —— `SetAgentClient` 收 `AgentPusher` 单方法接口(service.go:23-25/39),concrete `*agent.Client` 与未来 `agentexec` 客户端(有 `PushConfig`)均自动满足,**不需 widen、一行交换不会编译失败**;若按原 draft 错改反而把 `agentconfig` 无谓耦合到 `agent`。(2) **C2 import 拓扑入 §1.4** —— `agentexec` 须 import 两个包(`agent` 拿 DTO + `agentconfig` 拿 `AgentConfig`),无 cycle。(3) **O1 立为迁移表独立行 + §7.4** —— peerreview P5 cutover 100% 跑在新执行器 server-side WS 保真度上,零 HTTP-seam 兜底,是独立近不可逆耦合。其余确认:20 接缝签名 + HIGH-1/2/MEDIUM-4 journal 前提 + 全 WS frame map 均经真实代码核对准确;`var _ Executor=(*Client)(nil)` 守卫诚实可编译;`PushConfig` 已 hardcode `APIFormat:"anthropic"`+`AuthStrategy:"auth_token"`(client.go:887/899-900)兑现 "anthropic=协议非厂商";接缝纯 concrete→interface 加宽不破 fork,唯一近不可逆点(一行 `LoadFromEnv` 替换)可 revert 且被 canary 守住。